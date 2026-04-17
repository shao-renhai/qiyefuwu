"""角色权限依赖项：基于当前用户的 role 字段做访问控制。"""

from typing import Union, List
from fastapi import Depends, HTTPException
from db.database import User
from services.auth import get_current_user


def require_role(roles: Union[str, List[str]]):
    """返回一个 FastAPI 依赖项，只有指定角色才能访问端点。

    使用示例：
        @router.post("/admin-only")
        def admin_endpoint(user: User = Depends(require_role("founder"))):
            ...
    """
    if isinstance(roles, str):
        allowed = {roles.lower()}
    else:
        allowed = {r.lower() for r in roles}

    def _dep(current_user: User = Depends(get_current_user)) -> User:
        user_role = (current_user.role or "consultant").lower()
        if user_role not in allowed:
            raise HTTPException(
                status_code=403,
                detail=f"需要角色 {sorted(allowed)}，当前 {user_role}",
            )
        return current_user

    return _dep
