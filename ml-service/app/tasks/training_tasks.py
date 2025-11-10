"""
Celery tasks for async model training.
"""

from typing import Any, Dict, List

import pandas as pd
from celery import Task

from app.config.celery_config import celery_app
from app.config.logger import logger
from app.models.categorizer import ExpenseCategorizer
from app.models.feature_engineering import FeatureEngineering


class TrainingTask(Task):
    """
    Base task for training with error handling and logging.
    """

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure."""
        user_id = kwargs.get('user_id', 'unknown')
        logger.error(
            f'Training task failed for user {user_id}',
            extra={'task_id': task_id, 'user_id': user_id, 'exception': str(exc)},
        )

    def on_success(self, retval, task_id, args, kwargs):
        """Handle task success."""
        user_id = kwargs.get('user_id', 'unknown')
        logger.info(
            f'Training task completed for user {user_id}',
            extra={
                'task_id': task_id,
                'user_id': user_id,
                'accuracy': retval.get('metrics', {}).get('accuracy'),
            },
        )


@celery_app.task(base=TrainingTask, name='train_model_async', bind=True)
def train_model_async(
    self,
    user_id: str,
    training_data: List[Dict[str, Any]],
    hyperparameters: Dict[str, Any] = None,
    run_name: str = None,
) -> Dict[str, Any]:
    """
    Async task to train expense categorization model.

    Args:
        user_id: User identifier
        training_data: List of labeled expenses (dicts with merchant, amount, date, category)
        hyperparameters: Optional hyperparameters override
        run_name: Optional MLflow run name

    Returns:
        Training results with metrics and MLflow run ID
    """
    logger.info(f'Starting async training for user {user_id} (task_id: {self.request.id})')

    # Update task state
    self.update_state(state='PROCESSING', meta={'status': 'Feature engineering in progress'})

    # Convert to DataFrame
    df = pd.DataFrame(training_data)

    # Engineer features
    feature_engineer = FeatureEngineering(user_id=user_id)
    X = feature_engineer.fit_transform(df)
    y = df['category']

    logger.info(
        f'Feature engineering complete: {X.shape[1]} features from {len(df)} samples',
        extra={'user_id': user_id, 'task_id': self.request.id},
    )

    # Update task state
    self.update_state(state='PROCESSING', meta={'status': 'Training model'})

    # Initialize and train categorizer
    hyperparams = hyperparameters or {}
    categorizer = ExpenseCategorizer(
        user_id=user_id,
        max_depth=hyperparams.get('max_depth', 6),
        learning_rate=hyperparams.get('learning_rate', 0.1),
        n_estimators=hyperparams.get('n_estimators', 100),
    )

    result = categorizer.train(X, y, run_name=run_name)

    if not result['success']:
        # Task will be marked as failed by Celery
        raise Exception(f"Training failed: {result.get('error', 'unknown error')}")

    logger.info(
        f'Training completed for user {user_id}: accuracy={result["metrics"]["accuracy"]:.3f}',
        extra={'user_id': user_id, 'task_id': self.request.id, 'run_id': result['run_id']},
    )

    # Update task state with final result
    self.update_state(
        state='SUCCESS',
        meta={'status': 'Training complete', 'accuracy': result['metrics']['accuracy']},
    )

    return result


@celery_app.task(name='retrain_model_on_feedback', bind=True)
def retrain_model_on_feedback(
    self, user_id: str, feedback_count_threshold: int = 10
) -> Dict[str, Any]:
    """
    Check if user has enough new feedback to trigger retraining.

    This task is triggered periodically or on feedback collection.

    Args:
        user_id: User identifier
        feedback_count_threshold: Minimum new feedback samples to trigger retraining

    Returns:
        Retraining result or skip message
    """
    logger.info(f'Checking retraining eligibility for user {user_id}')

    # TODO: Query backend API for new training data count
    # This would integrate with Story 3-3's training-data API
    # For now, return a placeholder

    return {
        'user_id': user_id,
        'status': 'not_implemented',
        'message': 'Feedback-based retraining requires backend API integration',
    }


@celery_app.task(name='periodic_model_retraining', bind=True)
def periodic_model_retraining(self, user_ids: List[str] = None) -> Dict[str, Any]:
    """
    Periodically retrain models for active users.

    This task runs on a schedule (e.g., daily) to retrain models
    for users with sufficient new training data.

    Args:
        user_ids: Optional list of user IDs to retrain (if None, retrain all active users)

    Returns:
        Summary of retraining results
    """
    logger.info(f'Starting periodic retraining for {len(user_ids) if user_ids else "all"} users')

    # TODO: Implement periodic retraining logic
    # This would:
    # 1. Query backend for users with new training data
    # 2. For each user, check if retraining criteria met
    # 3. Trigger train_model_async for eligible users
    # 4. Track and report results

    return {
        'status': 'not_implemented',
        'message': 'Periodic retraining requires backend API integration',
    }
