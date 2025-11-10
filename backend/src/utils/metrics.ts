import logger from '../config/logger';

interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
}

interface ErrorMetrics {
  type: string;
  message: string;
  path: string;
}

interface MLMetrics {
  operation: string;
  duration: number;
  success: boolean;
  modelVersion?: string;
}

/**
 * Metrics collector for application monitoring
 * In production, these would be sent to CloudWatch Metrics
 */
export class MetricsCollector {
  private static metrics: {
    requests: RequestMetrics[];
    errors: ErrorMetrics[];
    mlOperations: MLMetrics[];
  } = {
    requests: [],
    errors: [],
    mlOperations: [],
  };

  /**
   * Record HTTP request metrics
   */
  static recordRequest(metrics: RequestMetrics): void {
    this.metrics.requests.push(metrics);

    // In production, send to CloudWatch Metrics
    if (process.env.NODE_ENV === 'production') {
      logger.debug('Request metrics', {
        namespace: 'PeakSpend/API',
        metric: 'RequestDuration',
        value: metrics.duration,
        unit: 'Milliseconds',
        dimensions: {
          Method: metrics.method,
          Path: metrics.path,
          StatusCode: metrics.statusCode.toString(),
        },
      });
    }

    // Keep only last 1000 metrics in memory
    if (this.metrics.requests.length > 1000) {
      this.metrics.requests = this.metrics.requests.slice(-1000);
    }
  }

  /**
   * Record error metrics
   */
  static recordError(metrics: ErrorMetrics): void {
    this.metrics.errors.push(metrics);

    if (process.env.NODE_ENV === 'production') {
      logger.debug('Error metrics', {
        namespace: 'PeakSpend/Errors',
        metric: 'ErrorCount',
        value: 1,
        unit: 'Count',
        dimensions: {
          ErrorType: metrics.type,
          Path: metrics.path,
        },
      });
    }

    if (this.metrics.errors.length > 1000) {
      this.metrics.errors = this.metrics.errors.slice(-1000);
    }
  }

  /**
   * Record ML operation metrics
   */
  static recordMLOperation(metrics: MLMetrics): void {
    this.metrics.mlOperations.push(metrics);

    if (process.env.NODE_ENV === 'production') {
      logger.debug('ML operation metrics', {
        namespace: 'PeakSpend/ML',
        metric: 'MLOperationDuration',
        value: metrics.duration,
        unit: 'Milliseconds',
        dimensions: {
          Operation: metrics.operation,
          Success: metrics.success.toString(),
          ModelVersion: metrics.modelVersion || 'unknown',
        },
      });
    }

    if (this.metrics.mlOperations.length > 1000) {
      this.metrics.mlOperations = this.metrics.mlOperations.slice(-1000);
    }
  }

  /**
   * Get current metrics summary
   */
  static getSummary() {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    // Recent requests (last 5 minutes)
    const recentRequests = this.metrics.requests.filter(
      (r) => now - fiveMinutesAgo < 5 * 60 * 1000
    );

    const totalRequests = recentRequests.length;
    const successfulRequests = recentRequests.filter((r) => r.statusCode < 400).length;
    const errorRequests = recentRequests.filter((r) => r.statusCode >= 400).length;

    const avgDuration =
      recentRequests.length > 0
        ? recentRequests.reduce((sum, r) => sum + r.duration, 0) / recentRequests.length
        : 0;

    const p95Duration = this.calculatePercentile(
      recentRequests.map((r) => r.duration),
      95
    );

    const p99Duration = this.calculatePercentile(
      recentRequests.map((r) => r.duration),
      99
    );

    return {
      requests: {
        total: totalRequests,
        successful: successfulRequests,
        errors: errorRequests,
        errorRate: totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0,
      },
      latency: {
        avg: avgDuration,
        p95: p95Duration,
        p99: p99Duration,
      },
      errors: {
        total: this.metrics.errors.length,
        recent: this.metrics.errors.slice(-10),
      },
      mlOperations: {
        total: this.metrics.mlOperations.length,
        recent: this.metrics.mlOperations.slice(-10),
      },
    };
  }

  /**
   * Calculate percentile
   */
  private static calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
  }

  /**
   * Clear all metrics (for testing)
   */
  static clear(): void {
    this.metrics = {
      requests: [],
      errors: [],
      mlOperations: [],
    };
  }
}
