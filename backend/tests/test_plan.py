from fastapi.testclient import TestClient

from app.main import app

p = TestClient(app).get("/api/plan", params={"working_days": 22}).json()


def test_models_plan_and_calculated_fact():
    m = {x["model"]: x for x in p["models"]}
    assert p["models_month_total"] == 4800 and p["target_month"] == 5500
    assert m["Chevrolet Onix"]["share_pct"] == 52.1 and m["JAC J7"]["share_pct"] == 10.4
    # Сменный план 120 × доля; факт последней смены 119 × доля (расчётный, A9)
    assert m["Chevrolet Onix"]["shift_plan"] == 62.5 and m["Chevrolet Cobalt"]["shift_plan"] == 45.0
    assert m["Chevrolet Cobalt"]["fact_last_shift"] == round(119 * 1800 / 4800, 1)
    assert all(x["calculated"] for x in p["models"])
    assert abs(sum(x["fact_period"] for x in p["models"]) - p["fact_period"]) < 0.2


def test_totals_and_forecast():
    assert p["fact_period"] == 240 and p["plan_period"] == 240 and p["completion_period_pct"] == 100.0
    assert p["forecast_month"] == 5280 and p["gap_target"] == -220 and p["gap_models"] == 480
    # План по моделям (4 800) выполним при текущем темпе — каждая модель ≥ 100%
    assert all(x["forecast_completion_pct"] >= 100 for x in p["models"])


def test_risk_zones_point_to_welding_and_painting():
    z = {r["section_id"]: r for r in p["risks"]}
    assert z["welding"]["bottleneck"] and z["welding"]["plan_completion_pct"] == 92.5
    assert z["painting"]["stage"] == "realized"
    assert [d["deviation"] for d in p["by_date"]] == [1, -1]
