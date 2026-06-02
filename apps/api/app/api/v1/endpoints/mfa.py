"""MFA endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import get_current_user, get_admin_user
from app.schemas.mfa import MfaSetupResponse, MfaEnableRequest, MfaDisableRequest, MfaStatusResponse
from app.schemas.common import MessageResponse
from app.services.mfa_service import MfaService
from app.models.user import User

router = APIRouter(prefix="/mfa", tags=["MFA"])


@router.get("/status", response_model=MfaStatusResponse)
async def mfa_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's MFA status."""
    service = MfaService(db)
    return await service.get_mfa_status(current_user.id)


@router.post("/setup", response_model=MfaSetupResponse)
async def mfa_setup(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate MFA setup data (secret, QR code, recovery codes)."""
    service = MfaService(db)
    return await service.setup_mfa(current_user.id)


@router.post("/enable", response_model=MessageResponse)
async def mfa_enable(
    body: MfaEnableRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Enable MFA after verifying the TOTP code."""
    service = MfaService(db)
    recovery_codes = await service.enable_mfa(current_user.id, body.code, body.secret)
    return {"message": "MFA enabled successfully", "detail": ",".join(recovery_codes)}


@router.post("/disable", response_model=MessageResponse)
async def mfa_disable(
    body: MfaDisableRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disable MFA."""
    service = MfaService(db)
    await service.disable_mfa(current_user.id, body.password, body.code)
    return {"message": "MFA disabled successfully"}


@router.post("/recovery-codes/regenerate")
async def regenerate_recovery_codes(
    password: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Regenerate MFA recovery codes."""
    service = MfaService(db)
    codes = await service.regenerate_recovery_codes(current_user.id, password)
    return {"recovery_codes": codes}


# ── Admin ────────────────────────────────────────────────
@router.post("/{user_id}/reset", response_model=MessageResponse)
async def admin_reset_mfa(
    user_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Force-disable a user's MFA (admin only)."""
    service = MfaService(db)
    await service.admin_reset_mfa(user_id)
    return {"message": "MFA reset for user"}
