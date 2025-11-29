import { Card, CardContent, Typography, Box, Chip } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { AccuracyTrendPoint } from '../../types/ml-metrics';

interface AccuracyOverviewProps {
  currentAccuracy: number;
  accuracyTrend: AccuracyTrendPoint[];
  improvement: number;
}

export function AccuracyOverview({ currentAccuracy, accuracyTrend, improvement }: AccuracyOverviewProps) {
  // Determine status color based on accuracy
  const getStatusColor = (accuracy: number): 'success' | 'warning' | 'error' => {
    if (accuracy >= 0.85) return 'success';
    if (accuracy >= 0.7) return 'warning';
    return 'error';
  };

  const statusColor = getStatusColor(currentAccuracy);
  const improvementPositive = improvement >= 0;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Model Accuracy Overview
        </Typography>

        {/* Current Accuracy - Large Display */}
        <Box sx={{ textAlign: 'center', my: 3 }}>
          <Typography variant="h2" color={`${statusColor}.main`} fontWeight="bold">
            {(currentAccuracy * 100).toFixed(1)}%
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Current Overall Accuracy
          </Typography>

          {/* Improvement Badge */}
          <Box sx={{ mt: 2 }}>
            <Chip
              icon={improvementPositive ? <TrendingUp /> : <TrendingDown />}
              label={`${improvementPositive ? '+' : ''}${(improvement * 100).toFixed(1)}% since day 1`}
              color={improvementPositive ? 'success' : 'error'}
              size="medium"
            />
          </Box>
        </Box>

        {/* Accuracy Trend Chart */}
        <Typography variant="subtitle2" gutterBottom sx={{ mt: 3 }}>
          30-Day Accuracy Trend
        </Typography>
        <Box sx={{ width: '100%', height: 200, mt: 2 }}>
          {accuracyTrend.length > 0 ? (
            <ResponsiveContainer>
              <LineChart data={accuracyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis
                  domain={[0, 1]}
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                />
                <Tooltip
                  formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                  labelFormatter={(label) => new Date(label).toLocaleDateString()}
                />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#1976d2"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', bgcolor: 'grey.100', borderRadius: 2 }}>
              <Typography color="text.secondary">No trend data available yet. Start categorizing expenses to see your progress!</Typography>
            </Box>
          )}
        </Box>

        {/* Status Legend */}
        <Box sx={{ mt: 3, display: 'flex', gap: 2, justifyContent: 'center' }}>
          <Chip label="Excellent (>85%)" color="success" size="small" variant="outlined" />
          <Chip label="Good (70-85%)" color="warning" size="small" variant="outlined" />
          <Chip label="Needs Work (<70%)" color="error" size="small" variant="outlined" />
        </Box>
      </CardContent>
    </Card>
  );
}
