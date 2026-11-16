from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, PasswordUpdateRequest, ProfileUpdateRequest, RegisterRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _serialize_user(u: User) -> dict:
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "bio": u.bio,
        "target_role": u.target_role,
        "avatar_url": u.avatar_url,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    exists = db.scalar(
        select(User).where(
            or_(func.lower(User.email) == payload.email.lower(), func.lower(User.username) == payload.username.lower())
        )
    )
    if exists:
        raise HTTPException(status_code=409, detail="An account with this email or username already exists.")

    user = User(
        username=payload.username,
        email=payload.email.lower(),
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        target_role=payload.target_role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": create_access_token(user), "user": _serialize_user(user)}


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    ident = payload.identifier.strip().lower()
    user = db.scalar(select(User).where(or_(func.lower(User.email) == ident, func.lower(User.username) == ident)))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email/username or password.")
    return {"token": create_access_token(user), "user": _serialize_user(user)}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {"user": _serialize_user(current_user)}


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    return {"ok": True}


@router.put("/profile")
def update_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.full_name = payload.full_name
    current_user.bio = payload.bio
    current_user.target_role = payload.target_role
    db.commit()
    db.refresh(current_user)
    return {"user": _serialize_user(current_user)}


@router.put("/password")
def update_password(
    payload: PasswordUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"ok": True}
