"""
Feature engineering pipeline for expense categorization.

Transforms raw expense data (merchant, amount, date) into ML-ready features
including merchant embeddings, temporal patterns, amount normalization, and
historical behavior patterns.
"""

import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import StandardScaler

from app.config.logger import logger


class FeatureEngineering:
    """
    Feature engineering pipeline for expense categorization.

    Transforms raw expense data into engineered features for XGBoost model.
    Supports per-user feature transformers and handles cold-start scenarios.
    """

    def __init__(self, user_id: str):
        """
        Initialize feature engineering pipeline for a specific user.

        Args:
            user_id: User identifier for per-user feature isolation
        """
        self.user_id = user_id

        # Feature transformers
        self.merchant_vectorizer: Optional[TfidfVectorizer] = None
        self.amount_scaler: Optional[StandardScaler] = None

        # Historical statistics (fitted from training data)
        self.merchant_frequency: Dict[str, int] = {}
        self.merchant_category_map: Dict[str, str] = {}
        self.category_priors: Dict[str, float] = {}
        self.user_amount_percentiles: Optional[pd.Series] = None

        # Global fallback statistics
        self.global_merchant_patterns: Dict[str, Any] = {}
        self.fitted: bool = False

    def fit(self, df: pd.DataFrame) -> 'FeatureEngineering':
        """
        Fit feature transformers on training data.

        Args:
            df: Training dataframe with columns:
                - merchant: str
                - amount: float
                - date: datetime or str (ISO format)
                - category: str (optional, for historical patterns)

        Returns:
            Self for method chaining
        """
        logger.info(f"Fitting feature engineering pipeline for user {self.user_id} on {len(df)} samples")

        # Ensure date is datetime
        if 'date' in df.columns and not pd.api.types.is_datetime64_any_dtype(df['date']):
            df = df.copy()
            df['date'] = pd.to_datetime(df['date'])

        # Fit merchant TF-IDF vectorizer
        merchant_normalized = df['merchant'].apply(self._normalize_merchant)
        self.merchant_vectorizer = TfidfVectorizer(
            max_features=100,
            ngram_range=(1, 2),
            min_df=1,
            lowercase=True,
        )
        self.merchant_vectorizer.fit(merchant_normalized)

        # Fit amount scaler
        self.amount_scaler = StandardScaler()
        log_amounts = np.log1p(df['amount'].values.reshape(-1, 1))
        self.amount_scaler.fit(log_amounts)

        # Calculate merchant frequency
        self.merchant_frequency = merchant_normalized.value_counts().to_dict()

        # Calculate merchant -> category mapping (most common category per merchant)
        if 'category' in df.columns:
            merchant_category = df.groupby(merchant_normalized)['category'].agg(lambda x: x.mode()[0] if len(x.mode()) > 0 else None)
            self.merchant_category_map = merchant_category.to_dict()

            # Calculate category priors
            category_counts = df['category'].value_counts()
            total = len(df)
            self.category_priors = (category_counts / total).to_dict()

        # Calculate user amount percentiles
        self.user_amount_percentiles = df['amount'].quantile([0.25, 0.5, 0.75])

        self.fitted = True
        logger.info(f"Feature engineering pipeline fitted successfully")

        return self

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Transform expense data into engineered features.

        Args:
            df: Dataframe with columns:
                - merchant: str
                - amount: float
                - date: datetime or str (ISO format)
                - (optional) historical data for pattern features

        Returns:
            Feature matrix (DataFrame) compatible with XGBoost
        """
        if not self.fitted:
            raise ValueError("Pipeline not fitted. Call fit() first.")

        logger.debug(f"Transforming {len(df)} samples")

        # Ensure date is datetime
        if not pd.api.types.is_datetime64_any_dtype(df['date']):
            df = df.copy()
            df['date'] = pd.to_datetime(df['date'])

        features = pd.DataFrame(index=df.index)

        # 1. Merchant features
        merchant_features = self._extract_merchant_features(df)
        features = pd.concat([features, merchant_features], axis=1)

        # 2. Temporal features
        temporal_features = self._extract_temporal_features(df)
        features = pd.concat([features, temporal_features], axis=1)

        # 3. Amount features
        amount_features = self._extract_amount_features(df)
        features = pd.concat([features, amount_features], axis=1)

        # 4. Historical pattern features
        if 'user_expense_history' in df.columns:
            historical_features = self._extract_historical_features(df)
            features = pd.concat([features, historical_features], axis=1)

        # Handle missing values
        features = features.fillna(0)

        logger.debug(f"Generated {features.shape[1]} features")

        return features

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Fit transformers and transform data in one step.

        Args:
            df: Training dataframe

        Returns:
            Feature matrix
        """
        return self.fit(df).transform(df)

    def _normalize_merchant(self, merchant: str) -> str:
        """
        Normalize merchant name for consistent processing.

        Args:
            merchant: Raw merchant name

        Returns:
            Normalized merchant name
        """
        # Lowercase
        merchant = merchant.lower()

        # Remove special characters but keep spaces
        merchant = re.sub(r'[^a-z0-9\s]', '', merchant)

        # Remove extra whitespace
        merchant = ' '.join(merchant.split())

        return merchant

    def _extract_merchant_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Extract merchant-related features (AC-1).

        Features:
        - TF-IDF vectorization of merchant names
        - Merchant frequency encoding
        """
        features = pd.DataFrame(index=df.index)

        # Normalize merchants
        merchant_normalized = df['merchant'].apply(self._normalize_merchant)

        # TF-IDF features
        tfidf_matrix = self.merchant_vectorizer.transform(merchant_normalized)
        tfidf_df = pd.DataFrame(
            tfidf_matrix.toarray(),
            columns=[f'merchant_tfidf_{i}' for i in range(tfidf_matrix.shape[1])],
            index=df.index,
        )
        features = pd.concat([features, tfidf_df], axis=1)

        # Merchant frequency
        features['merchant_frequency'] = merchant_normalized.map(
            lambda m: self.merchant_frequency.get(m, 0)
        )

        # Merchant is_new flag
        features['merchant_is_new'] = merchant_normalized.map(
            lambda m: 0 if m in self.merchant_frequency else 1
        )

        return features

    def _extract_temporal_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Extract temporal features (AC-2).

        Features:
        - Hour, day of week, day of month, month
        - Time bins (morning, afternoon, evening, night)
        - Cyclical encoding (sin/cos)
        - Is weekend
        """
        features = pd.DataFrame(index=df.index)

        dates = pd.to_datetime(df['date'])

        # Basic temporal components
        features['hour_of_day'] = dates.dt.hour
        features['day_of_week'] = dates.dt.dayofweek  # Monday=0, Sunday=6
        features['day_of_month'] = dates.dt.day
        features['month'] = dates.dt.month

        # Is weekend
        features['is_weekend'] = (dates.dt.dayofweek >= 5).astype(int)

        # Time bins
        def get_time_bin(hour):
            if 6 <= hour < 12:
                return 0  # morning
            elif 12 <= hour < 18:
                return 1  # afternoon
            elif 18 <= hour < 22:
                return 2  # evening
            else:
                return 3  # night

        features['time_bin'] = features['hour_of_day'].apply(get_time_bin)

        # Cyclical encoding for hour (0-23)
        features['hour_sin'] = np.sin(2 * np.pi * features['hour_of_day'] / 24)
        features['hour_cos'] = np.cos(2 * np.pi * features['hour_of_day'] / 24)

        # Cyclical encoding for day of week (0-6)
        features['day_sin'] = np.sin(2 * np.pi * features['day_of_week'] / 7)
        features['day_cos'] = np.cos(2 * np.pi * features['day_of_week'] / 7)

        return features

    def _extract_amount_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Extract amount-related features (AC-3).

        Features:
        - Log transformation
        - Amount range buckets
        - User-relative percentile
        - Normalized amount
        """
        features = pd.DataFrame(index=df.index)

        amounts = df['amount'].values

        # Log transformation
        log_amounts = np.log1p(amounts)
        features['amount_log'] = log_amounts

        # Normalized log amount
        log_amounts_scaled = self.amount_scaler.transform(log_amounts.reshape(-1, 1))
        features['amount_normalized'] = log_amounts_scaled.flatten()

        # Amount range buckets
        def get_amount_bucket(amount):
            if amount < 20:
                return 0  # small
            elif amount < 100:
                return 1  # medium
            else:
                return 2  # large

        features['amount_bucket'] = df['amount'].apply(get_amount_bucket)

        # User-relative percentile
        if self.user_amount_percentiles is not None:
            def get_percentile_rank(amount):
                if amount < self.user_amount_percentiles[0.25]:
                    return 0  # bottom quartile
                elif amount < self.user_amount_percentiles[0.5]:
                    return 1  # second quartile
                elif amount < self.user_amount_percentiles[0.75]:
                    return 2  # third quartile
                else:
                    return 3  # top quartile

            features['amount_percentile_rank'] = df['amount'].apply(get_percentile_rank)
        else:
            features['amount_percentile_rank'] = 1  # default to median

        return features

    def _extract_historical_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Extract historical pattern features (AC-4).

        Requires 'user_expense_history' column in df containing list of previous expenses.

        Features:
        - Merchant recency (days since last expense at merchant)
        - Merchant frequency count
        - Most common category for merchant
        - Category priors
        """
        features = pd.DataFrame(index=df.index)

        merchant_normalized = df['merchant'].apply(self._normalize_merchant)

        # Merchant frequency from fitted data
        features['historical_merchant_freq'] = merchant_normalized.map(
            lambda m: self.merchant_frequency.get(m, 0)
        )

        # Most common category for this merchant
        if self.merchant_category_map:
            features['merchant_common_category_encoded'] = merchant_normalized.map(
                lambda m: hash(self.merchant_category_map.get(m, 'unknown')) % 1000
            )
        else:
            features['merchant_common_category_encoded'] = 0

        # Category priors (if available)
        if self.category_priors:
            # Use entropy of category distribution as a feature
            prior_values = list(self.category_priors.values())
            if prior_values:
                entropy = -sum(p * np.log(p + 1e-10) for p in prior_values)
                features['category_entropy'] = entropy
            else:
                features['category_entropy'] = 0
        else:
            features['category_entropy'] = 0

        return features

    def save(self, filepath: str) -> None:
        """
        Save fitted feature engineering pipeline to disk.

        Args:
            filepath: Path to save pipeline
        """
        if not self.fitted:
            raise ValueError("Pipeline not fitted. Cannot save.")

        pipeline_data = {
            'user_id': self.user_id,
            'merchant_vectorizer': self.merchant_vectorizer,
            'amount_scaler': self.amount_scaler,
            'merchant_frequency': self.merchant_frequency,
            'merchant_category_map': self.merchant_category_map,
            'category_priors': self.category_priors,
            'user_amount_percentiles': self.user_amount_percentiles,
            'fitted': self.fitted,
        }

        joblib.dump(pipeline_data, filepath)
        logger.info(f"Feature engineering pipeline saved to {filepath}")

    @classmethod
    def load(cls, filepath: str) -> 'FeatureEngineering':
        """
        Load fitted pipeline from disk.

        Args:
            filepath: Path to saved pipeline

        Returns:
            Loaded FeatureEngineering instance
        """
        pipeline_data = joblib.load(filepath)

        instance = cls(user_id=pipeline_data['user_id'])
        instance.merchant_vectorizer = pipeline_data['merchant_vectorizer']
        instance.amount_scaler = pipeline_data['amount_scaler']
        instance.merchant_frequency = pipeline_data['merchant_frequency']
        instance.merchant_category_map = pipeline_data['merchant_category_map']
        instance.category_priors = pipeline_data['category_priors']
        instance.user_amount_percentiles = pipeline_data['user_amount_percentiles']
        instance.fitted = pipeline_data['fitted']

        logger.info(f"Feature engineering pipeline loaded from {filepath}")
        return instance

    def get_feature_names(self) -> List[str]:
        """
        Get list of feature names generated by pipeline.

        Returns:
            List of feature column names
        """
        if not self.fitted:
            raise ValueError("Pipeline not fitted. Call fit() first.")

        # Generate sample to extract feature names
        sample_df = pd.DataFrame({
            'merchant': ['sample merchant'],
            'amount': [50.0],
            'date': [datetime.now()],
        })

        features = self.transform(sample_df)
        return list(features.columns)
