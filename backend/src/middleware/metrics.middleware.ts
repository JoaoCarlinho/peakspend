import { Request, Response, NextFunction } from 'express';
import { CloudWatch, StandardUnit, MetricDatum } from '@aws-sdk/client-cloudwatch';
import logger from '../config/logger';

const isProduction = process.env['NODE_ENV'] === 'production';

let cloudwatch: CloudWatch | null = null;

if (isProduction && process.env['AWS_REGION']) {
  try {
    cloudwatch = new CloudWatch({ region: process.env['AWS_REGION'] });
    logger.info('CloudWatch metrics client initialized');
  } catch (error) {
    logger.warn('Failed to initialize CloudWatch metrics client', { error });
  }
}

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on('finish', async () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const isError = statusCode >= 400;

    // Log request metrics
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode,
      duration,
      isError,
    });

    // Send metrics to CloudWatch (production only)
    if (cloudwatch && isProduction) {
      try {
        const metricData: MetricDatum[] = [
          {
            MetricName: 'RequestDuration',
            Value: duration,
            Unit: StandardUnit.Milliseconds,
            Timestamp: new Date(),
            Dimensions: [
              { Name: 'Endpoint', Value: req.path },
              { Name: 'Method', Value: req.method },
              { Name: 'StatusCode', Value: statusCode.toString() },
            ],
          },
          {
            MetricName: 'RequestCount',
            Value: 1,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
            Dimensions: [
              { Name: 'Endpoint', Value: req.path },
              { Name: 'StatusCode', Value: statusCode.toString() },
            ],
          },
        ];

        if (isError) {
          metricData.push({
            MetricName: 'ErrorCount',
            Value: 1,
            Unit: StandardUnit.Count,
            Timestamp: new Date(),
            Dimensions: [
              { Name: 'Endpoint', Value: req.path },
              { Name: 'StatusCode', Value: statusCode.toString() },
            ],
          });
        }

        await cloudwatch.putMetricData({
          Namespace: 'PeakSpend/API',
          MetricData: metricData,
        });
      } catch (error) {
        logger.error('Failed to send metrics to CloudWatch', { error });
      }
    }
  });

  next();
};
