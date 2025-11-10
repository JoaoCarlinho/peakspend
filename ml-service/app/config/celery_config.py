"""
Celery configuration for async task processing.
"""

import os
from celery import Celery

from app.config.logger import logger
from app.config.settings import settings

# Create Celery app
celery_app = Celery(
    'peakspend_ml',
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=['app.tasks.training_tasks'],
)

# Celery configuration
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,  # 10 minutes
    task_soft_time_limit=540,  # 9 minutes
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=100,
    result_expires=3600,  # 1 hour
)

logger.info(f'Celery configured with broker: {settings.redis_url}')
