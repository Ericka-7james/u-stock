# backend/main.py
from datetime import datetime, timedelta
from typing import Optional

import os
import jwt
import hashlib  # 👈 simple hashing for dev
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from sqlalchemy import Column, Integer, String, DateTime, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# ---------- Config ----------

DATABASE_URL = "sqlite:///./auth.db"
JWT_SECRET = os.getenv("USTOCK_JWT_SECRET", "dev-secret-change-me")
JWT_ALG = "HS256"

# ---------- DB setup ----------

Base = declarative_base()
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # needed for SQLite + threads
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    avatar = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------- Security helpers (DEV-FRIENDLY) ----------

def hash_password(password: str) -> str:
    """
    Simple SHA-256 hash for dev only.
    Later you can swap this to passlib/argon2/bcrypt once
    your dependencies are stable.
    """
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    return hash_password(password) == password_hash


def create_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


# ---------- Schemas ----------

class SignupBody(BaseModel):
    name: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    password: str
    avatar: Optional[str] = None


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    avatar: Optional[str]

    class Config:
        # Pydantic v2 equivalent of orm_mode = True
        from_attributes = True


class AuthResponse(BaseModel):
    user: UserOut
    token: str


# ---------- FastAPI app ----------

app = FastAPI()


# ---------- CORS (DEV-FRIENDLY) ----------

# In dev, allow everything. We'll tighten this before real users.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # ✅ makes sure frontend can reach backend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Simple health check ----------

@app.get("/health")
def health():
    return {"status": "ok"}


# ---------- Routes ----------

@app.post("/auth/signup", response_model=AuthResponse)
def signup(body: SignupBody, db: Session = Depends(get_db)):
    try:
        existing = db.query(User).filter(User.email == body.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")

        user = User(
            email=body.email,
            password_hash=hash_password(body.password),
            avatar=body.avatar or "📈",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        token = create_token(user.id)
        return AuthResponse(user=user, token=token)
    except HTTPException:
        raise
    except Exception as e:
        print("🔥 Signup error:", repr(e))
        raise HTTPException(status_code=500, detail="Signup failed")


@app.post("/auth/login", response_model=AuthResponse)
def login(body: LoginBody, db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.email == body.email).first()
        if not user or not verify_password(body.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        token = create_token(user.id)
        return AuthResponse(user=user, token=token)
    except HTTPException:
        raise
    except Exception as e:
        print("🔥 Login error:", repr(e))
        raise HTTPException(status_code=500, detail="Login failed")
