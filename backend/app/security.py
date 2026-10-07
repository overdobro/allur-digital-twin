"""Пароли и сессии без внешних зависимостей: PBKDF2-SHA256 и подписанный HMAC токен в cookie.

Уровень — демонстрационный: достаточно, чтобы руководитель входил по паролю, а роли не подделывались
со стороны браузера. Для промышленной эксплуатации — SSO/LDAP предприятия.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

ITERATIONS = 200_000
SESSION_TTL_S = 7 * 24 * 3600


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"pbkdf2${ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        _, it, salt, dk = stored.split("$")
        calc = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(it))
        return hmac.compare_digest(calc.hex(), dk)
    except ValueError:
        return False


def _secret() -> bytes:
    key = os.getenv("SECRET_KEY")
    if not key and os.getenv("VERCEL"):
        # Публичный сайт с известным ключом = любой подделает cookie руководителя. Лучше явная ошибка.
        raise RuntimeError("На Vercel задайте переменную окружения SECRET_KEY (длинная случайная строка)")
    return (key or "dev-secret-change-me").encode()


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def make_token(user_id: int, role: str) -> str:
    payload = _b64(json.dumps({"uid": user_id, "role": role, "exp": int(time.time()) + SESSION_TTL_S}).encode())
    sig = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def read_token(token: str | None) -> dict | None:
    if not token or "." not in token:
        return None
    payload, sig = token.rsplit(".", 1)
    good = _b64(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, good):
        return None
    try:
        data = json.loads(_unb64(payload))
    except ValueError:
        return None
    return data if data.get("exp", 0) > time.time() else None
