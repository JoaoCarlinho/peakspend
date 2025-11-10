"""
Training API endpoints for expense categorization model.
"""

from typing import Any, Dict, List

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.config.logger import logger
from app.middleware.metrics import track_metrics
from app.models.categorizer import ExpenseCategorizer
from app.models.feature_engineering import FeatureEngineering
from app.tasks.training_tasks import train_model_async

router = APIRouter(prefix='/api/training', tags=['training'])


class TrainingDataSample(BaseModel):
    """Single training sample (labeled expense)."""

    merchant: str = Field(..., description='Merchant name')
    amount: float = Field(..., description='Transaction amount', gt=0)
    date: str = Field(..., description='Transaction date (ISO format)')
    category: str = Field(..., description='Category label')
    notes: str | None = Field(None, description='Optional expense notes')


class TrainModelRequest(BaseModel):
    """Request body for model training."""

    user_id: str = Field(..., description='User identifier')
    training_data: List[TrainingDataSample] = Field(
        ..., description='List of labeled expenses', min_length=1
    )
    hyperparameters: Dict[str, Any] | None = Field(
        None, description='Optional hyperparameters override'
    )
    run_name: str | None = Field(None, description='Optional MLflow run name')


class TrainModelResponse(BaseModel):
    """Response body for model training."""

    success: bool
    run_id: str | None = None
    model_name: str | None = None
    metrics: Dict[str, float] | None = None
    samples: Dict[str, int] | None = None
    error: str | None = None


@router.post('/train', response_model=TrainModelResponse, status_code=status.HTTP_201_CREATED)
@track_metrics('ml_training')
async def train_model(request: TrainModelRequest) -> TrainModelResponse:
    """
    Train expense categorization model for a user.

    This endpoint:
    1. Validates minimum training data requirement (50+ samples)
    2. Creates MLflow experiment for the user
    3. Trains XGBoost multi-class classifier
    4. Logs hyperparameters, metrics, and model to MLflow
    5. Registers model in MLflow Model Registry

    Args:
        request: Training request with user_id and labeled expenses

    Returns:
        Training results with metrics and MLflow run ID

    Raises:
        400: Insufficient training data
        500: Training failure
    """
    logger.info(f'Received training request for user {request.user_id}')

    try:
        # Convert training data to DataFrame
        data_dicts = [sample.model_dump() for sample in request.training_data]
        df = pd.DataFrame(data_dicts)

        # Engineer features using feature engineering pipeline (Story 3-2)
        feature_engineer = FeatureEngineering(user_id=request.user_id)
        X = feature_engineer.fit_transform(df)
        y = df['category']

        logger.info(
            f'Feature engineering complete: {X.shape[1]} features generated from {len(df)} samples'
        )

        # Initialize categorizer
        hyperparams = request.hyperparameters or {}
        categorizer = ExpenseCategorizer(
            user_id=request.user_id,
            max_depth=hyperparams.get('max_depth', 6),
            learning_rate=hyperparams.get('learning_rate', 0.1),
            n_estimators=hyperparams.get('n_estimators', 100),
        )

        # Train model
        result = categorizer.train(X, y, run_name=request.run_name)

        # Check if training succeeded
        if not result['success']:
            if result['error'] == 'insufficient_data':
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f'Insufficient training data: {result["samples"]} samples '
                    f'(minimum: {result["min_required"]})',
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f'Training failed: {result.get("error", "unknown error")}',
                )

        logger.info(
            f'Training completed successfully for user {request.user_id}: '
            f'run_id={result["run_id"]}, accuracy={result["metrics"]["accuracy"]:.3f}'
        )

        return TrainModelResponse(
            success=True,
            run_id=result['run_id'],
            model_name=result['model_name'],
            metrics=result['metrics'],
            samples=result['samples'],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f'Training failed for user {request.user_id}: {str(e)}', exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f'Training failed: {str(e)}',
        )


@router.get('/experiments/{user_id}', status_code=status.HTTP_200_OK)
async def get_experiments(user_id: str) -> Dict[str, Any]:
    """
    Get MLflow experiments for a user.

    Args:
        user_id: User identifier

    Returns:
        Experiment information and tracking URI
    """
    from app.ml.tracking import MLFLOW_TRACKING_URI, MLflowTracker

    try:
        experiment_id = MLflowTracker.create_or_get_experiment(user_id)

        return {
            'user_id': user_id,
            'experiment_id': experiment_id,
            'experiment_name': f'user_{user_id}_categorization',
            'tracking_uri': MLFLOW_TRACKING_URI,
            'ui_url': f'{MLFLOW_TRACKING_URI}/#/experiments/{experiment_id}',
        }
    except Exception as e:
        logger.error(f'Failed to get experiments for user {user_id}: {str(e)}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f'Failed to get experiments: {str(e)}',
        )


@router.post('/train/async', status_code=status.HTTP_202_ACCEPTED)
@track_metrics('ml_training_async')
async def train_model_async_endpoint(request: TrainModelRequest) -> Dict[str, Any]:
    """
    Trigger async model training using Celery.

    This endpoint queues a training task and returns immediately with a task ID.
    The client can poll the task status using the returned task_id.

    Args:
        request: Training request with user_id and labeled expenses

    Returns:
        Task ID for tracking training progress

    Raises:
        400: Insufficient training data
        500: Task queue failure
    """
    logger.info(f'Received async training request for user {request.user_id}')

    try:
        # Validate minimum data requirement
        if len(request.training_data) < 50:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f'Insufficient training data: {len(request.training_data)} samples (minimum: 50)',
            )

        # Convert training data to dicts
        training_data_dicts = [sample.model_dump() for sample in request.training_data]

        # Queue async training task
        task = train_model_async.delay(
            user_id=request.user_id,
            training_data=training_data_dicts,
            hyperparameters=request.hyperparameters,
            run_name=request.run_name,
        )

        logger.info(f'Async training task queued for user {request.user_id}: task_id={task.id}')

        return {
            'success': True,
            'task_id': task.id,
            'status': 'queued',
            'message': 'Training task queued successfully',
            'status_url': f'/api/training/status/{task.id}',
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f'Failed to queue async training for user {request.user_id}: {str(e)}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f'Failed to queue training task: {str(e)}',
        )


@router.get('/status/{task_id}', status_code=status.HTTP_200_OK)
async def get_training_status(task_id: str) -> Dict[str, Any]:
    """
    Get status of an async training task.

    Args:
        task_id: Celery task ID

    Returns:
        Task status and results (if complete)
    """
    from celery.result import AsyncResult

    try:
        task_result = AsyncResult(task_id)

        response = {
            'task_id': task_id,
            'status': task_result.state,
        }

        if task_result.state == 'PENDING':
            response['message'] = 'Task is waiting in queue'
        elif task_result.state == 'PROCESSING':
            response['message'] = 'Task is being processed'
            if task_result.info:
                response['progress'] = task_result.info
        elif task_result.state == 'SUCCESS':
            response['message'] = 'Training completed successfully'
            response['result'] = task_result.result
        elif task_result.state == 'FAILURE':
            response['message'] = 'Training failed'
            response['error'] = str(task_result.info)
        else:
            response['message'] = f'Task state: {task_result.state}'

        return response

    except Exception as e:
        logger.error(f'Error retrieving task status for {task_id}: {str(e)}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f'Failed to retrieve task status: {str(e)}',
        )
