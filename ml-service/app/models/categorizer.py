"""
Expense categorization model using XGBoost with MLflow tracking.
"""

import os
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split

from app.config.logger import logger
from app.ml.tracking import MLflowTracker


class ExpenseCategorizer:
    """
    XGBoost-based expense categorizer with MLflow integration.

    Trains per-user models for multi-class expense categorization,
    logs experiments to MLflow, and supports model registry.
    """

    def __init__(
        self,
        user_id: str,
        max_depth: int = 6,
        learning_rate: float = 0.1,
        n_estimators: int = 100,
        min_samples_for_training: int = 50,
    ):
        """
        Initialize categorizer for a specific user.

        Args:
            user_id: User identifier for model isolation
            max_depth: Maximum tree depth
            learning_rate: XGBoost learning rate
            n_estimators: Number of boosting rounds
            min_samples_for_training: Minimum samples required for training
        """
        self.user_id = user_id
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.n_estimators = n_estimators
        self.min_samples_for_training = min_samples_for_training

        self.model: Optional[xgb.XGBClassifier] = None
        self.classes_: Optional[np.ndarray] = None
        self.feature_names_: Optional[List[str]] = None

    def train(
        self,
        X: pd.DataFrame,
        y: pd.Series,
        validation_split: float = 0.2,
        run_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Train XGBoost model with MLflow tracking.

        Args:
            X: Feature matrix (engineered features)
            y: Target labels (category IDs or names)
            validation_split: Fraction of data for validation
            run_name: Optional name for MLflow run

        Returns:
            Dictionary with training metrics and model info
        """
        # Check minimum data requirement
        if len(X) < self.min_samples_for_training:
            logger.warning(
                f'Insufficient training data for user {self.user_id}: '
                f'{len(X)} samples (minimum: {self.min_samples_for_training})'
            )
            return {
                'success': False,
                'error': 'insufficient_data',
                'samples': len(X),
                'min_required': self.min_samples_for_training,
            }

        # Create MLflow experiment for user
        experiment_id = MLflowTracker.create_or_get_experiment(self.user_id)

        # Start MLflow run
        with MLflowTracker.start_run(experiment_id, run_name) as run:
            logger.info(f'Starting training for user {self.user_id} (run_id: {run.info.run_id})')

            # Log hyperparameters
            params = {
                'max_depth': self.max_depth,
                'learning_rate': self.learning_rate,
                'n_estimators': self.n_estimators,
                'objective': 'multi:softmax',
                'num_class': len(y.unique()),
                'eval_metric': 'mlogloss',
            }
            MLflowTracker.log_params(params)

            # Log dataset info
            MLflowTracker.log_params({
                'training_samples': len(X),
                'num_features': X.shape[1],
                'num_classes': len(y.unique()),
            })

            # Stratified train/validation split
            X_train, X_val, y_train, y_val = train_test_split(
                X, y, test_size=validation_split, stratify=y, random_state=42
            )

            logger.info(
                f'Train/val split: {len(X_train)} train, {len(X_val)} validation samples'
            )

            # Initialize XGBoost classifier
            self.model = xgb.XGBClassifier(
                max_depth=self.max_depth,
                learning_rate=self.learning_rate,
                n_estimators=self.n_estimators,
                objective='multi:softmax',
                num_class=len(y.unique()),
                eval_metric='mlogloss',
                early_stopping_rounds=10,
                random_state=42,
            )

            # Train model with early stopping
            self.model.fit(
                X_train,
                y_train,
                eval_set=[(X_val, y_val)],
                verbose=False,
            )

            # Store metadata
            self.classes_ = self.model.classes_
            self.feature_names_ = list(X.columns)

            # Evaluate on validation set
            metrics = self._evaluate(X_val, y_val)

            # Log metrics to MLflow
            MLflowTracker.log_metrics({
                'accuracy': metrics['accuracy'],
                'precision_macro': metrics['precision_macro'],
                'recall_macro': metrics['recall_macro'],
                'f1_macro': metrics['f1_macro'],
                'top3_accuracy': metrics.get('top3_accuracy', 0.0),
            })

            # Log model to MLflow
            model_name = f'expense_categorizer_user_{self.user_id}'
            MLflowTracker.log_model(
                self.model,
                artifact_path='model',
                registered_model_name=model_name,
            )

            logger.info(
                f'Training completed for user {self.user_id}: '
                f'accuracy={metrics["accuracy"]:.3f}, f1={metrics["f1_macro"]:.3f}'
            )

            return {
                'success': True,
                'run_id': run.info.run_id,
                'model_name': model_name,
                'metrics': metrics,
                'samples': {
                    'train': len(X_train),
                    'validation': len(X_val),
                },
            }

    def _evaluate(self, X: pd.DataFrame, y: pd.Series) -> Dict[str, float]:
        """
        Evaluate model performance on validation set.

        Args:
            X: Feature matrix
            y: True labels

        Returns:
            Dictionary with evaluation metrics
        """
        if self.model is None:
            raise ValueError('Model not trained yet')

        # Predictions
        y_pred = self.model.predict(X)

        # Basic metrics
        accuracy = accuracy_score(y, y_pred)
        precision = precision_score(y, y_pred, average='macro', zero_division=0)
        recall = recall_score(y, y_pred, average='macro', zero_division=0)
        f1 = f1_score(y, y_pred, average='macro', zero_division=0)

        # Top-3 accuracy
        y_proba = self.model.predict_proba(X)
        top3_indices = np.argsort(y_proba, axis=1)[:, -3:]
        top3_accuracy = np.mean([y.iloc[i] in self.classes_[top3_indices[i]] for i in range(len(y))])

        logger.debug(
            f'Evaluation metrics: accuracy={accuracy:.3f}, '
            f'precision={precision:.3f}, recall={recall:.3f}, f1={f1:.3f}'
        )

        return {
            'accuracy': float(accuracy),
            'precision_macro': float(precision),
            'recall_macro': float(recall),
            'f1_macro': float(f1),
            'top3_accuracy': float(top3_accuracy),
        }

    def predict(self, X: pd.DataFrame, top_k: int = 3) -> List[Dict[str, Any]]:
        """
        Predict top-K categories with confidence scores.

        Args:
            X: Feature matrix (single sample or multiple)
            top_k: Number of top predictions to return

        Returns:
            List of predictions with category and confidence
        """
        if self.model is None:
            raise ValueError('Model not trained yet. Train or load model first.')

        # Get probability predictions
        probabilities = self.model.predict_proba(X)

        # Get top-K predictions for each sample
        predictions = []
        for probs in probabilities:
            # Get indices of top-K classes
            top_indices = np.argsort(probs)[-top_k:][::-1]

            # Build prediction result
            top_predictions = [
                {
                    'category': self.classes_[idx],
                    'confidence': float(probs[idx]),
                    'confidence_pct': float(probs[idx] * 100),
                }
                for idx in top_indices
            ]

            predictions.append(top_predictions)

        return predictions

    def save(self, filepath: str) -> None:
        """
        Save model to disk using joblib.

        Args:
            filepath: Path to save model
        """
        if self.model is None:
            raise ValueError('No model to save. Train model first.')

        # Create directory if doesn't exist
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        # Save model and metadata
        model_data = {
            'model': self.model,
            'user_id': self.user_id,
            'classes_': self.classes_,
            'feature_names_': self.feature_names_,
            'hyperparameters': {
                'max_depth': self.max_depth,
                'learning_rate': self.learning_rate,
                'n_estimators': self.n_estimators,
            },
        }

        joblib.dump(model_data, filepath)
        logger.info(f'Model saved to {filepath}')

    @classmethod
    def load(cls, filepath: str) -> 'ExpenseCategorizer':
        """
        Load model from disk.

        Args:
            filepath: Path to saved model

        Returns:
            Loaded ExpenseCategorizer instance
        """
        model_data = joblib.load(filepath)

        # Create instance
        instance = cls(
            user_id=model_data['user_id'],
            max_depth=model_data['hyperparameters']['max_depth'],
            learning_rate=model_data['hyperparameters']['learning_rate'],
            n_estimators=model_data['hyperparameters']['n_estimators'],
        )

        # Restore model and metadata
        instance.model = model_data['model']
        instance.classes_ = model_data['classes_']
        instance.feature_names_ = model_data['feature_names_']

        logger.info(f'Model loaded from {filepath}')
        return instance

    @classmethod
    def load_from_mlflow(
        cls,
        user_id: str,
        version: Optional[int] = None,
        stage: str = 'Production',
    ) -> 'ExpenseCategorizer':
        """
        Load model from MLflow Model Registry.

        Args:
            user_id: User identifier
            version: Specific model version (optional)
            stage: Model stage ('Production', 'Staging', 'None')

        Returns:
            Loaded ExpenseCategorizer instance
        """
        model_name = f'expense_categorizer_user_{user_id}'

        if version is not None:
            model_uri = f'models:/{model_name}/{version}'
        else:
            model_uri = f'models:/{model_name}/{stage}'

        # Load model from MLflow
        model = MLflowTracker.load_model(model_uri)

        # Create instance and set model
        instance = cls(user_id=user_id)
        instance.model = model
        instance.classes_ = model.classes_

        logger.info(f'Model loaded from MLflow: {model_uri}')
        return instance
