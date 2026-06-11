from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.core.auth import (
    create_session,
    get_current_user,
    hash_session_token,
    verify_password,
)
from app.core.config import get_settings
from app.models.user import User, UserSession
from app.schemas.auth import LoginRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def serialize_user(user: User) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        username=user.username,
        role=user.role,
        is_active=user.is_active,
    )


@router.post("/login", response_model=UserResponse)
async def login(payload: LoginRequest, response: Response) -> UserResponse:
    user = await User.find_one(User.username == payload.username.strip())
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")

    token, _ = await create_session(user)
    settings = get_settings()
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        max_age=settings.session_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )
    return serialize_user(user)


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response) -> None:
    settings = get_settings()
    token = request.cookies.get(settings.auth_cookie_name)
    if token:
        session = await UserSession.find_one(UserSession.token_hash == hash_session_token(token))
        if session is not None:
            await session.delete()
    response.delete_cookie(settings.auth_cookie_name, path="/")


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)) -> UserResponse:
    return serialize_user(user)
