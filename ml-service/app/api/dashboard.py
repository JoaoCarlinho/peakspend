"""
ML Performance Dashboard API.

Provides comprehensive metrics for ML model performance
and continuous learning visualization.
"""

from typing import Any, Dict

from fastapi import APIRouter, status
from pydantic import BaseModel

from app.config.logger import logger
from app.middleware.metrics import track_metrics
from app.services.accuracy_tracker import AccuracyTracker
from app.services.feedback_service import FeedbackService
from app.services.retraining_service import RetrainingService

router = APIRouter(prefix='/api/ml/dashboard', tags=['dashboard'])


class DashboardMetrics(BaseModel):
    """Complete ML dashboard metrics."""

    user_id: str
    # Accuracy metrics
    overall_accuracy: float
    total_predictions: int
    correct_predictions: int
    category_accuracy: Dict[str, Any]
    accuracy_trend: list
    # Feedback metrics
    feedback_stats: Dict[str, Any]
    acceptance_rate: float
    # Improvement metrics
    improvement_metrics: Dict[str, Any]
    # Retraining status
    retraining_status: Dict[str, Any]
    # Confidence calibration
    confidence_calibration: list


@router.get(
    '/{user_id}',
    response_model=DashboardMetrics,
    status_code=status.HTTP_200_OK,
)
@track_metrics('ml_dashboard')
async def get_ml_dashboard(
    user_id: str, days: int = 30
) -> DashboardMetrics:
    """
    Get comprehensive ML performance dashboard.

    Provides all metrics needed to visualize:
    - Model accuracy and improvement
    - Feedback collection stats
    - Retraining recommendations
    - Confidence calibration

    Args:
        user_id: User identifier
        days: Number of days to analyze

    Returns:
        Complete dashboard metrics
    """
    logger.info(f'Fetching ML dashboard for user {user_id} (days={days})')

    # Initialize services
    accuracy_tracker = AccuracyTracker(user_id)
    feedback_service = FeedbackService(user_id)
    retraining_service = RetrainingService(user_id)

    # Get accuracy metrics
    accuracy_metrics = accuracy_tracker.get_accuracy_metrics(days=days)

    # Get feedback stats
    feedback_stats = feedback_service.get_feedback_stats()

    # Get improvement metrics
    improvement_metrics = accuracy_tracker.get_improvement_metrics()

    # Get retraining status
    retraining_status = retraining_service.get_retraining_schedule()

    # Combine into dashboard
    dashboard = DashboardMetrics(
        user_id=user_id,
        overall_accuracy=accuracy_metrics['overall_accuracy'],
        total_predictions=accuracy_metrics['total_predictions'],
        correct_predictions=accuracy_metrics['correct_predictions'],
        category_accuracy=accuracy_metrics['category_accuracy'],
        accuracy_trend=accuracy_metrics['accuracy_trend'],
        feedback_stats=feedback_stats,
        acceptance_rate=feedback_stats['acceptance_rate'],
        improvement_metrics=improvement_metrics,
        retraining_status=retraining_status,
        confidence_calibration=accuracy_metrics['confidence_calibration'],
    )

    logger.info(
        f'Dashboard fetched for user {user_id}: '
        f'accuracy={accuracy_metrics["overall_accuracy"]:.2%}, '
        f'acceptance_rate={feedback_stats["acceptance_rate"]:.1f}%'
    )

    return dashboard


@router.get(
    '/{user_id}/summary',
    response_model=Dict[str, Any],
    status_code=status.HTTP_200_OK,
)
@track_metrics('ml_dashboard_summary')
async def get_ml_summary(user_id: str) -> Dict[str, Any]:
    """
    Get ML performance summary (lightweight version).

    Returns key metrics for quick display.

    Args:
        user_id: User identifier

    Returns:
        Summary metrics
    """
    logger.info(f'Fetching ML summary for user {user_id}')

    accuracy_tracker = AccuracyTracker(user_id)
    feedback_service = FeedbackService(user_id)

    accuracy_metrics = accuracy_tracker.get_accuracy_metrics(days=7)
    feedback_stats = feedback_service.get_feedback_stats()
    improvement = accuracy_tracker.get_improvement_metrics()

    return {
        'user_id': user_id,
        'accuracy_7d': accuracy_metrics['overall_accuracy'],
        'predictions_7d': accuracy_metrics['total_predictions'],
        'acceptance_rate': feedback_stats['acceptance_rate'],
        'total_feedback': feedback_stats['total_predictions'],
        'is_improving': improvement.get('has_improvement', False),
        'improvement_message': improvement.get(
            'message', 'Not enough data'
        ),
    }
