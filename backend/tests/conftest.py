"""Тесты работают с БД в памяти: каждый запуск — чистые демо-аккаунты."""
import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ.setdefault("SECRET_KEY", "test-secret")
