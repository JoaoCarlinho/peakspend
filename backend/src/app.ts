import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes';
import expenseRoutes from './routes/expense.routes';
import receiptRoutes from './routes/receipt.routes';
import categoryRoutes from './routes/category.routes';
import mlInferenceRoutes from './routes/ml-inference.routes';
import feedbackRoutes from './routes/feedback.routes';
import mlMetricsRoutes from './routes/ml-metrics.routes';
import insightsRoutes from './routes/insights.routes';
import trainingDataRoutes from './routes/training-data.routes';
import consentRoutes from './routes/consent.routes';
import reviewQueueRoutes from './audit/reviewQueue.routes';
import auditRoutes from './audit/audit.routes';
import adminRoutes from './routes/admin.routes';
import healthRoutes from './routes/health.routes';
import securityFlagsRoutes from './routes/securityFlags.routes';
import securityEventsRoutes from './routes/securityEvents.routes';
import securityStatsRoutes from './routes/securityStats.routes';
import { errorHandler } from './middleware/error.middleware';
import { inputInspectorMiddleware } from './llm/guardrails';

const app: Application = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoints (including /health/security for security mode status)
app.use('/', healthRoutes);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/consent', consentRoutes);
app.use('/api/expenses', expenseRoutes);

// Apply input inspection middleware to LLM-powered endpoints
// This must be applied BEFORE the route handlers
app.use('/api/receipts', inputInspectorMiddleware, receiptRoutes);
app.use('/api/insights', inputInspectorMiddleware, insightsRoutes);

app.use('/api/categories', categoryRoutes);
app.use('/api/ml-inference', mlInferenceRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/ml-metrics', mlMetricsRoutes);
app.use('/api/training-data', trainingDataRoutes);

// Security/audit routes (require security role)
app.use('/api/security/review-queue', reviewQueueRoutes);
app.use('/api/security/events', securityEventsRoutes);
app.use('/api/security/stats', securityStatsRoutes);
app.use('/api/audit', auditRoutes);

// Admin routes (require admin role)
app.use('/api/admin', adminRoutes);
app.use('/api/admin/security-flags', securityFlagsRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global error handler (must be last)
app.use(errorHandler);

export default app;
