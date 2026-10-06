from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_monthly_forecast():
    f = client.get("/api/forecast", params={"working_days": 22}).json()
    assert f["avg_output_per_shift"] == 120.0 and f["shifts"] == 44
    assert f["forecast"] == 5280 and f["gap"] == -220 and f["status"] == "critical"
    assert f["capacity_at_plan"] == 5280
    assert f["required_per_shift"] == 125.0
    assert f["models_plan_total"] == 4800 and f["models_gap"] == -700


def test_effect_scenarios():
    e = client.get("/api/effect", params={"working_days": 22}).json()
    s = {x["id"]: x for x in e["scenarios"]}
    # Окраска: 231 / 2 = 115,5 кузовов/смену; брак за период 10/231 = 4,329%; (4,329 − 2)% × 115,5 × 44 = 118,4
    assert s["painting_quality"]["units"] == 118
    # Сварка 111 × 44 = 4884 → −616 к цели
    assert s["welding_inaction"]["units"] == -616
    # Аварийные простои 120 мин / 2 дня = 60 мин/сутки × 22 × 50% × 0,25 авто/мин = 165
    assert s["downtime_cut"]["units"] == 165
    assert all(x["money"] is None for x in e["scenarios"])


def test_effect_money_only_with_margin():
    e = client.get("/api/effect", params={"working_days": 22, "margin_per_car": 1_000_000}).json()
    assert e["scenarios"][0]["money"] == 118_000_000
