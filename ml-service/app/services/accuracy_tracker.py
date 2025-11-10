"""
Accuracy tracking service for continuous ML monitoring.

Tracks prediction accuracy over time to demonstrate learning.
"""

import json
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

from app.config.logger import logger


class AccuracyTracker:
    """
    Service for tracking ML prediction accuracy over time.

    Monitors:
    - Overall accuracy trends
    - Per-category accuracy
    - Confidence calibration
    - Model improvement
    """

    def __init__(self, user_id: str):
        """
        Initialize accuracy tracker.

        Args:
            user_id: User identifier
        """
        self.user_id = user_id
        self.metrics_dir = Path('data') / 'metrics' / user_id
        self.metrics_dir.mkdir(parents=True, exist_ok=True)
        self.metrics_file = self.metrics_dir / 'accuracy_metrics.jsonl'

    def record_prediction(
        self,
        predicted_category: str,
        actual_category: Optional[str],
        confidence: float,
        model_version: Optional[str],
        is_correct: Optional[bool] = None,
    ) -> None:
        """
        Record a prediction for accuracy tracking.

        Args:
            predicted_category: ML-predicted category
            actual_category: User-selected category
            confidence: Prediction confidence
            model_version: Model version
            is_correct: Whether prediction was correct
        """
        timestamp = datetime.now().isoformat()

        # Determine correctness
        if is_correct is None and actual_category:
            is_correct = predicted_category == actual_category

        record = {
            'timestamp': timestamp,
            'user_id': self.user_id,
            'predicted_category': predicted_category,
            'actual_category': actual_category,
            'confidence': confidence,
            'model_version': model_version,
            'is_correct': is_correct,
        }

        # Append to metrics file
        with open(self.metrics_file, 'a') as f:
            f.write(json.dumps(record) + '\n')

    def get_accuracy_metrics(
        self, days: int = 30
    ) -> Dict[str, Any]:
        """
        Get accuracy metrics for the specified period.

        Args:
            days: Number of days to analyze

        Returns:
            Accuracy metrics dictionary
        """
        if not self.metrics_file.exists():
            return self._empty_metrics()

        # Load metrics
        records = self._load_metrics()
        if len(records) == 0:
            return self._empty_metrics()

        df = pd.DataFrame(records)
        df['timestamp'] = pd.to_datetime(df['timestamp'])

        # Filter by date range
        cutoff = datetime.now() - timedelta(days=days)
        df = df[df['timestamp'] >= cutoff]

        if len(df) == 0:
            return self._empty_metrics()

        # Overall accuracy
        predictions_with_feedback = df[df['actual_category'].notna()]
        total_predictions = len(predictions_with_feedback)
        correct_predictions = len(
            predictions_with_feedback[
                predictions_with_feedback['is_correct'] == True
            ]
        )
        overall_accuracy = (
            correct_predictions / total_predictions
            if total_predictions > 0
            else 0.0
        )

        # Per-category accuracy
        category_accuracy = {}
        for category in predictions_with_feedback[
            'actual_category'
        ].unique():
            cat_df = predictions_with_feedback[
                predictions_with_feedback['actual_category'] == category
            ]
            cat_correct = len(cat_df[cat_df['is_correct'] == True])
            cat_total = len(cat_df)
            category_accuracy[category] = {
                'accuracy': cat_correct / cat_total if cat_total > 0 else 0.0,
                'total': cat_total,
                'correct': cat_correct,
            }

        # Confidence calibration
        confidence_bins = self._calculate_confidence_calibration(
            predictions_with_feedback
        )

        # Accuracy trend (weekly)
        accuracy_trend = self._calculate_accuracy_trend(
            predictions_with_feedback
        )

        # Model version comparison
        version_comparison = self._compare_model_versions(
            predictions_with_feedback
        )

        return {
            'user_id': self.user_id,
            'period_days': days,
            'overall_accuracy': overall_accuracy,
            'total_predictions': total_predictions,
            'correct_predictions': correct_predictions,
            'category_accuracy': category_accuracy,
            'confidence_calibration': confidence_bins,
            'accuracy_trend': accuracy_trend,
            'model_version_comparison': version_comparison,
            'last_updated': datetime.now().isoformat(),
        }

    def get_improvement_metrics(self) -> Dict[str, Any]:
        """
        Get metrics showing model improvement over time.

        Returns:
            Improvement metrics
        """
        if not self.metrics_file.exists():
            return {
                'has_improvement': False,
                'message': 'No data available',
            }

        records = self._load_metrics()
        if len(records) < 20:
            return {
                'has_improvement': False,
                'message': 'Insufficient data for trend analysis',
                'samples_needed': 20,
                'samples_available': len(records),
            }

        df = pd.DataFrame(records)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df[df['actual_category'].notna()]

        # Split into early and recent periods
        midpoint = len(df) // 2
        early_df = df.iloc[:midpoint]
        recent_df = df.iloc[midpoint:]

        # Calculate accuracy for each period
        early_accuracy = (
            len(early_df[early_df['is_correct'] == True]) / len(early_df)
            if len(early_df) > 0
            else 0.0
        )
        recent_accuracy = (
            len(recent_df[recent_df['is_correct'] == True]) / len(recent_df)
            if len(recent_df) > 0
            else 0.0
        )

        improvement = recent_accuracy - early_accuracy
        improvement_pct = improvement * 100

        return {
            'has_improvement': improvement > 0.05,  # >5% improvement
            'early_accuracy': early_accuracy,
            'recent_accuracy': recent_accuracy,
            'improvement': improvement,
            'improvement_pct': improvement_pct,
            'early_period_samples': len(early_df),
            'recent_period_samples': len(recent_df),
            'message': (
                f'Model improved by {improvement_pct:+.1f}% '
                if improvement > 0.05
                else 'Model performance stable'
            ),
        }

    def _load_metrics(self) -> List[Dict[str, Any]]:
        """Load all metrics records."""
        records = []
        with open(self.metrics_file, 'r') as f:
            for line in f:
                if line.strip():
                    records.append(json.loads(line))
        return records

    def _calculate_confidence_calibration(
        self, df: pd.DataFrame
    ) -> List[Dict[str, Any]]:
        """
        Calculate confidence calibration.

        Args:
            df: DataFrame with predictions

        Returns:
            Confidence calibration bins
        """
        bins = [0.0, 0.6, 0.8, 1.0]
        bin_labels = ['Low (0-60%)', 'Medium (60-80%)', 'High (80-100%)']

        calibration = []
        for i, label in enumerate(bin_labels):
            bin_df = df[
                (df['confidence'] >= bins[i])
                & (df['confidence'] < bins[i + 1])
            ]
            if len(bin_df) > 0:
                accuracy = (
                    len(bin_df[bin_df['is_correct'] == True]) / len(bin_df)
                )
                avg_confidence = bin_df['confidence'].mean()
                calibration.append(
                    {
                        'range': label,
                        'avg_confidence': float(avg_confidence),
                        'actual_accuracy': float(accuracy),
                        'count': len(bin_df),
                        'calibration_error': float(
                            abs(avg_confidence - accuracy)
                        ),
                    }
                )

        return calibration

    def _calculate_accuracy_trend(
        self, df: pd.DataFrame
    ) -> List[Dict[str, Any]]:
        """
        Calculate accuracy trend over time.

        Args:
            df: DataFrame with predictions

        Returns:
            Weekly accuracy trend
        """
        df = df.copy()
        df['week'] = df['timestamp'].dt.isocalendar().week

        trend = []
        for week, group in df.groupby('week'):
            correct = len(group[group['is_correct'] == True])
            total = len(group)
            accuracy = correct / total if total > 0 else 0.0
            trend.append(
                {
                    'week': int(week),
                    'accuracy': float(accuracy),
                    'total': total,
                    'correct': correct,
                }
            )

        # Sort by week
        trend.sort(key=lambda x: x['week'])
        return trend

    def _compare_model_versions(
        self, df: pd.DataFrame
    ) -> List[Dict[str, Any]]:
        """
        Compare accuracy across model versions.

        Args:
            df: DataFrame with predictions

        Returns:
            Model version comparison
        """
        comparison = []
        for version, group in df.groupby('model_version'):
            correct = len(group[group['is_correct'] == True])
            total = len(group)
            accuracy = correct / total if total > 0 else 0.0
            comparison.append(
                {
                    'model_version': str(version),
                    'accuracy': float(accuracy),
                    'total': total,
                    'correct': correct,
                }
            )

        # Sort by version
        comparison.sort(key=lambda x: x['model_version'], reverse=True)
        return comparison

    def _empty_metrics(self) -> Dict[str, Any]:
        """Return empty metrics."""
        return {
            'user_id': self.user_id,
            'period_days': 0,
            'overall_accuracy': 0.0,
            'total_predictions': 0,
            'correct_predictions': 0,
            'category_accuracy': {},
            'confidence_calibration': [],
            'accuracy_trend': [],
            'model_version_comparison': [],
            'last_updated': datetime.now().isoformat(),
        }
