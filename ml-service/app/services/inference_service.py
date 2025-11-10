"""
Unified inference service that combines ML predictions, confidence scoring,
and explainable AI.
"""

import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd

from app.config.logger import logger
from app.models.categorizer import ExpenseCategorizer
from app.models.feature_engineering import FeatureEngineering
from app.services.confidence_scorer import ConfidenceScorer
from app.services.explainer import ExplainableAI


class InferenceService:
    """
    Unified service for ML inference with confidence and explanations.
    """

    def __init__(self, user_id: str):
        """
        Initialize inference service for a user.

        Args:
            user_id: User identifier
        """
        self.user_id = user_id
        self.confidence_scorer = ConfidenceScorer(user_id)
        self.explainer = ExplainableAI(user_id)
        self.model: Optional[ExpenseCategorizer] = None
        self.fe_pipeline: Optional[FeatureEngineering] = None

    def load_model(
        self,
        version: Optional[int] = None,
        stage: str = 'Production',
    ) -> bool:
        """
        Load model from MLflow.

        Args:
            version: Model version
            stage: Model stage

        Returns:
            True if loaded successfully, False if model not found
        """
        try:
            self.model = ExpenseCategorizer.load_from_mlflow(
                user_id=self.user_id,
                version=version,
                stage=stage,
            )
            logger.info(f'Loaded model for user {self.user_id}')
            return True
        except Exception as e:
            logger.warning(
                f'Could not load model for user {self.user_id}: {e}'
            )
            return False

    def predict_with_explanation(
        self,
        merchant: str,
        amount: float,
        date: Optional[str] = None,
        notes: Optional[str] = None,
        top_k: int = 3,
    ) -> Dict[str, Any]:
        """
        Predict category with confidence and explanation.

        Args:
            merchant: Merchant name
            amount: Transaction amount
            date: Transaction date (ISO format)
            notes: Optional notes
            top_k: Number of predictions to return

        Returns:
            Dictionary with predictions, confidence, and explanations
        """
        start_time = time.time()

        # Prepare input
        expense_date = date if date else datetime.now().isoformat()
        input_df = pd.DataFrame(
            [
                {
                    'merchant': merchant,
                    'amount': amount,
                    'date': expense_date,
                }
            ]
        )

        # Try ML prediction first
        if self.model is not None:
            try:
                # Engineer features
                if self.fe_pipeline:
                    X = self.fe_pipeline.transform(input_df)
                else:
                    # Basic features fallback
                    X = self._create_basic_features(
                        merchant, amount, notes
                    )

                # Assess feature quality
                feature_quality = self.confidence_scorer.assess_feature_quality(
                    X
                )

                # Get predictions
                predictions = self.model.predict(X, top_k=top_k)

                # Process each prediction
                results = []
                for pred in predictions[0]:
                    category = pred['category']
                    raw_confidence = pred['confidence']

                    # Calculate calibrated confidence
                    confidence_info = self.confidence_scorer.score(
                        model_probability=raw_confidence,
                        feature_quality=feature_quality,
                        category=category,
                        features=X,
                    )

                    # Generate explanation
                    explanation_info = self.explainer.explain(
                        prediction=category,
                        confidence=confidence_info['confidence'],
                        features=X,
                        merchant=merchant,
                        amount=amount,
                        date=expense_date,
                    )

                    results.append(
                        {
                            'category': category,
                            'confidence': confidence_info['confidence'],
                            'confidence_pct': confidence_info[
                                'confidence_pct'
                            ],
                            'confidence_level': confidence_info[
                                'confidence_level'
                            ],
                            'explanation': explanation_info[
                                'short_explanation'
                            ],
                            'detailed_explanation': explanation_info[
                                'detailed_explanation'
                            ],
                            'contributing_factors': explanation_info[
                                'contributing_factors'
                            ],
                        }
                    )

                inference_time_ms = (time.time() - start_time) * 1000

                return {
                    'predictions': results,
                    'cold_start': False,
                    'inference_time_ms': inference_time_ms,
                    'feature_quality': feature_quality,
                }

            except Exception as e:
                logger.error(f'ML prediction failed: {e}', exc_info=True)

        # Fall back to rule-based
        logger.info(f'Using cold-start prediction for user {self.user_id}')
        cold_start_results = self._cold_start_predict(
            merchant, amount, top_k
        )

        inference_time_ms = (time.time() - start_time) * 1000

        return {
            'predictions': cold_start_results,
            'cold_start': True,
            'inference_time_ms': inference_time_ms,
            'feature_quality': 0.5,  # Default for cold-start
        }

    def _create_basic_features(
        self, merchant: str, amount: float, notes: Optional[str]
    ) -> pd.DataFrame:
        """Create basic features without feature engineering pipeline."""
        import numpy as np

        return pd.DataFrame(
            [
                {
                    'merchant_length': len(merchant),
                    'amount': amount,
                    'amount_log': np.log1p(amount),
                    'has_notes': 1 if notes else 0,
                }
            ]
        )

    def _cold_start_predict(
        self, merchant: str, amount: float, top_k: int
    ) -> List[Dict[str, Any]]:
        """Rule-based predictions for cold-start."""
        merchant_lower = merchant.lower()
        rules = []

        # Define rules
        if any(
            kw in merchant_lower
            for kw in ['restaurant', 'cafe', 'coffee', 'pizza']
        ):
            rules.append(
                {'category': 'Food & Dining', 'confidence': 0.75}
            )

        if any(
            kw in merchant_lower
            for kw in ['grocery', 'market', 'supermarket']
        ):
            rules.append({'category': 'Groceries', 'confidence': 0.80})

        if any(
            kw in merchant_lower
            for kw in ['uber', 'lyft', 'taxi', 'parking']
        ):
            rules.append(
                {'category': 'Transportation', 'confidence': 0.75}
            )

        if not rules:
            rules = [
                {'category': 'Miscellaneous', 'confidence': 0.50},
                {'category': 'Shopping', 'confidence': 0.30},
            ]

        # Sort and take top_k
        rules_sorted = sorted(
            rules, key=lambda x: x['confidence'], reverse=True
        )[:top_k]

        # Add explanations
        results = []
        for rule in rules_sorted:
            explanation = self.explainer.explain_cold_start(
                rule['category'], merchant
            )

            results.append(
                {
                    'category': rule['category'],
                    'confidence': rule['confidence'],
                    'confidence_pct': rule['confidence'] * 100,
                    'confidence_level': 'medium'
                    if rule['confidence'] >= 0.6
                    else 'low',
                    'explanation': f"Based on merchant pattern: {merchant}",
                    'detailed_explanation': explanation,
                    'contributing_factors': [
                        {
                            'factor': 'merchant',
                            'description': f'Merchant name: {merchant}',
                            'importance': 1.0,
                        }
                    ],
                }
            )

        return results
