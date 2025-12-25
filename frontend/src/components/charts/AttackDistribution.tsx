import { useEffect, useState, useCallback } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, ChartOptions } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';

ChartJS.register(ArcElement, Tooltip, Legend);

interface DistributionData {
  eventType: string;
  count: number;
}

interface DistributionResponse {
  data: {
    distribution: DistributionData[];
    hours: number;
  };
}

/**
 * Event type to color mapping
 */
const TYPE_COLORS: Record<string, string> = {
  INPUT_BLOCKED: '#ef4444',
  OUTPUT_REDACTED: '#f97316',
  UNAUTHORIZED_TOOL_ACCESS: '#eab308',
  CROSS_USER_ACCESS_BLOCKED: '#dc2626',
  ANOMALY_DETECTED: '#8b5cf6',
  SECURITY_MODE_INITIALIZED: '#06b6d4',
  SECURITY_FLAG_CHANGED: '#10b981',
  SECURITY_FLAG_RESET: '#14b8a6',
  PROMPT_INTEGRITY_VIOLATION: '#ec4899',
};

/**
 * Event type display labels
 */
const TYPE_LABELS: Record<string, string> = {
  INPUT_BLOCKED: 'Input Blocked',
  OUTPUT_REDACTED: 'Output Redacted',
  UNAUTHORIZED_TOOL_ACCESS: 'Unauthorized Access',
  CROSS_USER_ACCESS_BLOCKED: 'Cross-User Blocked',
  ANOMALY_DETECTED: 'Anomaly Detected',
  SECURITY_MODE_INITIALIZED: 'Mode Initialized',
  SECURITY_FLAG_CHANGED: 'Flag Changed',
  SECURITY_FLAG_RESET: 'Flag Reset',
  PROMPT_INTEGRITY_VIOLATION: 'Prompt Violation',
};

interface AttackDistributionProps {
  hours?: number;
  refreshInterval?: number;
  height?: number;
  onTypeClick?: (type: string) => void;
}

/**
 * AttackDistribution Component
 *
 * Displays a doughnut chart showing distribution of security event types.
 * Click on segments to filter the dashboard by event type.
 */
export function AttackDistribution({
  hours = 24,
  refreshInterval = 10000,
  height = 300,
  onTypeClick,
}: AttackDistributionProps) {
  const [data, setData] = useState<DistributionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/security/stats/distribution?hours=${hours}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json: DistributionResponse = await response.json();
      setData(json.data.distribution);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch distribution');
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
    labels: data.map((d) => TYPE_LABELS[d.eventType] || d.eventType),
    datasets: [
      {
        data: data.map((d) => d.count),
        backgroundColor: data.map((d) => TYPE_COLORS[d.eventType] || '#6b7280'),
        borderWidth: 2,
        borderColor: '#fff',
      },
    ],
  };

  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          boxWidth: 12,
          padding: 10,
          usePointStyle: true,
        },
      },
      title: {
        display: true,
        text: `Event Type Distribution (${hours}h)`,
        font: {
          size: 16,
          weight: 'bold',
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const total = data.reduce((sum, d) => sum + d.count, 0);
            const percentage = ((context.parsed / total) * 100).toFixed(1);
            return `${context.label}: ${context.parsed} (${percentage}%)`;
          },
        },
      },
    },
    onClick: (_event, elements) => {
      if (elements.length > 0 && onTypeClick) {
        const index = elements[0].index;
        onTypeClick(data[index].eventType);
      }
    },
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

  if (data.length === 0) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        height={height}
        sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}
      >
        <Typography color="text.secondary">No distribution data available</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height, position: 'relative' }}>
      <Doughnut data={chartData} options={options} />
    </Box>
  );
}
