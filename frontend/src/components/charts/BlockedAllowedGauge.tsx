import { useEffect, useState, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, ChartOptions } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';

ChartJS.register(ArcElement, Tooltip);

interface RatioData {
  blocked: number;
  allowed: number;
  total: number;
  blockRate: number;
}

interface RatioResponse {
  data: RatioData;
}

interface BlockedAllowedGaugeProps {
  hours?: number;
  refreshInterval?: number;
  height?: number;
}

/**
 * BlockedAllowedGauge Component
 *
 * Displays a semi-circle gauge showing the ratio of blocked to allowed events.
 * Green represents allowed events, red represents blocked events.
 */
export function BlockedAllowedGauge({
  hours = 24,
  refreshInterval = 5000,
  height = 200,
}: BlockedAllowedGaugeProps) {
  const [data, setData] = useState<RatioData>({
    blocked: 0,
    allowed: 0,
    total: 0,
    blockRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/security/stats/ratio?hours=${hours}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json: RatioResponse = await response.json();
      setData(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch ratio');
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  const chartData = {
    labels: ['Blocked', 'Allowed'],
    datasets: [
      {
        data: [data.blocked, data.allowed],
        backgroundColor: ['#ef4444', '#22c55e'],
        borderWidth: 0,
        circumference: 180,
        rotation: 270,
      },
    ],
  };

  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (context) => {
            const percentage = ((context.parsed / data.total) * 100).toFixed(1);
            return `${context.label}: ${context.parsed} (${percentage}%)`;
          },
        },
      },
    },
    cutout: '70%',
  };

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

  return (
    <Box sx={{ height, position: 'relative' }}>
      <Box sx={{ height: '100%', paddingBottom: '20px' }}>
        <Doughnut data={chartData} options={options} />
      </Box>
      <Box
        sx={{
          position: 'absolute',
          top: '55%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}
      >
        <Typography
          variant="h3"
          sx={{
            fontWeight: 'bold',
            color: data.blockRate > 50 ? 'error.main' : 'success.main',
          }}
        >
          {data.blockRate.toFixed(1)}%
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Block Rate
        </Typography>
        <Box sx={{ mt: 1, display: 'flex', gap: 1, justifyContent: 'center' }}>
          <Typography variant="caption" sx={{ color: '#ef4444' }}>
            {data.blocked} blocked
          </Typography>
          <Typography variant="caption" color="text.secondary">
            /
          </Typography>
          <Typography variant="caption" sx={{ color: '#22c55e' }}>
            {data.allowed} allowed
          </Typography>
        </Box>
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', textAlign: 'center', mt: -2 }}
      >
        Last {hours} hours ({data.total} total events)
      </Typography>
    </Box>
  );
}
