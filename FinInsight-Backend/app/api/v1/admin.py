from fastapi import APIRouter, Depends, HTTPException

from app.api.v1.auth import serialize_user
from app.core.auth import hash_password, require_admin
from app.models.article import PolicyArticle
from app.models.user import User
from app.schemas.auth import CreateUserRequest, UpdateUserRequest, UserResponse

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/users", response_model=list[UserResponse])
async def list_users() -> list[UserResponse]:
    users = await User.find_all().sort("-created_at").to_list()
    return [serialize_user(user) for user in users]


@router.post("/users", response_model=UserResponse)
async def create_user(payload: CreateUserRequest) -> UserResponse:
    username = payload.username.strip()
    if await User.find_one(User.username == username):
        raise HTTPException(status_code=409, detail="用户名已存在")
    user = User(
        username=username,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    await user.insert()
    return serialize_user(user)


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    payload: UpdateUserRequest,
    current_admin: User = Depends(require_admin),
) -> UserResponse:
    user = await User.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == current_admin.id and not payload.is_active:
        raise HTTPException(status_code=400, detail="不能禁用当前管理员账号")
    user.is_active = payload.is_active
    await user.save()
    return serialize_user(user)


@router.get("/summary")
async def admin_summary() -> dict[str, int]:
    return {
        "users": await User.find_all().count(),
        "active_users": await User.find(User.is_active == True).count(),  # noqa: E712
        "articles": await PolicyArticle.find_all().count(),
    }
