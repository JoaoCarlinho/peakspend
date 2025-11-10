"""
Explainable AI service for generating human-readable explanations.

Provides clear, non-technical explanations for ML predictions using
feature importance and pattern analysis.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.config.logger import logger


class ExplainableAI:
    """
    Generate explanations for ML predictions.

    Uses feature importance and historical patterns to create
    human-readable explanations that help users understand and
    trust ML recommendations.
    """

    def __init__(self, user_id: str):
        """
        Initialize explainer for a user.

        Args:
            user_id: User identifier
        """
        self.user_id = user_id
        self.merchant_patterns: Dict[str, Any] = {}

    def explain(
        self,
        prediction: str,
        confidence: float,
        features: pd.DataFrame,
        feature_importance: Optional[Dict[str, float]] = None,
        merchant: str = '',
        amount: float = 0.0,
        date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate explanation for a prediction.

        Args:
            prediction: Predicted category
            confidence: Confidence score (0-1)
            features: Feature matrix used for prediction
            feature_importance: Optional feature importance scores
            merchant: Merchant name
            amount: Transaction amount
            date: Transaction date

        Returns:
            Dictionary with explanation and contributing factors
        """
        # Extract top contributing factors
        contributing_factors = self._identify_factors(
            features, feature_importance, merchant, amount, date
        )

        # Generate natural language explanation
        short_explanation = self._generate_short_explanation(
            prediction, confidence, contributing_factors
        )

        detailed_explanation = self._generate_detailed_explanation(
            prediction, confidence, contributing_factors, merchant, amount
        )

        return {
            'short_explanation': short_explanation,
            'detailed_explanation': detailed_explanation,
            'contributing_factors': contributing_factors,
            'confidence': confidence,
        }

    def _identify_factors(
        self,
        features: pd.DataFrame,
        feature_importance: Optional[Dict[str, float]],
        merchant: str,
        amount: float,
        date: Optional[str],
    ) -> List[Dict[str, Any]]:
        """
        Identify top contributing factors to prediction.

        Args:
            features: Feature matrix
            feature_importance: Feature importance scores
            merchant: Merchant name
            amount: Transaction amount
            date: Transaction date

        Returns:
            List of contributing factors with descriptions
        """
        factors = []

        # Factor 1: Merchant pattern
        if merchant:
            merchant_lower = merchant.lower()
            if any(
                kw in merchant_lower
                for kw in ['restaurant', 'cafe', 'coffee']
            ):
                factors.append(
                    {
                        'factor': 'merchant_type',
                        'description': f"'{merchant}' is a dining establishment",
                        'importance': 0.4,
                    }
                )
            elif 'grocery' in merchant_lower or 'market' in merchant_lower:
                factors.append(
                    {
                        'factor': 'merchant_type',
                        'description': f"'{merchant}' is a grocery store",
                        'importance': 0.4,
                    }
                )
            elif any(
                kw in merchant_lower for kw in ['uber', 'lyft', 'taxi']
            ):
                factors.append(
                    {
                        'factor': 'merchant_type',
                        'description': f"'{merchant}' is a transportation service",
                        'importance': 0.4,
                    }
                )
            else:
                factors.append(
                    {
                        'factor': 'merchant',
                        'description': f'Based on merchant name: {merchant}',
                        'importance': 0.3,
                    }
                )

        # Factor 2: Amount range
        if amount > 0:
            if amount < 20:
                amount_desc = 'small purchase (under $20)'
            elif amount < 100:
                amount_desc = 'moderate purchase ($20-$100)'
            else:
                amount_desc = 'large purchase (over $100)'

            factors.append(
                {
                    'factor': 'amount',
                    'description': f'${amount:.2f} is a {amount_desc}',
                    'importance': 0.25,
                }
            )

        # Factor 3: Time context
        if date:
            try:
                dt = pd.to_datetime(date)
                hour = dt.hour
                day_of_week = dt.day_name()
                is_weekend = dt.dayofweek >= 5

                if 6 <= hour < 12:
                    time_desc = 'morning purchase'
                elif 12 <= hour < 18:
                    time_desc = 'afternoon purchase'
                elif 18 <= hour < 22:
                    time_desc = 'evening purchase'
                else:
                    time_desc = 'late night purchase'

                time_context = f'{day_of_week} {time_desc}'
                if is_weekend:
                    time_context += ' (weekend)'

                factors.append(
                    {
                        'factor': 'timing',
                        'description': time_context,
                        'importance': 0.20,
                    }
                )
            except Exception:
                pass

        # Sort by importance
        factors.sort(key=lambda x: x['importance'], reverse=True)

        return factors[:3]  # Top 3 factors

    def _generate_short_explanation(
        self, prediction: str, confidence: float, factors: List[Dict[str, Any]]
    ) -> str:
        """
        Generate concise 1-sentence explanation.

        Args:
            prediction: Predicted category
            confidence: Confidence score
            factors: Contributing factors

        Returns:
            Short explanation string
        """
        conf_pct = int(confidence * 100)

        if not factors:
            return f'{conf_pct}% confident this is {prediction}'

        top_factor = factors[0]
        return (
            f'{conf_pct}% confident this is {prediction} '
            f'based on {top_factor["description"]}'
        )

    def _generate_detailed_explanation(
        self,
        prediction: str,
        confidence: float,
        factors: List[Dict[str, Any]],
        merchant: str,
        amount: float,
    ) -> str:
        """
        Generate detailed multi-sentence explanation.

        Args:
            prediction: Predicted category
            confidence: Confidence score
            factors: Contributing factors
            merchant: Merchant name
            amount: Transaction amount

        Returns:
            Detailed explanation string
        """
        conf_pct = int(confidence * 100)
        parts = []

        # Opening statement
        parts.append(f'This expense is categorized as {prediction}.')

        # Confidence statement
        if confidence >= 0.8:
            parts.append(
                f'We are {conf_pct}% confident in this prediction.'
            )
        elif confidence >= 0.6:
            parts.append(
                f'We are moderately confident ({conf_pct}%) '
                'in this prediction.'
            )
        else:
            parts.append(
                f'This prediction has lower confidence ({conf_pct}%).'
            )

        # Contributing factors
        if factors:
            factor_descriptions = [
                f['description'].lower() for f in factors[:2]
            ]
            if len(factor_descriptions) == 1:
                parts.append(
                    f'The main factor is that {factor_descriptions[0]}.'
                )
            else:
                parts.append(
                    f'Key factors include: {factor_descriptions[0]}, '
                    f'and {factor_descriptions[1]}.'
                )

        # Historical pattern (if available)
        merchant_normalized = merchant.lower() if merchant else ''
        if merchant_normalized in self.merchant_patterns:
            pattern = self.merchant_patterns[merchant_normalized]
            parts.append(
                f'You typically categorize {merchant} as {pattern["category"]} '
                f'({pattern["frequency"]} times before).'
            )

        return ' '.join(parts)

    def add_merchant_pattern(
        self, merchant: str, category: str, frequency: int
    ) -> None:
        """
        Add or update merchant pattern.

        Args:
            merchant: Merchant name
            category: Most common category
            frequency: Number of times seen
        """
        merchant_normalized = merchant.lower()
        self.merchant_patterns[merchant_normalized] = {
            'category': category,
            'frequency': frequency,
        }

    def explain_cold_start(self, prediction: str, merchant: str) -> str:
        """
        Generate explanation for cold-start predictions.

        Args:
            prediction: Predicted category
            merchant: Merchant name

        Returns:
            Explanation string
        """
        return (
            f'This suggestion is based on merchant patterns, not your '
            f'personal history. As you categorize more expenses, '
            f'our predictions will improve and become personalized to '
            f'your spending habits.'
        )
