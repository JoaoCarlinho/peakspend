"""
Model retraining API endpoints.

Provides endpoints for triggering and monitoring model retraining.
"""

from typing import Any, Dict

from fastapi import APIRouter, BackgroundTasks, status
from pydantic import BaseModel

from app.config.logger import logger
from app.middleware.metrics import track_metrics
from app.services.retraining_service import RetrainingService

router = APIRouter(prefix='/api/ml/retraining', tags=['retraining'])


class RetrainingTriggerRequest(BaseModel):
    """Request to trigger model retraining."""

    user_id: str
    force: bool = False


class RetrainingResponse(BaseModel):
    """Retraining trigger response."""

    user_id: str
    triggered: bool
    message: str
    status: str  # queued, running, or skipped


class RetrainingStatusResponse(BaseModel):
    """Retraining status response."""

    user_id: str
    should_retrain: bool
    retrain_reasons: list  # Matches service's get_retraining_schedule() output
    last_training_date: str | None
    next_scheduled_date: str | None
    days_since_training: int | None
    feedback_count: int
    acceptance_rate: float


@router.post(
    '/trigger',
    response_model=RetrainingResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
@track_metrics('retrain_trigger')
async def trigger_retraining(
    request: RetrainingTriggerRequest,
    background_tasks: BackgroundTasks,
) -> RetrainingResponse:
    """
    Trigger model retraining for a user.

    This endpoint checks if retraining is needed and
    queues a background retraining task.

    Args:
        request: Retraining trigger request
        background_tasks: FastAPI background tasks

    Returns:
        Retraining response
    """
    logger.info(
        f'Retraining trigger requested for user {request.user_id} '
        f'(force={request.force})'
    )

    retraining_service = RetrainingService(request.user_id)

    # Check if retraining needed
    decision = retraining_service.should_retrain()

    if not decision['should_retrain'] and not request.force:
        return RetrainingResponse(
            user_id=request.user_id,
            triggered=False,
            message='Retraining not needed yet',
            status='skipped',
        )

    # Queue retraining in background
    background_tasks.add_task(
        _run_retraining, request.user_id, retraining_service
    )

    logger.info(
        f'Retraining queued for user {request.user_id} '
        f'(reasons: {decision["reasons"]})'
    )

    return RetrainingResponse(
        user_id=request.user_id,
        triggered=True,
        message='Retraining queued successfully',
        status='queued',
    )


@router.get(
    '/status/{user_id}',
    response_model=RetrainingStatusResponse,
    status_code=status.HTTP_200_OK,
)
@track_metrics('retrain_status')
async def get_retraining_status(
    user_id: str,
) -> RetrainingStatusResponse:
    """
    Get retraining status for a user.

    Shows whether retraining is recommended and why.

    Args:
        user_id: User identifier

    Returns:
        Retraining status
    """
    logger.info(f'Fetching retraining status for user {user_id}')

    retraining_service = RetrainingService(user_id)
    schedule = retraining_service.get_retraining_schedule()

    return RetrainingStatusResponse(**schedule)


@router.get(
    '/schedule',
    response_model=Dict[str, Any],
    status_code=status.HTTP_200_OK,
)
@track_metrics('retrain_schedule')
async def get_retraining_schedule() -> Dict[str, Any]:
    """
    Get global retraining schedule.

    Returns information about scheduled retraining jobs.

    Returns:
        Schedule information
    """
    # TODO: Implement global scheduling system
    # For now, return placeholder
    return {
        'schedule_type': 'on-demand',
        'batch_retraining': 'nightly',
        'next_batch_run': 'Not implemented',
        'message': 'Retraining currently runs on-demand via /trigger endpoint',
    }


async def _run_retraining(
    user_id: str, retraining_service: RetrainingService
) -> None:
    """
    Background task to run model retraining.

    Args:
        user_id: User identifier
        retraining_service: Retraining service instance
    """
    try:
        logger.info(f'Starting background retraining for user {user_id}')
        result = retraining_service.retrain_model()

        if result['success']:
            logger.info(
                f'Retraining completed for user {user_id}: '
                f'accuracy={result["metrics"].get("accuracy", 0.0):.3f}'
            )
        else:
            logger.warning(
                f'Retraining failed for user {user_id}: '
                f'{result["message"]}'
            )
    except Exception as e:
        logger.error(
            f'Error during retraining for user {user_id}: {e}',
            exc_info=True,
        )
