from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import uuid
import secrets
import bcrypt
import jwt
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Query, Header
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# -------- Config --------
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
EANDATA_KEY = os.environ.get("EANDATA_API_KEY", "")
RAWG_KEY = os.environ.get("RAWG_API_KEY", "")
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = os.environ.get("APP_NAME", "gamevault")
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# -------- DB --------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# -------- App --------
app = FastAPI(title="GameVault API")
api_router = APIRouter(prefix="/api")

# -------- Object Storage --------
storage_key_holder = {"key": None}

def init_storage():
    if storage_key_holder["key"]:
        return storage_key_holder["key"]
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key_holder["key"] = resp.json()["storage_key"]
        return storage_key_holder["key"]
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage unavailable")
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 403:
        storage_key_holder["key"] = None
        key = init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 403:
        storage_key_holder["key"] = None
        key = init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# -------- Auth helpers --------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
               "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id,
               "exp": datetime.now(timezone.utc) + timedelta(days=7),
               "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=604800, path="/")

def clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    response.delete_cookie("session_token", path="/")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    # Try Google session token
    session_token = request.cookies.get("session_token")
    if session_token and not token:
        session = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
        if session:
            exp = session.get("expires_at")
            if isinstance(exp, str):
                exp = datetime.fromisoformat(exp)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp >= datetime.now(timezone.utc):
                user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0})
                if user:
                    return user
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# -------- Models --------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class ForgotIn(BaseModel):
    email: EmailStr

class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=6)

class GoogleSessionIn(BaseModel):
    session_id: str

class GameIn(BaseModel):
    title: str
    platform: str
    release_year: Optional[int] = None
    genre: Optional[str] = None
    cover_url: Optional[str] = None
    status: str = "Backlog"  # Backlog, Playing, Completed, 100% Completed, Dropped
    rating: Optional[int] = None
    review: Optional[str] = None
    rawg_id: Optional[int] = None
    barcode: Optional[str] = None
    gallery: Optional[List[str]] = []

class GameUpdate(BaseModel):
    title: Optional[str] = None
    platform: Optional[str] = None
    release_year: Optional[int] = None
    genre: Optional[str] = None
    cover_url: Optional[str] = None
    status: Optional[str] = None
    rating: Optional[int] = None
    review: Optional[str] = None
    gallery: Optional[List[str]] = None

class SessionIn(BaseModel):
    date: str  # ISO date
    duration_minutes: int
    notes: Optional[str] = ""

class FriendRequestIn(BaseModel):
    to_user_id: str

class BarcodeLookupIn(BaseModel):
    barcode: str

# -------- Auth endpoints --------
@api_router.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": email,
        "name": body.name,
        "password_hash": hash_password(body.password),
        "picture": "",
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return {"user_id": user_id, "email": email, "name": body.name, "picture": "", "role": "user"}

@api_router.post("/auth/login")
async def login(body: LoginIn, response: Response, request: Request):
    email = body.email.lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"
    attempts = await db.login_attempts.find_one({"identifier": identifier})
    if attempts and attempts.get("locked_until"):
        locked = attempts["locked_until"]
        if isinstance(locked, str):
            locked = datetime.fromisoformat(locked)
        if locked.tzinfo is None:
            locked = locked.replace(tzinfo=timezone.utc)
        if locked > datetime.now(timezone.utc):
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        new_count = (attempts.get("count", 0) if attempts else 0) + 1
        update = {"identifier": identifier, "count": new_count, "last_attempt": datetime.now(timezone.utc).isoformat()}
        if new_count >= 5:
            update["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
        await db.login_attempts.update_one({"identifier": identifier}, {"$set": update}, upsert=True)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await db.login_attempts.delete_one({"identifier": identifier})
    access = create_access_token(user["user_id"], user["email"])
    refresh = create_refresh_token(user["user_id"])
    set_auth_cookies(response, access, refresh)
    return {"user_id": user["user_id"], "email": user["email"], "name": user.get("name", ""), "picture": user.get("picture", ""), "role": user.get("role", "user")}

@api_router.post("/auth/logout")
async def logout(response: Response, request: Request):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    clear_auth_cookies(response)
    return {"ok": True}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    rtoken = request.cookies.get("refresh_token")
    if not rtoken:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(rtoken, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        access = create_access_token(user["user_id"], user["email"])
        response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=3600, path="/")
        return {"ok": True}
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

@api_router.post("/auth/forgot-password")
async def forgot_password(body: ForgotIn):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({
            "token": token,
            "user_id": user["user_id"],
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "used": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Password reset link for {email}: /reset-password?token={token}")
    return {"ok": True, "message": "If account exists, a reset link was sent."}

@api_router.post("/auth/reset-password")
async def reset_password(body: ResetIn):
    rec = await db.password_reset_tokens.find_one({"token": body.token, "used": False})
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid or used token")
    exp = rec["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expired")
    await db.users.update_one({"user_id": rec["user_id"]}, {"$set": {"password_hash": hash_password(body.password)}})
    await db.password_reset_tokens.update_one({"token": body.token}, {"$set": {"used": True}})
    return {"ok": True}

@api_router.post("/auth/google/session")
async def google_session(body: GoogleSessionIn, response: Response):
    try:
        r = requests.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id}, timeout=15,
        )
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        logger.error(f"Google session lookup failed: {e}")
        raise HTTPException(status_code=401, detail="Google auth failed")
    email = data["email"].lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name", existing.get("name", "")), "picture": data.get("picture", existing.get("picture", ""))}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name", ""),
            "picture": data.get("picture", ""),
            "role": "user",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    session_token = data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    response.set_cookie("session_token", session_token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return user

# -------- Game lookup (EAN + RAWG) --------
def fetch_eandata(barcode: str) -> Optional[dict]:
    if not EANDATA_KEY:
        return None
    try:
        url = f"https://eandata.com/feed/?v=3&keycode={EANDATA_KEY}&mode=json&find={barcode}"
        r = requests.get(url, timeout=15)
        if r.status_code != 200:
            return None
        d = r.json()
        if d.get("status", {}).get("code") != "200":
            return None
        product = d.get("product", {})
        attrs = product.get("attributes", {})
        return {
            "title": attrs.get("product") or attrs.get("title") or "",
            "category": attrs.get("category", ""),
            "raw": attrs,
        }
    except Exception as e:
        logger.error(f"eandata error: {e}")
        return None

def rawg_search(query: str, page_size: int = 8) -> List[dict]:
    if not RAWG_KEY or not query:
        return []
    try:
        url = "https://api.rawg.io/api/games"
        params = {"key": RAWG_KEY, "search": query, "page_size": page_size}
        r = requests.get(url, params=params, timeout=15)
        r.raise_for_status()
        results = r.json().get("results", [])
        out = []
        for g in results:
            platforms = ", ".join([p.get("platform", {}).get("name", "") for p in (g.get("platforms") or [])])
            genres = ", ".join([gn.get("name", "") for gn in (g.get("genres") or [])])
            out.append({
                "rawg_id": g.get("id"),
                "title": g.get("name", ""),
                "cover_url": g.get("background_image", ""),
                "release_year": int(g.get("released", "0000")[:4]) if g.get("released") else None,
                "platform": platforms,
                "genre": genres,
                "rating": g.get("rating", 0),
            })
        return out
    except Exception as e:
        logger.error(f"rawg error: {e}")
        return []

@api_router.post("/games/lookup-barcode")
async def lookup_barcode(body: BarcodeLookupIn, user: dict = Depends(get_current_user)):
    ean = fetch_eandata(body.barcode)
    title_guess = (ean or {}).get("title", "")
    candidates = rawg_search(title_guess) if title_guess else []
    return {"barcode": body.barcode, "eandata": ean, "title_guess": title_guess, "rawg_candidates": candidates}

@api_router.get("/games/rawg-search")
async def rawg_search_endpoint(q: str = Query(..., min_length=1), user: dict = Depends(get_current_user)):
    return {"results": rawg_search(q)}

# -------- Game CRUD --------
@api_router.post("/games")
async def create_game(body: GameIn, user: dict = Depends(get_current_user)):
    game_id = f"game_{uuid.uuid4().hex[:12]}"
    doc = body.model_dump()
    doc.update({
        "game_id": game_id,
        "user_id": user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.games.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/games")
async def list_games(
    user: dict = Depends(get_current_user),
    status: Optional[str] = None,
    platform: Optional[str] = None,
    year: Optional[int] = None,
    sort: str = "created_desc",
):
    q = {"user_id": user["user_id"]}
    if status: q["status"] = status
    if platform: q["platform"] = {"$regex": platform, "$options": "i"}
    if year: q["release_year"] = year
    sort_map = {
        "created_desc": ("created_at", -1),
        "alpha_asc": ("title", 1),
        "alpha_desc": ("title", -1),
        "year_desc": ("release_year", -1),
        "year_asc": ("release_year", 1),
    }
    field, direction = sort_map.get(sort, ("created_at", -1))
    cursor = db.games.find(q, {"_id": 0}).sort(field, direction)
    return await cursor.to_list(1000)

@api_router.get("/games/{game_id}")
async def get_game(game_id: str, user: dict = Depends(get_current_user)):
    g = await db.games.find_one({"game_id": game_id}, {"_id": 0})
    if not g:
        raise HTTPException(status_code=404, detail="Game not found")
    # allow owner or friend
    if g["user_id"] != user["user_id"]:
        is_friend = await db.friendships.find_one({
            "$or": [
                {"user_a": user["user_id"], "user_b": g["user_id"]},
                {"user_b": user["user_id"], "user_a": g["user_id"]},
            ]
        })
        if not is_friend:
            raise HTTPException(status_code=403, detail="Forbidden")
    return g

@api_router.put("/games/{game_id}")
async def update_game(game_id: str, body: GameUpdate, user: dict = Depends(get_current_user)):
    g = await db.games.find_one({"game_id": game_id, "user_id": user["user_id"]})
    if not g:
        raise HTTPException(status_code=404, detail="Game not found")
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.games.update_one({"game_id": game_id}, {"$set": update})
    g2 = await db.games.find_one({"game_id": game_id}, {"_id": 0})
    return g2

@api_router.delete("/games/{game_id}")
async def delete_game(game_id: str, user: dict = Depends(get_current_user)):
    res = await db.games.delete_one({"game_id": game_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Game not found")
    await db.gameplay_sessions.delete_many({"game_id": game_id})
    return {"ok": True}

# -------- Gameplay Sessions --------
@api_router.post("/games/{game_id}/sessions")
async def add_session(game_id: str, body: SessionIn, user: dict = Depends(get_current_user)):
    g = await db.games.find_one({"game_id": game_id, "user_id": user["user_id"]})
    if not g:
        raise HTTPException(status_code=404, detail="Game not found")
    sid = f"sess_{uuid.uuid4().hex[:12]}"
    doc = {
        "session_id": sid,
        "game_id": game_id,
        "user_id": user["user_id"],
        "date": body.date,
        "duration_minutes": body.duration_minutes,
        "notes": body.notes or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.gameplay_sessions.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/games/{game_id}/sessions")
async def list_sessions(game_id: str, user: dict = Depends(get_current_user)):
    cur = db.gameplay_sessions.find({"game_id": game_id, "user_id": user["user_id"]}, {"_id": 0}).sort("date", -1)
    return await cur.to_list(1000)

@api_router.get("/sessions/all")
async def list_all_sessions(user: dict = Depends(get_current_user)):
    cur = db.gameplay_sessions.find({"user_id": user["user_id"]}, {"_id": 0}).sort("date", -1)
    sessions = await cur.to_list(1000)
    # attach game info
    game_ids = list({s["game_id"] for s in sessions})
    games = await db.games.find({"game_id": {"$in": game_ids}}, {"_id": 0, "game_id": 1, "title": 1, "cover_url": 1, "platform": 1}).to_list(1000)
    gmap = {g["game_id"]: g for g in games}
    for s in sessions:
        s["game"] = gmap.get(s["game_id"])
    return sessions

@api_router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    res = await db.gameplay_sessions.delete_one({"session_id": session_id, "user_id": user["user_id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}

# -------- Uploads --------
@api_router.post("/upload")
async def upload(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    if ext not in ("jpg", "jpeg", "png", "gif", "webp"):
        raise HTTPException(status_code=400, detail="Invalid image type")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Max 8MB")
    path = f"{APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    ct = file.content_type or f"image/{ext}"
    result = put_object(path, data, ct)
    file_id = str(uuid.uuid4())
    await db.files.insert_one({
        "file_id": file_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": ct,
        "size": result.get("size", len(data)),
        "user_id": user["user_id"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    backend_url = os.environ.get("BACKEND_PUBLIC_URL", "")
    url = f"/api/files/{result['path']}"
    return {"file_id": file_id, "path": result["path"], "url": url}

@api_router.get("/files/{path:path}")
async def serve_file(path: str):
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    data, ct = get_object(path)
    return Response(content=data, media_type=rec.get("content_type") or ct)

# -------- Friends --------
@api_router.get("/users/search")
async def search_users(q: str = Query(..., min_length=1), user: dict = Depends(get_current_user)):
    cur = db.users.find(
        {"$or": [{"email": {"$regex": q, "$options": "i"}}, {"name": {"$regex": q, "$options": "i"}}],
         "user_id": {"$ne": user["user_id"]}},
        {"_id": 0, "password_hash": 0}
    ).limit(20)
    return await cur.to_list(20)

@api_router.post("/friends/request")
async def send_friend_request(body: FriendRequestIn, user: dict = Depends(get_current_user)):
    if body.to_user_id == user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot friend yourself")
    target = await db.users.find_one({"user_id": body.to_user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    existing_friend = await db.friendships.find_one({
        "$or": [
            {"user_a": user["user_id"], "user_b": body.to_user_id},
            {"user_b": user["user_id"], "user_a": body.to_user_id},
        ]
    })
    if existing_friend:
        raise HTTPException(status_code=400, detail="Already friends")
    existing_req = await db.friend_requests.find_one({
        "from_user_id": user["user_id"], "to_user_id": body.to_user_id, "status": "pending"
    })
    if existing_req:
        return {"ok": True, "message": "Request already pending"}
    req_id = f"req_{uuid.uuid4().hex[:12]}"
    await db.friend_requests.insert_one({
        "request_id": req_id,
        "from_user_id": user["user_id"],
        "to_user_id": body.to_user_id,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "request_id": req_id}

@api_router.post("/friends/accept/{request_id}")
async def accept_request(request_id: str, user: dict = Depends(get_current_user)):
    req = await db.friend_requests.find_one({"request_id": request_id, "to_user_id": user["user_id"], "status": "pending"})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    await db.friend_requests.update_one({"request_id": request_id}, {"$set": {"status": "accepted"}})
    await db.friendships.insert_one({
        "user_a": req["from_user_id"],
        "user_b": user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}

@api_router.post("/friends/decline/{request_id}")
async def decline_request(request_id: str, user: dict = Depends(get_current_user)):
    res = await db.friend_requests.update_one(
        {"request_id": request_id, "to_user_id": user["user_id"], "status": "pending"},
        {"$set": {"status": "declined"}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Request not found")
    return {"ok": True}

@api_router.get("/friends")
async def list_friends(user: dict = Depends(get_current_user)):
    cur = db.friendships.find({"$or": [{"user_a": user["user_id"]}, {"user_b": user["user_id"]}]}, {"_id": 0})
    relations = await cur.to_list(1000)
    friend_ids = [r["user_b"] if r["user_a"] == user["user_id"] else r["user_a"] for r in relations]
    if not friend_ids:
        return []
    users = await db.users.find({"user_id": {"$in": friend_ids}}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@api_router.get("/friends/pending")
async def list_pending_requests(user: dict = Depends(get_current_user)):
    incoming = await db.friend_requests.find({"to_user_id": user["user_id"], "status": "pending"}, {"_id": 0}).to_list(1000)
    outgoing = await db.friend_requests.find({"from_user_id": user["user_id"], "status": "pending"}, {"_id": 0}).to_list(1000)
    # enrich with user info
    all_ids = list({r["from_user_id"] for r in incoming} | {r["to_user_id"] for r in outgoing})
    users = await db.users.find({"user_id": {"$in": all_ids}}, {"_id": 0, "password_hash": 0}).to_list(1000)
    umap = {u["user_id"]: u for u in users}
    for r in incoming: r["from_user"] = umap.get(r["from_user_id"])
    for r in outgoing: r["to_user"] = umap.get(r["to_user_id"])
    return {"incoming": incoming, "outgoing": outgoing}

@api_router.get("/users/{user_id}/games")
async def user_games(user_id: str, user: dict = Depends(get_current_user)):
    if user_id != user["user_id"]:
        is_friend = await db.friendships.find_one({
            "$or": [
                {"user_a": user["user_id"], "user_b": user_id},
                {"user_b": user["user_id"], "user_a": user_id},
            ]
        })
        if not is_friend:
            raise HTTPException(status_code=403, detail="Not friends with this user")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    games = await db.games.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"user": target, "games": games}

# -------- Friend Activity Feed --------
@api_router.get("/activity/feed")
async def activity_feed(user: dict = Depends(get_current_user), limit: int = 30):
    rels = await db.friendships.find(
        {"$or": [{"user_a": user["user_id"]}, {"user_b": user["user_id"]}]}, {"_id": 0}
    ).to_list(1000)
    friend_ids = [r["user_b"] if r["user_a"] == user["user_id"] else r["user_a"] for r in rels]
    if not friend_ids:
        return []
    users = await db.users.find({"user_id": {"$in": friend_ids}}, {"_id": 0, "password_hash": 0}).to_list(1000)
    umap = {u["user_id"]: u for u in users}
    # Recent games added by friends
    recent_games = await db.games.find(
        {"user_id": {"$in": friend_ids}}, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    recent_sessions = await db.gameplay_sessions.find(
        {"user_id": {"$in": friend_ids}}, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    game_ids = list({s["game_id"] for s in recent_sessions})
    sgames = await db.games.find({"game_id": {"$in": game_ids}}, {"_id": 0}).to_list(1000) if game_ids else []
    sgmap = {g["game_id"]: g for g in sgames}
    events = []
    for g in recent_games:
        events.append({
            "type": "added",
            "ts": g.get("created_at", ""),
            "user": umap.get(g["user_id"]),
            "game": g,
        })
    for s in recent_sessions:
        events.append({
            "type": "session",
            "ts": s.get("created_at", ""),
            "user": umap.get(s["user_id"]),
            "session": s,
            "game": sgmap.get(s["game_id"]),
        })
    events.sort(key=lambda e: e["ts"], reverse=True)
    return events[:limit]

# -------- CSV Import / Export --------
import csv
import io as _io

CSV_HEADERS = ["title", "platform", "release_year", "genre", "cover_url", "status", "rating", "review", "barcode"]

@api_router.get("/export/games.csv")
async def export_csv(user: dict = Depends(get_current_user)):
    cur = db.games.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1)
    games = await cur.to_list(5000)
    buf = _io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_HEADERS, extrasaction="ignore")
    writer.writeheader()
    for g in games:
        writer.writerow({h: g.get(h, "") if g.get(h) is not None else "" for h in CSV_HEADERS})
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="gamevault-catalog.csv"'},
    )

@api_router.post("/import/games-csv")
async def import_csv(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="CSV file required")
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    reader = csv.DictReader(_io.StringIO(text))
    created = 0
    skipped = 0
    errors = []
    for idx, row in enumerate(reader, start=2):
        title = (row.get("title") or "").strip()
        platform = (row.get("platform") or "").strip()
        if not title or not platform:
            skipped += 1
            errors.append({"row": idx, "error": "Missing title or platform"})
            continue
        year_raw = (row.get("release_year") or "").strip()
        try:
            year = int(year_raw) if year_raw else None
        except ValueError:
            year = None
        rating_raw = (row.get("rating") or "").strip()
        try:
            rating = int(rating_raw) if rating_raw else None
        except ValueError:
            rating = None
        status = (row.get("status") or "Backlog").strip() or "Backlog"
        if status not in ("Backlog", "Playing", "Completed", "100% Completed", "Dropped"):
            status = "Backlog"
        game_id = f"game_{uuid.uuid4().hex[:12]}"
        doc = {
            "game_id": game_id,
            "user_id": user["user_id"],
            "title": title,
            "platform": platform,
            "release_year": year,
            "genre": (row.get("genre") or "").strip() or None,
            "cover_url": (row.get("cover_url") or "").strip() or None,
            "status": status,
            "rating": rating,
            "review": (row.get("review") or "").strip() or None,
            "barcode": (row.get("barcode") or "").strip() or None,
            "gallery": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.games.insert_one(doc)
        created += 1
    return {"created": created, "skipped": skipped, "errors": errors[:20]}

# -------- Stats --------
@api_router.get("/stats")
async def stats(user: dict = Depends(get_current_user)):
    games = await db.games.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(2000)
    by_status = {}
    by_platform = {}
    for g in games:
        by_status[g.get("status", "Backlog")] = by_status.get(g.get("status", "Backlog"), 0) + 1
        p = g.get("platform") or "Other"
        by_platform[p] = by_platform.get(p, 0) + 1
    sessions = await db.gameplay_sessions.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(5000)
    total_minutes = sum(s.get("duration_minutes", 0) for s in sessions)
    return {
        "total_games": len(games),
        "by_status": by_status,
        "by_platform": by_platform,
        "total_play_minutes": total_minutes,
        "total_sessions": len(sessions),
    }

# -------- Health --------
@api_router.get("/")
async def root():
    return {"message": "GameVault API", "status": "ok"}

# -------- Startup --------
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.games.create_index("user_id")
    await db.games.create_index("game_id", unique=True)
    await db.gameplay_sessions.create_index("user_id")
    await db.gameplay_sessions.create_index("game_id")
    await db.user_sessions.create_index("session_token", unique=True)
    await db.friend_requests.create_index([("from_user_id", 1), ("to_user_id", 1)])
    await db.friendships.create_index([("user_a", 1), ("user_b", 1)])
    await db.login_attempts.create_index("identifier")
    # admin seed
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@gamevault.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": admin_email,
            "name": "Admin",
            "password_hash": hash_password(admin_password),
            "picture": "",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    elif existing.get("password_hash") and not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
    init_storage()
    logger.info("Startup complete")

@app.on_event("shutdown")
async def on_shutdown():
    client.close()

app.include_router(api_router)

# CORS – allow credentials with reflected origin via regex
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
