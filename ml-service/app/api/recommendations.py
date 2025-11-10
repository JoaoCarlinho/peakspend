"""
Recommendation API endpoints combining ML, confidence, and explanations.
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from app.config.logger import logger
from app.middleware.metrics import track_metrics
from app.services.error_detection import ErrorDetectionService
from app.services.inference_service import InferenceService

router = APIRouter(prefix='/api/ml', tags=['recommendations'])


class RecommendationRequest(BaseModel):
    """Request for intelligent expense recommendations."""

    user_id: str = Field(..., description='User identifier')
    merchant: str = Field(..., description='Merchant name')
    amount: float = Field(..., description='Transaction amount', gt=0)
    date: str | None = Field(
        None, description='Transaction date (ISO format)'
    )
    notes: str | None = Field(None, description='Optional expense notes')
    receipt_attached: bool = Field(
        False, description='Whether receipt is attached'
    )
    category: str | None = Field(
        None, description='Pre-selected category (for validation)'
    )
    top_k: int = Field(
        3, description='Number of category suggestions', ge=1, le=5
    )


class Prediction(BaseModel):
    """Enhanced prediction with confidence and explanation."""

    category: str
    confidence: float
    confidence_pct: float
    confidence_level: str
    explanation: str
    detailed_explanation: str
    contributing_factors: List[Dict[str, Any]]


class ErrorWarning(BaseModel):
    """Error or warning about expense data."""

    type: str = Field(..., description='Error type')
    severity: str = Field(
        ..., description='Severity: error, warning, or info'
    )
    message: str = Field(..., description='Human-readable message')
    suggestion: str = Field(..., description='Suggested action')
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description='Additional data'
    )


class RecommendationResponse(BaseModel):
    """Complete recommendation with predictions and validations."""

    user_id: str
    predictions: List[Prediction]
    errors: List[ErrorWarning]
    cold_start: bool
    inference_time_ms: float
    feature_quality: float


@router.post(
    '/recommend',
    response_model=RecommendationResponse,
    status_code=status.HTTP_200_OK,
)
@track_metrics('ml_recommendations')
async def get_recommendations(
    request: RecommendationRequest,
) -> RecommendationResponse:
    """
    Get intelligent expense recommendations.

    This endpoint provides:
    1. Top-K category predictions with confidence scores
    2. Human-readable explanations for each prediction
    3. Error detection and validation warnings
    4. Pattern-based insights

    Args:
        request: Recommendation request

    Returns:
        Complete recommendations with predictions and validations
    """
    logger.info(
        f'Received recommendation request for user {request.user_id}'
    )

    # Initialize services
    inference_service = InferenceService(request.user_id)
    error_service = ErrorDetectionService(request.user_id)

    # Load model (will fall back to cold-start if not available)
    inference_service.load_model()

    # Get predictions with explanations
    prediction_result = inference_service.predict_with_explanation(
        merchant=request.merchant,
        amount=request.amount,
        date=request.date,
        notes=request.notes,
        top_k=request.top_k,
    )

    # Detect errors/warnings
    # TODO: Load user expense history from database
    errors = error_service.detect_errors(
        merchant=request.merchant,
        amount=request.amount,
        category=request.category,
        date=request.date,
        notes=request.notes,
        receipt_attached=request.receipt_attached,
        user_expense_history=None,  # Would come from database
    )

    # Convert to response format
    predictions = [
        Prediction(**pred) for pred in prediction_result['predictions']
    ]
    error_warnings = [ErrorWarning(**err) for err in errors]

    logger.info(
        f'Recommendation completed for user {request.user_id}: '
        f'{len(predictions)} predictions, {len(error_warnings)} warnings, '
        f'latency={prediction_result["inference_time_ms"]:.1f}ms'
    )

    return RecommendationResponse(
        user_id=request.user_id,
        predictions=predictions,
        errors=error_warnings,
        cold_start=prediction_result['cold_start'],
        inference_time_ms=prediction_result['inference_time_ms'],
        feature_quality=prediction_result['feature_quality'],
    )
