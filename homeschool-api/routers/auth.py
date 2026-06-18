from fastapi import APIRouter, HTTPException, status
from models.schemas import LoginRequest, TokenResponse
from core.security import create_access_token
from core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    if req.role == "parent":
        if req.credential != settings.parent_password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid parent password",
            )
    elif req.role == "child":
        if req.credential != settings.child_pin:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid child PIN",
            )
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown role")

    token = create_access_token({"sub": req.role, "role": req.role})
    return TokenResponse(access_token=token, role=req.role)
