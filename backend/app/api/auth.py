import os

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import User, get_session
from app.security import SESSION_TTL_S, make_token, read_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
COOKIE = "twin_session"


def public_user(u: User) -> dict:
    return {"id": u.id, "login": u.login, "role": u.role, "name": u.name, "title": u.title,
            "section_id": u.section_id, "course": u.course}


def current_user(twin_session: str | None = Cookie(None), s: Session = Depends(get_session)) -> User | None:
    data = read_token(twin_session)
    if not data:
        return None
    u = s.get(User, data["uid"])
    return u if u and u.role == data["role"] else None


def require(*roles: str):
    def dep(u: User | None = Depends(current_user)) -> User:
        if u is None:
            raise HTTPException(401, "Нужно войти")
        if roles and u.role not in roles:
            raise HTTPException(403, "Недостаточно прав для этой роли")
        return u
    return dep


def _set_cookie(resp: Response, req: Request, u: User) -> None:
    https = req.headers.get("x-forwarded-proto", req.url.scheme) == "https"
    resp.set_cookie(COOKIE, make_token(u.id, u.role), max_age=SESSION_TTL_S, httponly=True, samesite="lax", secure=https, path="/")


class LoginIn(BaseModel):
    login: str
    password: str


class DemoIn(BaseModel):
    login: str


@router.get("/hint")
def hint():
    """Подсказку с демо-паролем показываем, только пока пароль руководителя не сменён через MANAGER_PASSWORD."""
    custom = os.getenv("MANAGER_PASSWORD", "allur2026") != "allur2026"
    return {"manager_demo_password": None if custom else "allur2026"}


@router.get("/accounts")
def accounts(role: str = Query(..., pattern="^(employee|student)$"), s: Session = Depends(get_session)):
    """Демо-аккаунты сотрудников и обучающихся для выбора на экране входа."""
    return [public_user(u) for u in s.exec(select(User).where(User.role == role).order_by(User.login))]


@router.post("/login")
def login(body: LoginIn, req: Request, resp: Response, s: Session = Depends(get_session)):
    """Вход руководителя по логину и паролю."""
    u = s.exec(select(User).where(User.login == body.login)).first()
    if not u or u.role != "manager" or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Неверный логин или пароль")
    _set_cookie(resp, req, u)
    return public_user(u)


@router.post("/demo")
def demo(body: DemoIn, req: Request, resp: Response, s: Session = Depends(get_session)):
    """Вход в демо-аккаунт сотрудника или обучающегося (без пароля). Руководитель так войти не может."""
    u = s.exec(select(User).where(User.login == body.login)).first()
    if not u or u.role not in ("employee", "student"):
        raise HTTPException(404, "Демо-аккаунт не найден")
    _set_cookie(resp, req, u)
    return public_user(u)


@router.post("/logout")
def logout(resp: Response):
    resp.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(u: User | None = Depends(current_user)):
    return public_user(u) if u else None
