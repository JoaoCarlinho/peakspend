import { Card, CardContent, Typography, Box, Grid, LinearProgress, Chip } from '@mui/material';
import {
  TrendingUp,
  School,
  Speed,
  Timer,
} from '@mui/icons-material';
import type { UserImprovementMetrics } from '../../types/ml-metrics';

interface LearningProgressProps {
  improvementMetrics: UserImprovementMetrics;
}

export function LearningProgress({ improvementMetrics }: LearningProgressProps) {
  const { accuracyImprovement, learningRate, userEngagement, timeSavings } = improvementMetrics;

  // Safe values to prevent NaN errors
  const safeAccuracyImprovement = isFinite(accuracyImprovement) ? accuracyImprovement : 0;
  const safeLearningRate = isFinite(learningRate) ? learningRate : 0;
  const safeUserEngagement = isFinite(userEngagement) ? userEngagement : 0;
  const safePercentageReduction = isFinite(timeSavings?.percentageReduction) ? timeSavings.percentageReduction : 0;
  const safeManualBefore = isFinite(timeSavings?.manualCategorizationsBefore) ? timeSavings.manualCategorizationsBefore : 0;
  const safeAutoNow = isFinite(timeSavings?.autoCategorizationsNow) ? timeSavings.autoCategorizationsNow : 0;

  // Calculate progress percentage (0-100)
  const learningProgress = Math.min(100, Math.max(0, safeLearningRate * 100));

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Learning Progress
        </Typography>

        {/* Metric Cards */}
        <Grid container spacing={2} sx={{ mt: 1 }}>
          {/* Accuracy Improvement */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box
              sx={{
                p: 2,
                bgcolor: 'primary.light',
                borderRadius: 2,
                textAlign: 'center',
              }}
            >
              <TrendingUp sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h4" color="primary.main" fontWeight="bold">
                {(safeAccuracyImprovement * 100).toFixed(1)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Accuracy Improvement
              </Typography>
            </Box>
          </Grid>

          {/* Learning Rate */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box
              sx={{
                p: 2,
                bgcolor: 'success.light',
                borderRadius: 2,
                textAlign: 'center',
              }}
            >
              <School sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
              <Typography variant="h4" color="success.main" fontWeight="bold">
                {(safeLearningRate * 100).toFixed(0)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Learning Rate
              </Typography>
            </Box>
          </Grid>

          {/* User Engagement */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box
              sx={{
                p: 2,
                bgcolor: 'warning.light',
                borderRadius: 2,
                textAlign: 'center',
              }}
            >
              <Speed sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
              <Typography variant="h4" color="warning.main" fontWeight="bold">
                {(safeUserEngagement * 100).toFixed(0)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Engagement Score
              </Typography>
            </Box>
          </Grid>

          {/* Time Savings */}
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Box
              sx={{
                p: 2,
                bgcolor: 'info.light',
                borderRadius: 2,
                textAlign: 'center',
              }}
            >
              <Timer sx={{ fontSize: 40, color: 'info.main', mb: 1 }} />
              <Typography variant="h4" color="info.main" fontWeight="bold">
                {safePercentageReduction.toFixed(0)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Time Saved
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {/* Learning Progress Bar */}
        <Box sx={{ mt: 4 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle2">Overall Learning Progress</Typography>
            <Typography variant="body2" color="text.secondary">
              {learningProgress.toFixed(0)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={learningProgress}
            sx={{ height: 10, borderRadius: 5 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Your AI assistant is learning from your feedback and getting smarter over time.
          </Typography>
        </Box>

        {/* Time Savings Breakdown */}
        <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.100', borderRadius: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Automation Impact
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={6}>
              <Typography variant="body2" color="text.secondary">
                Before Automation
              </Typography>
              <Typography variant="h6">
                {safeManualBefore} manual
              </Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="body2" color="text.secondary">
                Now Automated
              </Typography>
              <Typography variant="h6" color="success.main">
                {safeAutoNow} auto
              </Typography>
            </Grid>
          </Grid>
        </Box>

        {/* Status Badge */}
        <Box sx={{ mt: 3, textAlign: 'center' }}>
          {learningProgress >= 80 && (
            <Chip
              label="🎉 Fully Trained - Your AI is highly personalized!"
              color="success"
              sx={{ fontWeight: 'medium' }}
            />
          )}
          {learningProgress >= 50 && learningProgress < 80 && (
            <Chip
              label="📚 Learning Well - Keep providing feedback!"
              color="primary"
              sx={{ fontWeight: 'medium' }}
            />
          )}
          {learningProgress < 50 && (
            <Chip
              label="🌱 Early Stage - More training data needed"
              color="warning"
              sx={{ fontWeight: 'medium' }}
            />
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
