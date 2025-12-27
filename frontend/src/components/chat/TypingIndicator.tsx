/**
 * TypingIndicator Component
 *
 * Shows animated dots to indicate the assistant is thinking/typing.
 */

import React from 'react';
import { Box, Paper, Avatar, keyframes } from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';

const bounce = keyframes`
  0%, 60%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-4px);
  }
`;

export const TypingIndicator: React.FC = () => {
  return (
    <Box
      data-testid="typing-indicator"
      sx={{
        display: 'flex',
        justifyContent: 'flex-start',
        mb: 2,
        px: 1,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
        }}
      >
        <Avatar
          sx={{
            bgcolor: 'secondary.main',
            width: 32,
            height: 32,
          }}
        >
          <SmartToyIcon fontSize="small" />
        </Avatar>
        <Paper
          elevation={1}
          sx={{
            p: 1.5,
            bgcolor: 'grey.100',
            borderRadius: 2,
            borderTopLeftRadius: 0,
            display: 'flex',
            gap: 0.5,
            alignItems: 'center',
          }}
        >
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: 'grey.400',
                animation: `${bounce} 1.4s infinite ease-in-out`,
                animationDelay: `${i * 0.16}s`,
              }}
            />
          ))}
        </Paper>
      </Box>
    </Box>
  );
};
