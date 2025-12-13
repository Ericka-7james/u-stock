import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from supabase import create_client, Client

# Load repo-root .env for local dev; in Vercel this is harmless.
ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

# ---- Settings (simple + explicit, auth-only) ----
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "USTOCK_CORS_ORIGINS",
        "http://localhost:5173,https://u-stock.vercel.app",
    ).split(",")
    if o.strip()
]
ENV = os.getenv("ENV", "development")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_supabase() -> Client:
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="SUPABASE_URL is missing")
    if not SUPABASE_ANON_KEY:
        raise HTTPException(status_code=500, detail="SUPABASE_ANON_KEY is missing")
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

@app.get("/")
def root():
    return {"name": "u-stock-auth-backend", "status": "running", "env": ENV}

@app.get("/health")
def health():
    # Auth-only = no DB dependency
    return {"status": "ok", "supabase_url_set": bool(SUPABASE_URL), "env": ENV}

@app.get("/debug/env")
def debug_env():
    # Keep for now; remove later
    return {
        "SUPABASE_URL_set": bool(SUPABASE_URL),
        "SUPABASE_ANON_KEY_set": bool(SUPABASE_ANON_KEY),
        "CORS_ORIGINS": CORS_ORIGINS,
        "ENV": ENV,
    }

class SignupBody(BaseModel):
    email: EmailStr
    password: str
    avatar: Optional[str] = None

class LoginBody(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    email: EmailStr
    avatar: Optional[str] = None

class AuthResponse(BaseModel):
    user: UserOut
    access_token: str
    refresh_token: Optional[str] = None

@app.post("/auth/signup", response_model=AuthResponse)
def signup(body: SignupBody):
    sb = get_supabase()
    try:
        res = sb.auth.sign_up({"email": body.email, "password": body.password})
    except Exception as e:
        # show a useful error message
        raise HTTPException(status_code=400, detail=f"Supabase signup error: {repr(e)}")

    if not res or not res.user:
        raise HTTPException(status_code=400, detail=f"Signup failed. Raw response: {res}")

    return AuthResponse(
        user=UserOut(id=res.user.id, email=res.user.email, avatar=body.avatar or "📈"),
        access_token=res.session.access_token if res.session else "",
        refresh_token=res.session.refresh_token if res.session else None,
    )

@app.post("/auth/login", response_model=AuthResponse)
def login(body: LoginBody):
    sb = get_supabase()
    try:
        res = sb.auth.sign_in_with_password({"email": body.email, "password": body.password})
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Supabase login error: {repr(e)}")

    if not res.user or not res.session:
        raise HTTPException(status_code=401, detail="Invalid email/password or email not confirmed")

    return AuthResponse(
        user=UserOut(
            id=res.user.id,
            email=res.user.email,
            avatar=(res.user.user_metadata or {}).get("avatar"),
        ),
        access_token=res.session.access_token,
        refresh_token=res.session.refresh_token,
    )
