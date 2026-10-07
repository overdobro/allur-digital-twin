"""Хранилище пользовательских данных: роли, идеи, инциденты, посещаемость, журнал работ.

Данные кейса (производство, качество, простои) остаются в seed.json — они неизменны.
Здесь только то, что создают пользователи. Локально — SQLite, на Vercel — Postgres (Neon) через DATABASE_URL.
"""
import os
from datetime import date, datetime, timezone
from functools import lru_cache

from sqlalchemy import UniqueConstraint
from sqlalchemy.pool import StaticPool
from sqlmodel import Field, Session, SQLModel, create_engine, select

from app.security import hash_password


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    login: str = Field(index=True, unique=True)
    role: str  # manager | employee | student
    name: str
    title: str = ""  # должность / направление обучения
    section_id: str | None = None  # участок сотрудника
    course: int | None = None  # курс обучающегося
    password_hash: str | None = None  # только у руководителя; демо-аккаунты входят выбором


class Idea(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    author_id: int = Field(foreign_key="user.id", index=True)
    title: str
    text: str
    section_id: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    ai_json: str | None = None  # структурированная AI-оценка
    ai_source: str | None = None  # claude | rules
    status: str = "submitted"  # submitted | shortlisted | finalist | winner | rejected
    expert_score: int | None = None  # 1–10, ставит руководитель/эксперт
    expert_comment: str | None = None
    reviewed_at: datetime | None = None


class Incident(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    author_id: int = Field(foreign_key="user.id", index=True)
    section_id: str
    equipment: str | None = None
    text: str
    severity: str = "warning"  # warning | critical
    status: str = "open"  # open | ack | closed
    created_at: datetime = Field(default_factory=utcnow)


class Attendance(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "day"),)
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    day: date
    check_in: datetime = Field(default_factory=utcnow)
    check_out: datetime | None = None


class WorkLog(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    text: str
    units: int | None = None


class Scenario(SQLModel, table=True):
    """Сохранённый сценарий редактора 3D: расстановка и итог проверки."""
    id: int | None = Field(default=None, primary_key=True)
    name: str
    author_id: int = Field(foreign_key="user.id")
    items_json: str  # расстановка объектов
    summary_json: str  # «было → стало», конфликты, последствия
    idea_id: int | None = Field(default=None, foreign_key="idea.id")
    created_at: datetime = Field(default_factory=utcnow)


# ---------- подключение ----------

def database_url() -> str:
    url = os.getenv("DATABASE_URL", "sqlite:///./data/twin.db")
    # Neon/Vercel отдают postgres:// — SQLAlchemy нужен явный драйвер psycopg
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


@lru_cache
def get_engine():
    """Движок создаётся один раз на процесс; таблицы и демо-аккаунты — при первом обращении
    (на Vercel функции не всегда проходят lifespan, в тестах TestClient его не вызывает)."""
    engine = _make_engine(database_url())
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        seed_users(s)
        seed_ideas(s)
    return engine


def _make_engine(url: str):
    if url.startswith("sqlite"):
        if url == "sqlite://" or ":memory:" in url:
            return create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        path = url.removeprefix("sqlite:///")
        if os.path.dirname(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
        return create_engine(url, connect_args={"check_same_thread": False})
    # Serverless: короткоживущие соединения, проверка перед использованием
    return create_engine(url, pool_pre_ping=True, pool_size=2, max_overflow=2)


def get_session():
    with Session(get_engine()) as s:
        yield s


# ---------- демо-аккаунты (по таблице из плана функционала) ----------

EMPLOYEES = [
    ("emp_01", "Сварщик", "welding"),
    ("emp_02", "Оператор поста геометрии (роботы ABB)", "welding"),
    ("emp_03", "Оператор камеры ЛКП", "painting"),
    ("emp_04", "Сборщик", "assembly"),
    ("emp_05", "Слесарь-ремонтник конвейера", "assembly"),
    ("emp_06", "Контролёр тестовой линии", "qc"),
]
# login, курс — как в таблице документа; число идей задаётся при наполнении идеями
STUDENTS = [("student_01", 2), ("student_02", 3), ("student_03", 4), ("student_04", 1),
            ("student_05", 2), ("student_06", 3), ("student_07", 4), ("student_08", 1)]


def seed_users(s: Session) -> None:
    if s.exec(select(User).limit(1)).first():
        return
    s.add(User(login="manager", role="manager", name="Руководитель производства", title="Руководитель",
               password_hash=hash_password(os.getenv("MANAGER_PASSWORD", "allur2026"))))
    for login, title, section in EMPLOYEES:
        s.add(User(login=login, role="employee", name="Демонстрационный сотрудник", title=title, section_id=section))
    for login, course in STUDENTS:
        s.add(User(login=login, role="student", name="Демонстрационный студент", title="АЛЛЮР Университет", course=course))
    s.commit()


def seed_ideas(s: Session) -> None:
    """Готовые идеи демо-обучающихся — один раз, если идей ещё нет."""
    if s.exec(select(Idea).limit(1)).first():
        return
    import json as _json
    from datetime import timedelta

    from app.repository import get_repository
    from app.seed_ideas import IDEAS
    from app.services.ideas import evaluate_offline

    repo = get_repository()
    users = {u.login: u for u in s.exec(select(User))}
    t0 = utcnow() - timedelta(days=6)
    n = 0
    for login, items in IDEAS.items():
        for it in items:
            ev = evaluate_offline(it["title"], it["text"], it["section_id"], repo)
            s.add(Idea(author_id=users[login].id, title=it["title"], text=it["text"], section_id=it["section_id"],
                       created_at=t0 + timedelta(hours=7 * n), ai_json=_json.dumps(ev, ensure_ascii=False), ai_source=ev["source"],
                       status=it.get("demo_status", "submitted"), expert_score=it.get("demo_expert"),
                       expert_comment=it.get("demo_comment"), reviewed_at=utcnow() if it.get("demo_status") else None))
            n += 1
    s.commit()


def init_db() -> None:
    get_engine()
