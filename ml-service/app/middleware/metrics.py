import os
import time
from functools import wraps
from typing import Any, Callable

import boto3
from app.config.logger import logger

is_production = os.getenv('ENVIRONMENT') == 'production'

cloudwatch = None
if is_production and os.getenv('AWS_REGION'):
    try:
        cloudwatch = boto3.client('cloudwatch', region_name=os.getenv('AWS_REGION'))
        logger.info('CloudWatch metrics client initialized')
    except Exception as error:
        logger.warning(f'Failed to initialize CloudWatch metrics client: {error}')


def track_inference_metrics(func: Callable) -> Callable:
    """
    Decorator to track ML inference metrics and send to CloudWatch.

    Tracks:
    - Inference latency
    - Inference count
    - Error count (if exception occurs)
    """

    @wraps(func)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        start_time = time.time()
        error_occurred = False

        try:
            result = await func(*args, **kwargs)
            return result
        except Exception as e:
            error_occurred = True
            raise e
        finally:
            duration = (time.time() - start_time) * 1000  # Convert to ms

            # Log metrics
            logger.info(
                f'Inference completed: {func.__name__}',
                extra={'duration_ms': duration, 'error': error_occurred},
            )

            # Send to CloudWatch (production only)
            if cloudwatch and is_production:
                try:
                    metric_data = [
                        {
                            'MetricName': 'InferenceLatency',
                            'Value': duration,
                            'Unit': 'Milliseconds',
                            'Dimensions': [
                                {'Name': 'Function', 'Value': func.__name__},
                                {'Name': 'Operation', 'Value': 'CategoryPrediction'},
                            ],
                        },
                        {
                            'MetricName': 'InferenceCount',
                            'Value': 1,
                            'Unit': 'Count',
                            'Dimensions': [
                                {'Name': 'Function', 'Value': func.__name__},
                            ],
                        },
                    ]

                    if error_occurred:
                        metric_data.append(
                            {
                                'MetricName': 'InferenceError',
                                'Value': 1,
                                'Unit': 'Count',
                                'Dimensions': [
                                    {'Name': 'Function', 'Value': func.__name__},
                                ],
                            }
                        )

                    cloudwatch.put_metric_data(Namespace='PeakSpend/ML', MetricData=metric_data)
                except Exception as error:
                    logger.error(f'Failed to send metrics to CloudWatch: {error}')

    return wrapper


def track_metrics(metric_name: str) -> Callable:
    """
    Generic decorator to track API metrics and send to CloudWatch.

    Args:
        metric_name: Name of the metric to track

    Tracks:
    - API latency
    - API call count
    - Error count (if exception occurs)
    """

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            start_time = time.time()
            error_occurred = False

            try:
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                error_occurred = True
                raise e
            finally:
                duration = (time.time() - start_time) * 1000  # Convert to ms

                # Log metrics
                logger.info(
                    f'{metric_name} completed: {func.__name__}',
                    extra={'duration_ms': duration, 'error': error_occurred},
                )

                # Send to CloudWatch (production only)
                if cloudwatch and is_production:
                    try:
                        metric_data = [
                            {
                                'MetricName': f'{metric_name}Latency',
                                'Value': duration,
                                'Unit': 'Milliseconds',
                                'Dimensions': [
                                    {'Name': 'Function', 'Value': func.__name__},
                                    {'Name': 'Operation', 'Value': metric_name},
                                ],
                            },
                            {
                                'MetricName': f'{metric_name}Count',
                                'Value': 1,
                                'Unit': 'Count',
                                'Dimensions': [
                                    {'Name': 'Function', 'Value': func.__name__},
                                ],
                            },
                        ]

                        if error_occurred:
                            metric_data.append(
                                {
                                    'MetricName': f'{metric_name}Error',
                                    'Value': 1,
                                    'Unit': 'Count',
                                    'Dimensions': [
                                        {'Name': 'Function', 'Value': func.__name__},
                                    ],
                                }
                            )

                        cloudwatch.put_metric_data(
                            Namespace='PeakSpend/ML', MetricData=metric_data
                        )
                    except Exception as error:
                        logger.error(f'Failed to send metrics to CloudWatch: {error}')

        return wrapper

    return decorator
