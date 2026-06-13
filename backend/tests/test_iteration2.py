"""
GameVault iteration 2 backend tests:
- CSV export (/api/export/games.csv)
- CSV import (/api/import/games-csv)
- Activity feed (/api/activity/feed)
- Reset password end-to-end
- Regression: /api/games/{game_id}
"""
import os
import io
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@gamevault.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def fresh_user():
    s = requests.Session()
    email = f"test_iter2_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "secret123"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": pwd, "name": "Iter2 User"}, timeout=20)
    assert r.status_code == 200, r.text
    return {"session": s, "email": email, "password": pwd, "user_id": r.json()["user_id"]}


# ---------- CSV Export ----------
class TestCsvExport:
    def test_export_requires_auth(self):
        r = requests.get(f"{API}/export/games.csv", timeout=15)
        assert r.status_code == 401

    def test_export_returns_csv_with_headers(self, admin):
        # Ensure at least one game exists
        admin.post(f"{API}/games", json={"title": "TEST_CSV_Export", "platform": "PC",
                                          "release_year": 2024, "status": "Playing", "rating": 4}, timeout=15)
        r = admin.get(f"{API}/export/games.csv", timeout=20)
        assert r.status_code == 200
        # Content-Disposition attachment
        cd = r.headers.get("Content-Disposition", "")
        assert "attachment" in cd.lower()
        assert "gamevault-catalog.csv" in cd
        # Content-Type
        assert "text/csv" in r.headers.get("Content-Type", "")
        # First line is header in expected order
        first_line = r.text.splitlines()[0]
        expected = "title,platform,release_year,genre,cover_url,status,rating,review,barcode"
        assert first_line.strip() == expected, f"unexpected header: {first_line}"
        # Contains our seeded title
        assert "TEST_CSV_Export" in r.text


# ---------- CSV Import ----------
class TestCsvImport:
    def test_import_creates_games_and_skips_invalid(self, fresh_user):
        s = fresh_user["session"]
        csv_body = (
            "title,platform,release_year,genre,cover_url,status,rating,review,barcode\n"
            "TEST_ImportA,PC,2023,RPG,,Playing,5,,\n"
            "TEST_ImportB,PS5,2022,Action,,Backlog,,,\n"
            ",PC,2021,Bad,,Backlog,,,\n"               # missing title -> skipped
            "TEST_ImportNoPlatform,,2020,Bad,,Backlog,,,\n"  # missing platform -> skipped
        )
        files = {"file": ("import.csv", io.BytesIO(csv_body.encode("utf-8")), "text/csv")}
        r = s.post(f"{API}/import/games-csv", files=files, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["created"] == 2
        assert d["skipped"] == 2
        assert isinstance(d["errors"], list) and len(d["errors"]) == 2
        # verify games appear in /api/games
        g = s.get(f"{API}/games", timeout=15)
        assert g.status_code == 200
        titles = [x["title"] for x in g.json()]
        assert "TEST_ImportA" in titles
        assert "TEST_ImportB" in titles

    def test_import_rejects_non_csv(self, admin):
        files = {"file": ("data.txt", io.BytesIO(b"hello"), "text/plain")}
        r = admin.post(f"{API}/import/games-csv", files=files, timeout=15)
        assert r.status_code == 400


# ---------- Activity Feed ----------
class TestActivityFeed:
    def test_feed_empty_for_no_friends(self, fresh_user):
        # fresh_user has no friends
        r = fresh_user["session"].get(f"{API}/activity/feed", timeout=15)
        assert r.status_code == 200
        # Should be a list (empty since no friends yet)
        d = r.json()
        assert isinstance(d, list)
        assert d == []

    def test_feed_returns_added_and_session_events_for_friend(self, admin, fresh_user):
        # Make admin and fresh_user friends, then have admin create a game + session,
        # fresh_user's feed should include them.
        # 1) admin sends friend request
        req = admin.post(f"{API}/friends/request", json={"to_user_id": fresh_user["user_id"]}, timeout=15)
        assert req.status_code == 200
        # 2) fresh_user accepts
        pend = fresh_user["session"].get(f"{API}/friends/pending", timeout=15).json()
        incoming = pend["incoming"]
        admin_reqs = [x for x in incoming if x.get("from_user", {}).get("email") == ADMIN_EMAIL]
        assert admin_reqs, f"no incoming from admin: {incoming}"
        rid = admin_reqs[0]["request_id"]
        acc = fresh_user["session"].post(f"{API}/friends/accept/{rid}", timeout=15)
        assert acc.status_code == 200
        # 3) admin adds a game + session
        g = admin.post(f"{API}/games", json={"title": "TEST_FeedGame", "platform": "PC", "status": "Playing"}, timeout=15)
        assert g.status_code == 200
        gid = g.json()["game_id"]
        admin.post(f"{API}/games/{gid}/sessions",
                   json={"date": "2026-01-15", "duration_minutes": 30, "notes": "TEST_feed"}, timeout=15)
        # 4) fresh_user fetches feed
        r = fresh_user["session"].get(f"{API}/activity/feed", timeout=15)
        assert r.status_code == 200
        events = r.json()
        assert isinstance(events, list) and len(events) >= 2
        types = {e["type"] for e in events}
        assert "added" in types
        assert "session" in types
        # Items contain user/game/session info with ts
        for e in events:
            assert "ts" in e and isinstance(e["ts"], str)
            assert "user" in e and e["user"] is not None
            if e["type"] == "added":
                assert e.get("game") is not None
                assert "title" in e["game"]
            if e["type"] == "session":
                assert e.get("session") is not None
                assert e.get("game") is not None


# ---------- Reset Password E2E ----------
class TestResetPasswordE2E:
    def test_forgot_then_reset_then_login(self):
        # Create a fresh user so we don't break admin
        s = requests.Session()
        email = f"test_reset_{uuid.uuid4().hex[:8]}@example.com"
        pwd = "secret123"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": pwd, "name": "Reset User"}, timeout=20)
        assert r.status_code == 200, r.text
        # Request forgot-password
        r = requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
        assert r.status_code == 200
        # Pull token from DB
        from pymongo import MongoClient
        mongo_url = os.environ["MONGO_URL"]
        db_name = os.environ["DB_NAME"]
        mc = MongoClient(mongo_url)
        # Look up the user_id from response of /auth/me
        s2 = requests.Session()
        s2.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=15)
        me = s2.get(f"{API}/auth/me", timeout=15).json()
        uid = me["user_id"]
        rec = mc[db_name].password_reset_tokens.find_one({"user_id": uid, "used": False}, sort=[("created_at", -1)])
        assert rec is not None, "no reset token found in db"
        token = rec["token"]
        new_pwd = "NewPass1234!"
        # Reset
        rr = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": new_pwd}, timeout=15)
        assert rr.status_code == 200, rr.text
        # Old password fails
        s3 = requests.Session()
        bad = s3.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=15)
        assert bad.status_code == 401
        # New password works
        good = s3.post(f"{API}/auth/login", json={"email": email, "password": new_pwd}, timeout=15)
        assert good.status_code == 200
        # Token can't be reused
        again = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": "Whatever1!"}, timeout=15)
        assert again.status_code == 400
        mc.close()


# ---------- Regression: /api/games/{game_id} still works ----------
class TestGetGameByIdRegression:
    def test_get_game_after_route_changes(self, admin):
        g = admin.post(f"{API}/games", json={"title": "TEST_RegressionGetById", "platform": "PC"}, timeout=15)
        assert g.status_code == 200
        gid = g.json()["game_id"]
        r = admin.get(f"{API}/games/{gid}", timeout=15)
        assert r.status_code == 200
        assert r.json()["game_id"] == gid
        assert r.json()["title"] == "TEST_RegressionGetById"

    def test_export_csv_path_does_not_match_get_game(self, admin):
        # ensure /api/games/export.csv style path doesn't accidentally hit /games/{id}
        # CSV endpoint is /api/export/games.csv now
        r = admin.get(f"{API}/games/nonexistent_id_xyz", timeout=15)
        assert r.status_code == 404


# ---------- PWA static files ----------
class TestPwaStatic:
    def test_manifest_served(self):
        r = requests.head(f"{BASE_URL}/manifest.json", timeout=15, allow_redirects=True)
        # Some servers don't support HEAD - fall back to GET
        if r.status_code in (405, 404):
            r = requests.get(f"{BASE_URL}/manifest.json", timeout=15)
        assert r.status_code == 200

    def test_sw_served(self):
        r = requests.get(f"{BASE_URL}/sw.js", timeout=15)
        assert r.status_code == 200
        assert "addEventListener" in r.text or "self" in r.text
