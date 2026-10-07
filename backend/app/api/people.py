"""Действия пользователей: идеи, инциденты, посещаемость, журнал работ (базовые операции; логика идей — services/ideas)."""
import json
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.api.auth import public_user, require
from app.db import Attendance, Idea, Incident, Scenario, User, WorkLog, get_session, reset_demo
from app.repository import get_repository
from app.services.ideas import evaluate
from app.services.layout_ai import assess_layout

router = APIRouter(tags=["people"])
TZ = timezone(timedelta(hours=5))  # Костанай, UTC+5


def today() -> date:
    return datetime.now(TZ).date()


def _section_ok(section_id: str | None) -> None:
    if section_id is not None and get_repository().section_by_id(section_id) is None:
        raise HTTPException(422, "Неизвестный участок")


# ---------- идеи ----------

class IdeaIn(BaseModel):
    title: str = Field(min_length=3, max_length=140)
    text: str = Field(min_length=10, max_length=4000)
    section_id: str | None = None


STATUSES = ("submitted", "shortlisted", "finalist", "winner", "rejected")


def final_score(i: Idea, ai: dict | None) -> int | None:
    """Итог рейтинга: без оценки эксперта — балл AI; с оценкой — 40% AI + 60% эксперт (1–10 → 0–100)."""
    a = ai.get("score") if ai else None
    if i.expert_score is None:
        return a
    return round(0.4 * (a or 0) + 0.6 * i.expert_score * 10)


def idea_out(i: Idea, author: User | None) -> dict:
    ai = json.loads(i.ai_json) if i.ai_json else None
    return {**i.model_dump(exclude={"ai_json", "check3d_json"}), "ai": ai,
            "check3d": json.loads(i.check3d_json) if i.check3d_json else None, "final_score": final_score(i, ai),
            "author": public_user(author) if author else None}


def _authors(s: Session, ideas: list[Idea]) -> dict[int, User]:
    ids = {i.author_id for i in ideas}
    return {u.id: u for u in s.exec(select(User).where(User.id.in_(ids)))} if ids else {}


@router.post("/ideas", status_code=201)
def create_idea(body: IdeaIn, u: User = Depends(require("student", "employee")), s: Session = Depends(get_session)):
    """Идея сохраняется сразу с AI-оценкой (Claude или правила) — ответ приходит в том же запросе."""
    _section_ok(body.section_id)
    title, text = body.title.strip(), body.text.strip()
    ev = evaluate(title, text, body.section_id, get_repository())
    idea = Idea(author_id=u.id, title=title, text=text, section_id=body.section_id or ev.get("section_id"),
                ai_json=json.dumps(ev, ensure_ascii=False), ai_source=ev["source"])
    s.add(idea)
    s.commit()
    s.refresh(idea)
    return idea_out(idea, u)


@router.get("/ideas/mine")
def my_ideas(u: User = Depends(require("student", "employee")), s: Session = Depends(get_session)):
    rows = s.exec(select(Idea).where(Idea.author_id == u.id).order_by(Idea.created_at.desc()))
    return [idea_out(i, u) for i in rows]


@router.get("/ideas/rating")
def rating(_: User = Depends(require("manager", "student", "employee")), s: Session = Depends(get_session)):
    """Рейтинг всех идей: итоговый балл, статус в конкурсе. Отклонённые — в конце."""
    rows = list(s.exec(select(Idea)))
    authors = _authors(s, rows)
    out = [idea_out(i, authors.get(i.author_id)) for i in rows]
    order = {"winner": 0, "finalist": 1, "shortlisted": 2, "submitted": 3, "rejected": 4}
    return sorted(out, key=lambda x: (x["status"] == "rejected", -(x["final_score"] or 0), order[x["status"]]))


@router.get("/ideas/{idea_id}")
def get_idea(idea_id: int, _: User = Depends(require("manager", "student", "employee")), s: Session = Depends(get_session)):
    i = s.get(Idea, idea_id)
    if not i:
        raise HTTPException(404, "Идея не найдена")
    return idea_out(i, s.get(User, i.author_id))


@router.post("/ideas/{idea_id}/reevaluate")
def reevaluate(idea_id: int, u: User = Depends(require("manager", "student", "employee")), s: Session = Depends(get_session)):
    i = s.get(Idea, idea_id)
    if not i:
        raise HTTPException(404, "Идея не найдена")
    if u.role != "manager" and i.author_id != u.id:
        raise HTTPException(403, "Переоценить может автор или руководитель")
    ev = evaluate(i.title, i.text, i.section_id, get_repository())
    i.ai_json, i.ai_source = json.dumps(ev, ensure_ascii=False), ev["source"]
    s.add(i)
    s.commit()
    s.refresh(i)
    return idea_out(i, s.get(User, i.author_id))


class Check3dIn(BaseModel):
    """Итог проверки идеи на 3D-модели — считается на клиенте той же моделью, что в редакторе."""
    changes: list[str] = Field(max_length=20)
    before: int
    after: int
    bottleneck_before: str = Field(max_length=60)
    bottleneck_after: str = Field(max_length=60)
    conflicts: list[str] = Field(default_factory=list, max_length=50)
    consequences: list[str] = Field(default_factory=list, max_length=20)


@router.post("/ideas/{idea_id}/check3d")
def save_check3d(idea_id: int, body: Check3dIn, u: User = Depends(require("manager", "student", "employee")),
                 s: Session = Depends(get_session)):
    i = s.get(Idea, idea_id)
    if not i:
        raise HTTPException(404, "Идея не найдена")
    if u.role != "manager" and i.author_id != u.id:
        raise HTTPException(403, "Сохранить проверку может автор или руководитель")
    i.check3d_json = json.dumps({**body.model_dump(), "checked_at": datetime.now(timezone.utc).isoformat()}, ensure_ascii=False)
    s.add(i)
    s.commit()
    s.refresh(i)
    return idea_out(i, s.get(User, i.author_id))


class ReviewIn(BaseModel):
    status: str = Field(pattern="^(submitted|shortlisted|finalist|winner|rejected)$")
    expert_score: int | None = Field(default=None, ge=1, le=10)
    expert_comment: str | None = Field(default=None, max_length=1000)


@router.patch("/ideas/{idea_id}/review")
def review(idea_id: int, body: ReviewIn, _: User = Depends(require("manager")), s: Session = Depends(get_session)):
    """Решение эксперта/руководителя. AI решения о гранте не принимает; победителем может стать только финалист."""
    i = s.get(Idea, idea_id)
    if not i:
        raise HTTPException(404, "Идея не найдена")
    if body.status == "winner" and i.status not in ("finalist", "winner"):
        raise HTTPException(409, "Победителем может стать только финалист")
    if body.status in ("finalist", "winner") and (body.expert_score or i.expert_score) is None:
        raise HTTPException(409, "Для финала нужна оценка эксперта")
    i.status = body.status
    if body.expert_score is not None:
        i.expert_score = body.expert_score
    if body.expert_comment is not None:
        i.expert_comment = body.expert_comment
    i.reviewed_at = datetime.now(timezone.utc)
    s.add(i)
    s.commit()
    s.refresh(i)
    return idea_out(i, s.get(User, i.author_id))


# ---------- инциденты ----------

class IncidentIn(BaseModel):
    section_id: str
    equipment: str | None = Field(default=None, max_length=60)
    text: str = Field(min_length=5, max_length=2000)
    severity: str = Field(default="warning", pattern="^(warning|critical)$")


@router.post("/incidents", status_code=201)
def create_incident(body: IncidentIn, u: User = Depends(require("employee")), s: Session = Depends(get_session)):
    _section_ok(body.section_id)
    inc = Incident(author_id=u.id, **body.model_dump())
    s.add(inc)
    s.commit()
    s.refresh(inc)
    return {**inc.model_dump(), "author": public_user(u)}


@router.get("/incidents")
def list_incidents(u: User = Depends(require("manager", "employee")), s: Session = Depends(get_session)):
    q = select(Incident).order_by(Incident.created_at.desc())
    if u.role == "employee":
        q = q.where(Incident.author_id == u.id)
    rows = s.exec(q).all()
    authors = {a.id: a for a in s.exec(select(User).where(User.id.in_({r.author_id for r in rows})))} if rows else {}
    return [{**r.model_dump(), "author": public_user(authors[r.author_id]) if r.author_id in authors else None} for r in rows]


class IncidentStatusIn(BaseModel):
    status: str = Field(pattern="^(open|ack|closed)$")


@router.patch("/incidents/{incident_id}")
def update_incident(incident_id: int, body: IncidentStatusIn, _: User = Depends(require("manager")), s: Session = Depends(get_session)):
    inc = s.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "Инцидент не найден")
    inc.status = body.status
    s.add(inc)
    s.commit()
    s.refresh(inc)  # после commit поля устаревают — без refresh model_dump вернёт пустоту
    return inc.model_dump()


# ---------- посещаемость и журнал работ ----------

@router.post("/attendance/check-in")
def check_in(u: User = Depends(require("employee")), s: Session = Depends(get_session)):
    rec = s.exec(select(Attendance).where(Attendance.user_id == u.id, Attendance.day == today())).first()
    if rec:
        return rec.model_dump()  # повторная отметка — без дубля
    rec = Attendance(user_id=u.id, day=today())
    s.add(rec)
    s.commit()
    s.refresh(rec)
    return rec.model_dump()


@router.post("/attendance/check-out")
def check_out(u: User = Depends(require("employee")), s: Session = Depends(get_session)):
    rec = s.exec(select(Attendance).where(Attendance.user_id == u.id, Attendance.day == today())).first()
    if not rec:
        raise HTTPException(409, "Сначала отметьте выход на смену")
    rec.check_out = datetime.now(timezone.utc)
    s.add(rec)
    s.commit()
    s.refresh(rec)
    return rec.model_dump()


@router.get("/attendance/mine")
def my_attendance(u: User = Depends(require("employee")), s: Session = Depends(get_session)):
    return [r.model_dump() for r in s.exec(select(Attendance).where(Attendance.user_id == u.id).order_by(Attendance.day.desc()).limit(30))]


class WorkIn(BaseModel):
    text: str = Field(min_length=3, max_length=500)
    units: int | None = Field(default=None, ge=0, le=1000)


@router.post("/worklog", status_code=201)
def add_work(body: WorkIn, u: User = Depends(require("employee")), s: Session = Depends(get_session)):
    w = WorkLog(user_id=u.id, **body.model_dump())
    s.add(w)
    s.commit()
    s.refresh(w)
    return w.model_dump()


@router.get("/worklog/mine")
def my_work(u: User = Depends(require("employee")), s: Session = Depends(get_session)):
    return [w.model_dump() for w in s.exec(select(WorkLog).where(WorkLog.user_id == u.id).order_by(WorkLog.created_at.desc()).limit(50))]


# ---------- редактор 3D: сценарии и AI-оценка ----------

class AssessIn(BaseModel):
    changes: list[str] = Field(max_length=100)
    before: dict
    after: dict
    conflicts: list[str] = Field(default_factory=list, max_length=200)
    consequences: list[str] = Field(default_factory=list, max_length=100)
    assumptions: list[str] = Field(default_factory=list, max_length=50)


@router.post("/editor/assess")
def editor_assess(body: AssessIn, _: User = Depends(require("manager", "student", "employee"))):
    return assess_layout(body.model_dump())


class ScenarioIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    items: list[dict] = Field(max_length=300)
    summary: dict
    idea_id: int | None = None


def scenario_out(sc: Scenario, author: User | None) -> dict:
    return {**sc.model_dump(exclude={"items_json", "summary_json"}), "items": json.loads(sc.items_json),
            "summary": json.loads(sc.summary_json), "author": public_user(author) if author else None}


@router.post("/scenarios", status_code=201)
def save_scenario(body: ScenarioIn, u: User = Depends(require("manager")), s: Session = Depends(get_session)):
    sc = Scenario(name=body.name.strip(), author_id=u.id, items_json=json.dumps(body.items, ensure_ascii=False),
                  summary_json=json.dumps(body.summary, ensure_ascii=False), idea_id=body.idea_id)
    s.add(sc)
    s.commit()
    s.refresh(sc)
    return scenario_out(sc, u)


@router.get("/scenarios")
def list_scenarios(_: User = Depends(require("manager")), s: Session = Depends(get_session)):
    rows = list(s.exec(select(Scenario).order_by(Scenario.created_at.desc())))
    authors = {u.id: u for u in s.exec(select(User))} if rows else {}
    return [scenario_out(r, authors.get(r.author_id)) for r in rows]


@router.delete("/scenarios/{scenario_id}", status_code=204)
def delete_scenario(scenario_id: int, _: User = Depends(require("manager")), s: Session = Depends(get_session)):
    sc = s.get(Scenario, scenario_id)
    if not sc:
        raise HTTPException(404, "Сценарий не найден")
    s.delete(sc)
    s.commit()


# ---------- демо ----------

@router.post("/demo/reset")
def demo_reset(_: User = Depends(require("manager")), s: Session = Depends(get_session)):
    """Вернуть демо-данные к исходным перед показом: идеи, сообщения, смены, работы, сценарии."""
    reset_demo(s)
    return {"ideas": len(list(s.exec(select(Idea)))), "incidents": len(list(s.exec(select(Incident))))}
