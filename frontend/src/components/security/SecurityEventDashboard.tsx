import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Collapse,
  Tooltip,
  Badge,
  SelectChangeEvent,
} from '@mui/material';
import {
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  FiberManualRecord as LiveIcon,
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';

/**
 * Security event structure
 */
interface SecurityEvent {
  id: string;
  timestamp: string;
  eventType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  userId: string | null;
  sessionId: string | null;
  requestId: string | null;
  details: Record<string, unknown>;
  status: string;
}

/**
 * Severity color mapping
 */
const SEVERITY_COLORS: Record<
  string,
  { bg: string; border: string; text: string; chip: 'success' | 'warning' | 'error' | 'default' }
> = {
  LOW: { bg: '#f0fdf4', border: '#22c55e', text: '#166534', chip: 'success' },
  MEDIUM: { bg: '#fefce8', border: '#eab308', text: '#854d0e', chip: 'warning' },
  HIGH: { bg: '#fff7ed', border: '#f97316', text: '#9a3412', chip: 'warning' },
  CRITICAL: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', chip: 'error' },
};

/**
 * Event type labels for display
 */
const EVENT_TYPE_LABELS: Record<string, string> = {
  INPUT_BLOCKED: 'Input Blocked',
  OUTPUT_REDACTED: 'Output Redacted',
  CROSS_USER_ACCESS_BLOCKED: 'Cross-User Access Blocked',
  UNAUTHORIZED_TOOL_ACCESS: 'Unauthorized Tool Access',
  SECURITY_MODE_INITIALIZED: 'Security Mode Initialized',
  SECURITY_FLAG_CHANGED: 'Flag Changed',
  SECURITY_FLAG_RESET: 'Flag Reset',
  ANOMALY_DETECTED: 'Anomaly Detected',
  PROMPT_INTEGRITY_VIOLATION: 'Prompt Integrity Violation',
};

/**
 * SecurityEventDashboard Component
 *
 * Real-time dashboard showing security events with SSE streaming.
 * Supports filtering, auto-scroll, and expandable event details.
 */
export function SecurityEventDashboard() {
  useAuth(); // Verify authentication
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [limit, setLimit] = useState(100);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [newEventCount, setNewEventCount] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch initial events
  const fetchEvents = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/security/events?limit=${limit}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          setError('Security role required to view events');
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
        return;
      }

      const json = await response.json();
      setEvents(json.data.events);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  // Connect to SSE stream
  const connectSSE = useCallback(() => {
    // Note: SSE doesn't support custom headers, so we'd need to use query params
    // or implement a different auth mechanism for production
    const url = new URL('/api/security/events/stream', window.location.origin);

    const eventSource = new EventSource(url.toString(), {
      withCredentials: true,
    });

    eventSource.addEventListener('connected', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      console.log('SSE connected:', data);
      setIsConnected(true);
    });

    eventSource.addEventListener('security-event', (e: MessageEvent) => {
      const newEvent: SecurityEvent = JSON.parse(e.data);

      setEvents((prev) => {
        const updated = [newEvent, ...prev];
        return updated.slice(0, limit);
      });

      if (isPaused) {
        setNewEventCount((prev) => prev + 1);
      }
    });

    eventSource.onerror = () => {
      console.error('SSE connection error');
      setIsConnected(false);
      // Attempt reconnect after delay
      setTimeout(() => {
        if (eventSourceRef.current === eventSource) {
          connectSSE();
        }
      }, 5000);
    };

    eventSourceRef.current = eventSource;

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [limit, isPaused]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    const cleanup = connectSSE();
    return cleanup;
  }, [connectSSE]);

  // Auto-scroll effect
  useEffect(() => {
    if (!isPaused && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [events, isPaused]);

  // Handle scroll to detect manual scrolling
  const handleScroll = () => {
    if (listRef.current && listRef.current.scrollTop > 100) {
      setIsPaused(true);
    }
  };

  // Resume and scroll to top
  const handleResume = () => {
    setIsPaused(false);
    setNewEventCount(0);
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  };

  // Filter events
  const filteredEvents = events.filter((event) => {
    if (filter !== 'all' && event.eventType !== filter) return false;
    if (severityFilter !== 'all' && event.severity !== severityFilter) return false;
    return true;
  });

  // Get unique event types for filter
  const eventTypes = [...new Set(events.map((e) => e.eventType))];

  const handleFilterChange = (event: SelectChangeEvent) => {
    setFilter(event.target.value);
  };

  const handleSeverityFilterChange = (event: SelectChangeEvent) => {
    setSeverityFilter(event.target.value);
  };

  const handleLimitChange = (event: SelectChangeEvent<number>) => {
    setLimit(event.target.value as number);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
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
    <Box>
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
        flexWrap="wrap"
        gap={2}
      >
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="h5">Security Events</Typography>
          <Chip
            icon={<LiveIcon sx={{ fontSize: 12 }} />}
            label={isConnected ? 'Live' : 'Disconnected'}
            color={isConnected ? 'success' : 'error'}
            size="small"
            sx={{
              '& .MuiChip-icon': {
                animation: isConnected ? 'pulse 2s infinite' : 'none',
              },
              '@keyframes pulse': {
                '0%': { opacity: 1 },
                '50%': { opacity: 0.4 },
                '100%': { opacity: 1 },
              },
            }}
          />
        </Box>

        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Event Type</InputLabel>
            <Select value={filter} label="Event Type" onChange={handleFilterChange}>
              <MenuItem value="all">All Types</MenuItem>
              {eventTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {EVENT_TYPE_LABELS[type] || type}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>Severity</InputLabel>
            <Select
              value={severityFilter}
              label="Severity"
              onChange={handleSeverityFilterChange}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="LOW">Low</MenuItem>
              <MenuItem value="MEDIUM">Medium</MenuItem>
              <MenuItem value="HIGH">High</MenuItem>
              <MenuItem value="CRITICAL">Critical</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>Limit</InputLabel>
            <Select value={limit} label="Limit" onChange={handleLimitChange}>
              <MenuItem value={50}>50</MenuItem>
              <MenuItem value={100}>100</MenuItem>
              <MenuItem value={250}>250</MenuItem>
              <MenuItem value={500}>500</MenuItem>
            </Select>
          </FormControl>

          <Tooltip title={isPaused ? 'Resume auto-scroll' : 'Pause auto-scroll'}>
            <Badge badgeContent={newEventCount} color="error" invisible={!isPaused}>
              <IconButton
                onClick={isPaused ? handleResume : () => setIsPaused(true)}
                color={isPaused ? 'warning' : 'default'}
              >
                {isPaused ? <PlayIcon /> : <PauseIcon />}
              </IconButton>
            </Badge>
          </Tooltip>

          <Tooltip title="Refresh">
            <IconButton onClick={fetchEvents}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Paused indicator */}
      {isPaused && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Auto-scroll paused. {newEventCount > 0 && `${newEventCount} new event(s).`}
          <Box
            component="span"
            sx={{ cursor: 'pointer', textDecoration: 'underline', ml: 1 }}
            onClick={handleResume}
          >
            Click to resume
          </Box>
        </Alert>
      )}

      {/* Event count */}
      <Typography variant="body2" color="text.secondary" mb={1}>
        Showing {filteredEvents.length} of {events.length} events
      </Typography>

      {/* Event list */}
      <Box
        ref={listRef}
        onScroll={handleScroll}
        sx={{
          maxHeight: 600,
          overflowY: 'auto',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
        }}
      >
        {filteredEvents.length === 0 ? (
          <Box p={4} textAlign="center">
            <Typography color="text.secondary">No events to display</Typography>
          </Box>
        ) : (
          filteredEvents.map((event) => {
            const colors = SEVERITY_COLORS[event.severity] || SEVERITY_COLORS.LOW;
            const isExpanded = expandedEvent === event.id;

            return (
              <Card
                key={event.id}
                sx={{
                  m: 1,
                  borderLeft: '4px solid',
                  borderLeftColor: colors.border,
                  backgroundColor: colors.bg,
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s',
                  '&:hover': {
                    boxShadow: 2,
                  },
                }}
                onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
              >
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    flexWrap="wrap"
                    gap={1}
                  >
                    <Box display="flex" alignItems="center" gap={1}>
                      <Chip
                        label={event.severity}
                        size="small"
                        color={colors.chip}
                        sx={{ fontWeight: 'bold' }}
                      />
                      <Typography variant="subtitle2" fontWeight="bold">
                        {EVENT_TYPE_LABELS[event.eventType] || event.eventType}
                      </Typography>
                    </Box>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(event.timestamp).toLocaleString()}
                      </Typography>
                      <IconButton size="small">
                        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </Box>
                  </Box>

                  <Box display="flex" gap={2} mt={0.5} flexWrap="wrap">
                    {event.userId && (
                      <Typography variant="caption" color="text.secondary">
                        User: {event.userId.substring(0, 8)}...
                      </Typography>
                    )}
                    {event.sessionId && (
                      <Typography variant="caption" color="text.secondary">
                        Session: {event.sessionId.substring(0, 8)}...
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      Status: {event.status}
                    </Typography>
                  </Box>

                  <Collapse in={isExpanded}>
                    <Box
                      mt={2}
                      p={1}
                      sx={{
                        backgroundColor: 'background.paper',
                        borderRadius: 1,
                        maxHeight: 300,
                        overflow: 'auto',
                      }}
                    >
                      <Typography variant="caption" component="pre" sx={{ m: 0 }}>
                        {JSON.stringify(event.details, null, 2)}
                      </Typography>
                    </Box>
                  </Collapse>
                </CardContent>
              </Card>
            );
          })
        )}
      </Box>
    </Box>
  );
}
