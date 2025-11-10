import winston from 'winston';
import WinstonCloudWatch from 'winston-cloudwatch';

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// Create base logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'peakspend-backend',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [],
});

// Console transport (always enabled, formatted for readability in dev)
logger.add(
  new winston.transports.Console({
    format: isDevelopment
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(
            ({ level, message, timestamp, ...metadata }) => {
              let msg = `${timestamp} [${level}]: ${message}`;
              if (Object.keys(metadata).length > 0) {
                msg += ` ${JSON.stringify(metadata)}`;
              }
              return msg;
            }
          )
        )
      : winston.format.json(),
  })
);

// CloudWatch transport (production only)
if (isProduction && process.env.AWS_REGION) {
  try {
    logger.add(
      new WinstonCloudWatch({
        logGroupName: '/peakspend/backend',
        logStreamName: `${process.env.NODE_ENV}-${new Date().toISOString().split('T')[0]}`,
        awsRegion: process.env.AWS_REGION || 'us-east-1',
        messageFormatter: (logObject) => JSON.stringify(logObject),
        retentionInDays: 90,
      })
    );
    logger.info('CloudWatch logging enabled');
  } catch (error) {
    logger.warn('Failed to initialize CloudWatch logging', { error });
  }
}

export default logger;
