"""
Integration tests for recommendation API.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestRecommendationAPI:
    """Integration tests for /api/ml/recommend endpoint."""

    def test_get_recommendations_success(self):
        """Test successful recommendation request."""
        payload = {
            'user_id': 'test_user_123',
            'merchant': 'Starbucks',
            'amount': 12.50,
            'date': '2025-11-09T10:00:00',
            'notes': 'Morning coffee',
            'receipt_attached': False,
            'top_k': 3,
        }

        response = client.post('/api/ml/recommend', json=payload)

        assert response.status_code == 200
        data = response.json()

        assert 'user_id' in data
        assert 'predictions' in data
        assert 'errors' in data
        assert 'cold_start' in data
        assert 'inference_time_ms' in data

        # Should have predictions
        assert len(data['predictions']) > 0
        assert len(data['predictions']) <= 3

        # Check prediction structure
        pred = data['predictions'][0]
        assert 'category' in pred
        assert 'confidence' in pred
        assert 'explanation' in pred
        assert 0.0 <= pred['confidence'] <= 1.0

    def test_get_recommendations_validation_error(self):
        """Test request validation errors."""
        payload = {
            'user_id': 'test_user',
            'merchant': 'Test',
            'amount': -10.0,  # Invalid (negative)
        }

        response = client.post('/api/ml/recommend', json=payload)

        assert response.status_code == 422  # Validation error

    def test_get_recommendations_missing_fields(self):
        """Test missing required fields."""
        payload = {
            'user_id': 'test_user',
            # Missing merchant and amount
        }

        response = client.post('/api/ml/recommend', json=payload)

        assert response.status_code == 422

    def test_get_recommendations_error_detection(self):
        """Test error detection in recommendations."""
        payload = {
            'user_id': 'test_user_456',
            'merchant': 'Expensive Restaurant',
            'amount': 500.0,  # Large amount
            'date': '2025-11-09T03:00:00',  # 3 AM (unusual)
            'receipt_attached': False,  # No receipt for large amount
        }

        response = client.post('/api/ml/recommend', json=payload)

        assert response.status_code == 200
        data = response.json()

        # Should have error/warning
        assert 'errors' in data
        # Likely to have missing receipt warning
        assert any(
            err['type'] == 'missing_receipt'
            for err in data['errors']
        )


class TestFeedbackAPI:
    """Integration tests for feedback API."""

    def test_submit_accepted_feedback(self):
        """Test submitting accepted feedback."""
        payload = {
            'user_id': 'test_user_789',
            'expense_id': 'exp_123',
            'merchant': 'Starbucks',
            'amount': 12.50,
            'date': '2025-11-09T10:00:00',
            'predicted_category': 'Food & Dining',
            'confidence': 0.85,
            'feedback_type': 'accepted',
        }

        response = client.post('/api/ml/feedback/submit', json=payload)

        assert response.status_code == 201
        data = response.json()

        assert 'feedback_id' in data
        assert data['user_id'] == 'test_user_789'
        assert data['feedback_type'] == 'accepted'
        assert 'message' in data

    def test_submit_corrected_feedback(self):
        """Test submitting corrected feedback."""
        payload = {
            'user_id': 'test_user_790',
            'expense_id': 'exp_124',
            'merchant': 'Amazon',
            'amount': 45.00,
            'date': '2025-11-09T14:00:00',
            'predicted_category': 'Shopping',
            'confidence': 0.65,
            'feedback_type': 'corrected',
            'actual_category': 'Business Expenses',
        }

        response = client.post('/api/ml/feedback/submit', json=payload)

        assert response.status_code == 201
        data = response.json()

        assert data['feedback_type'] == 'corrected'

    def test_submit_feedback_invalid_type(self):
        """Test invalid feedback type."""
        payload = {
            'user_id': 'test_user',
            'expense_id': 'exp_123',
            'merchant': 'Test',
            'amount': 10.0,
            'date': '2025-11-09',
            'predicted_category': 'Test',
            'confidence': 0.8,
            'feedback_type': 'invalid_type',  # Invalid
        }

        response = client.post('/api/ml/feedback/submit', json=payload)

        assert response.status_code == 400

    def test_get_feedback_stats(self):
        """Test getting feedback stats."""
        user_id = 'test_user_stats'

        # Submit some feedback first
        for i in range(3):
            payload = {
                'user_id': user_id,
                'expense_id': f'exp_{i}',
                'merchant': 'Test Merchant',
                'amount': 10.0 + i,
                'date': '2025-11-09',
                'predicted_category': 'Test',
                'confidence': 0.8,
                'feedback_type': 'accepted',
            }
            client.post('/api/ml/feedback/submit', json=payload)

        # Get stats
        response = client.get(f'/api/ml/feedback/stats/{user_id}')

        assert response.status_code == 200
        data = response.json()

        assert data['user_id'] == user_id
        assert 'total_predictions' in data
        assert 'acceptance_rate' in data
        assert data['total_predictions'] >= 3


class TestRetrainingAPI:
    """Integration tests for retraining API."""

    def test_get_retraining_status(self):
        """Test getting retraining status."""
        response = client.get('/api/ml/retraining/status/test_user_retrain')

        assert response.status_code == 200
        data = response.json()

        assert 'user_id' in data
        assert 'should_retrain' in data
        assert 'retrain_reasons' in data
        assert isinstance(data['should_retrain'], bool)

    def test_trigger_retraining_skip(self):
        """Test trigger retraining when not needed."""
        payload = {
            'user_id': 'test_user_new',
            'force': False,
        }

        response = client.post('/api/ml/retraining/trigger', json=payload)

        assert response.status_code == 202
        data = response.json()

        # Should skip (no feedback yet)
        assert data['status'] == 'skipped'
        assert data['triggered'] == False

    def test_trigger_retraining_force(self):
        """Test forcing retraining."""
        payload = {
            'user_id': 'test_user_force',
            'force': True,  # Force retraining
        }

        response = client.post('/api/ml/retraining/trigger', json=payload)

        assert response.status_code == 202
        data = response.json()

        assert data['triggered'] == True
        assert data['status'] in ['queued', 'running']


class TestDashboardAPI:
    """Integration tests for dashboard API."""

    def test_get_dashboard_summary(self):
        """Test getting dashboard summary."""
        response = client.get('/api/ml/dashboard/test_user_dash/summary')

        assert response.status_code == 200
        data = response.json()

        assert 'user_id' in data
        assert 'accuracy_7d' in data
        assert 'predictions_7d' in data
        assert 'acceptance_rate' in data
        assert 'is_improving' in data

    def test_get_full_dashboard(self):
        """Test getting full dashboard."""
        response = client.get('/api/ml/dashboard/test_user_full?days=30')

        assert response.status_code == 200
        data = response.json()

        assert 'overall_accuracy' in data
        assert 'total_predictions' in data
        assert 'category_accuracy' in data
        assert 'accuracy_trend' in data
        assert 'feedback_stats' in data
        assert 'improvement_metrics' in data
        assert 'retraining_status' in data
