/**
 * Security Stats Routes
 *
 * Provides aggregated statistics for security visualization components.
 * All endpoints require security role authentication.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getPrismaClient } from '../config/database';
import { authMiddleware, roleMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);
router.use(roleMiddleware(['admin', 'security']));

/**
 * Query schema for timeline
 */
const timelineQuerySchema = z.object({
  minutes: z.string().optional().transform((val) => parseInt(val || '30', 10)),
});

/**
 * Query schema for distribution/ratio
 */
const hoursQuerySchema = z.object({
  hours: z.string().optional().transform((val) => parseInt(val || '24', 10)),
});

/**
 * Query schema for heatmap
 */
const daysQuerySchema = z.object({
  days: z.string().optional().transform((val) => parseInt(val || '7', 10)),
});

/**
 * GET /api/security/stats/timeline
 *
 * Returns security events aggregated by minute for timeline visualization.
 */
router.get('/timeline', async (req: Request, res: Response) => {
  try {
    const query = timelineQuerySchema.parse(req.query);
    const minutes = Math.min(Math.max(query.minutes, 1), 1440); // 1 minute to 24 hours
    const since = new Date(Date.now() - minutes * 60 * 1000);

    const prisma = getPrismaClient();
    const events = await prisma.securityEvent.findMany({
      where: { timestamp: { gte: since } },
      select: { timestamp: true, eventType: true, status: true },
      orderBy: { timestamp: 'asc' },
    });

    // Aggregate by minute
    const buckets: Map<string, { blocked: number; allowed: number; escalated: number }> = new Map();

    // Pre-fill all minute buckets
    for (let i = 0; i < minutes; i++) {
      const bucketTime = new Date(Date.now() - (minutes - i) * 60 * 1000);
      bucketTime.setSeconds(0, 0);
      const key = bucketTime.toISOString();
      buckets.set(key, { blocked: 0, allowed: 0, escalated: 0 });
    }

    for (const event of events) {
      const minute = new Date(event.timestamp);
      minute.setSeconds(0, 0);
      const key = minute.toISOString();

      if (!buckets.has(key)) {
        buckets.set(key, { blocked: 0, allowed: 0, escalated: 0 });
      }

      const bucket = buckets.get(key)!;
      const type = event.eventType.toUpperCase();
      const status = event.status?.toUpperCase() || '';

      if (
        type.includes('BLOCKED') ||
        type.includes('DENIED') ||
        type.includes('UNAUTHORIZED') ||
        status === 'BLOCKED'
      ) {
        bucket.blocked++;
      } else if (type.includes('ESCALAT') || status === 'ESCALATED') {
        bucket.escalated++;
      } else {
        bucket.allowed++;
      }
    }

    const timeline = Array.from(buckets.entries())
      .map(([timestamp, counts]) => ({ timestamp, ...counts }))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    res.json({
      success: true,
      data: { timeline, minutes },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid query parameters' });
      return;
    }
    console.error('Error fetching timeline:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch timeline' });
  }
});

/**
 * GET /api/security/stats/distribution
 *
 * Returns security events grouped by event type for distribution chart.
 */
router.get('/distribution', async (req: Request, res: Response) => {
  try {
    const query = hoursQuerySchema.parse(req.query);
    const hours = Math.min(Math.max(query.hours, 1), 720); // 1 hour to 30 days
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const prisma = getPrismaClient();
    const distribution = await prisma.securityEvent.groupBy({
      by: ['eventType'],
      where: { timestamp: { gte: since } },
      _count: { eventType: true },
      orderBy: { _count: { eventType: 'desc' } },
    });

    res.json({
      success: true,
      data: {
        distribution: distribution.map((d) => ({
          eventType: d.eventType,
          count: d._count.eventType,
        })),
        hours,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid query parameters' });
      return;
    }
    console.error('Error fetching distribution:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch distribution' });
  }
});

/**
 * GET /api/security/stats/ratio
 *
 * Returns blocked vs allowed ratio for gauge visualization.
 */
router.get('/ratio', async (req: Request, res: Response) => {
  try {
    const query = hoursQuerySchema.parse(req.query);
    const hours = Math.min(Math.max(query.hours, 1), 720);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const prisma = getPrismaClient();
    const events = await prisma.securityEvent.findMany({
      where: { timestamp: { gte: since } },
      select: { eventType: true, status: true },
    });

    let blocked = 0;
    let allowed = 0;

    for (const event of events) {
      const type = event.eventType.toUpperCase();
      const status = event.status?.toUpperCase() || '';

      if (
        type.includes('BLOCKED') ||
        type.includes('DENIED') ||
        type.includes('UNAUTHORIZED') ||
        status === 'BLOCKED'
      ) {
        blocked++;
      } else {
        allowed++;
      }
    }

    const total = blocked + allowed;
    const blockRate = total > 0 ? (blocked / total) * 100 : 0;

    res.json({
      success: true,
      data: { blocked, allowed, total, blockRate, hours },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid query parameters' });
      return;
    }
    console.error('Error fetching ratio:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch ratio' });
  }
});

/**
 * GET /api/security/stats/heatmap
 *
 * Returns security events aggregated by day and hour for heatmap visualization.
 * Grid: hour (0-23) x day of week (0-6, Sun-Sat)
 */
router.get('/heatmap', async (req: Request, res: Response) => {
  try {
    const query = daysQuerySchema.parse(req.query);
    const days = Math.min(Math.max(query.days, 1), 30);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const prisma = getPrismaClient();
    const events = await prisma.securityEvent.findMany({
      where: { timestamp: { gte: since } },
      select: { timestamp: true },
    });

    // Create heatmap grid: day (0-6) x hour (0-23)
    const heatmap: number[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => 0)
    );

    for (const event of events) {
      const date = new Date(event.timestamp);
      const dayIndex = date.getDay(); // 0 = Sunday
      const hourIndex = date.getHours();
      heatmap[dayIndex][hourIndex]++;
    }

    res.json({
      success: true,
      data: { heatmap, days },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'Invalid query parameters' });
      return;
    }
    console.error('Error fetching heatmap:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch heatmap' });
  }
});

export default router;
