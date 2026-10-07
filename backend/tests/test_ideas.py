from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.repository import get_repository
from app.seed_ideas import IDEAS
from app.services import ideas as ideas_svc


def demo(login):
    c = TestClient(app)
    c.post("/api/auth/demo", json={"login": login})
    return c


def manager():
    c = TestClient(app)
    c.post("/api/auth/login", json={"login": "manager", "password": "allur2026"})
    return c


def test_seed_matches_plan_table():
    assert [len(IDEAS[f"student_0{i}"]) for i in range(1, 9)] == [2, 3, 1, 2, 3, 1, 2, 3]
    seeded = {it["title"] for items in IDEAS.values() for it in items}
    mine = {i["title"] for i in demo("student_02").get("/api/ideas/mine").json()}
    assert {it["title"] for it in IDEAS["student_02"]} <= mine
    r = [x for x in manager().get("/api/ideas/rating").json() if x["title"] in seeded]
    assert len(r) == 17 and all(x["ai"]["source"] == "rules" for x in r)


def test_score_formula():
    assert ideas_svc.score({"effect": "high", "realism": "high", "complexity": "low"}, 1) == 100
    assert ideas_svc.score({"effect": "high", "realism": "high", "complexity": "low"}) == 90
    assert ideas_svc.score({"effect": "low", "realism": "low", "complexity": "high"}) == 0
    assert ideas_svc.score({"effect": "medium", "realism": "medium", "complexity": "medium"}, 0.5) == 50
    repo = get_repository()
    assert ideas_svc.specificity("Датчик на Камере-02", "порог перепада давления", repo) == 1.0
    assert ideas_svc.specificity("Геймификация", "баллы за идеи", repo) == 0.0


def test_rules_are_honest():
    repo = get_repository()
    weak = ideas_svc.rules_evaluate("Полностью автоматическая сборка без людей", "Заменить всех роботами, 100% автоматически", "assembly", repo)
    assert weak["realism"] == "low" and weak["next_step"] == "expert"
    good = ideas_svc.rules_evaluate("Датчик на фильтрах Камеры-02", "Датчик перепада давления на фильтре приточки", None, repo)
    assert good["section_id"] == "painting" and good["effect"] == "high" and good["scenario"]["object"] == "sensor"


def test_submit_gets_instant_ai_answer_without_key():
    c = demo("student_04")
    r = c.post("/api/ideas", json={"title": "Буфер перед сборкой", "text": "Увеличить буфер окрашенных кузовов перед сборкой на 4 места"})
    assert r.status_code == 201
    idea = r.json()
    assert idea["ai"]["source"] == "rules" and idea["section_id"] == "assembly"
    assert set(idea["ai"]) >= {"realism", "effect", "complexity", "risks", "checks", "next_step", "scenario", "score"}
    assert idea["final_score"] == idea["ai"]["score"]


def test_claude_path_and_fallback(monkeypatch):
    repo = get_repository()
    monkeypatch.setattr(ideas_svc, "settings", SimpleNamespace(**{**vars(ideas_svc.settings), "anthropic_api_key": "sk-test"}))
    fake = {"summary": "s", "section_id": "welding", "realism": "high", "effect": "medium", "complexity": "medium",
            "risks": ["r"], "checks": ["c"], "next_step": "pilot",
            "scenario": {"action": "add", "object": "teleport", "section_id": "welding", "note": "n"}}
    monkeypatch.setattr(ideas_svc, "claude_evaluate", lambda *a: (dict(fake), "claude-opus-5-5"))
    ev = ideas_svc.evaluate("t", "текст идеи", None, repo)
    assert ev["source"] == "claude" and ev["scenario"] is None  # неизвестный объект отброшен
    def boom(*a):
        raise ideas_svc.anthropic.APIConnectionError(request=None)
    monkeypatch.setattr(ideas_svc, "claude_evaluate", boom)
    ev = ideas_svc.evaluate("Датчик", "Датчик на фильтре камеры окраски", None, repo)
    assert ev["source"] == "rules" and ev["fallback_reason"] == "network"


def test_grant_flow_expert_decides():
    s = demo("student_06")
    idea = s.post("/api/ideas", json={"title": "Табло темпа Сварки", "text": "Показывать сварщикам темп смены и отставание от плана"}).json()
    m = manager()
    assert s.patch(f"/api/ideas/{idea['id']}/review", json={"status": "finalist"}).status_code == 403  # не руководитель
    assert m.patch(f"/api/ideas/{idea['id']}/review", json={"status": "winner", "expert_score": 9}).status_code == 409  # не финалист
    assert m.patch(f"/api/ideas/{idea['id']}/review", json={"status": "finalist"}).status_code == 409  # нет оценки эксперта
    r = m.patch(f"/api/ideas/{idea['id']}/review", json={"status": "finalist", "expert_score": 9, "expert_comment": "Сильно"}).json()
    assert r["final_score"] == round(0.4 * r["ai"]["score"] + 0.6 * 90)
    assert m.patch(f"/api/ideas/{idea['id']}/review", json={"status": "winner"}).json()["status"] == "winner"
    rating = s.get("/api/ideas/rating").json()
    assert next(x for x in rating if x["id"] == idea["id"])["status"] == "winner"


def test_reevaluate_rights():
    other = demo("student_01")
    mine = demo("student_03")
    idea_id = mine.get("/api/ideas/mine").json()[0]["id"]
    assert other.post(f"/api/ideas/{idea_id}/reevaluate").status_code == 403
    assert mine.post(f"/api/ideas/{idea_id}/reevaluate").status_code == 200
