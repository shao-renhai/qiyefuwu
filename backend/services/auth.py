"""Authentication service — JWT token + password hashing."""

import logging
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from db.database import get_db, User

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# SECRET_KEY: JWT 签名密钥。
# 生产环境必须通过 SECRET_KEY 环境变量提供;若未设置,本进程会生成
# 一个随机临时 key —— 进程重启后所有已发 token 失效,且每个进程的
# key 独立(多进程部署会出现登录态不一致)。这是故意设计:让"忘
# 设 env"在开发能跑通、在生产立刻被发现。
_SECRET_KEY_FROM_ENV = os.getenv("SECRET_KEY")
if _SECRET_KEY_FROM_ENV:
    SECRET_KEY = _SECRET_KEY_FROM_ENV
else:
    SECRET_KEY = secrets.token_urlsafe(32)
    logger.warning(
        "SECRET_KEY 环境变量未设置,已生成随机临时密钥。"
        "进程重启后所有 JWT 失效;多进程部署会出现登录态不一致。"
        "生产环境必须设置 SECRET_KEY 环境变量。"
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 7  # 7 days

# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


# ---------------------------------------------------------------------------
# JWT token
# ---------------------------------------------------------------------------

def create_access_token(user_id: int, username: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": str(user_id),
        "username": username,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency: extract and validate JWT, return User object."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="登录已过期，请重新登录",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user
