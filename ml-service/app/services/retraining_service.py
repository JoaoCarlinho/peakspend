"""
Model retraining service for continuous learning.

Handles incremental learning from user feedback and
periodic model retraining.
"""

from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import mlflow
import pandas as pd
from sklearn.model_selection import train_test_split

from app.config.logger import logger
from app.models.categorizer import ExpenseCategorizer
from app.models.feature_engineering import FeatureEngineering
from app.services.feedback_service import FeedbackService


class RetrainingService:
    """
    Service for incremental learning and model retraining.

    Supports:
    - Incremental learning from feedback
    - Periodic batch retraining
    - A/B testing with model versions
    """

    def __init__(self, user_id: str):
        """
        Initialize retraining service.

        Args:
            user_id: User identifier
        """
        self.user_id = user_id
        self.feedback_service = FeedbackService(user_id)
        self.feature_engineering = FeatureEngineering(user_id)
        self.data_dir = Path('data') / 'training' / user_id
        self.data_dir.mkdir(parents=True, exist_ok=True)

    def should_retrain(self) -> Dict[str, Any]:
        """
        Determine if model should be retrained.

        Returns:
            Decision dictionary with should_retrain flag and reasons
        """
        # Get feedback stats
        stats = self.feedback_service.get_feedback_stats()

        reasons = []
        should_retrain = False

        # Trigger 1: Low acceptance rate (<70%)
        if (
            stats['total_predictions'] >= 20
            and stats['acceptance_rate'] < 70.0
        ):
            reasons.append(
                f'Low acceptance rate: {stats["acceptance_rate"]:.1f}%'
            )
            should_retrain = True

        # Trigger 2: Enough corrections (>10)
        if stats['corrected_count'] >= 10:
            reasons.append(
                f'Sufficient corrections: {stats["corrected_count"]}'
            )
            should_retrain = True

        # Trigger 3: Scheduled retraining (every 7 days)
        last_training = self._get_last_training_date()
        if last_training:
            days_since = (datetime.now() - last_training).days
            if days_since >= 7 and stats['total_predictions'] >= 50:
                reasons.append(
                    f'Scheduled retraining: {days_since} days since last'
                )
                should_retrain = True

        # Trigger 4: New feedback volume (>50 new samples)
        if stats['total_predictions'] >= 50 and not last_training:
            reasons.append('Initial training threshold reached')
            should_retrain = True

        return {
            'should_retrain': should_retrain,
            'reasons': reasons,
            'stats': stats,
            'last_training_date': (
                last_training.isoformat() if last_training else None
            ),
        }

    def retrain_model(
        self, experiment_name: str = 'expense_categorization'
    ) -> Dict[str, Any]:
        """
        Retrain model with feedback data.

        Args:
            experiment_name: MLflow experiment name

        Returns:
            Training results dictionary
        """
        logger.info(f'Starting model retraining for user {self.user_id}')

        # Get training data from feedback
        training_data = self.feedback_service.get_training_data(
            min_confidence=0.0
        )

        if len(training_data) < 20:
            return {
                'success': False,
                'message': (
                    f'Insufficient training data: {len(training_data)} samples'
                ),
                'samples_required': 20,
                'samples_available': len(training_data),
            }

        # Load existing training data if available
        existing_data = self._load_existing_training_data()
        if existing_data is not None and len(existing_data) > 0:
            logger.info(
                f'Merging {len(existing_data)} existing samples '
                f'with {len(training_data)} new samples'
            )
            # Combine and deduplicate
            combined = pd.concat(
                [existing_data, training_data], ignore_index=True
            )
            combined = combined.drop_duplicates(
                subset=['merchant', 'amount', 'date'], keep='last'
            )
            training_data = combined

        logger.info(
            f'Training with {len(training_data)} total samples'
        )

        # Feature engineering
        X = self.feature_engineering.transform(training_data)
        y = training_data['category']

        # Train/test split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )

        # Train model
        categorizer = ExpenseCategorizer()

        # MLflow tracking
        mlflow.set_experiment(experiment_name)
        with mlflow.start_run(run_name=f'retrain_{self.user_id}'):
            mlflow.log_param('user_id', self.user_id)
            mlflow.log_param('training_samples', len(training_data))
            mlflow.log_param('feedback_samples', len(training_data))
            mlflow.log_param('training_type', 'incremental')

            # Train
            categorizer.train(X_train, y_train)

            # Evaluate
            metrics = categorizer.evaluate(X_test, y_test)

            # Log metrics
            for key, value in metrics.items():
                mlflow.log_metric(key, value)

            # Save model to MLflow
            model_uri = categorizer.save_to_mlflow(
                user_id=self.user_id,
                feature_engineer=self.feature_engineering,
                run_id=mlflow.active_run().info.run_id,
            )

            logger.info(f'Model saved to MLflow: {model_uri}')

        # Save training data for next iteration
        self._save_training_data(training_data)

        # Update last training timestamp
        self._update_last_training_date()

        logger.info(
            f'Model retraining completed for user {self.user_id}: '
            f'accuracy={metrics.get("accuracy", 0.0):.3f}'
        )

        return {
            'success': True,
            'message': 'Model retrained successfully',
            'metrics': metrics,
            'training_samples': len(training_data),
            'model_uri': model_uri,
            'timestamp': datetime.now().isoformat(),
        }

    def _get_last_training_date(self) -> Optional[datetime]:
        """
        Get last training date from metadata file.

        Returns:
            Last training datetime or None
        """
        metadata_file = self.data_dir / 'training_metadata.json'
        if not metadata_file.exists():
            return None

        import json

        with open(metadata_file, 'r') as f:
            metadata = json.load(f)
            last_training = metadata.get('last_training_date')
            if last_training:
                return datetime.fromisoformat(last_training)
        return None

    def _update_last_training_date(self) -> None:
        """Update last training date in metadata file."""
        import json

        metadata_file = self.data_dir / 'training_metadata.json'
        metadata = {'last_training_date': datetime.now().isoformat()}

        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)

    def _load_existing_training_data(self) -> Optional[pd.DataFrame]:
        """
        Load existing training data.

        Returns:
            DataFrame of existing training data or None
        """
        training_file = self.data_dir / 'training_data.csv'
        if not training_file.exists():
            return None

        try:
            df = pd.read_csv(training_file)
            logger.info(
                f'Loaded {len(df)} existing training samples '
                f'for user {self.user_id}'
            )
            return df
        except Exception as e:
            logger.error(f'Error loading training data: {e}')
            return None

    def _save_training_data(self, training_data: pd.DataFrame) -> None:
        """
        Save training data to CSV.

        Args:
            training_data: Training DataFrame
        """
        training_file = self.data_dir / 'training_data.csv'
        training_data.to_csv(training_file, index=False)
        logger.info(
            f'Saved {len(training_data)} training samples '
            f'for user {self.user_id}'
        )

    def get_retraining_schedule(self) -> Dict[str, Any]:
        """
        Get retraining schedule and status.

        Returns:
            Schedule information
        """
        last_training = self._get_last_training_date()
        stats = self.feedback_service.get_feedback_stats()
        decision = self.should_retrain()

        next_scheduled = None
        if last_training:
            next_scheduled = last_training + timedelta(days=7)

        return {
            'user_id': self.user_id,
            'last_training_date': (
                last_training.isoformat() if last_training else None
            ),
            'next_scheduled_date': (
                next_scheduled.isoformat() if next_scheduled else None
            ),
            'days_since_training': (
                (datetime.now() - last_training).days
                if last_training
                else None
            ),
            'feedback_count': stats['total_predictions'],
            'acceptance_rate': stats['acceptance_rate'],
            'should_retrain': decision['should_retrain'],
            'retrain_reasons': decision['reasons'],
        }
