import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  IconButton,
  Tooltip,
  Switch,
  FormControlLabel,
  Chip,
} from '@mui/material';
import {
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Refresh as RefreshIcon,
  FiberManualRecord as LiveIcon,
} from '@mui/icons-material';
import { AttackTimeline, AttackDistribution, BlockedAllowedGauge, UserActivityHeatmap } from '../charts';
import { SecurityEventDashboard } from './SecurityEventDashboard';
import { useAuth } from '../../hooks/useAuth';

interface SecurityDashboardLayoutProps {
  initialView?: 'charts' | 'events' | 'all';
}

/**
 * SecurityDashboardLayout Component
 *
 * Grid layout for all security visualization components.
 * Features responsive breakpoints, full-screen presentation mode,
 * and auto-refresh toggle.
 */
export function SecurityDashboardLayout({ initialView = 'all' }: SecurityDashboardLayoutProps) {
  useAuth(); // Verify authentication
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [view, setView] = useState(initialView);
  const [selectedEventType, setSelectedEventType] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Handle fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Manual refresh handler
  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  // Handle event type filter from distribution chart
  const handleTypeClick = (type: string) => {
    setSelectedEventType(type === selectedEventType ? null : type);
  };

  const refreshInterval = autoRefresh ? 10000 : 0;

  return (
    <Box
      sx={{
        p: isFullscreen ? 4 : 0,
        minHeight: isFullscreen ? '100vh' : 'auto',
        backgroundColor: isFullscreen ? 'background.default' : 'transparent',
      }}
    >
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
        flexWrap="wrap"
        gap={2}
      >
        <Box display="flex" alignItems="center" gap={2}>
          <Typography
            variant={isFullscreen ? 'h4' : 'h5'}
            fontWeight="bold"
          >
            Security Dashboard
          </Typography>
          <Chip
            icon={<LiveIcon sx={{ fontSize: 12 }} />}
            label={autoRefresh ? 'Live' : 'Paused'}
            color={autoRefresh ? 'success' : 'default'}
            size="small"
            sx={{
              '& .MuiChip-icon': {
                animation: autoRefresh ? 'pulse 2s infinite' : 'none',
              },
              '@keyframes pulse': {
                '0%': { opacity: 1 },
                '50%': { opacity: 0.4 },
                '100%': { opacity: 1 },
              },
            }}
          />
        </Box>

        <Box display="flex" alignItems="center" gap={2}>
          {/* View selector */}
          <Box display="flex" gap={1}>
            {(['charts', 'events', 'all'] as const).map((v) => (
              <Chip
                key={v}
                label={v.charAt(0).toUpperCase() + v.slice(1)}
                onClick={() => setView(v)}
                color={view === v ? 'primary' : 'default'}
                variant={view === v ? 'filled' : 'outlined'}
                size="small"
              />
            ))}
          </Box>

          <FormControlLabel
            control={
              <Switch
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                size="small"
              />
            }
            label="Auto-refresh"
          />

          <Tooltip title="Refresh all">
            <IconButton onClick={handleRefresh} size="small">
              <RefreshIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Presentation mode'}>
            <IconButton onClick={toggleFullscreen} size="small">
              {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Selected filter indicator */}
      {selectedEventType && (
        <Box mb={2}>
          <Chip
            label={`Filtered by: ${selectedEventType}`}
            onDelete={() => setSelectedEventType(null)}
            color="primary"
            variant="outlined"
          />
        </Box>
      )}

      {/* Charts Grid */}
      {(view === 'charts' || view === 'all') && (
        <Grid container spacing={3} mb={3}>
          {/* Timeline - full width on top */}
          <Grid size={{ xs: 12, lg: 8 }}>
            <Paper sx={{ p: 2 }}>
              <AttackTimeline
                key={`timeline-${refreshKey}`}
                refreshInterval={refreshInterval}
                height={isFullscreen ? 400 : 300}
              />
            </Paper>
          </Grid>

          {/* Gauge - right side */}
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <Paper sx={{ p: 2 }}>
              <BlockedAllowedGauge
                key={`gauge-${refreshKey}`}
                refreshInterval={refreshInterval}
                height={isFullscreen ? 280 : 220}
              />
            </Paper>
          </Grid>

          {/* Distribution - left bottom */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 2 }}>
              <AttackDistribution
                key={`distribution-${refreshKey}`}
                refreshInterval={refreshInterval}
                height={isFullscreen ? 400 : 300}
                onTypeClick={handleTypeClick}
              />
            </Paper>
          </Grid>

          {/* Heatmap - right bottom */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={{ p: 2 }}>
              <UserActivityHeatmap
                key={`heatmap-${refreshKey}`}
                refreshInterval={refreshInterval}
                height={isFullscreen ? 400 : 300}
              />
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Events List */}
      {(view === 'events' || view === 'all') && (
        <Paper sx={{ p: 2 }}>
          <SecurityEventDashboard />
        </Paper>
      )}
    </Box>
  );
}
