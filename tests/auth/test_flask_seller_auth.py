"""
Phase 2C/2I — Flask seller + ml-service hardening (projections, internal guard, internal create).
Run from the repo root:  npm run test:auth:flask
Isolated: uses an in-memory fake MongoDB; never connects to Atlas.
"""
import copy
import os
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "visual-ml-service"))
os.environ["MONGODB_URI"] = "mongodb://127.0.0.1:1/none"
os.environ.pop("VISUAL_ML_HOST", None)

from werkzeug.security import generate_password_hash, check_password_hash  # noqa: E402
import mongo_seller  # noqa: E402

SECRET = "flask-test-internal-secret"
BCRYPT = "$2b$10$" + "N9qo8uLOickgx2ZMRZoMye" + "IjZAgcfl7p92ldGxad68LJZdL17lhWy"  # well-formed 60-char bcrypt


class FakeCursor(list):
    pass


class FakeCollection:
    def __init__(self):
        self.docs = []

    @staticmethod
    def _project(doc, projection):
        out = copy.deepcopy(doc)
        for k, v in (projection or {}).items():
            if v == 0:
                out.pop(k, None)
        return out

    def _match(self, doc, q):
        return all(doc.get(k) == v for k, v in q.items())

    def find_one(self, q, projection=None):
        for d in self.docs:
            if self._match(d, q):
                return self._project(d, projection)
        return None

    def find(self, q=None, projection=None):
        return FakeCursor(self._project(d, projection) for d in self.docs if self._match(d, q or {}))

    def insert_one(self, doc):
        doc["_id"] = f"oid{len(self.docs)}"
        self.docs.append(copy.deepcopy(doc))

    def count_documents(self, q):
        return len(self.find(q))

    def create_index(self, *a, **k):
        return None


class FakeDB(dict):
    def __missing__(self, key):
        self[key] = FakeCollection()
        return self[key]


db = FakeDB()
mongo_seller._get_db = lambda: db
sellers = db[mongo_seller.SELLERS_COLLECTION]
AUTH = {"token_version": 3, "failed_logins": 2, "reset_token_hash": "deadbeef", "verify_token_hash": "cafe"}


def reset():
    sellers.docs[:] = [
        {"_id": "1", "seller_id": "sel_a", "name": "A", "email": "a@x.com", "city": "Lahore", "seller_type": "company",
         "password_hash": generate_password_hash("Test-Passw0rd!"), "auth": copy.deepcopy(AUTH)},
        {"_id": "2", "seller_id": "sel_b", "name": "B", "email": "b@x.com", "password_hash": BCRYPT, "auth": copy.deepcopy(AUTH)},
    ]


results = []


def check(name, cond):
    results.append(bool(cond))
    print(("PASS " if cond else "FAIL ") + name)


def private_free(doc):
    return doc is not None and "password_hash" not in doc and "auth" not in doc and "_id" not in doc


reset()

# ── mongo_seller read paths ────────────────────────────────────────────────
g = mongo_seller.get_seller("sel_a")
check("get_seller excludes password_hash + auth, keeps public fields", private_free(g) and g["city"] == "Lahore")
e = mongo_seller.get_seller_by_email("A@x.com ")
check("get_seller_by_email excludes password_hash + auth", private_free(e) and e["seller_id"] == "sel_a")
lg = mongo_seller.login_seller("a@x.com", "Test-Passw0rd!")
check("login_seller success result excludes password_hash + auth", private_free(lg) and lg["seller_id"] == "sel_a")
check("login_seller cannot verify bcrypt (Node is the verifier)", mongo_seller.login_seller("b@x.com", "anything") == {"error": "Incorrect password."})

c = mongo_seller.create_seller(name="C", email="c@x.com", password_hash=BCRYPT, auth={"token_version": 0},
                               seller_type="company", max_listings=None)
stored = sellers.find_one({"email": "c@x.com"})
check("create_seller stores precomputed hash + auth as given", stored["password_hash"] == BCRYPT and stored["auth"] == {"token_version": 0})
check("create_seller response excludes password_hash + auth", private_free(c) and c["seller_id"].startswith("sel_"))
c2 = mongo_seller.create_seller(name="D", email="d@x.com", password="Legacy-Passw0rd")
stored2 = sellers.find_one({"email": "d@x.com"})
check("create_seller legacy path still hashes with werkzeug, no auth",
      check_password_hash(stored2["password_hash"], "Legacy-Passw0rd") and "auth" not in stored2 and private_free(c2))

# ── Flask routes (Phase 2I: app-wide internal guard, same as app.py) ──────────
from flask import Flask  # noqa: E402
import seller_routes  # noqa: E402
import internal_auth  # noqa: E402

app = Flask(__name__)
internal_auth.install_internal_guard(app)
app.register_blueprint(seller_routes.seller_bp)


@app.route("/health")
def _health():
    return {"status": "ok"}


@app.route("/images/<path:p>", methods=["GET", "POST"])
def _image(p):
    return "img"


client = app.test_client()
os.environ["INTERNAL_API_SECRET"] = SECRET
H = {"X-Internal-Secret": SECRET}
reset()

# Guard: only GET /images and GET /health are public; everything else needs the secret.
check("public GET /health works without the secret", client.get("/health").status_code == 200)
check("public GET /images/<path> works without the secret", client.get("/images/a/b.jpg").status_code == 200)
check("POST /images/... is NOT public (only GET/HEAD)", client.post("/images/a/b.jpg").status_code == 401)
for path in ["/seller/profile/sel_a", "/seller/by-email?email=a@x.com", "/seller/all", "/seller/products?seller_id=sel_a",
             "/seller/products/public", "/seller/categories", "/seller/search?q=x"]:
    check("GET " + path.split("?")[0] + " without secret -> 401", client.get(path).status_code == 401)
for method, path in [("post", "/seller/product"), ("put", "/seller/product/p1"), ("delete", "/seller/product/p1")]:
    check(method.upper() + " " + path + " without secret -> 401", getattr(client, method)(path, json={}).status_code == 401)
check("wrong secret -> 401", client.get("/seller/all", headers={"X-Internal-Secret": "wrong"}).status_code == 401)
check("secret with extra whitespace -> 401", client.get("/seller/all", headers={"X-Internal-Secret": " " + SECRET}).status_code == 401)
os.environ.pop("INTERNAL_API_SECRET")
check("guard fails closed (503) when INTERNAL_API_SECRET is unset", client.get("/seller/all", headers=H).status_code == 503)
check("public /health still works when the secret is unset", client.get("/health").status_code == 200)
os.environ["INTERNAL_API_SECRET"] = SECRET

r = client.get("/seller/profile/sel_a", headers=H).get_json()
check("GET /seller/profile (Node, with secret) excludes password_hash + auth", r["success"] and private_free(r["seller"]))
r = client.get("/seller/by-email?email=a@x.com", headers=H).get_json()
check("GET /seller/by-email (with secret) excludes password_hash + auth", r["success"] and private_free(r["seller"]))
r = client.get("/seller/all", headers=H).get_json()
check("GET /seller/all (with secret) excludes password_hash + auth for every seller",
      r["success"] and len(r["sellers"]) == 2 and all("password_hash" not in s and "auth" not in s for s in r["sellers"]))

# Legacy Flask auth endpoints are gone (410) - even for a caller holding the secret.
r = client.post("/seller/login", json={"email": "a@x.com", "password": "Test-Passw0rd!"}, headers=H)
check("POST /seller/login (legacy) -> 410 ENDPOINT_REMOVED, no seller data",
      r.status_code == 410 and r.get_json()["code"] == "ENDPOINT_REMOVED" and "seller" not in r.get_json())
r = client.post("/seller/register", json={"name": "Q", "email": "q@x.com", "password": "Plain-Passw0rd"}, headers=H)
check("POST /seller/register (legacy) -> 410 and creates nothing",
      r.status_code == 410 and sellers.find_one({"email": "q@x.com"}) is None)
check("legacy routes without the secret -> 401 (guard first)",
      client.post("/seller/login", json={}).status_code == 401 and client.post("/seller/register", json={}).status_code == 401)

# Internal create: secret handling
payload = {"name": "New Seller", "email": "new@x.com", "phone": "0300", "city": "Multan", "seller_type": "company",
           "password_hash": BCRYPT,
           "auth": {"email_verified": False, "token_version": 0, "failed_logins": 0,
                    "password_changed_at": "2026-09-25T10:00:00.000Z", "login_disabled": True, "evil": "x"}}
check("internal create without secret -> 401", client.post("/seller/internal/create", json=payload).status_code == 401)
check("internal create with wrong secret -> 401",
      client.post("/seller/internal/create", json=payload, headers={"X-Internal-Secret": "wrong"}).status_code == 401)
os.environ.pop("INTERNAL_API_SECRET")
check("internal create fails closed (503) when INTERNAL_API_SECRET unset",
      client.post("/seller/internal/create", json=payload, headers={"X-Internal-Secret": ""}).status_code == 503)
os.environ["INTERNAL_API_SECRET"] = SECRET
check("nothing was created by rejected internal calls", sellers.find_one({"email": "new@x.com"}) is None)

resp = client.post("/seller/internal/create", json=payload, headers=H)
body = resp.get_json()
doc = sellers.find_one({"email": "new@x.com"})
check("internal create with secret -> 201 (legitimate Node -> Flask flow)", resp.status_code == 201 and body["success"])
check("internal create response excludes password_hash + auth", private_free(body["seller"]))
check("internal create stores Node's bcrypt hash verbatim", doc["password_hash"] == BCRYPT)
check("internal create keeps seller rules (company -> unlimited, sel_ id)",
      doc["seller_type"] == "company" and doc["max_listings"] is None and doc["seller_id"].startswith("sel_"))
check("internal create whitelists auth (drops login_disabled/unknown keys) and parses dates",
      set(doc["auth"]) == {"email_verified", "token_version", "failed_logins", "password_changed_at"}
      and doc["auth"]["email_verified"] is False and isinstance(doc["auth"]["password_changed_at"], datetime))
bad_type = client.post("/seller/internal/create", json={**payload, "email": "t@x.com", "seller_type": "admin"}, headers=H)
check("internal create invalid seller_type falls back to individual/5",
      sellers.find_one({"email": "t@x.com"})["seller_type"] == "individual" and sellers.find_one({"email": "t@x.com"})["max_listings"] == 5)
check("internal create rejects non-bcrypt hash",
      client.post("/seller/internal/create", json={**payload, "email": "h@x.com", "password_hash": "scrypt:1:1:1$a$b"}, headers=H).status_code == 400)
check("internal create rejects plaintext-only requests",
      client.post("/seller/internal/create", json={"name": "P", "email": "p@x.com", "password": "Plain-Passw0rd"}, headers=H).status_code == 400)
dup = client.post("/seller/internal/create", json=payload, headers=H)
check("internal create duplicate email -> 409 EMAIL_IN_USE", dup.status_code == 409 and dup.get_json()["code"] == "EMAIL_IN_USE")

# Real app wiring (static: importing app.py would load the ML models)
app_src = (ROOT / "visual-ml-service" / "app.py").read_text(encoding="utf-8")
check("visual-ml app.py installs the internal guard", "install_internal_guard(app)" in app_src)
check("visual-ml app.py restricts CORS to the frontend origin",
      "CORS(app, origins=frontend_origins())" in app_src and "CORS(app)" not in app_src.replace("CORS(app, origins", ""))
check("visual-ml app.py never hardcodes debug=True", "debug=True" not in app_src and "debug=debug_enabled()" in app_src)
os.environ.pop("FLASK_DEBUG", None)
check("Werkzeug debugger is off by default", internal_auth.debug_enabled() is False)

# ml-service (:5001): load its app with its ML modules stubbed out
import importlib.util  # noqa: E402
import types  # noqa: E402

_stub_names = {"dataset_generator": ["generate_dataset", "save_dataset", "load_dataset", "append_user_to_dataset"],
               "kmeans_trainer": ["train_kmeans", "save_model", "load_and_preprocess", "retrain_with_new_data"],
               "predictor": ["predict_adjustment"]}
saved = {k: sys.modules.get(k) for k in _stub_names}
for name, attrs in _stub_names.items():
    m = types.ModuleType(name)
    for a in attrs:
        setattr(m, a, lambda *a, **k: {"ok": True})
    if name == "dataset_generator":
        m.CSV_PATH = "none.csv"
    sys.modules[name] = m
spec = importlib.util.spec_from_file_location("ml_service_app", ROOT / "ml-service" / "app.py")
ml = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ml)
for k, v in saved.items():
    if v is None:
        sys.modules.pop(k, None)
    else:
        sys.modules[k] = v
mlc = ml.app.test_client()
check("ml-service GET /health is public", mlc.get("/health").status_code == 200)
check("ml-service POST /ml/dowry-adjustment without secret -> 401", mlc.post("/ml/dowry-adjustment", json={}).status_code == 401)
check("ml-service GET /ml/dataset-stats without secret -> 401", mlc.get("/ml/dataset-stats").status_code == 401)
check("ml-service wrong secret -> 401", mlc.get("/ml/dataset-stats", headers={"X-Internal-Secret": "nope"}).status_code == 401)
check("ml-service with secret passes the guard", mlc.get("/ml/dataset-stats", headers=H).status_code != 401)
ml_src = (ROOT / "ml-service" / "app.py").read_text(encoding="utf-8")
check("ml-service binds to localhost by default and never forces debug",
      '"0.0.0.0"' not in ml_src and 'os.environ.get("ML_SERVICE_HOST", "127.0.0.1")' in ml_src and "debug=True" not in ml_src)

import config  # noqa: E402
check("Flask binds to localhost by default", config.FLASK_HOST == "127.0.0.1")

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
