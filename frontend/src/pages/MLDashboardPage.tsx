import { Container, Grid, Typography, Box, CircularProgress, Alert } from '@mui/material';
import { Psychology as IntelligenceIcon } from '@mui/icons-material';
import { useDashboardMetrics, useImprovementMetrics } from '../hooks/useMLMetrics';
import { AccuracyOverview } from '../components/ml-dashboard/AccuracyOverview';
import { CategoryPerformance } from '../components/ml-dashboard/CategoryPerformance';
import { LearningProgress } from '../components/ml-dashboard/LearningProgress';
import { FeedbackStats } from '../components/ml-dashboard/FeedbackStats';

export function MLDashboardPage() {
  const {
    data: dashboardData,
    isLoading: isDashboardLoading,
    isError: isDashboardError,
    error: dashboardError,
  } = useDashboardMetrics();

  const {
    data: improvementData,
    isLoading: isImprovementLoading,
    isError: isImprovementError,
    error: improvementError,
  } = useImprovementMetrics();

  // Loading state
  if (isDashboardLoading || isImprovementLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  // Error state
  if (isDashboardError || isImprovementError) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">
          Error loading dashboard data:{' '}
          {(dashboardError as Error)?.message || (improvementError as Error)?.message || 'Unknown error'}
        </Alert>
      </Container>
    );
  }

  // No data state
  if (!dashboardData || !improvementData) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="info">
          No ML performance data available yet. Start using expense categorization to see your AI
          learning progress!
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {/* Page Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <IntelligenceIcon sx={{ fontSize: 40, color: 'primary.main' }} />
          <Typography variant="h4" fontWeight="bold">
            ML Performance Dashboard
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary">
          Track your AI assistant's learning progress and categorization accuracy
        </Typography>
      </Box>

      {/* Dashboard Grid */}
      <Grid container spacing={3}>
        {/* Row 1: Accuracy Overview (full width) */}
        <Grid item xs={12}>
          <AccuracyOverview
            currentAccuracy={dashboardData.currentAccuracy}
            accuracyTrend={dashboardData.accuracyTrend}
            improvement={improvementData.accuracyImprovement}
          />
        </Grid>

        {/* Row 2: Learning Progress (full width) */}
        <Grid item xs={12}>
          <LearningProgress improvementMetrics={improvementData} />
        </Grid>

        {/* Row 3: Category Performance and Feedback Stats */}
        <Grid item xs={12} lg={7}>
          <CategoryPerformance categoryBreakdown={dashboardData.categoryBreakdown} />
        </Grid>

        <Grid item xs={12} lg={5}>
          <FeedbackStats
            improvementMetrics={dashboardData.improvementMetrics}
            categoryBreakdown={dashboardData.categoryBreakdown}
          />
        </Grid>
      </Grid>

      {/* Footer Note */}
      <Box sx={{ mt: 4, p: 2, bgcolor: 'info.light', borderRadius: 2 }}>
        <Typography variant="body2" color="info.dark">
          💡 <strong>Tip:</strong> Your AI gets smarter with every expense you categorize. Accept or
          correct suggestions to help it learn your spending patterns better!
        </Typography>
      </Box>
    </Container>
  );
}
