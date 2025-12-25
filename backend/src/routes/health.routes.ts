import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../config/database';
import { MetricsCollector } from '../utils/metrics';
import { getPromptManager } from '../llm/prompts';
import logger from '../config/logger';
import { securityConfigService } from '../security';

const router = Router();

/**
 * GET /health
 * Basic health check endpoint
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const prisma = getPrismaClient();

    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'peakspend-backend',
      uptime: process.uptime(),
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'peakspend-backend',
      error: 'Database connection failed',
    });
  }
});

/**
 * GET /health/detailed
 * Detailed health check with all system components
 */
router.get('/health/detailed', async (_req: Request, res: Response) => {
  const checks: {
    database: boolean;
    promptManager: {
      initialized: boolean;
      integrityVerified: boolean;
      promptCount: number;
    };
    uptime: number;
    memory: NodeJS.MemoryUsage;
    timestamp: string;
  } = {
    database: false,
    promptManager: {
      initialized: false,
      integrityVerified: false,
      promptCount: 0,
    },
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  };

  try {
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (error) {
    logger.error('Database health check failed', { error });
  }

  // Check PromptManager status
  try {
    const promptManager = getPromptManager();
    const health = promptManager.getHealthStatus();
    checks.promptManager = {
      initialized: health.initialized,
      integrityVerified: health.integrityVerified,
      promptCount: health.promptCount,
    };
  } catch (error) {
    logger.error('PromptManager health check failed', { error });
  }

  const overallHealthy = checks.database;

  res.status(overallHealthy ? 200 : 503).json({
    status: overallHealthy ? 'healthy' : 'degraded',
    checks,
    service: 'peakspend-backend',
  });
});

/**
 * GET /health/metrics
 * Application metrics endpoint
 */
router.get('/health/metrics', (_req: Request, res: Response) => {
  try {
    const metrics = MetricsCollector.getSummary();
    res.status(200).json({
      timestamp: new Date().toISOString(),
      service: 'peakspend-backend',
      metrics,
    });
  } catch (error) {
    logger.error('Failed to retrieve metrics', { error });
    res.status(500).json({
      error: 'Failed to retrieve metrics',
    });
  }
});

/**
 * GET /health/ready
 * Readiness probe for Kubernetes/ECS
 */
router.get('/health/ready', async (_req: Request, res: Response) => {
  try {
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false, error: `Database connection failed ${error}` });
  }
});

/**
 * GET /health/live
 * Liveness probe for Kubernetes/ECS
 */
router.get('/health/live', (_req: Request, res: Response) => {
  // Simple liveness check - service is running
  res.status(200).json({ alive: true });
});

/**
 * GET /health/security
 * Security mode and feature flag status endpoint
 * Used by the frontend to display current security state
 */
router.get('/health/security', (_req: Request, res: Response) => {
  try {
    const status = securityConfigService.getSecurityStatus();

    res.status(200).json({
      status: 'ok',
      security: {
        mode: status.mode,
        isVulnerable: status.mode === 'vulnerable',
        flags: status.flags,
        initializedAt: status.initializedAt,
        uptimeMs: status.uptimeMs,
      },
    });
  } catch (error) {
    logger.error('Security status check failed', { error });
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve security status',
    });
  }
});

export default router;
