"""Точка входа Vercel Function: тот же FastAPI-бэкенд, что в Docker (backend/app/main.py).

Vercel направляет сюда все запросы /api/* (см. vercel.json); фронтенд отдаётся статикой с CDN.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402,F401
