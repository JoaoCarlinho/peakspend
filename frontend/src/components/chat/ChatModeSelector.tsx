/**
 * ChatModeSelector Component
 *
 * Toggle between assistant and budget coach modes.
 */

import React from 'react';
import { ToggleButton, ToggleButtonGroup, Tooltip, Box, Typography } from '@mui/material';
import AssistantIcon from '@mui/icons-material/Assistant';
import SchoolIcon from '@mui/icons-material/School';
import type { ChatMode } from '../../services/chatService';

export interface ChatModeSelectorProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  disabled?: boolean;
}

export const ChatModeSelector: React.FC<ChatModeSelectorProps> = ({
  mode,
  onModeChange,
  disabled = false,
}) => {
  const handleChange = (_event: React.MouseEvent<HTMLElement>, newMode: ChatMode | null) => {
    if (newMode !== null) {
      onModeChange(newMode);
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="caption" color="text.secondary">
        Mode:
      </Typography>
      <ToggleButtonGroup
        value={mode}
        exclusive
        onChange={handleChange}
        disabled={disabled}
        size="small"
      >
        <ToggleButton value="assistant">
          <Tooltip title="Financial Assistant - Get help with expenses and questions">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AssistantIcon fontSize="small" />
              <Typography variant="caption">Assistant</Typography>
            </Box>
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="coach">
          <Tooltip title="Budget Coach - Get personalized advice and goal setting">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <SchoolIcon fontSize="small" />
              <Typography variant="caption">Coach</Typography>
            </Box>
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
};
