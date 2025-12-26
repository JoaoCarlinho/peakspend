"""
Unit tests for confidence scoring service.
"""

import numpy as np
import pandas as pd
import pytest

from app.services.confidence_scorer import ConfidenceScorer


class TestConfidenceScorer:
    """Test suite for ConfidenceScorer."""

    def setup_method(self):
        """Set up test fixtures."""
        self.scorer = ConfidenceScorer(user_id='test_user')

    def test_score_basic(self):
        """Test basic confidence scoring."""
        features = pd.DataFrame({'amount': [50.0], 'hour': [12]})

        result = self.scorer.score(
            model_probability=0.9,
            feature_quality=0.95,
            category='Food & Dining',
            features=features,
        )

        assert 'confidence' in result
        assert 'confidence_level' in result
        assert 'explanation' in result
        assert 0.0 <= result['confidence'] <= 1.0

    def test_score_high_confidence(self):
        """Test high confidence classification."""
        features = pd.DataFrame({'amount': [50.0]})

        result = self.scorer.score(
            model_probability=0.95,
            feature_quality=0.98,
            category='Food & Dining',
            features=features,
        )

        assert result['confidence'] > 0.8
        assert result['confidence_level'] == 'high'

    def test_score_low_confidence(self):
        """Test low confidence classification."""
        features = pd.DataFrame({'amount': [50.0]})

        result = self.scorer.score(
            model_probability=0.45,
            feature_quality=0.5,
            category='Shopping',
            features=features,
        )

        assert result['confidence'] < 0.6
        assert result['confidence_level'] == 'low'

    def test_score_with_historical_accuracy(self):
        """Test scoring with historical accuracy."""
        # Update historical accuracy
        self.scorer.update_historical_accuracy('Food & Dining', 0.9)

        features = pd.DataFrame({'amount': [50.0]})

        result = self.scorer.score(
            model_probability=0.7,
            feature_quality=0.8,
            category='Food & Dining',
            features=features,
        )

        # Confidence should be boosted by high historical accuracy
        assert result['confidence'] > 0.7

    def test_confidence_bounds(self):
        """Test that confidence is always between 0 and 1."""
        features = pd.DataFrame({'amount': [50.0]})

        # Test extreme values
        result1 = self.scorer.score(
            model_probability=1.0,
            feature_quality=1.0,
            category='Test',
            features=features,
        )
        assert 0.0 <= result1['confidence'] <= 1.0

        result2 = self.scorer.score(
            model_probability=0.0,
            feature_quality=0.0,
            category='Test',
            features=features,
        )
        assert 0.0 <= result2['confidence'] <= 1.0

    def test_feature_quality_assessment(self):
        """Test feature quality assessment."""
        # Complete features
        features_complete = pd.DataFrame({
            'amount': [50.0],
            'merchant_len': [10],
            'hour': [12],
            'day_of_week': [3],
        })
        quality1 = self.scorer._assess_feature_quality(features_complete)
        assert quality1 > 0.8

        # Incomplete features (many NaN)
        features_incomplete = pd.DataFrame({
            'amount': [50.0],
            'merchant_len': [np.nan],
            'hour': [np.nan],
        })
        quality2 = self.scorer._assess_feature_quality(features_incomplete)
        assert quality2 < quality1

    def test_confidence_explanation(self):
        """Test confidence explanation generation."""
        result = self.scorer._generate_explanation(
            confidence=0.85,
            model_probability=0.9,
            feature_quality=0.95,
            category='Food & Dining',
        )

        assert isinstance(result, str)
        assert len(result) > 0
        assert 'confident' in result.lower() or 'certain' in result.lower()
