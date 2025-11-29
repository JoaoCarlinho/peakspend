/**
 * ML Performance Widget - Shows visible improvement metrics
 *
 * Displays key ML metrics to demonstrate continuous learning:
 * - Current accuracy
 * - Improvement over time
 * - Acceptance rate
 * - Total predictions
 */

import { Box, Card, CardContent, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import { TrendingUp, CheckCircle, Psychology, Timeline } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';

const ML_API_BASE = import.meta.env.VITE_ML_API_BASE_URL || 'http://localhost:8000';

interface MLSummary {
  user_id: string;
  accuracy_7d: number;
  predictions_7d: number;
  acceptance_rate: number;
  total_feedback: number;
  is_improving: boolean;
  improvement_message: string;
}

export function MLPerformanceWidget() {
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ['ml-summary', user?.id],
    queryFn: async (): Promise<MLSummary> => {
      if (!user?.id) throw new Error('User not authenticated');

      const response = await axios.get<MLSummary>(
        `${ML_API_BASE}/api/ml/dashboard/${user.id}/summary`
      );
      return response.data;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  if (!user || error) {
    return null; // Don't show widget if not authenticated or error
  }

  if (isLoading) {
    return (
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Loading AI performance...
            </Typography>
            <LinearProgress />
          </Stack>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.total_feedback === 0) {
    return null; // Don't show widget until some feedback collected
  }

  const accuracyColor = data.accuracy_7d >= 0.8 ? 'success' : data.accuracy_7d >= 0.6 ? 'warning' : 'error';
  const acceptanceColor = data.acceptance_rate >= 80 ? 'success' : data.acceptance_rate >= 60 ? 'warning' : 'error';

  return (
    <Card sx={{ mb: 2, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
      <CardContent>
        <Stack spacing={2}>
          {/* Header */}
          <Box display="flex" alignItems="center" gap={1}>
            <Psychology />
            <Typography variant="h6" fontWeight="bold">
              Your AI Assistant is Learning
            </Typography>
          </Box>

          {/* Metrics Grid */}
          <Box
            display="grid"
            gridTemplateColumns="repeat(2, 1fr)"
            gap={2}
          >
            {/* Accuracy */}
            <Box>
              <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                <CheckCircle fontSize="small" />
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  Accuracy (7 days)
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold">
                {(data.accuracy_7d * 100).toFixed(0)}%
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                {data.predictions_7d} predictions
              </Typography>
            </Box>

            {/* Acceptance Rate */}
            <Box>
              <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                <Timeline fontSize="small" />
                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                  Acceptance Rate
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold">
                {data.acceptance_rate.toFixed(0)}%
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.7 }}>
                {data.total_feedback} total
              </Typography>
            </Box>
          </Box>

          {/* Improvement Message */}
          {data.is_improving && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: 'rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <Box display="flex" alignItems="center" gap={1}>
                <TrendingUp fontSize="small" />
                <Typography variant="body2" fontWeight="medium">
                  {data.improvement_message}
                </Typography>
              </Box>
            </Box>
          )}

          {/* Info */}
          <Typography variant="caption" sx={{ opacity: 0.7, fontStyle: 'italic' }}>
            Your AI learns from every correction you make, getting smarter over time.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}
