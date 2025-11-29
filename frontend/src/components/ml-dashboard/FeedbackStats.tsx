import { Card, CardContent, Typography, Box, Grid } from '@mui/material';
import { ThumbUp, ThumbDown, Feedback as FeedbackIcon } from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import type { ImprovementMetrics } from '../../types/ml-metrics';

interface FeedbackStatsProps {
  improvementMetrics: ImprovementMetrics;
  categoryBreakdown?: Array<{ category: string; accuracy: number; predictions: number }>;
}

export function FeedbackStats({ improvementMetrics, categoryBreakdown = [] }: FeedbackStatsProps) {
  const { totalFeedbackCount, accuracyChange30Days, accuracyChange7Days } = improvementMetrics;

  // Calculate acceptance rate (assuming based on accuracy)
  const totalPredictions = categoryBreakdown.reduce((sum, cat) => sum + cat.predictions, 0);
  const acceptanceRate = totalPredictions > 0
    ? categoryBreakdown.reduce((sum, cat) => sum + cat.accuracy * cat.predictions, 0) / totalPredictions
    : 0.85; // Default estimate when no data

  const correctionRate = 1 - acceptanceRate;

  // Ensure values are valid numbers for display and charts
  const safeAcceptanceRate = isFinite(acceptanceRate) ? acceptanceRate : 0.85;
  const safeCorrectionRate = isFinite(correctionRate) ? correctionRate : 0.15;

  // Pie chart data with validated values
  const pieData = [
    { name: 'Accepted', value: safeAcceptanceRate * 100, color: '#4caf50' },
    { name: 'Corrected', value: safeCorrectionRate * 100, color: '#ff9800' },
  ];

  // Most corrected categories (lowest accuracy)
  const mostCorrected = [...categoryBreakdown]
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Feedback Statistics
        </Typography>

        {/* Summary Metrics */}
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'grey.100', borderRadius: 2 }}>
              <FeedbackIcon sx={{ fontSize: 36, color: 'primary.main', mb: 1 }} />
              <Typography variant="h4" fontWeight="bold">
                {totalFeedbackCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Feedback
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 4 }}>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'success.light', borderRadius: 2 }}>
              <ThumbUp sx={{ fontSize: 36, color: 'success.main', mb: 1 }} />
              <Typography variant="h4" fontWeight="bold" color="success.main">
                {(safeAcceptanceRate * 100).toFixed(0)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Acceptance Rate
              </Typography>
            </Box>
          </Grid>

          <Grid size={{ xs: 12, sm: 4 }}>
            <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'warning.light', borderRadius: 2 }}>
              <ThumbDown sx={{ fontSize: 36, color: 'warning.main', mb: 1 }} />
              <Typography variant="h4" fontWeight="bold" color="warning.main">
                {(safeCorrectionRate * 100).toFixed(0)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Correction Rate
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {/* Pie Chart */}
        <Box sx={{ width: '100%', height: 250, mt: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Feedback Distribution
          </Typography>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value.toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Box>

        {/* Improvement Trends */}
        <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.100', borderRadius: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Recent Improvements
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={6}>
              <Typography variant="body2" color="text.secondary">
                Last 7 Days
              </Typography>
              <Typography
                variant="h6"
                color={isFinite(accuracyChange7Days) && accuracyChange7Days >= 0 ? 'success.main' : 'error.main'}
              >
                {isFinite(accuracyChange7Days) ? (
                  <>
                    {accuracyChange7Days >= 0 ? '+' : ''}
                    {(accuracyChange7Days * 100).toFixed(1)}%
                  </>
                ) : '0.0%'}
              </Typography>
            </Grid>
            <Grid size={6}>
              <Typography variant="body2" color="text.secondary">
                Last 30 Days
              </Typography>
              <Typography
                variant="h6"
                color={isFinite(accuracyChange30Days) && accuracyChange30Days >= 0 ? 'success.main' : 'error.main'}
              >
                {isFinite(accuracyChange30Days) ? (
                  <>
                    {accuracyChange30Days >= 0 ? '+' : ''}
                    {(accuracyChange30Days * 100).toFixed(1)}%
                  </>
                ) : '0.0%'}
              </Typography>
            </Grid>
          </Grid>
        </Box>

        {/* Most Corrected Categories */}
        {mostCorrected.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Categories Needing More Training
            </Typography>
            <Box sx={{ mt: 1 }}>
              {mostCorrected.map((category, index) => (
                <Box
                  key={category.category}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    p: 1,
                    bgcolor: index % 2 === 0 ? 'grey.50' : 'transparent',
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="body2">{category.category}</Typography>
                  <Typography variant="body2" color="warning.main">
                    {((1 - category.accuracy) * 100).toFixed(0)}% corrections
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
