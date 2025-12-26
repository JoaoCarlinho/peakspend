import { useEffect, useState } from 'react';
import { Chip, Tooltip, Box, Typography, CircularProgress } from '@mui/material';
import { Shield as ShieldIcon, Warning as WarningIcon } from '@mui/icons-material';
import { apiClient } from '../../services/api';

/**
 * Security status response from /health/security endpoint
 */
interface SecurityStatusResponse {
  status: string;
  security: {
    mode: 'vulnerable' | 'secure';
    isVulnerable: boolean;
    flags: Record<string, boolean>;
    initializedAt: string;
    uptimeMs: number;
  };
}

/**
 * Format uptime in a human-readable way
 */
function formatUptime(uptimeMs: number): string {
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * SecurityModeIndicator Component
 *
 * Displays the current security mode in the application header.
 * Color-coded: red for vulnerable mode, green for secure mode.
 * Shows tooltip with detailed feature flag states.
 */
export function SecurityModeIndicator() {
  const [status, setStatus] = useState<SecurityStatusResponse['security'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSecurityStatus = async () => {
      try {
        const response = await apiClient.get<SecurityStatusResponse>('/health/security');
        setStatus(response.data.security);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch security status');
      } finally {
        setLoading(false);
      }
    };

    fetchSecurityStatus();

    // Refresh every 30 seconds
    const interval = setInterval(fetchSecurityStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Chip
        size="small"
        label={<CircularProgress size={12} color="inherit" />}
        sx={{ minWidth: 80 }}
      />
    );
  }

  if (error || !status) {
    return (
      <Tooltip title={`Error: ${error || 'Unknown error'}`}>
        <Chip
          size="small"
          label="UNKNOWN"
          color="default"
          icon={<WarningIcon />}
        />
      </Tooltip>
    );
  }

  const isVulnerable = status.mode === 'vulnerable';

  // Build tooltip content showing all feature flags
  const tooltipContent = (
    <Box sx={{ p: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
        Security Mode: {status.mode.toUpperCase()}
      </Typography>
      <Typography variant="caption" display="block" sx={{ mb: 1 }}>
        Uptime: {formatUptime(status.uptimeMs)}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
        Feature Flags:
      </Typography>
      {Object.entries(status.flags).map(([key, value]) => (
        <Typography
          key={key}
          variant="caption"
          display="block"
          sx={{
            color: value ? 'success.light' : 'error.light',
            pl: 1,
          }}
        >
          {value ? '✓' : '✗'} {key.replace(/_ENABLED$/, '')}
        </Typography>
      ))}
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} arrow>
      <Chip
        size="small"
        icon={isVulnerable ? <WarningIcon /> : <ShieldIcon />}
        label={status.mode.toUpperCase()}
        color={isVulnerable ? 'error' : 'success'}
        sx={{
          fontWeight: 'bold',
          '& .MuiChip-icon': {
            fontSize: 16,
          },
        }}
      />
    </Tooltip>
  );
}
