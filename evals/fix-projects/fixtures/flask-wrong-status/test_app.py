from app import app, USERS


def setup_function():
    USERS.clear()


def test_signup_without_an_email_is_refused():
    client = app.test_client()
    r = client.post("/api/signup", json={})
    assert r.status_code == 400


def test_signup_works():
    client = app.test_client()
    r = client.post("/api/signup", json={"email": "sam@example.com"})
    assert r.status_code == 201
