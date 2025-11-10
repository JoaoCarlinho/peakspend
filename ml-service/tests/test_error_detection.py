"""
Unit tests for error detection service.
"""

import pandas as pd
import pytest
from datetime import datetime, timedelta

from app.services.error_detection import ErrorDetectionService


class TestErrorDetectionService:
    """Test suite for ErrorDetectionService."""

    def setup_method(self):
        """Set up test fixtures."""
        self.service = ErrorDetectionService('test_user')

    def test_detect_amount_outlier(self):
        """Test amount outlier detection."""
        # Create history with normal amounts
        history = pd.DataFrame({
            'category': ['Food & Dining'] * 10,
            'amount': [10, 12, 15, 11, 13, 14, 12, 11, 10, 13],
            'merchant': ['Starbucks'] * 10,
            'date': [datetime.now().isoformat()] * 10,
        })

        # Test outlier amount
        outlier = self.service._detect_amount_outlier(
            amount=100.0,  # Way higher than average (~12)
            category='Food & Dining',
            history=history,
        )

        assert outlier is not None
        assert outlier['type'] == 'amount_outlier'
        assert outlier['severity'] == 'warning'

    def test_detect_amount_outlier_no_outlier(self):
        """Test no outlier detected for normal amount."""
        history = pd.DataFrame({
            'category': ['Food & Dining'] * 10,
            'amount': [10, 12, 15, 11, 13, 14, 12, 11, 10, 13],
            'merchant': ['Starbucks'] * 10,
            'date': [datetime.now().isoformat()] * 10,
        })

        outlier = self.service._detect_amount_outlier(
            amount=12.0,  # Normal amount
            category='Food & Dining',
            history=history,
        )

        assert outlier is None

    def test_detect_duplicate(self):
        """Test duplicate expense detection."""
        yesterday = datetime.now() - timedelta(days=1)

        history = pd.DataFrame({
            'merchant': ['Starbucks', 'Amazon', 'Uber'],
            'amount': [12.50, 45.00, 25.00],
            'date': [
                yesterday.isoformat(),
                (yesterday - timedelta(days=2)).isoformat(),
                (yesterday - timedelta(days=3)).isoformat(),
            ],
        })

        # Test duplicate (same merchant, similar amount, within 7 days)
        duplicate = self.service._detect_duplicate(
            merchant='Starbucks',
            amount=12.50,
            date=datetime.now().isoformat(),
            history=history,
        )

        assert duplicate is not None
        assert duplicate['type'] == 'duplicate'

    def test_detect_missing_receipt(self):
        """Test missing receipt detection."""
        errors = self.service._detect_missing_data(
            merchant='Expensive Store',
            amount=150.0,  # Over $100
            category='Shopping',
            notes='Bought something',
            receipt_attached=False,  # No receipt
        )

        # Should warn about missing receipt
        receipt_error = next(
            (e for e in errors if e['type'] == 'missing_receipt'),
            None,
        )
        assert receipt_error is not None
        assert receipt_error['severity'] == 'info'

    def test_detect_missing_notes(self):
        """Test missing notes detection."""
        errors = self.service._detect_missing_data(
            merchant='Some Store',
            amount=75.0,  # Over $50
            category='Shopping',
            notes=None,  # No notes
            receipt_attached=True,
        )

        # Should suggest adding notes
        notes_error = next(
            (e for e in errors if e['type'] == 'missing_notes'),
            None,
        )
        assert notes_error is not None

    def test_detect_unusual_time(self):
        """Test unusual time detection."""
        # Large transaction at 3 AM
        date_3am = datetime.now().replace(hour=3, minute=0)

        errors = self.service._detect_unusual_patterns(
            merchant='Some Store',
            amount=600.0,  # Large amount
            date=date_3am.isoformat(),
            category='Shopping',
        )

        unusual_time_error = next(
            (e for e in errors if e['type'] == 'unusual_time'),
            None,
        )
        assert unusual_time_error is not None
        assert unusual_time_error['severity'] == 'warning'

    def test_fuzzy_match(self):
        """Test fuzzy string matching."""
        # Exact match
        assert self.service._fuzzy_match('starbucks', 'starbucks') == 1.0

        # Substring match
        score1 = self.service._fuzzy_match('starbucks', 'starbucks coffee')
        assert score1 > 0.8

        # Similar strings
        score2 = self.service._fuzzy_match('amazon', 'amzn')
        assert 0.0 < score2 < 1.0

        # Completely different
        score3 = self.service._fuzzy_match('starbucks', 'uber')
        assert score3 < 0.5

    def test_detect_errors_comprehensive(self):
        """Test comprehensive error detection."""
        yesterday = datetime.now() - timedelta(days=1)

        history = pd.DataFrame({
            'category': ['Shopping'] * 5,
            'amount': [30, 35, 32, 31, 33],
            'merchant': ['Amazon'] * 5,
            'date': [
                (yesterday - timedelta(days=i)).isoformat()
                for i in range(5)
            ],
        })

        errors = self.service.detect_errors(
            merchant='Amazon',
            amount=150.0,  # Outlier
            category='Shopping',
            date=datetime.now().isoformat(),
            notes=None,  # Missing notes
            receipt_attached=False,  # Missing receipt
            user_expense_history=history,
        )

        assert len(errors) > 0
        # Should detect outlier, missing receipt, and missing notes
        error_types = {e['type'] for e in errors}
        assert 'amount_outlier' in error_types
        assert 'missing_receipt' in error_types
        assert 'missing_notes' in error_types
