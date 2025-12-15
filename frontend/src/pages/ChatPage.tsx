/**
 * ChatPage
 *
 * Page component for the financial assistant chat interface.
 */

import React from 'react';
import { Box, Container, Typography, Paper } from '@mui/material';
import { ChatContainer } from '../components/chat';

export const ChatPage: React.FC = () => {
  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Financial Assistant
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Ask questions about your expenses, get spending insights, or switch to Budget Coach mode
          for personalized advice and goal setting.
        </Typography>
      </Box>

      <Paper sx={{ height: '70vh' }}>
        <ChatContainer
          initialMode="assistant"
          welcomeMessage="Hello! I'm your financial assistant. I can help you understand your spending patterns, answer questions about your expenses, or provide budgeting advice. What would you like to know?"
        />
      </Paper>
    </Container>
  );
};
