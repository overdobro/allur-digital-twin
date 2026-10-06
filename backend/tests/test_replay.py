from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
data = client.get("/api/replay").json()
overview = {d: {n["id"]: n["status"] for n in client.get("/api/overview", params={"date": d}).json()["nodes"]}
            for d in ("2026-10-01", "2026-10-02")}


def test_steps_cover_all_records():
    kinds = [s["kind"] for s in data["steps"]]
    assert kinds.count("day") == 2 and kinds.count("production") == 6
    assert kinds.count("quality") == 6 and kinds.count("downtime") == 4


def test_starts_empty_and_ends_matching_overview():
    assert set(data["steps"][0]["nodes"].values()) == {"no_data"}
    assert data["steps"][-1]["nodes"] == overview["2026-10-02"]
    last_day1 = [s for s in data["steps"] if s["date"] == "2026-10-01"][-1]
    assert last_day1["nodes"] == overview["2026-10-01"]


def test_painting_defect_event_text():
    e = next(s for s in data["steps"] if s["kind"] == "quality" and s["section_id"] == "painting" and s["date"] == "2026-10-02")
    assert e["severity"] == "critical" and "5,2%" in e["text"] and "2,6 раза" in e["text"]
