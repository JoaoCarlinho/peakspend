import {
  Card,
  CardContent,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Paper,
} from '@mui/material';
import { Warning } from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { CategoryBreakdown } from '../../types/ml-metrics';

interface CategoryPerformanceProps {
  categoryBreakdown: CategoryBreakdown[];
}

export function CategoryPerformance({ categoryBreakdown }: CategoryPerformanceProps) {
  // Sort by accuracy (lowest first to highlight weak categories)
  const sortedCategories = [...categoryBreakdown].sort((a, b) => a.accuracy - b.accuracy);

  // Color bars based on accuracy
  const getBarColor = (accuracy: number): string => {
    if (accuracy >= 0.85) return '#4caf50'; // green
    if (accuracy >= 0.7) return '#ff9800'; // orange
    return '#f44336'; // red
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Category Performance
        </Typography>

        {/* Bar Chart */}
        <Box sx={{ width: '100%', height: 300, mt: 2 }}>
          <ResponsiveContainer>
            <BarChart data={sortedCategories} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                domain={[0, 1]}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
              />
              <YAxis dataKey="category" type="category" tick={{ fontSize: 12 }} width={100} />
              <Tooltip
                formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                labelFormatter={(label) => `Category: ${label}`}
              />
              <Bar dataKey="accuracy" radius={[0, 4, 4, 0]}>
                {sortedCategories.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.accuracy)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>

        {/* Detailed Table */}
        <Typography variant="subtitle2" gutterBottom sx={{ mt: 3 }}>
          Detailed Metrics
        </Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Category</TableCell>
                <TableCell align="right">Accuracy</TableCell>
                <TableCell align="right">Predictions</TableCell>
                <TableCell align="center">Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedCategories.map((category) => {
                const isWeak = category.accuracy < 0.7;
                return (
                  <TableRow key={category.category}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {isWeak && <Warning color="error" fontSize="small" />}
                        {category.category}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        color={
                          category.accuracy >= 0.85
                            ? 'success.main'
                            : category.accuracy >= 0.7
                              ? 'warning.main'
                              : 'error.main'
                        }
                        fontWeight="medium"
                      >
                        {(category.accuracy * 100).toFixed(1)}%
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{category.predictions}</TableCell>
                    <TableCell align="center">
                      {category.accuracy >= 0.85 && (
                        <Chip label="Excellent" color="success" size="small" />
                      )}
                      {category.accuracy >= 0.7 && category.accuracy < 0.85 && (
                        <Chip label="Good" color="warning" size="small" />
                      )}
                      {category.accuracy < 0.7 && (
                        <Chip label="Needs Work" color="error" size="small" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Weak Categories Alert */}
        {sortedCategories.some((c) => c.accuracy < 0.7) && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'error.light', borderRadius: 1 }}>
            <Typography variant="body2" color="error.dark">
              <Warning fontSize="small" sx={{ verticalAlign: 'middle', mr: 1 }} />
              Some categories have accuracy below 70%. Consider providing more training examples for
              these categories.
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
