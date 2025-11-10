import { z } from 'zod';

export const recordFeedbackSchema = z.object({
  body: z.object({
    expenseId: z.string().uuid(),
    predictedCategory: z.string().optional(),
    actualCategory: z.string(),
    feedbackType: z.enum(['ACCEPTED', 'CORRECTED']),
    confidenceScore: z.number().min(0).max(1).optional(),
  }),
});

export const getTrainingDataQuerySchema = z.object({
  query: z.object({
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional(),
    feedbackType: z.enum(['ACCEPTED', 'CORRECTED']).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
});

export type RecordFeedbackInput = z.infer<typeof recordFeedbackSchema>['body'];
export type GetTrainingDataQuery = z.infer<typeof getTrainingDataQuerySchema>['query'];
