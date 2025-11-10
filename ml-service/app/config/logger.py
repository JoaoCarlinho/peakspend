import json
import logging
import os
import sys
from datetime import datetime

import watchtower

# Create logger
logger = logging.getLogger('peakspend-ml')
logger.setLevel(logging.INFO)

# Determine environment
is_production = os.getenv('ENVIRONMENT') == 'production'


class JsonFormatter(logging.Formatter):
    """Custom JSON formatter for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        log_data = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno,
        }

        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)

        # Add extra fields from record
        if hasattr(record, 'user_id'):
            log_data['user_id'] = record.user_id
        if hasattr(record, 'request_id'):
            log_data['request_id'] = record.request_id

        return json.dumps(log_data)


# Console handler (always enabled with JSON formatting)
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.DEBUG if not is_production else logging.INFO)
console_handler.setFormatter(JsonFormatter())
logger.addHandler(console_handler)

# CloudWatch handler (production only)
if is_production and os.getenv('AWS_REGION'):
    try:
        cloudwatch_handler = watchtower.CloudWatchLogHandler(
            log_group='/peakspend/ml-service',
            stream_name=f"{os.getenv('ENVIRONMENT')}-{datetime.now().strftime('%Y-%m-%d')}",
            use_queues=True,
            send_interval=60,  # Send logs every 60 seconds
            create_log_group=True,
        )
        cloudwatch_handler.setLevel(logging.INFO)
        cloudwatch_handler.setFormatter(JsonFormatter())
        logger.addHandler(cloudwatch_handler)
        logger.info('CloudWatch logging enabled')
    except Exception as error:
        logger.warning(f'Failed to initialize CloudWatch logging: {error}')

# Prevent duplicate logs
logger.propagate = False
