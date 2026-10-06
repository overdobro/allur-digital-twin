from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
data = client.get("/api/risk").json()
risks = {r["section_id"]: r for r in data["risks"]}


def test_painting_is_realized_quality_problem_ranked_first():
    p = data["risks"][0]
    assert p["section_id"] == "painting"
    assert p["stage"] == "realized" and p["kind"] == "quality" and p["level"]["code"] == "high"
    assert "5,2%" in p["recommendation"]["what"] and "2,6 раза" in p["recommendation"]["what"]
    assert any("Камеру-02" in a for a in p["recommendation"]["actions"])
    assert any("Гипотеза" in w for w in p["recommendation"]["why"])


def test_welding_is_emerging_throughput_risk():
    w = risks["welding"]
    assert w["stage"] == "emerging" and w["kind"] == "throughput" and w["level"]["code"] == "high"
    evidence = " ".join(f["evidence"] for f in w["factors"])
    assert "94,2% → 81,0%" in evidence and "Плановое ТО" in evidence


def test_assembly_conveyor_equipment_risk():
    a = risks["assembly"]
    assert a["kind"] == "equipment" and a["level"]["code"] == "medium"
    assert any("Конвейер" in x for x in a["recommendation"]["actions"])


def test_index_is_sum_of_factors_and_bounded():
    for r in data["risks"]:
        assert 0 <= r["risk_index"] <= 100
        assert abs(r["risk_index"] - sum(f["contribution"] for f in r["factors"])) < 0.2


def test_bottleneck_shifts_from_painting_to_welding():
    b = data["bottleneck"]
    assert b["period"]["section_id"] == "painting" and b["period"]["lost_units"] == 19
    assert b["current"]["section_id"] == "welding" and b["current"]["lost_units"] == 12
    assert b["previous"]["section_id"] == "painting" and b["shifted"] is True
