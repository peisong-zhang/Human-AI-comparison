import hashlib
from typing import Any, Optional

from fastapi import Request

from .settings import get_settings


def hash_ip(ip: Optional[str]) -> Optional[str]:
    if not ip:
        return None
    secret = get_settings().ip_hash_secret
    digest = hashlib.sha256(f"{secret}:{ip}".encode("utf-8")).hexdigest()
    return digest


def get_client_ip(request: Request) -> Optional[str]:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    client = request.client
    if client:
        return client.host
    return None


def to_dict(model: Any) -> dict[str, Any]:
    """Return a shallow dict from a SQLAlchemy model."""
    return {column.name: getattr(model, column.name) for column in model.__table__.columns}
