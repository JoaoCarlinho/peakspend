"""
Confidence scoring system for ML predictions.

Provides sophisticated confidence scores that combine model probability,
feature quality, and historical accuracy to give users reliable confidence
estimates.
"""

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV

from app.config.logger import logger


class ConfidenceScorer:
    """
    Multi-factor confidence scoring system.

    Combines:
    - Model prediction probability
    - Feature quality score
    - Historical accuracy for similar predictions
    - Prediction stability
    """

    def __init__(self, user_id: str):
        """
        Initialize confidence scorer for a user.

        Args:
            user_id: User identifier
        """
        self.user_id = user_id
        self.historical_accuracy: Dict[str, float] = {}
        self.calibration_model: Optional[Any] = None

    def score(
        self,
        model_probability: float,
        feature_quality: float,
        category: str,
        features: pd.DataFrame,
    ) -> Dict[str, Any]:
        """
        Calculate calibrated confidence score.

        Args:
            model_probability: Raw model probability (0-1)
            feature_quality: Feature completeness score (0-1)
            category: Predicted category
            features: Input features for prediction

        Returns:
            Dictionary with confidence score and explanation
        """
        # 1. Start with model probability
        confidence = model_probability

        # 2. Adjust for feature quality
        feature_weight = 0.2
        confidence = (
            confidence * (1 - feature_weight)
            + feature_quality * feature_weight
        )

        # 3. Adjust for historical accuracy
        if category in self.historical_accuracy:
            hist_accuracy = self.historical_accuracy[category]
            hist_weight = 0.15
            confidence = (
                confidence * (1 - hist_weight) + hist_accuracy * hist_weight
            )

        # 4. Ensure confidence is between 0 and 1
        confidence = np.clip(confidence, 0.0, 1.0)

        # 5. Determine confidence level
        confidence_level = self._get_confidence_level(confidence)

        # 6. Generate explanation
        explanation = self._generate_explanation(
            confidence, model_probability, feature_quality, category
        )

        return {
            'confidence': float(confidence),
            'confidence_pct': float(confidence * 100),
            'confidence_level': confidence_level,
            'explanation': explanation,
            'factors': {
                'model_probability': float(model_probability),
                'feature_quality': float(feature_quality),
                'historical_accuracy': self.historical_accuracy.get(
                    category, None
                ),
            },
        }

    def assess_feature_quality(self, features: pd.DataFrame) -> float:
        """
        Assess quality of input features.

        Args:
            features: Feature matrix

        Returns:
            Quality score (0-1)
        """
        if len(features) == 0:
            return 0.0

        # Count missing values
        missing_ratio = features.isnull().sum().sum() / (
            features.shape[0] * features.shape[1]
        )

        # Penalize missing values
        completeness = 1.0 - missing_ratio

        # Check for zero variance features
        zero_var_ratio = (features.std() == 0).sum() / len(features.columns)

        # Feature diversity score
        diversity = 1.0 - zero_var_ratio

        # Combined quality score
        quality = 0.7 * completeness + 0.3 * diversity

        return float(np.clip(quality, 0.0, 1.0))

    def update_historical_accuracy(
        self, category: str, accuracy: float
    ) -> None:
        """
        Update historical accuracy for a category.

        Args:
            category: Category name
            accuracy: Accuracy value (0-1)
        """
        if category in self.historical_accuracy:
            # Exponential moving average
            alpha = 0.2
            self.historical_accuracy[category] = (
                alpha * accuracy
                + (1 - alpha) * self.historical_accuracy[category]
            )
        else:
            self.historical_accuracy[category] = accuracy

        logger.debug(
            f'Updated historical accuracy for {category}: '
            f'{self.historical_accuracy[category]:.3f}'
        )

    def _get_confidence_level(self, confidence: float) -> str:
        """
        Get confidence level bucket.

        Args:
            confidence: Confidence score (0-1)

        Returns:
            Confidence level: 'high', 'medium', or 'low'
        """
        if confidence >= 0.8:
            return 'high'
        elif confidence >= 0.6:
            return 'medium'
        else:
            return 'low'

    def _generate_explanation(
        self,
        final_confidence: float,
        model_prob: float,
        feature_quality: float,
        category: str,
    ) -> str:
        """
        Generate human-readable confidence explanation.

        Args:
            final_confidence: Final confidence score
            model_prob: Model probability
            feature_quality: Feature quality score
            category: Predicted category

        Returns:
            Explanation string
        """
        level = self._get_confidence_level(final_confidence)

        if level == 'high':
            base = f'{int(final_confidence * 100)}% confident'
            if model_prob > 0.85:
                reason = 'the model is very certain about this prediction'
            elif feature_quality > 0.9:
                reason = 'the input data quality is excellent'
            elif category in self.historical_accuracy:
                hist_pct = int(self.historical_accuracy[category] * 100)
                reason = (
                    f'historically correct {hist_pct}% of the time '
                    f'for this category'
                )
            else:
                reason = 'based on strong prediction signals'

            return f'{base} - {reason}'

        elif level == 'medium':
            base = f'{int(final_confidence * 100)}% confident'
            if feature_quality < 0.7:
                reason = 'but some expense details are missing'
            elif model_prob < 0.7:
                reason = 'but this prediction has moderate uncertainty'
            else:
                reason = 'with reasonable certainty'

            return f'{base} - {reason}'

        else:  # low
            base = f'Only {int(final_confidence * 100)}% confident'
            if feature_quality < 0.5:
                reason = 'due to incomplete expense information'
            elif model_prob < 0.5:
                reason = 'because this expense is ambiguous'
            else:
                reason = 'limited historical data for this pattern'

            return f'{base} - {reason}'
