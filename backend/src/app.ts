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
import { errorHandler } from './middleware/error.middleware';

const app: Application = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/ml-inference', mlInferenceRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/ml-metrics', mlMetricsRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/training-data', trainingDataRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global error handler (must be last)
app.use(errorHandler);

export default app;
