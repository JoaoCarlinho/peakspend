"""
Health check endpoints for service monitoring.
"""

import time
from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, status
from pydantic import BaseModel

from app.config.logger import logger

router = APIRouter(tags=["health"])

# Track service start time for uptime calculation
START_TIME = time.time()
SERVICE_VERSION = "1.0.0"


class HealthResponse(BaseModel):
    """Health check response model."""

    status: str
    version: str
    timestamp: str


class ReadinessResponse(BaseModel):
    """Readiness check response model."""

    ready: bool
    version: str
    uptime_seconds: float
    dependencies: Dict[str, str]


class LivenessResponse(BaseModel):
    """Liveness check response model."""

    alive: bool
    version: str
    uptime_seconds: float


def get_uptime() -> float:
    """Calculate service uptime in seconds."""
    return time.time() - START_TIME


async def check_redis() -> str:
    """Check Redis connection status."""
    try:
        # TODO: Implement actual Redis connection check when Redis client is set up
        # For now, return "not_configured" as Redis integration is in future stories
        return "not_configured"
    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        return "unhealthy"


async def check_model_registry() -> str:
    """Check model registry status."""
    try:
        # TODO: Implement actual model registry check when MLflow is integrated
        # For now, return "not_configured" as model registry is in future stories
        return "not_configured"
    except Exception as e:
        logger.error(f"Model registry health check failed: {e}")
        return "unhealthy"


@router.get("/health", response_model=HealthResponse, status_code=status.HTTP_200_OK)
async def health_check() -> HealthResponse:
    """
    Basic health check endpoint.

    Returns service status, version, and timestamp.
    """
    return HealthResponse(
        status="ok",
        version=SERVICE_VERSION,
        timestamp=datetime.now().isoformat(),
    )


@router.get("/health/ready", response_model=ReadinessResponse, status_code=status.HTTP_200_OK)
async def readiness_check() -> ReadinessResponse:
    """
    Readiness check endpoint.

    Checks if the service is ready to accept requests.
    Validates dependencies like Redis and model registry.
    """
    redis_status = await check_redis()
    model_registry_status = await check_model_registry()

    # Service is ready if critical dependencies are healthy or not yet configured
    # (not_configured is acceptable during initial development)
    is_ready = redis_status in ("healthy", "not_configured") and \
               model_registry_status in ("healthy", "not_configured")

    return ReadinessResponse(
        ready=is_ready,
        version=SERVICE_VERSION,
        uptime_seconds=get_uptime(),
        dependencies={
            "redis": redis_status,
            "model_registry": model_registry_status,
        },
    )


@router.get("/health/live", response_model=LivenessResponse, status_code=status.HTTP_200_OK)
async def liveness_check() -> LivenessResponse:
    """
    Liveness check endpoint.

    Checks if the service is alive and responsive.
    Does not check dependencies - only service process health.
    """
    return LivenessResponse(
        alive=True,
        version=SERVICE_VERSION,
        uptime_seconds=get_uptime(),
    )
