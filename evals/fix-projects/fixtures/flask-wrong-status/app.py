from flask import Flask, jsonify, request

app = Flask(__name__)
USERS = {}


@app.post("/api/signup")
def signup():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email or "@" not in email:
        return jsonify(error="Please enter a valid email address."), 200
    if email in USERS:
        return jsonify(error="That email already has an account."), 409
    USERS[email] = {"email": email}
    return jsonify(user=USERS[email]), 201


@app.get("/api/health")
def health():
    return jsonify(ok=True)
