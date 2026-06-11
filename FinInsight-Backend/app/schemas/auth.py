from typing import Literal

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=8, max_length=200)


class UserResponse(BaseModel):
    id: str
    username: str
    role: Literal["user", "admin"]
    is_active: bool


class CreateUserRequest(LoginRequest):
    role: Literal["user", "admin"]


class UpdateUserRequest(BaseModel):
    is_active: bool
