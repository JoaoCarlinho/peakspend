"""
Inference API endpoints for expense categorization predictions.
"""

import time
from datetime import datetime
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.config.logger import logger
from app.middleware.metrics import track_metrics
from app.models.categorizer import ExpenseCategorizer
from app.models.feature_engineering import FeatureEngineering

router = APIRouter(prefix='/api/ml', tags=['inference'])


class PredictionRequest(BaseModel):
    """Request body for category prediction."""

    user_id: str = Field(..., description='User identifier')
    merchant: str = Field(..., description='Merchant name')
    amount: float = Field(..., description='Transaction amount', gt=0)
    date: str | None = Field(
        None, description='Transaction date (ISO format)'
    )
    notes: str | None = Field(None, description='Optional expense notes')
    top_k: int = Field(
        3, description='Number of category suggestions', ge=1, le=5
    )
    model_version: int | None = Field(
        None, description='Specific model version (optional)'
    )
    model_stage: str = Field(
        'Production', description='Model stage (Production/Staging)'
    )


class CategoryPrediction(BaseModel):
    """Single category prediction with confidence."""

    category: str
    confidence: float = Field(..., description='Confidence score (0-1)')
    confidence_pct: float = Field(
        ..., description='Confidence percentage (0-100)'
    )


class PredictionResponse(BaseModel):
    """Response body for category prediction."""

    user_id: str
    predictions: List[CategoryPrediction]
    cold_start: bool = Field(
        ..., description='Whether cold-start handling was used'
    )
    inference_time_ms: float = Field(
        ..., description='Total inference time in milliseconds'
    )
    model_version: str | None = None


@router.post(
    '/predict',
    response_model=PredictionResponse,
    status_code=status.HTTP_200_OK,
)
@track_metrics('ml_inference')
async def predict_category(request: PredictionRequest) -> PredictionResponse:
    """
    Predict expense category with confidence scores.

    This endpoint:
    1. Attempts to load user's trained model from MLflow
    2. Falls back to rule-based prediction if model not available
    3. Engineers features from the expense data
    4. Returns top-K category predictions with confidence scores
    5. Tracks inference latency

    Args:
        request: Prediction request with expense details

    Returns:
        Top-K category predictions with confidence scores

    Raises:
        500: Prediction failure
    """
    start_time = time.time()
    logger.info(f'Received prediction request for user {request.user_id}')

    cold_start = False
    model_version = None

    try:
        # Try to load model from MLflow
        try:
            categorizer = ExpenseCategorizer.load_from_mlflow(
                user_id=request.user_id,
                version=request.model_version,
                stage=request.model_stage,
            )
            model_version = request.model_version or request.model_stage
            logger.info(
                f'Loaded ML model for user {request.user_id} '
                f'(version={model_version})'
            )
        except (FileNotFoundError, Exception) as e:
            # Fall back to rule-based categorization
            logger.warning(
                f'Model not found for user {request.user_id}, '
                f'using cold-start handling: {str(e)}'
            )
            cold_start = True
            predictions = _cold_start_predict(
                request.merchant, request.amount, request.top_k
            )
            inference_time_ms = (time.time() - start_time) * 1000

            return PredictionResponse(
                user_id=request.user_id,
                predictions=predictions,
                cold_start=cold_start,
                inference_time_ms=inference_time_ms,
                model_version=None,
            )

        # Prepare input data for feature engineering
        expense_date = (
            request.date if request.date else datetime.now().isoformat()
        )
        input_df = pd.DataFrame(
            [
                {
                    'merchant': request.merchant,
                    'amount': request.amount,
                    'date': expense_date,
                }
            ]
        )

        # Load feature engineering pipeline
        # TODO: Load from MLflow artifacts once saved with model
        try:
            fe_pipeline = FeatureEngineering.load(
                f'/tmp/fe_pipeline_user_{request.user_id}.pkl'
            )
            X = fe_pipeline.transform(input_df)
        except Exception as fe_error:
            logger.warning(
                f'Could not load feature engineering pipeline: {fe_error}, '
                'using basic features'
            )
            # Fallback to basic features
            X = pd.DataFrame(
                [
                    {
                        'merchant_length': len(request.merchant),
                        'amount': request.amount,
                        'amount_log': np.log1p(request.amount),
                        'has_notes': 1 if request.notes else 0,
                    }
                ]
            )

        # Get predictions
        predictions = categorizer.predict(X, top_k=request.top_k)

        # Convert to response format
        category_predictions = [
            CategoryPrediction(
                category=pred['category'],
                confidence=pred['confidence'],
                confidence_pct=pred['confidence_pct'],
            )
            for pred in predictions[0]  # First sample
        ]

        inference_time_ms = (time.time() - start_time) * 1000

        logger.info(
            f'Prediction completed for user {request.user_id}: '
            f'top_prediction={category_predictions[0].category} '
            f'(confidence={category_predictions[0].confidence_pct:.1f}%), '
            f'latency={inference_time_ms:.1f}ms'
        )

        return PredictionResponse(
            user_id=request.user_id,
            predictions=category_predictions,
            cold_start=cold_start,
            inference_time_ms=inference_time_ms,
            model_version=model_version,
        )

    except Exception as e:
        logger.error(
            f'Prediction failed for user {request.user_id}: {str(e)}',
            exc_info=True,
        )
        # Return fallback predictions instead of failing
        fallback_predictions = _cold_start_predict(
            request.merchant, request.amount, request.top_k
        )
        inference_time_ms = (time.time() - start_time) * 1000

        return PredictionResponse(
            user_id=request.user_id,
            predictions=fallback_predictions,
            cold_start=True,
            inference_time_ms=inference_time_ms,
            model_version=None,
        )


def _cold_start_predict(
    merchant: str, amount: float, top_k: int = 3
) -> List[CategoryPrediction]:
    """
    Rule-based cold-start predictions.

    Args:
        merchant: Merchant name
        amount: Transaction amount
        top_k: Number of predictions to return

    Returns:
        List of category predictions based on rules
    """
    merchant_lower = merchant.lower()

    # Define rule-based categories with confidence scores
    rules = []

    # Restaurant patterns
    if any(
        kw in merchant_lower
        for kw in [
            'restaurant',
            'cafe',
            'coffee',
            'pizza',
            'burger',
            'grill',
        ]
    ):
        rules.append(
            {'category': 'Food & Dining', 'confidence': 0.75}
        )

    # Grocery patterns
    if any(
        kw in merchant_lower
        for kw in ['grocery', 'market', 'supermarket', 'whole foods']
    ):
        rules.append({'category': 'Groceries', 'confidence': 0.80})

    # Transportation patterns
    if any(
        kw in merchant_lower
        for kw in ['uber', 'lyft', 'taxi', 'parking', 'gas', 'fuel']
    ):
        rules.append({'category': 'Transportation', 'confidence': 0.75})

    # Shopping patterns
    if any(kw in merchant_lower for kw in ['amazon', 'store', 'shop']):
        rules.append({'category': 'Shopping', 'confidence': 0.65})

    # Default categories if no rules matched
    if not rules:
        rules = [
            {'category': 'Miscellaneous', 'confidence': 0.50},
            {'category': 'Shopping', 'confidence': 0.30},
            {'category': 'Food & Dining', 'confidence': 0.20},
        ]

    # Sort by confidence and take top_k
    rules_sorted = sorted(
        rules, key=lambda x: x['confidence'], reverse=True
    )
    top_rules = rules_sorted[:top_k]

    # If we need more predictions, add default categories
    default_categories = [
        'Groceries',
        'Transportation',
        'Entertainment',
        'Utilities',
    ]
    while len(top_rules) < top_k:
        for cat in default_categories:
            if cat not in [r['category'] for r in top_rules]:
                top_rules.append({'category': cat, 'confidence': 0.20})
                break

    return [
        CategoryPrediction(
            category=rule['category'],
            confidence=rule['confidence'],
            confidence_pct=rule['confidence'] * 100,
        )
        for rule in top_rules[:top_k]
    ]


@router.get('/models/{user_id}', status_code=status.HTTP_200_OK)
async def get_model_info(user_id: str) -> Dict[str, Any]:
    """
    Get model information for a user.

    Args:
        user_id: User identifier

    Returns:
        Model registry information
    """
    from app.ml.tracking import MLFLOW_TRACKING_URI

    try:
        model_name = f'expense_categorizer_user_{user_id}'

        return {
            'user_id': user_id,
            'model_name': model_name,
            'tracking_uri': MLFLOW_TRACKING_URI,
            'registry_url': f'{MLFLOW_TRACKING_URI}/#/models/{model_name}',
        }
    except Exception as e:
        logger.error(f'Failed to get model info for user {user_id}: {str(e)}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f'Failed to get model info: {str(e)}',
        )
