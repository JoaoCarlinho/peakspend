"""
Unit tests for feedback service.
"""

import tempfile
from pathlib import Path

import pytest

from app.services.feedback_service import FeedbackService


class TestFeedbackService:
    """Test suite for FeedbackService."""

    def setup_method(self):
        """Set up test fixtures with temporary directory."""
        self.temp_dir = tempfile.mkdtemp()
        self.user_id = 'test_user_123'
        self.service = FeedbackService(self.user_id)
        # Override feedback directory to temp
        self.service.feedback_dir = Path(self.temp_dir) / 'feedback' / self.user_id
        self.service.feedback_dir.mkdir(parents=True, exist_ok=True)
        self.service.feedback_file = self.service.feedback_dir / 'feedback.jsonl'

    def teardown_method(self):
        """Clean up temp directory."""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_submit_accepted_feedback(self):
        """Test submitting accepted feedback."""
        feedback_id = self.service.submit_feedback(
            expense_id='exp_123',
            merchant='Starbucks',
            amount=12.50,
            date='2025-11-09T10:00:00',
            notes='Coffee',
            predicted_category='Food & Dining',
            confidence=0.85,
            model_version='v1.0',
            feedback_type='accepted',
        )

        assert feedback_id is not None
        assert isinstance(feedback_id, str)
        assert len(feedback_id) > 0

        # Verify file was created
        assert self.service.feedback_file.exists()

    def test_submit_corrected_feedback(self):
        """Test submitting corrected feedback."""
        feedback_id = self.service.submit_feedback(
            expense_id='exp_124',
            merchant='Amazon',
            amount=45.00,
            date='2025-11-09T14:00:00',
            notes='Office supplies',
            predicted_category='Shopping',
            confidence=0.65,
            model_version='v1.0',
            feedback_type='corrected',
            actual_category='Business Expenses',
        )

        assert feedback_id is not None

        # Load and verify
        records = self.service._load_feedback()
        assert len(records) == 1
        assert records[0]['feedback_type'] == 'corrected'
        assert records[0]['actual_category'] == 'Business Expenses'
        assert records[0]['is_correct'] == False

    def test_get_feedback_stats_empty(self):
        """Test stats with no feedback."""
        stats = self.service.get_feedback_stats()

        assert stats['total_predictions'] == 0
        assert stats['acceptance_rate'] == 0.0
        assert len(stats['most_corrected_categories']) == 0

    def test_get_feedback_stats(self):
        """Test stats calculation."""
        # Submit multiple feedback records
        self.service.submit_feedback(
            expense_id='exp_1',
            merchant='Starbucks',
            amount=10.0,
            date='2025-11-09',
            notes=None,
            predicted_category='Food & Dining',
            confidence=0.9,
            model_version='v1',
            feedback_type='accepted',
        )
        self.service.submit_feedback(
            expense_id='exp_2',
            merchant='Amazon',
            amount=50.0,
            date='2025-11-09',
            notes=None,
            predicted_category='Shopping',
            confidence=0.7,
            model_version='v1',
            feedback_type='accepted',
        )
        self.service.submit_feedback(
            expense_id='exp_3',
            merchant='Uber',
            amount=25.0,
            date='2025-11-09',
            notes=None,
            predicted_category='Shopping',
            confidence=0.6,
            model_version='v1',
            feedback_type='corrected',
            actual_category='Transportation',
        )

        stats = self.service.get_feedback_stats()

        assert stats['total_predictions'] == 3
        assert stats['accepted_count'] == 2
        assert stats['corrected_count'] == 1
        assert stats['acceptance_rate'] == pytest.approx(66.67, rel=0.1)

    def test_get_training_data(self):
        """Test extracting training data."""
        # Submit feedback with actual categories
        self.service.submit_feedback(
            expense_id='exp_1',
            merchant='Starbucks',
            amount=10.0,
            date='2025-11-09',
            notes='Coffee',
            predicted_category='Food & Dining',
            confidence=0.9,
            model_version='v1',
            feedback_type='accepted',
        )
        self.service.submit_feedback(
            expense_id='exp_2',
            merchant='Uber',
            amount=25.0,
            date='2025-11-09',
            notes='Ride',
            predicted_category='Shopping',
            confidence=0.6,
            model_version='v1',
            feedback_type='corrected',
            actual_category='Transportation',
        )

        training_df = self.service.get_training_data()

        assert len(training_df) == 2
        assert 'category' in training_df.columns
        assert 'merchant' in training_df.columns
        assert training_df.iloc[0]['category'] == 'Food & Dining'
        assert training_df.iloc[1]['category'] == 'Transportation'

    def test_get_feedback_history(self):
        """Test getting feedback history."""
        # Submit multiple records
        for i in range(5):
            self.service.submit_feedback(
                expense_id=f'exp_{i}',
                merchant='Test Merchant',
                amount=10.0 + i,
                date='2025-11-09',
                notes=None,
                predicted_category='Test',
                confidence=0.8,
                model_version='v1',
                feedback_type='accepted',
            )

        history = self.service.get_feedback_history(limit=3)

        assert len(history) == 3
        # Should be sorted by timestamp descending (most recent first)
        assert history[0]['expense_id'] == 'exp_4'

    def test_clear_feedback(self):
        """Test clearing feedback."""
        self.service.submit_feedback(
            expense_id='exp_1',
            merchant='Test',
            amount=10.0,
            date='2025-11-09',
            notes=None,
            predicted_category='Test',
            confidence=0.8,
            model_version='v1',
            feedback_type='accepted',
        )

        assert self.service.feedback_file.exists()

        self.service.clear_feedback()

        assert not self.service.feedback_file.exists()
