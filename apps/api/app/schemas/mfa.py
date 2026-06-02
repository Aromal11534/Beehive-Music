"""MFA schemas."""

from pydantic import BaseModel, Field


class MfaSetupResponse(BaseModel):
    secret: str
    totp_uri: str
    qr_code_base64: str
    recovery_codes: list[str]


class MfaEnableRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)
    secret: str


class MfaDisableRequest(BaseModel):
    password: str
    code: str = Field(..., min_length=6, max_length=8)


class MfaStatusResponse(BaseModel):
    is_enabled: bool
    enabled_at: str | None = None
