"""
Feedback collection API for continuous learning.

Allows users to accept, correct, or reject ML predictions,
building a feedback loop for model improvement.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.config.logger import logger
from app.middleware.metrics import track_metrics
from app.services.feedback_service import FeedbackService

router = APIRouter(prefix='/api/ml/feedback', tags=['feedback'])


class FeedbackRequest(BaseModel):
    """User feedback on ML prediction."""

    user_id: str = Field(..., description='User identifier')
    expense_id: str = Field(..., description='Expense identifier')
    merchant: str = Field(..., description='Merchant name')
    amount: float = Field(..., description='Transaction amount', gt=0)
    date: str = Field(..., description='Transaction date (ISO format)')
    notes: Optional[str] = Field(None, description='Expense notes')

    # ML prediction info
    predicted_category: str = Field(
        ..., description='Category predicted by ML'
    )
    confidence: float = Field(
        ..., description='Prediction confidence', ge=0.0, le=1.0
    )
    model_version: Optional[str] = Field(
        None, description='Model version used'
    )

    # User feedback
    feedback_type: str = Field(
        ...,
        description='Feedback type: accepted, corrected, or rejected',
    )
    actual_category: Optional[str] = Field(
        None, description='User-selected category (if corrected)'
    )
    feedback_notes: Optional[str] = Field(
        None, description='Optional feedback notes'
    )


class FeedbackResponse(BaseModel):
    """Feedback submission response."""

    feedback_id: str
    user_id: str
    expense_id: str
    feedback_type: str
    timestamp: str
    message: str


class FeedbackStats(BaseModel):
    """User feedback statistics."""

    user_id: str
    total_predictions: int
    accepted_count: int
    corrected_count: int
    rejected_count: int
    acceptance_rate: float
    avg_confidence_accepted: float
    avg_confidence_corrected: float
    most_corrected_categories: List[Dict[str, Any]]
    feedback_trend: List[Dict[str, Any]]


@router.post(
    '/submit',
    response_model=FeedbackResponse,
    status_code=status.HTTP_201_CREATED,
)
@track_metrics('feedback_submission')
async def submit_feedback(
    request: FeedbackRequest,
) -> FeedbackResponse:
    """
    Submit user feedback on ML prediction.

    This endpoint collects feedback for continuous learning:
    - 'accepted': User accepted the ML suggestion
    - 'corrected': User changed to different category
    - 'rejected': User rejected the suggestion entirely

    Args:
        request: Feedback request

    Returns:
        Feedback submission confirmation
    """
    logger.info(
        f'Received feedback from user {request.user_id}: '
        f'{request.feedback_type} for expense {request.expense_id}'
    )

    # Validate feedback type
    valid_types = {'accepted', 'corrected', 'rejected'}
    if request.feedback_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Invalid feedback_type. Must be one of: {valid_types}',
        )

    # Validate corrected feedback has actual_category
    if (
        request.feedback_type == 'corrected'
        and not request.actual_category
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='actual_category required for corrected feedback',
        )

    # Initialize feedback service
    feedback_service = FeedbackService(request.user_id)

    # Submit feedback
    feedback_id = feedback_service.submit_feedback(
        expense_id=request.expense_id,
        merchant=request.merchant,
        amount=request.amount,
        date=request.date,
        notes=request.notes,
        predicted_category=request.predicted_category,
        confidence=request.confidence,
        model_version=request.model_version,
        feedback_type=request.feedback_type,
        actual_category=request.actual_category,
        feedback_notes=request.feedback_notes,
    )

    # Generate response message
    if request.feedback_type == 'accepted':
        message = f'Thank you! We\'ll use this to improve your predictions.'
    elif request.feedback_type == 'corrected':
        message = (
            f'Thanks for the correction! We\'ll learn that '
            f'{request.merchant} is {request.actual_category}.'
        )
    else:
        message = 'Feedback noted. We\'ll improve our suggestions.'

    logger.info(
        f'Feedback submitted: {feedback_id} for user {request.user_id}'
    )

    return FeedbackResponse(
        feedback_id=feedback_id,
        user_id=request.user_id,
        expense_id=request.expense_id,
        feedback_type=request.feedback_type,
        timestamp=datetime.now().isoformat(),
        message=message,
    )


@router.get(
    '/stats/{user_id}',
    response_model=FeedbackStats,
    status_code=status.HTTP_200_OK,
)
@track_metrics('feedback_stats')
async def get_feedback_stats(user_id: str) -> FeedbackStats:
    """
    Get user feedback statistics.

    Shows how well the ML model performs for this user,
    including acceptance rate and common corrections.

    Args:
        user_id: User identifier

    Returns:
        Feedback statistics
    """
    logger.info(f'Fetching feedback stats for user {user_id}')

    feedback_service = FeedbackService(user_id)
    stats = feedback_service.get_feedback_stats()

    return FeedbackStats(**stats)


@router.get(
    '/history/{user_id}',
    response_model=List[Dict[str, Any]],
    status_code=status.HTTP_200_OK,
)
@track_metrics('feedback_history')
async def get_feedback_history(
    user_id: str, limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Get user feedback history.

    Returns recent feedback submissions for analytics.

    Args:
        user_id: User identifier
        limit: Maximum number of records to return

    Returns:
        Feedback history
    """
    logger.info(
        f'Fetching feedback history for user {user_id} (limit={limit})'
    )

    feedback_service = FeedbackService(user_id)
    history = feedback_service.get_feedback_history(limit=limit)

    return history
