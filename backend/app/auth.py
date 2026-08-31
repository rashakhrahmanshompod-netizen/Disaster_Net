import jwt
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database import get_db
from app import models

SECRET_KEY = "disasternet_secret_key_super_secure_key_2026"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day token expiration

security = HTTPBearer()

def hash_password(password: str) -> str:
    """Uses SHA-256 with salt for simple, robust zero-dependency hashing."""
    salt = "disasternet_salt_v1_"
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return hash_password(plain_password) == hashed_password

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    # JWT RFC 7519 defines the subject ("sub") claim as a string.  PyJWT
    # 2.10+ validates this strictly during decode, so normalise it here.
    if "sub" in to_encode and to_encode["sub"] is not None:
        to_encode["sub"] = str(to_encode["sub"])

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> models.User:
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        subject = payload.get("sub")
        if subject is None:
            raise credentials_exception
        user_id = int(subject)
    except (jwt.PyJWTError, TypeError, ValueError):
        raise credentials_exception

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user

def require_admin(user: models.User = Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return user

def require_government(user: models.User = Depends(get_current_user)):
    if user.role not in ["government", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Government or Admin privileges required"
        )
    return user

def require_organization(user: models.User = Depends(get_current_user)):
    if user.role not in ["organization", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization or Admin privileges required"
        )
    return user


def require_hospital(user: models.User = Depends(get_current_user)):
    if user.role != "hospital":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Hospital privileges required"
        )
    return user


def require_shelter(user: models.User = Depends(get_current_user)):
    if user.role != "shelter":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Disaster Shelter privileges required"
        )
    return user


def require_volunteer(user: models.User = Depends(get_current_user)):
    if user.role != "volunteer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Volunteer privileges required")
    return user


def require_donor(user: models.User = Depends(get_current_user)):
    if user.role != "donor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Donor privileges required")
    return user


def require_beneficiary(user: models.User = Depends(get_current_user)):
    if user.role != "beneficiary":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Citizen / Beneficiary privileges required")
    return user
