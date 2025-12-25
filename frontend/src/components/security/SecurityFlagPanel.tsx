import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Switch,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Tooltip,
  IconButton,
  Grid,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  RestartAlt as ResetIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';

/**
 * Flag data returned from API
 */
interface FlagData {
  flag: string;
  effectiveValue: boolean;
  modeDefault: boolean;
  isOverridden: boolean;
  overriddenAt?: string;
  overriddenBy?: string;
}

/**
 * API response structure
 */
interface FlagsResponse {
  data: {
    mode: string;
    flags: FlagData[];
    overrideCount: number;
    modeInitializedAt: string;
    lastUpdated: string;
  };
}

/**
 * Flag metadata for display
 */
const FLAG_LABELS: Record<
  string,
  { label: string; description: string; category: string }
> = {
  INPUT_INSPECTION_ENABLED: {
    label: 'Input Inspection',
    description: 'Detect and block prompt injection attacks in user input',
    category: 'Input Protection',
  },
  OUTPUT_INSPECTION_ENABLED: {
    label: 'Output Inspection',
    description: 'Redact PII and block cross-user data leakage in LLM outputs',
    category: 'Output Protection',
  },
  AUDIT_LOGGING_ENABLED: {
    label: 'Audit Logging',
    description: 'Log all LLM interactions for compliance and forensics',
    category: 'Audit & Compliance',
  },
  PROMPT_PROTECTION_ENABLED: {
    label: 'Prompt Protection',
    description: 'Protect system prompts from tampering and extraction',
    category: 'System Protection',
  },
  TENANT_ISOLATION_ENABLED: {
    label: 'Tenant Isolation',
    description: 'Prevent cross-user data access in multi-tenant environment',
    category: 'Data Isolation',
  },
  ANOMALY_DETECTION_ENABLED: {
    label: 'Anomaly Detection',
    description: 'Detect attack patterns and generate security alerts',
    category: 'Threat Detection',
  },
  TOOL_RBAC_ENABLED: {
    label: 'Tool RBAC',
    description: 'Role-based access control for LLM tool invocations',
    category: 'Access Control',
  },
  TIER2_INSPECTION_ENABLED: {
    label: 'Tier 2 Inspection',
    description: 'Advanced AI-powered security inspection (optional)',
    category: 'Advanced Protection',
  },
};

/**
 * SecurityFlagPanel Component
 *
 * Displays all security flags with toggles for admin users.
 * Shows override indicators when flags differ from mode defaults.
 */
export function SecurityFlagPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FlagsResponse['data'] | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    flag: string;
    action: 'disable' | 'reset' | 'reset-all';
  } | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/security-flags', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          setError('Admin access required');
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
        return;
      }

      const json: FlagsResponse = await response.json();
      setData(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch flags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
    // Poll every 5 seconds for real-time updates
    const interval = setInterval(fetchFlags, 5000);
    return () => clearInterval(interval);
  }, [fetchFlags]);

  const handleToggle = async (flag: string, currentValue: boolean) => {
    if (!isAdmin) return;

    // If disabling, show confirmation
    if (currentValue) {
      setConfirmDialog({ flag, action: 'disable' });
      return;
    }

    // Enabling is immediate
    await updateFlag(flag, true);
  };

  const updateFlag = async (flag: string, value: boolean) => {
    setUpdating(flag);
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/admin/security-flags', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ flags: { [flag]: value } }),
      });
      await fetchFlags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update flag');
    } finally {
      setUpdating(null);
      setConfirmDialog(null);
    }
  };

  const handleReset = async (flag?: string) => {
    if (!isAdmin) return;

    if (flag) {
      setConfirmDialog({ flag, action: 'reset' });
    } else {
      setConfirmDialog({ flag: 'all', action: 'reset-all' });
    }
  };

  const performReset = async (flag?: string) => {
    setUpdating(flag || 'all');
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/admin/security-flags/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ flag }),
      });
      await fetchFlags();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset flags');
    } finally {
      setUpdating(null);
      setConfirmDialog(null);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
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

  if (!data) {
    return null;
  }

  const isVulnerableMode = data.mode === 'vulnerable';

  return (
    <Box>
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Box>
          <Typography variant="h5" gutterBottom>
            Security Feature Flags
          </Typography>
          <Box display="flex" alignItems="center" gap={2}>
            <Chip
              label={`Mode: ${data.mode.toUpperCase()}`}
              color={isVulnerableMode ? 'error' : 'success'}
              icon={isVulnerableMode ? <WarningIcon /> : <CheckCircleIcon />}
            />
            {data.overrideCount > 0 && (
              <Chip
                label={`${data.overrideCount} override${data.overrideCount > 1 ? 's' : ''} active`}
                color="warning"
                variant="outlined"
                size="small"
              />
            )}
          </Box>
        </Box>
        <Box display="flex" gap={1}>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchFlags}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          {isAdmin && data.overrideCount > 0 && (
            <Button
              variant="outlined"
              startIcon={<ResetIcon />}
              onClick={() => handleReset()}
              size="small"
            >
              Reset All
            </Button>
          )}
        </Box>
      </Box>

      {/* Warning banner for vulnerable mode */}
      {isVulnerableMode && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <strong>Vulnerable Mode Active:</strong> All security controls are
          disabled by default. This configuration is for demonstration purposes
          only.
        </Alert>
      )}

      {/* Flags Grid */}
      <Grid container spacing={2}>
        {data.flags.map((flag) => {
          const meta = FLAG_LABELS[flag.flag] || {
            label: flag.flag,
            description: '',
            category: 'Other',
          };
          const isUpdating = updating === flag.flag;

          return (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={flag.flag}>
              <Card
                sx={{
                  height: '100%',
                  border: flag.isOverridden ? '2px solid' : '1px solid',
                  borderColor: flag.isOverridden
                    ? 'warning.main'
                    : 'divider',
                }}
              >
                <CardContent>
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="flex-start"
                    mb={1}
                  >
                    <Box flex={1}>
                      <Typography variant="subtitle1" fontWeight="bold">
                        {meta.label}
                      </Typography>
                      <Chip
                        label={meta.category}
                        size="small"
                        variant="outlined"
                        sx={{ mt: 0.5 }}
                      />
                    </Box>
                    <Box display="flex" alignItems="center">
                      {isUpdating ? (
                        <CircularProgress size={24} />
                      ) : (
                        <Switch
                          checked={flag.effectiveValue}
                          onChange={() =>
                            handleToggle(flag.flag, flag.effectiveValue)
                          }
                          disabled={!isAdmin}
                          color={flag.effectiveValue ? 'success' : 'default'}
                        />
                      )}
                    </Box>
                  </Box>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 1, minHeight: 40 }}
                  >
                    {meta.description}
                  </Typography>

                  {/* Override indicator */}
                  {flag.isOverridden && (
                    <Box
                      display="flex"
                      alignItems="center"
                      justifyContent="space-between"
                      mt={1}
                    >
                      <Tooltip
                        title={`Default: ${flag.modeDefault ? 'ON' : 'OFF'} | Changed: ${
                          flag.overriddenAt
                            ? new Date(flag.overriddenAt).toLocaleString()
                            : 'Unknown'
                        }`}
                      >
                        <Chip
                          icon={<InfoIcon />}
                          label="Overridden"
                          size="small"
                          color="warning"
                        />
                      </Tooltip>
                      {isAdmin && (
                        <Button
                          size="small"
                          onClick={() => handleReset(flag.flag)}
                          disabled={isUpdating}
                        >
                          Reset
                        </Button>
                      )}
                    </Box>
                  )}

                  {/* Status indicator */}
                  <Box mt={1}>
                    <Chip
                      label={flag.effectiveValue ? 'ENABLED' : 'DISABLED'}
                      size="small"
                      color={flag.effectiveValue ? 'success' : 'error'}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog !== null}
        onClose={() => setConfirmDialog(null)}
      >
        <DialogTitle>
          {confirmDialog?.action === 'disable'
            ? 'Disable Security Feature?'
            : confirmDialog?.action === 'reset'
              ? 'Reset to Default?'
              : 'Reset All Flags?'}
        </DialogTitle>
        <DialogContent>
          {confirmDialog?.action === 'disable' && (
            <>
              <Typography paragraph>
                You are about to disable{' '}
                <strong>
                  {FLAG_LABELS[confirmDialog.flag]?.label || confirmDialog.flag}
                </strong>
                . This will reduce security protection.
              </Typography>
              <Alert severity="warning">
                This change takes effect immediately.
              </Alert>
            </>
          )}
          {confirmDialog?.action === 'reset' && (
            <Typography>
              Reset{' '}
              <strong>
                {FLAG_LABELS[confirmDialog.flag]?.label || confirmDialog.flag}
              </strong>{' '}
              to its mode default value?
            </Typography>
          )}
          {confirmDialog?.action === 'reset-all' && (
            <Typography>
              Reset all flags to their mode default values? This will clear all
              overrides.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog(null)}>Cancel</Button>
          <Button
            onClick={() => {
              if (confirmDialog?.action === 'disable') {
                updateFlag(confirmDialog.flag, false);
              } else if (confirmDialog?.action === 'reset') {
                performReset(confirmDialog.flag);
              } else {
                performReset();
              }
            }}
            color={confirmDialog?.action === 'disable' ? 'error' : 'primary'}
            variant="contained"
          >
            {confirmDialog?.action === 'disable' ? 'Disable' : 'Reset'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
