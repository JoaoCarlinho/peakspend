"""
Performance tests for ML inference endpoints.

Tests latency requirements from PRD:
- Inference: <200ms p95
- Feature Engineering: <50ms
- Total Interaction: <300ms
"""

import time
from statistics import median, quantile

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestInferencePerformance:
    """Performance tests for inference API."""

    def test_inference_latency_p95(self):
        """Test that p95 inference latency < 200ms."""
        latencies = []
        num_requests = 100

        payload = {
            'user_id': 'perf_test_user',
            'merchant': 'Starbucks',
            'amount': 12.50,
            'date': '2025-11-09T10:00:00',
            'top_k': 3,
        }

        for _ in range(num_requests):
            start = time.time()
            response = client.post('/api/ml/recommend', json=payload)
            end = time.time()

            assert response.status_code == 200
            latency_ms = (end - start) * 1000
            latencies.append(latency_ms)

        # Calculate percentiles
        p50 = median(latencies)
        p95 = quantile(latencies, 0.95)
        p99 = quantile(latencies, 0.99)
        avg = sum(latencies) / len(latencies)

        print(f'\nInference Latency Metrics:')
        print(f'  Average: {avg:.2f}ms')
        print(f'  Median (p50): {p50:.2f}ms')
        print(f'  p95: {p95:.2f}ms')
        print(f'  p99: {p99:.2f}ms')

        # PRD requirement: p95 < 200ms
        assert p95 < 200, f'p95 latency {p95:.2f}ms exceeds 200ms requirement'

    def test_recommendation_throughput(self):
        """Test recommendation API throughput."""
        num_requests = 50
        start_time = time.time()

        payload = {
            'user_id': 'throughput_test_user',
            'merchant': 'Test Merchant',
            'amount': 25.00,
            'date': '2025-11-09T10:00:00',
        }

        success_count = 0
        for _ in range(num_requests):
            response = client.post('/api/ml/recommend', json=payload)
            if response.status_code == 200:
                success_count += 1

        elapsed = time.time() - start_time
        requests_per_second = num_requests / elapsed

        print(f'\nThroughput Metrics:')
        print(f'  Total requests: {num_requests}')
        print(f'  Successful: {success_count}')
        print(f'  Time elapsed: {elapsed:.2f}s')
        print(f'  Requests/second: {requests_per_second:.2f}')

        assert success_count == num_requests
        assert requests_per_second > 10, 'Throughput too low'

    def test_feedback_submission_performance(self):
        """Test feedback submission performance."""
        latencies = []
        num_requests = 50

        for i in range(num_requests):
            payload = {
                'user_id': 'perf_feedback_user',
                'expense_id': f'exp_{i}',
                'merchant': 'Test',
                'amount': 10.0 + i,
                'date': '2025-11-09T10:00:00',
                'predicted_category': 'Food & Dining',
                'confidence': 0.8,
                'feedback_type': 'accepted',
            }

            start = time.time()
            response = client.post('/api/ml/feedback/submit', json=payload)
            end = time.time()

            assert response.status_code == 201
            latency_ms = (end - start) * 1000
            latencies.append(latency_ms)

        p95 = quantile(latencies, 0.95)
        avg = sum(latencies) / len(latencies)

        print(f'\nFeedback Submission Latency:')
        print(f'  Average: {avg:.2f}ms')
        print(f'  p95: {p95:.2f}ms')

        # Should be fast (write to file)
        assert p95 < 100, 'Feedback submission too slow'

    def test_dashboard_load_time(self):
        """Test dashboard load time."""
        latencies = []
        num_requests = 20

        for _ in range(num_requests):
            start = time.time()
            response = client.get('/api/ml/dashboard/perf_dash_user/summary')
            end = time.time()

            assert response.status_code == 200
            latency_ms = (end - start) * 1000
            latencies.append(latency_ms)

        p95 = quantile(latencies, 0.95)
        avg = sum(latencies) / len(latencies)

        print(f'\nDashboard Load Time:')
        print(f'  Average: {avg:.2f}ms')
        print(f'  p95: {p95:.2f}ms')

        # Dashboard should load quickly
        assert p95 < 500, 'Dashboard load time too slow'


class TestConcurrency:
    """Test concurrent request handling."""

    def test_concurrent_recommendations(self):
        """Test handling concurrent recommendation requests."""
        import concurrent.futures

        def make_request(user_id):
            payload = {
                'user_id': user_id,
                'merchant': 'Concurrent Test',
                'amount': 15.00,
                'date': '2025-11-09T10:00:00',
            }
            response = client.post('/api/ml/recommend', json=payload)
            return response.status_code == 200

        # Simulate 10 concurrent users
        num_concurrent = 10
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=num_concurrent
        ) as executor:
            futures = [
                executor.submit(make_request, f'user_{i}')
                for i in range(num_concurrent)
            ]
            results = [f.result() for f in futures]

        success_count = sum(results)
        print(f'\nConcurrent Requests: {success_count}/{num_concurrent} successful')

        assert success_count == num_concurrent, 'Some concurrent requests failed'


@pytest.mark.slow
class TestLoadTesting:
    """Load testing (marked as slow, run separately)."""

    def test_sustained_load(self):
        """Test sustained load over time."""
        duration_seconds = 60
        target_rps = 20  # Requests per second
        total_requests = duration_seconds * target_rps

        start_time = time.time()
        success_count = 0
        latencies = []

        payload = {
            'user_id': 'load_test_user',
            'merchant': 'Load Test',
            'amount': 20.00,
            'date': '2025-11-09T10:00:00',
        }

        for i in range(total_requests):
            request_start = time.time()
            response = client.post('/api/ml/recommend', json=payload)
            request_end = time.time()

            if response.status_code == 200:
                success_count += 1

            latencies.append((request_end - request_start) * 1000)

            # Rate limiting to achieve target RPS
            elapsed = time.time() - start_time
            expected_elapsed = (i + 1) / target_rps
            if elapsed < expected_elapsed:
                time.sleep(expected_elapsed - elapsed)

        total_time = time.time() - start_time
        actual_rps = total_requests / total_time
        p95 = quantile(latencies, 0.95)

        print(f'\nLoad Test Results:')
        print(f'  Total requests: {total_requests}')
        print(f'  Success rate: {success_count / total_requests * 100:.1f}%')
        print(f'  Actual RPS: {actual_rps:.2f}')
        print(f'  p95 latency: {p95:.2f}ms')

        assert success_count / total_requests > 0.99, 'Too many failures'
        assert p95 < 300, 'Latency degraded under load'
