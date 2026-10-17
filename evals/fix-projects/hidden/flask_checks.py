# HIDDEN checks for the flask-wrong-status case. Run in the project folder: python3 flask_checks.py <name>
import os
import sys

sys.path.insert(0, os.getcwd())
from app import USERS, app  # noqa: E402

name = sys.argv[1]
client = app.test_client()
USERS.clear()
if name == "bad-email-400":
    r = client.post("/api/signup", json={"email": "not-an-email"})
    assert r.status_code == 400, f"an address with no @ must be refused with 400, got {r.status_code}"
elif name == "good-signup-201":
    r = client.post("/api/signup", json={"email": "ann@example.com"})
    assert r.status_code == 201, f"a good signup must answer 201, got {r.status_code}"
    again = client.post("/api/signup", json={"email": "ann@example.com"})
    assert again.status_code == 409, f"signing up twice must answer 409, got {again.status_code}"
else:
    sys.exit(f"no hidden check called {name}")
