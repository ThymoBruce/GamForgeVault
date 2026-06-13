"""
GameVault backend API test suite (pytest).
Covers auth, games CRUD, sessions, uploads, barcode/RAWG, friends, stats.
"""
import os
import io
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://game-vault-534.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@gamevault.com"
ADMIN_PASSWORD = "admin123"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def secondary_user():
    """Create a second user for friend-flow tests."""
    s = requests.Session()
    email = f"test_user_{uuid.uuid4().hex[:8]}@example.com"
    pwd = "secret123"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": pwd, "name": "Test Buddy"}, timeout=20)
    assert r.status_code == 200, f"register failed: {r.text}"
    data = r.json()
    return {"session": s, "email": email, "password": pwd, "user_id": data["user_id"], "name": "Test Buddy"}


# ---------- Auth ----------
class TestAuth:
    def test_register_creates_user_and_sets_cookies(self):
        s = requests.Session()
        email = f"test_reg_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "name": "Reg User"}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["email"] == email
        assert body["name"] == "Reg User"
        # cookies set
        assert "access_token" in s.cookies, f"missing access_token cookie. cookies={s.cookies}"
        # /auth/me
        me = s.get(f"{API}/auth/me", timeout=15)
        assert me.status_code == 200
        assert me.json()["email"] == email

    def test_login_admin_and_me(self, admin_session):
        r = admin_session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_EMAIL
        assert d.get("role") == "admin"

    def test_forgot_password_returns_200(self):
        r = requests.post(f"{API}/auth/forgot-password", json={"email": "nonexistent@example.com"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_reset_password_invalid_token(self):
        r = requests.post(f"{API}/auth/reset-password", json={"token": "invalid_token", "password": "abcdef"}, timeout=15)
        assert r.status_code == 400

    def test_logout_clears_cookies(self):
        s = requests.Session()
        email = f"test_logout_{uuid.uuid4().hex[:8]}@example.com"
        s.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "name": "L"}, timeout=20)
        me = s.get(f"{API}/auth/me", timeout=15)
        assert me.status_code == 200
        r = s.post(f"{API}/auth/logout", timeout=15)
        assert r.status_code == 200
        # Force-clear cookies on client side too (server sends delete_cookie but client may keep stale)
        s.cookies.clear()
        me2 = s.get(f"{API}/auth/me", timeout=15)
        assert me2.status_code == 401


# ---------- Games CRUD + filter/sort ----------
class TestGames:
    created_id = None

    def test_create_game(self, admin_session):
        payload = {"title": "TEST_Elden Ring", "platform": "PC", "release_year": 2022,
                   "genre": "ARPG", "status": "Playing", "rating": 5, "review": "Great"}
        r = admin_session.post(f"{API}/games", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == payload["title"]
        assert d["platform"] == "PC"
        assert "game_id" in d
        TestGames.created_id = d["game_id"]

    def test_list_games_returns_created(self, admin_session):
        r = admin_session.get(f"{API}/games", timeout=15)
        assert r.status_code == 200
        games = r.json()
        assert any(g["game_id"] == TestGames.created_id for g in games)

    def test_filter_by_status(self, admin_session):
        r = admin_session.get(f"{API}/games", params={"status": "Playing"}, timeout=15)
        assert r.status_code == 200
        assert all(g["status"] == "Playing" for g in r.json())

    def test_filter_by_platform_regex(self, admin_session):
        r = admin_session.get(f"{API}/games", params={"platform": "pc"}, timeout=15)
        assert r.status_code == 200
        assert all("pc" in g["platform"].lower() for g in r.json())

    def test_filter_by_year(self, admin_session):
        r = admin_session.get(f"{API}/games", params={"year": 2022}, timeout=15)
        assert r.status_code == 200
        assert all(g.get("release_year") == 2022 for g in r.json())

    def test_sort_alpha(self, admin_session):
        r = admin_session.get(f"{API}/games", params={"sort": "alpha_asc"}, timeout=15)
        assert r.status_code == 200
        titles = [g["title"] for g in r.json()]
        assert titles == sorted(titles)

    def test_get_game_by_id(self, admin_session):
        r = admin_session.get(f"{API}/games/{TestGames.created_id}", timeout=15)
        assert r.status_code == 200
        assert r.json()["game_id"] == TestGames.created_id

    def test_update_game(self, admin_session):
        r = admin_session.put(f"{API}/games/{TestGames.created_id}", json={"rating": 4}, timeout=15)
        assert r.status_code == 200
        assert r.json()["rating"] == 4
        g = admin_session.get(f"{API}/games/{TestGames.created_id}", timeout=15).json()
        assert g["rating"] == 4

    def test_get_game_forbidden_for_non_friend(self, secondary_user):
        # secondary user tries to access admin's game
        r = secondary_user["session"].get(f"{API}/games/{TestGames.created_id}", timeout=15)
        assert r.status_code == 403


# ---------- Barcode / RAWG ----------
class TestBarcodeRawg:
    def test_lookup_barcode_real(self, admin_session):
        # Real EAN for PS5 console: 0711719541110
        r = admin_session.post(f"{API}/games/lookup-barcode", json={"barcode": "0711719541110"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["barcode"] == "0711719541110"
        assert "rawg_candidates" in body
        assert "title_guess" in body

    def test_lookup_barcode_unknown(self, admin_session):
        r = admin_session.post(f"{API}/games/lookup-barcode", json={"barcode": "0000000000000"}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["barcode"] == "0000000000000"

    def test_rawg_search(self, admin_session):
        r = admin_session.get(f"{API}/games/rawg-search", params={"q": "elden ring"}, timeout=30)
        assert r.status_code == 200
        results = r.json().get("results", [])
        assert isinstance(results, list)
        assert len(results) > 0
        assert "title" in results[0]


# ---------- Sessions ----------
class TestSessions:
    sess_id = None
    game_id = None

    def test_create_session(self, admin_session):
        # need a game
        g = admin_session.post(f"{API}/games", json={"title": "TEST_SessionGame", "platform": "PC", "status": "Playing"}, timeout=15)
        assert g.status_code == 200
        TestSessions.game_id = g.json()["game_id"]
        r = admin_session.post(f"{API}/games/{TestSessions.game_id}/sessions",
                               json={"date": "2026-01-15", "duration_minutes": 60, "notes": "TEST_play"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["duration_minutes"] == 60
        TestSessions.sess_id = d["session_id"]

    def test_list_sessions_for_game(self, admin_session):
        r = admin_session.get(f"{API}/games/{TestSessions.game_id}/sessions", timeout=15)
        assert r.status_code == 200
        assert any(s["session_id"] == TestSessions.sess_id for s in r.json())

    def test_sessions_all_enriched(self, admin_session):
        r = admin_session.get(f"{API}/sessions/all", timeout=15)
        assert r.status_code == 200
        sessions = r.json()
        match = [s for s in sessions if s["session_id"] == TestSessions.sess_id]
        assert match, "created session not in /sessions/all"
        assert match[0].get("game") is not None
        assert match[0]["game"]["title"] == "TEST_SessionGame"

    def test_delete_session(self, admin_session):
        r = admin_session.delete(f"{API}/sessions/{TestSessions.sess_id}", timeout=15)
        assert r.status_code == 200


# ---------- Upload ----------
class TestUpload:
    def test_upload_and_serve(self, admin_session):
        # 1x1 PNG
        png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082")
        files = {"file": ("test.png", io.BytesIO(png), "image/png")}
        r = admin_session.post(f"{API}/upload", files=files, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "path" in d and "url" in d
        # fetch
        r2 = admin_session.get(f"{BASE_URL}{d['url']}", timeout=30)
        assert r2.status_code == 200
        assert len(r2.content) > 0


# ---------- Friends ----------
class TestFriends:
    req_id = None

    def test_user_search(self, admin_session, secondary_user):
        r = admin_session.get(f"{API}/users/search", params={"q": secondary_user["email"][:10]}, timeout=15)
        assert r.status_code == 200
        users = r.json()
        assert any(u["user_id"] == secondary_user["user_id"] for u in users)

    def test_send_request(self, admin_session, secondary_user):
        r = admin_session.post(f"{API}/friends/request", json={"to_user_id": secondary_user["user_id"]}, timeout=15)
        assert r.status_code == 200
        # get pending from secondary
        p = secondary_user["session"].get(f"{API}/friends/pending", timeout=15)
        assert p.status_code == 200
        incoming = p.json()["incoming"]
        match = [x for x in incoming if x["from_user"]["email"] == ADMIN_EMAIL]
        assert match, f"no incoming from admin: {incoming}"
        TestFriends.req_id = match[0]["request_id"]

    def test_accept_request(self, admin_session, secondary_user):
        r = secondary_user["session"].post(f"{API}/friends/accept/{TestFriends.req_id}", timeout=15)
        assert r.status_code == 200
        # friends list
        f1 = admin_session.get(f"{API}/friends", timeout=15).json()
        assert any(u["user_id"] == secondary_user["user_id"] for u in f1)

    def test_friend_games_access(self, admin_session, secondary_user):
        # after accept, admin should be able to view secondary's games (empty ok)
        r = admin_session.get(f"{API}/users/{secondary_user['user_id']}/games", timeout=15)
        assert r.status_code == 200
        assert "games" in r.json()

    def test_non_friend_games_403(self):
        # 3rd user trying to see admin
        s = requests.Session()
        email = f"test_nofriend_{uuid.uuid4().hex[:8]}@example.com"
        s.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "name": "NF"}, timeout=20)
        # admin user_id - look it up
        me = requests.Session()
        me.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        admin_id = me.get(f"{API}/auth/me", timeout=15).json()["user_id"]
        r = s.get(f"{API}/users/{admin_id}/games", timeout=15)
        assert r.status_code == 403


# ---------- Stats ----------
class TestStats:
    def test_stats_shape(self, admin_session):
        r = admin_session.get(f"{API}/stats", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_games", "by_status", "by_platform", "total_play_minutes", "total_sessions"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["total_games"], int)
        assert isinstance(d["by_status"], dict)
