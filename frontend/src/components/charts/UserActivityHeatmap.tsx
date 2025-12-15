import { useEffect, useState, useCallback } from 'react';
import { Box, Typography, CircularProgress, Alert, Tooltip } from '@mui/material';

interface HeatmapResponse {
  data: {
    heatmap: number[][];
    days: number;
  };
}

interface UserActivityHeatmapProps {
  days?: number;
  refreshInterval?: number;
  height?: number;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? '12am' : i < 12 ? `${i}am` : i === 12 ? '12pm' : `${i - 12}pm`
);

/**
 * Get color intensity based on event count
 */
function getHeatColor(value: number, maxValue: number): string {
  if (value === 0) return '#f3f4f6'; // Gray-100
  const intensity = Math.min(value / maxValue, 1);

  if (intensity < 0.25) return '#fef2f2'; // Red-50
  if (intensity < 0.5) return '#fecaca'; // Red-200
  if (intensity < 0.75) return '#f87171'; // Red-400
  return '#dc2626'; // Red-600
}

/**
 * UserActivityHeatmap Component
 *
 * Displays a grid showing security event activity patterns.
 * X-axis: hours (0-23)
 * Y-axis: days of week (Sun-Sat)
 * Color intensity represents event count
 */
export function UserActivityHeatmap({
  days = 7,
  refreshInterval = 30000,
  height = 300,
}: UserActivityHeatmapProps) {
  const [heatmap, setHeatmap] = useState<number[][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/security/stats/heatmap?days=${days}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json: HeatmapResponse = await response.json();
      setHeatmap(json.data.heatmap);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch heatmap');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  // Calculate max value for color scaling
  const maxValue = Math.max(1, ...heatmap.flat());

  // Get current day and hour for highlighting
  const now = new Date();
  const currentDay = now.getDay();
  const currentHour = now.getHours();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height={height}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (heatmap.length === 0) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height={height}
        sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}
      >
        <Typography color="text.secondary">No heatmap data available</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height }}>
      <Typography variant="subtitle1" fontWeight="bold" textAlign="center" mb={1}>
        Activity Heatmap (Last {days} Days)
      </Typography>

      <Box sx={{ overflowX: 'auto' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '50px repeat(24, 1fr)',
            gap: '2px',
            minWidth: 600,
          }}
        >
          {/* Header row with hours */}
          <Box /> {/* Empty corner cell */}
          {HOUR_LABELS.map((hour, i) => (
            <Typography
              key={hour}
              variant="caption"
              sx={{
                textAlign: 'center',
                fontSize: '0.6rem',
                color: i === currentHour ? 'primary.main' : 'text.secondary',
                fontWeight: i === currentHour ? 'bold' : 'normal',
              }}
            >
              {i % 3 === 0 ? hour : ''}
            </Typography>
          ))}

          {/* Rows for each day */}
          {DAY_LABELS.map((day, dayIndex) => (
            <>
              <Typography
                key={`label-${day}`}
                variant="caption"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  pr: 1,
                  color: dayIndex === currentDay ? 'primary.main' : 'text.secondary',
                  fontWeight: dayIndex === currentDay ? 'bold' : 'normal',
                }}
              >
                {day}
              </Typography>
              {Array.from({ length: 24 }, (_, hourIndex) => {
                const value = heatmap[dayIndex]?.[hourIndex] ?? 0;
                const isCurrentCell = dayIndex === currentDay && hourIndex === currentHour;

                return (
                  <Tooltip
                    key={`cell-${dayIndex}-${hourIndex}`}
                    title={`${day} ${HOUR_LABELS[hourIndex]}: ${value} events`}
                    arrow
                  >
                    <Box
                      sx={{
                        aspectRatio: '1',
                        minHeight: 20,
                        backgroundColor: getHeatColor(value, maxValue),
                        borderRadius: '2px',
                        border: isCurrentCell ? '2px solid' : '1px solid',
                        borderColor: isCurrentCell ? 'primary.main' : 'divider',
                        cursor: 'pointer',
                        transition: 'transform 0.1s',
                        '&:hover': {
                          transform: 'scale(1.2)',
                          zIndex: 1,
                        },
                      }}
                    />
                  </Tooltip>
                );
              })}
            </>
          ))}
        </Box>
      </Box>

      {/* Legend */}
      <Box display="flex" justifyContent="center" alignItems="center" gap={1} mt={2}>
        <Typography variant="caption" color="text.secondary">
          Less
        </Typography>
        {[0, 0.25, 0.5, 0.75, 1].map((intensity, i) => (
          <Box
            key={i}
            sx={{
              width: 16,
              height: 16,
              backgroundColor: getHeatColor(intensity * maxValue, maxValue),
              borderRadius: '2px',
              border: '1px solid',
              borderColor: 'divider',
            }}
          />
        ))}
        <Typography variant="caption" color="text.secondary">
          More
        </Typography>
      </Box>
    </Box>
  );
}
