"""
Error detection service for proactive expense validation.

Detects potential errors like outliers, duplicates, and unusual patterns
before expense submission.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from app.config.logger import logger


class ErrorDetectionService:
    """
    Proactive error detection for expense submissions.

    Detects:
    - Amount outliers
    - Duplicate expenses
    - Missing required fields
    - Unusual patterns
    """

    def __init__(self, user_id: str):
        """
        Initialize error detection for a user.

        Args:
            user_id: User identifier
        """
        self.user_id = user_id
        self.user_statistics: Dict[str, Any] = {}

    def detect_errors(
        self,
        merchant: str,
        amount: float,
        category: Optional[str] = None,
        date: Optional[str] = None,
        notes: Optional[str] = None,
        receipt_attached: bool = False,
        user_expense_history: Optional[pd.DataFrame] = None,
    ) -> List[Dict[str, Any]]:
        """
        Detect potential errors in expense data.

        Args:
            merchant: Merchant name
            amount: Transaction amount
            category: Selected category (optional)
            date: Transaction date
            notes: Expense notes
            receipt_attached: Whether receipt is attached
            user_expense_history: User's expense history

        Returns:
            List of detected errors/warnings
        """
        errors = []

        # 1. Amount outlier detection
        if category and user_expense_history is not None:
            outlier_error = self._detect_amount_outlier(
                amount, category, user_expense_history
            )
            if outlier_error:
                errors.append(outlier_error)

        # 2. Duplicate detection
        if user_expense_history is not None:
            duplicate_error = self._detect_duplicate(
                merchant, amount, date, user_expense_history
            )
            if duplicate_error:
                errors.append(duplicate_error)

        # 3. Missing data alerts
        missing_errors = self._detect_missing_data(
            merchant, amount, category, notes, receipt_attached
        )
        errors.extend(missing_errors)

        # 4. Unusual pattern detection
        unusual_errors = self._detect_unusual_patterns(
            merchant, amount, date, category
        )
        errors.extend(unusual_errors)

        return errors

    def _detect_amount_outlier(
        self, amount: float, category: str, history: pd.DataFrame
    ) -> Optional[Dict[str, Any]]:
        """
        Detect if amount is an outlier for the category.

        Args:
            amount: Transaction amount
            category: Expense category
            history: User's expense history

        Returns:
            Error dict if outlier detected, None otherwise
        """
        # Filter history by category
        category_expenses = history[history['category'] == category]

        if len(category_expenses) < 3:
            return None  # Not enough data

        # Calculate statistics
        amounts = category_expenses['amount'].values
        mean_amount = np.mean(amounts)
        std_amount = np.std(amounts)
        median_amount = np.median(amounts)

        # Check if outlier (>2 std dev or >3x median)
        is_outlier = False
        if std_amount > 0 and abs(amount - mean_amount) > 2 * std_amount:
            is_outlier = True
        elif amount > 3 * median_amount:
            is_outlier = True

        if is_outlier:
            return {
                'type': 'amount_outlier',
                'severity': 'warning',
                'message': (
                    f'This amount (${amount:.2f}) is unusually '
                    f'high for {category}'
                ),
                'suggestion': (
                    f'Your average {category} expense is '
                    f'${mean_amount:.2f}. Please verify the amount.'
                ),
                'metadata': {
                    'user_average': float(mean_amount),
                    'user_median': float(median_amount),
                    'current_amount': float(amount),
                },
            }

        return None

    def _detect_duplicate(
        self,
        merchant: str,
        amount: float,
        date: Optional[str],
        history: pd.DataFrame,
    ) -> Optional[Dict[str, Any]]:
        """
        Detect potential duplicate expenses.

        Args:
            merchant: Merchant name
            amount: Transaction amount
            date: Transaction date
            history: User's expense history

        Returns:
            Error dict if duplicate detected, None otherwise
        """
        if date is None:
            date = datetime.now().isoformat()

        try:
            expense_date = pd.to_datetime(date)
        except Exception:
            return None

        # Look for similar expenses in last 7 days
        cutoff_date = expense_date - timedelta(days=7)

        # Filter recent expenses
        if 'date' in history.columns:
            history = history.copy()
            history['date'] = pd.to_datetime(history['date'])
            recent = history[history['date'] >= cutoff_date]
        else:
            recent = history

        if len(recent) == 0:
            return None

        # Calculate similarity scores
        for _, row in recent.iterrows():
            # Merchant similarity (fuzzy match)
            merchant_match = self._fuzzy_match(
                merchant.lower(), str(row.get('merchant', '')).lower()
            )

            # Amount similarity (within 10%)
            row_amount = row.get('amount', 0)
            amount_diff = abs(amount - row_amount) / max(amount, row_amount)
            amount_match = amount_diff < 0.1

            # Overall similarity
            if merchant_match > 0.8 and amount_match:
                return {
                    'type': 'duplicate',
                    'severity': 'warning',
                    'message': (
                        f'Similar expense found: ${row_amount:.2f} at '
                        f'{row.get("merchant", "unknown")}'
                    ),
                    'suggestion': (
                        'This might be a duplicate. Please verify.'
                    ),
                    'metadata': {
                        'similar_date': str(row.get('date', '')),
                        'similar_amount': float(row_amount),
                        'similar_merchant': str(row.get('merchant', '')),
                    },
                }

        return None

    def _detect_missing_data(
        self,
        merchant: str,
        amount: float,
        category: Optional[str],
        notes: Optional[str],
        receipt_attached: bool,
    ) -> List[Dict[str, Any]]:
        """
        Detect missing required or recommended fields.

        Args:
            merchant: Merchant name
            amount: Transaction amount
            category: Category
            notes: Notes
            receipt_attached: Receipt status

        Returns:
            List of missing data errors
        """
        errors = []

        # Missing receipt on large expense
        if amount > 100 and not receipt_attached:
            errors.append(
                {
                    'type': 'missing_receipt',
                    'severity': 'info',
                    'message': 'Receipt recommended for expenses over $100',
                    'suggestion': 'Consider attaching a receipt.',
                }
            )

        # Missing notes on unusual merchant
        if not notes and amount > 50:
            errors.append(
                {
                    'type': 'missing_notes',
                    'severity': 'info',
                    'message': 'Notes can help clarify this expense',
                    'suggestion': 'Add notes to explain this purchase.',
                }
            )

        return errors

    def _detect_unusual_patterns(
        self,
        merchant: str,
        amount: float,
        date: Optional[str],
        category: Optional[str],
    ) -> List[Dict[str, Any]]:
        """
        Detect unusual patterns.

        Args:
            merchant: Merchant name
            amount: Transaction amount
            date: Transaction date
            category: Category

        Returns:
            List of unusual pattern warnings
        """
        errors = []

        # Unusual time
        if date:
            try:
                dt = pd.to_datetime(date)
                hour = dt.hour

                # Restaurant at 3am
                if category == 'Food & Dining' and (hour < 6 or hour > 23):
                    errors.append(
                        {
                            'type': 'unusual_time',
                            'severity': 'info',
                            'message': f'Unusual time for dining ({hour}:00)',
                            'suggestion': 'Please verify the date and time.',
                        }
                    )

                # Very large early morning transaction
                if amount > 500 and 0 <= hour < 6:
                    errors.append(
                        {
                            'type': 'unusual_time',
                            'severity': 'warning',
                            'message': (
                                f'Large transaction (${amount:.2f}) '
                                f'at unusual hour ({hour}:00)'
                            ),
                            'suggestion': 'Please verify this is correct.',
                        }
                    )
            except Exception:
                pass

        return errors

    def _fuzzy_match(self, str1: str, str2: str) -> float:
        """
        Calculate fuzzy string similarity.

        Args:
            str1: First string
            str2: Second string

        Returns:
            Similarity score (0-1)
        """
        # Simple character-based similarity
        if not str1 or not str2:
            return 0.0

        # Exact match
        if str1 == str2:
            return 1.0

        # Substring match
        if str1 in str2 or str2 in str1:
            return 0.9

        # Character overlap
        set1 = set(str1)
        set2 = set(str2)
        intersection = len(set1 & set2)
        union = len(set1 | set2)

        if union == 0:
            return 0.0

        return intersection / union

    def update_user_statistics(
        self, category: str, amount: float
    ) -> None:
        """
        Update user statistics for better error detection.

        Args:
            category: Expense category
            amount: Transaction amount
        """
        if category not in self.user_statistics:
            self.user_statistics[category] = {
                'amounts': [],
                'count': 0,
            }

        self.user_statistics[category]['amounts'].append(amount)
        self.user_statistics[category]['count'] += 1

        # Keep only last 100 amounts
        if (
            len(self.user_statistics[category]['amounts']) > 100
        ):
            self.user_statistics[category]['amounts'] = self.user_statistics[
                category
            ]['amounts'][-100:]
