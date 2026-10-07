"""Сверка seed с исходным docx: данные перенесены 1:1 и внутренне согласованы."""
from fastapi.testclient import TestClient

from app.main import app
from app.repository import get_repository

client = TestClient(app)


def test_seed_counts():
    repo = get_repository()
    assert len(repo.production) == 6
    assert len(repo.downtime) == 4
    assert len(repo.quality) == 6
    assert sum(m["plan"] for m in repo.monthly_plan) == 4800
    assert repo.dates == ["2026-10-01", "2026-10-02"]


def test_quality_pct_matches_counts():
    for r in get_repository().quality:
        assert round(r["defects"] / r["produced"] * 100, 1) == r["defect_pct"], r


def test_quality_produced_matches_production_fact():
    repo = get_repository()
    facts = {(p["date"], repo.section_by_line(p["line"])["name"]): p["fact"] for p in repo.production}
    for q in repo.quality:
        assert facts[(q["date"], q["section"])] == q["produced"]


def test_load_is_hours_over_shift():
    for p in get_repository().production:
        assert abs(p["hours"] / 8 * 100 - p["load_pct"]) <= 1, p


def test_health_and_meta():
    assert client.get("/api/health").json()["status"] == "ok"
    meta = client.get("/api/meta").json()
    assert meta["targets"]["monthly_output_min"] == 5500
    assert len(meta["assumptions"]) == 9  # A1–A9
