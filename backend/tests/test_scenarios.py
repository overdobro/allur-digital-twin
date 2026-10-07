from fastapi.testclient import TestClient

from app.main import app
from app.services.layout_ai import rules_assess


def manager():
    c = TestClient(app)
    c.post("/api/auth/login", json={"login": "manager", "password": "allur2026"})
    return c


PAYLOAD = {"changes": ["Добавлен: Робот (6 осей)"], "before": {"monthly": 4752, "bottleneck": "Сварка"},
           "after": {"monthly": 4840, "bottleneck": "Окраска"}, "conflicts": [], "consequences": [], "assumptions": []}


def test_rules_assess():
    r = rules_assess(PAYLOAD)
    assert r["next_step"] == "pilot" and "+88" in r["recommendation"]
    assert any("Сварка → Окраска" in x for x in r["risks"])
    r2 = rules_assess({**PAYLOAD, "conflicts": ["Камера ЛКП (Камера-02)"]})
    assert r2["next_step"] == "fix_layout"
    # Ответ без LLM содержательный: что изменилось, выпуск, узкое место, риск по виду оборудования
    assert r["summary"].startswith("Добавлен: Робот (6 осей). Устойчивый выпуск 4752 → 4840 авто/мес (+88)")
    assert "узкое место смещается с «Сварка» на «Окраска»" in r["summary"]
    assert any(x.startswith("Робот:") for x in r["risks"]) and "ограничивает «Окраска»" in r["recommendation"]
    r3 = rules_assess({**PAYLOAD, "changes": ["Убран: ABB-01"], "after": {"monthly": 4600, "bottleneck": "Сварка"}})
    assert r3["next_step"] == "reject" and any("кто её возьмёт" in x for x in r3["risks"])


def test_assess_endpoint_without_key():
    c = manager()
    r = c.post("/api/editor/assess", json=PAYLOAD).json()
    assert r["source"] == "rules" and r["next_step"] == "pilot"
    assert TestClient(app).post("/api/editor/assess", json=PAYLOAD).status_code == 401


def test_scenarios_crud_manager_only():
    c = manager()
    sc = c.post("/api/scenarios", json={"name": "Третий робот на посту геометрии", "items": [{"id": "r", "type": "robot", "x": 1, "z": 2, "rot": 0}],
                                        "summary": {"before": 4752, "after": 4840}}).json()
    assert sc["items"][0]["type"] == "robot" and sc["author"]["login"] == "manager"
    assert any(x["id"] == sc["id"] for x in c.get("/api/scenarios").json())
    st = TestClient(app); st.post("/api/auth/demo", json={"login": "student_01"})
    assert st.get("/api/scenarios").status_code == 403
    assert c.delete(f"/api/scenarios/{sc['id']}").status_code == 204


def test_demo_reset_manager_only():
    st = TestClient(app); st.post("/api/auth/demo", json={"login": "student_01"})
    st.post("/api/ideas", json={"title": "Лишняя идея перед показом", "text": "Эта идея должна исчезнуть после сброса"})
    assert st.post("/api/demo/reset").status_code == 403
    r = manager().post("/api/demo/reset")
    assert r.status_code == 200 and r.json() == {"ideas": 17, "incidents": 2}
    assert not any(i["title"] == "Лишняя идея перед показом" for i in manager().get("/api/ideas/rating").json())


def test_root_requirements_match_backend():
    from pathlib import Path
    root = Path(__file__).resolve().parents[2]
    pins = lambda p: sorted(l.strip() for l in p.read_text().splitlines() if l.strip() and not l.startswith("#"))
    assert pins(root / "requirements.txt") == pins(root / "backend" / "requirements.txt")


def test_vercel_secret_required(monkeypatch):
    import pytest
    from app import security
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(RuntimeError):
        security.make_token(1, "manager")
    monkeypatch.setenv("SECRET_KEY", "x" * 40)
    assert security.read_token(security.make_token(1, "manager"))
