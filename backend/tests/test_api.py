from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def nodes(date=None):
    params = {"date": date} if date else {}
    return {n["id"]: n for n in client.get("/api/overview", params=params).json()["nodes"]}


def test_map_order_and_no_data():
    n = nodes("2026-10-02")
    assert [x["id"] for x in sorted(n.values(), key=lambda x: x["order"])] == [
        "warehouse_in", "welding", "painting", "assembly", "qc", "warehouse_out"]
    for sid in ("warehouse_in", "qc", "warehouse_out"):
        assert n[sid]["status"] == "no_data" and n[sid]["metrics"] is None


def test_statuses_day1():
    n = nodes("2026-10-01")
    assert n["welding"]["status"] == "ok"
    assert n["painting"]["status"] == "critical"
    assert n["assembly"]["status"] == "ok"


def test_equipment_drilldown():
    n = nodes("2026-10-02")
    assert [e["name"] for e in n["welding"]["equipment"]] == ["ABB-01", "ABB-04"]
    conveyor = n["assembly"]["equipment"][0]
    assert conveyor["name"] == "Конвейер-03" and conveyor["status"] == "warning" and conveyor["downtime_min"] == 55
    assert n["assembly"]["status"] == "warning"


def test_section_detail_trend():
    r = client.get("/api/sections/painting").json()
    assert [t["defect_pct"] for t in r["trend"]] == [3.5, 5.2]
    assert client.get("/api/sections/nope").status_code == 404


def test_bad_date():
    assert client.get("/api/overview", params={"date": "2026-10-05"}).status_code == 404


def test_quality_and_downtime_endpoints():
    q = client.get("/api/quality").json()
    assert q["norm_pct"] == 2 and len(q["rows"]) == 6
    d = client.get("/api/downtime", params={"date": "2026-10-01"}).json()
    assert d["total_min"] == 65 and d["incidents"] == 2
