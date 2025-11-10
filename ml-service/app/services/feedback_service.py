"""
Feedback service for collecting and managing user feedback.

Stores feedback for continuous learning and model improvement.
"""

import json
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd

from app.config.logger import logger


class FeedbackService:
    """
    Service for managing user feedback on ML predictions.

    Stores feedback in JSON files (simulating database) for:
    - Continuous learning
    - Accuracy tracking
    - Model improvement
    """

    def __init__(self, user_id: str):
        """
        Initialize feedback service for a user.

        Args:
            user_id: User identifier
        """
        self.user_id = user_id
        self.feedback_dir = (
            Path('data') / 'feedback' / user_id
        )
        self.feedback_dir.mkdir(parents=True, exist_ok=True)
        self.feedback_file = self.feedback_dir / 'feedback.jsonl'

    def submit_feedback(
        self,
        expense_id: str,
        merchant: str,
        amount: float,
        date: str,
        notes: Optional[str],
        predicted_category: str,
        confidence: float,
        model_version: Optional[str],
        feedback_type: str,
        actual_category: Optional[str] = None,
        feedback_notes: Optional[str] = None,
    ) -> str:
        """
        Submit user feedback.

        Args:
            expense_id: Expense identifier
            merchant: Merchant name
            amount: Transaction amount
            date: Transaction date
            notes: Expense notes
            predicted_category: ML-predicted category
            confidence: Prediction confidence
            model_version: Model version used
            feedback_type: accepted, corrected, or rejected
            actual_category: User-selected category (if corrected)
            feedback_notes: Optional feedback notes

        Returns:
            Feedback ID
        """
        feedback_id = str(uuid.uuid4())
        timestamp = datetime.now().isoformat()

        # Determine if prediction was correct
        is_correct = False
        if feedback_type == 'accepted':
            is_correct = True
            actual_category = predicted_category
        elif feedback_type == 'corrected':
            is_correct = False
        else:  # rejected
            is_correct = False

        feedback_record = {
            'feedback_id': feedback_id,
            'user_id': self.user_id,
            'expense_id': expense_id,
            'timestamp': timestamp,
            # Expense details
            'merchant': merchant,
            'amount': amount,
            'date': date,
            'notes': notes,
            # ML prediction
            'predicted_category': predicted_category,
            'confidence': confidence,
            'model_version': model_version,
            # User feedback
            'feedback_type': feedback_type,
            'actual_category': actual_category,
            'is_correct': is_correct,
            'feedback_notes': feedback_notes,
        }

        # Append to JSONL file
        with open(self.feedback_file, 'a') as f:
            f.write(json.dumps(feedback_record) + '\n')

        logger.info(
            f'Feedback stored: {feedback_id} for user {self.user_id}'
        )

        return feedback_id

    def get_feedback_stats(self) -> Dict[str, Any]:
        """
        Get user feedback statistics.

        Returns:
            Feedback statistics dictionary
        """
        if not self.feedback_file.exists():
            return self._empty_stats()

        # Load all feedback
        feedback_records = self._load_feedback()

        if len(feedback_records) == 0:
            return self._empty_stats()

        df = pd.DataFrame(feedback_records)

        # Calculate stats
        total = len(df)
        accepted = len(df[df['feedback_type'] == 'accepted'])
        corrected = len(df[df['feedback_type'] == 'corrected'])
        rejected = len(df[df['feedback_type'] == 'rejected'])

        acceptance_rate = (
            (accepted / total * 100) if total > 0 else 0.0
        )

        # Average confidence by feedback type
        accepted_df = df[df['feedback_type'] == 'accepted']
        corrected_df = df[df['feedback_type'] == 'corrected']

        avg_conf_accepted = (
            float(accepted_df['confidence'].mean())
            if len(accepted_df) > 0
            else 0.0
        )
        avg_conf_corrected = (
            float(corrected_df['confidence'].mean())
            if len(corrected_df) > 0
            else 0.0
        )

        # Most corrected categories
        if len(corrected_df) > 0:
            corrections = Counter(
                zip(
                    corrected_df['predicted_category'],
                    corrected_df['actual_category'],
                )
            )
            most_corrected = [
                {
                    'predicted': pred,
                    'actual': actual,
                    'count': count,
                }
                for (pred, actual), count in corrections.most_common(5)
            ]
        else:
            most_corrected = []

        # Feedback trend (last 30 days)
        df['date_parsed'] = pd.to_datetime(df['timestamp'])
        cutoff = datetime.now() - timedelta(days=30)
        recent = df[df['date_parsed'] >= cutoff]

        # Group by week
        recent['week'] = recent['date_parsed'].dt.isocalendar().week
        trend_data = []
        for week, group in recent.groupby('week'):
            week_total = len(group)
            week_accepted = len(
                group[group['feedback_type'] == 'accepted']
            )
            trend_data.append(
                {
                    'week': int(week),
                    'total': week_total,
                    'accepted': week_accepted,
                    'acceptance_rate': (
                        week_accepted / week_total * 100
                        if week_total > 0
                        else 0.0
                    ),
                }
            )

        return {
            'user_id': self.user_id,
            'total_predictions': total,
            'accepted_count': accepted,
            'corrected_count': corrected,
            'rejected_count': rejected,
            'acceptance_rate': acceptance_rate,
            'avg_confidence_accepted': avg_conf_accepted,
            'avg_confidence_corrected': avg_conf_corrected,
            'most_corrected_categories': most_corrected,
            'feedback_trend': trend_data,
        }

    def get_feedback_history(
        self, limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get recent feedback history.

        Args:
            limit: Maximum number of records to return

        Returns:
            List of feedback records
        """
        if not self.feedback_file.exists():
            return []

        feedback_records = self._load_feedback()

        # Sort by timestamp descending
        feedback_records.sort(
            key=lambda x: x['timestamp'], reverse=True
        )

        return feedback_records[:limit]

    def get_training_data(
        self, min_confidence: float = 0.0
    ) -> pd.DataFrame:
        """
        Get feedback as training data for model retraining.

        Args:
            min_confidence: Minimum confidence threshold

        Returns:
            DataFrame of training samples
        """
        if not self.feedback_file.exists():
            return pd.DataFrame()

        feedback_records = self._load_feedback()
        df = pd.DataFrame(feedback_records)

        if len(df) == 0:
            return pd.DataFrame()

        # Filter by confidence
        df = df[df['confidence'] >= min_confidence]

        # Use actual_category as label
        df = df[df['actual_category'].notna()]

        # Select relevant columns for training
        training_df = df[
            [
                'merchant',
                'amount',
                'date',
                'notes',
                'actual_category',
                'timestamp',
                'is_correct',
            ]
        ].copy()

        # Rename for consistency
        training_df = training_df.rename(
            columns={'actual_category': 'category'}
        )

        logger.info(
            f'Extracted {len(training_df)} training samples '
            f'from feedback for user {self.user_id}'
        )

        return training_df

    def _load_feedback(self) -> List[Dict[str, Any]]:
        """
        Load all feedback records from JSONL file.

        Returns:
            List of feedback records
        """
        records = []
        with open(self.feedback_file, 'r') as f:
            for line in f:
                if line.strip():
                    records.append(json.loads(line))
        return records

    def _empty_stats(self) -> Dict[str, Any]:
        """
        Return empty statistics.

        Returns:
            Empty stats dictionary
        """
        return {
            'user_id': self.user_id,
            'total_predictions': 0,
            'accepted_count': 0,
            'corrected_count': 0,
            'rejected_count': 0,
            'acceptance_rate': 0.0,
            'avg_confidence_accepted': 0.0,
            'avg_confidence_corrected': 0.0,
            'most_corrected_categories': [],
            'feedback_trend': [],
        }

    def clear_feedback(self) -> None:
        """Clear all feedback for user (for testing)."""
        if self.feedback_file.exists():
            self.feedback_file.unlink()
        logger.info(f'Cleared feedback for user {self.user_id}')
