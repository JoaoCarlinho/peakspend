import { useEffect, useState, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface TimelineDataPoint {
  timestamp: string;
  blocked: number;
  allowed: number;
  escalated: number;
}

interface TimelineResponse {
  data: {
    timeline: TimelineDataPoint[];
    minutes: number;
  };
}

interface AttackTimelineProps {
  minutes?: number;
  refreshInterval?: number;
  height?: number;
}

/**
 * AttackTimeline Component
 *
 * Displays a line chart showing security events over time.
 * X-axis: time (configurable window, default 30 minutes)
 * Y-axis: event count per minute
 * Color-coded by severity (blocked=red, allowed=green, escalated=yellow)
 */
export function AttackTimeline({
  minutes = 30,
  refreshInterval = 10000,
  height = 300,
}: AttackTimelineProps) {
  const [data, setData] = useState<TimelineDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/security/stats/timeline?minutes=${minutes}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json: TimelineResponse = await response.json();
      setData(json.data.timeline);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch timeline');
    } finally {
      setLoading(false);
    }
  }, [minutes]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, refreshInterval]);

  const chartData = {
    labels: data.map((d) => new Date(d.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'Blocked',
        data: data.map((d) => d.blocked),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Escalated',
        data: data.map((d) => d.escalated),
        borderColor: 'rgb(234, 179, 8)',
        backgroundColor: 'rgba(234, 179, 8, 0.2)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Allowed',
        data: data.map((d) => d.allowed),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.2)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          usePointStyle: true,
          padding: 15,
        },
      },
      title: {
        display: true,
        text: `Security Events - Last ${minutes} Minutes`,
        font: {
          size: 16,
          weight: 'bold',
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Event Count',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Time',
        },
      },
    },
    interaction: {
      mode: 'nearest',
      axis: 'x',
      intersect: false,
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
        <Typography color="text.secondary">No timeline data available</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height, position: 'relative' }}>
      <Line data={chartData} options={options} />
    </Box>
  );
}
