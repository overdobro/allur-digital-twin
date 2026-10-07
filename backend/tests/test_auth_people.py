from fastapi.testclient import TestClient

from app.main import app
from app.security import hash_password, make_token, read_token, verify_password


def client():
    return TestClient(app)


def login_demo(c, login):
    r = c.post("/api/auth/demo", json={"login": login})
    assert r.status_code == 200, r.text
    return r.json()


def test_password_hash_and_token():
    h = hash_password("secret")
    assert verify_password("secret", h) and not verify_password("wrong", h) and not verify_password("x", None)
    t = make_token(5, "student")
    assert read_token(t)["uid"] == 5
    payload, sig = t.rsplit(".", 1)
    assert read_token(payload + "." + sig[:-2] + "AA") is None  # подделанная подпись
    assert read_token("garbage") is None


def test_demo_accounts_match_plan_table():
    c = client()
    st = c.get("/api/auth/accounts", params={"role": "student"}).json()
    assert [s["login"] for s in st] == [f"student_0{i}" for i in range(1, 9)]
    assert [s["course"] for s in st] == [2, 3, 4, 1, 2, 3, 4, 1]
    emp = c.get("/api/auth/accounts", params={"role": "employee"}).json()
    assert len(emp) == 6 and all(e["section_id"] for e in emp)
    assert c.get("/api/auth/accounts", params={"role": "manager"}).status_code == 422  # руководитель в списке не раскрывается


def test_manager_login_by_password_only():
    c = client()
    assert c.post("/api/auth/login", json={"login": "manager", "password": "wrong"}).status_code == 401
    assert c.post("/api/auth/demo", json={"login": "manager"}).status_code == 404  # без пароля нельзя
    assert c.post("/api/auth/login", json={"login": "student_01", "password": "x"}).status_code == 401
    r = c.post("/api/auth/login", json={"login": "manager", "password": "allur2026"})
    assert r.status_code == 200 and r.json()["role"] == "manager"
    assert c.get("/api/auth/me").json()["login"] == "manager"
    c.post("/api/auth/logout")
    assert c.get("/api/auth/me").json() is None


def test_forged_cookie_role_rejected():
    c = client()
    me = login_demo(c, "student_01")
    c.cookies.set("twin_session", make_token(me["id"], "manager"))  # роль в токене не совпадает с БД
    assert c.get("/api/auth/me").json() is None


def test_ideas_by_roles():
    c = client()
    assert c.post("/api/ideas", json={"title": "Идея", "text": "Подробное описание"}).status_code == 401
    login_demo(c, "student_02")
    r = c.post("/api/ideas", json={"title": "Буфер перед сборкой", "text": "Увеличить буфер окрашенных кузовов", "section_id": "assembly"})
    assert r.status_code == 201 and r.json()["status"] == "submitted"
    assert c.post("/api/ideas", json={"title": "Идея", "text": "Подробное описание", "section_id": "nope"}).status_code == 422
    assert c.get("/api/ideas/mine").json()[0]["title"] == "Буфер перед сборкой"  # новая — первой


def test_employee_incident_reaches_manager():
    c = client()
    login_demo(c, "emp_05")
    assert c.post("/api/attendance/check-out").status_code == 409
    a = c.post("/api/attendance/check-in").json()
    assert c.post("/api/attendance/check-in").json()["id"] == a["id"]  # без дубля
    assert c.post("/api/attendance/check-out").json()["check_out"]
    assert c.post("/api/worklog", json={"text": "Замена натяжителя цепи", "units": 1}).status_code == 201
    inc = c.post("/api/incidents", json={"section_id": "assembly", "equipment": "Конвейер-03", "text": "Посторонний шум цепи", "severity": "critical"})
    assert inc.status_code == 201
    m = client()
    assert m.get("/api/incidents").status_code == 401
    m.post("/api/auth/login", json={"login": "manager", "password": "allur2026"})
    feed = m.get("/api/incidents").json()
    assert feed[0]["equipment"] == "Конвейер-03" and feed[0]["author"]["login"] == "emp_05"
    assert m.patch(f"/api/incidents/{feed[0]['id']}", json={"status": "ack"}).json()["status"] == "ack"
    # Студент не видит ленту инцидентов
    s = client(); login_demo(s, "student_01")
    assert s.get("/api/incidents").status_code == 403
