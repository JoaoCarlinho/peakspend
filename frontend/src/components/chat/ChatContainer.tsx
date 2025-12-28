/**
 * ChatContainer Component
 *
 * Main container for the chat interface. Manages messages,
 * handles sending/receiving, and coordinates with the chat service.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Alert,
  Snackbar,
  IconButton,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { ChatMessage, ChatMessageProps } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import { ChatModeSelector } from './ChatModeSelector';
import { chatService, ChatMode } from '../../services/chatService';
import { useStreamingChat } from '../../hooks/useStreamingChat';

export interface ChatContainerProps {
  initialMode?: ChatMode;
  welcomeMessage?: string;
}

export const ChatContainer: React.FC<ChatContainerProps> = ({
  initialMode = 'assistant',
  welcomeMessage = "Hello! I'm your financial assistant. How can I help you today?",
}) => {
  const [messages, setMessages] = useState<ChatMessageProps[]>([
    { role: 'assistant', content: welcomeMessage },
  ]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ChatMode>(initialMode);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { streamMessage, cancelStream } = useStreamingChat();

  // Auto-scroll to bottom when messages change or during streaming
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, streamingContent]);

  // Create session on mount
  useEffect(() => {
    const initSession = async () => {
      try {
        const session = await chatService.createSession();
        setSessionId(session.id);
      } catch (err) {
        console.error('Failed to create chat session:', err);
        // Continue without session - will use quick message endpoint
      }
    };
    initSession();
  }, []);

  // Cleanup streaming on unmount
  useEffect(() => {
    return () => {
      cancelStream();
    };
  }, [cancelStream]);

  const handleSendMessage = useCallback(
    async (content: string) => {
      // Add user message immediately
      const userMessage: ChatMessageProps = {
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setError(null);

      // Use streaming if we have a session, otherwise fall back to non-streaming
      if (sessionId) {
        setIsStreaming(true);
        setStreamingContent('');

        streamMessage(sessionId, content, mode, {
          onToken: (token) => {
            setStreamingContent((prev) => prev + token);
          },
          onComplete: (result) => {
            // Convert streaming message to regular message
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: result.fullResponse,
                timestamp: new Date().toISOString(),
              },
            ]);
            setStreamingContent('');
            setIsStreaming(false);

            // Show warning if content was redacted
            if (result.wasRedacted) {
              setError('Some content was filtered for your protection.');
            }
          },
          onError: (err) => {
            console.error('Streaming error:', err);
            setError('Failed to send message. Please try again.');
            setStreamingContent('');
            setIsStreaming(false);
            // Remove the user message on error
            setMessages((prev) => prev.slice(0, -1));
          },
        });
      } else {
        // Fall back to non-streaming for initial message (no session yet)
        setLoading(true);
        try {
          const response = await chatService.quickMessage(content, mode);
          setSessionId(response.sessionId);

          const assistantMessage: ChatMessageProps = {
            role: 'assistant',
            content: response.response,
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMessage]);

          // Show warning if content was redacted
          if (response.wasRedacted) {
            setError('Some content was filtered for your protection.');
          }
        } catch (err) {
          console.error('Failed to send message:', err);
          setError('Failed to send message. Please try again.');
          // Remove the user message on error
          setMessages((prev) => prev.slice(0, -1));
        } finally {
          setLoading(false);
        }
      }
    },
    [sessionId, mode, streamMessage]
  );

  const handleModeChange = (newMode: ChatMode) => {
    setMode(newMode);
    const modeLabel = newMode === 'coach' ? 'Budget Coach' : 'Financial Assistant';
    setMessages((prev) => [
      ...prev,
      {
        role: 'system',
        content: `Switched to ${modeLabel} mode`,
      },
    ]);
  };

  const handleReset = () => {
    cancelStream();
    setIsStreaming(false);
    setStreamingContent('');
    setMessages([{ role: 'assistant', content: welcomeMessage }]);
    setSessionId(null);
    chatService.createSession().then((session) => {
      setSessionId(session.id);
    });
  };

  return (
    <Paper
      elevation={3}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxHeight: '70vh',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          bgcolor: 'primary.main',
          color: 'white',
        }}
      >
        <Typography variant="h6">
          {mode === 'coach' ? 'Budget Coach' : 'Financial Assistant'}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ChatModeSelector mode={mode} onModeChange={handleModeChange} disabled={loading || isStreaming} />
          <Tooltip title="Start new conversation">
            <IconButton size="small" onClick={handleReset} sx={{ color: 'white' }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Messages */}
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
          bgcolor: 'grey.50',
        }}
      >
        {messages.map((msg, index) => (
          <ChatMessage key={index} {...msg} />
        ))}
        {/* Show streaming message with typewriter cursor */}
        {isStreaming && streamingContent && (
          <ChatMessage role="assistant" content={streamingContent} isStreaming={true} />
        )}
        {/* Show typing indicator only when loading (non-streaming) or streaming hasn't started */}
        {(loading || (isStreaming && !streamingContent)) && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <ChatInput
        onSend={handleSendMessage}
        loading={loading || isStreaming}
        placeholder={
          mode === 'coach'
            ? 'Ask for budget advice or set a goal...'
            : 'Ask about your expenses...'
        }
      />

      {/* Error Snackbar */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setError(null)} severity="warning" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Paper>
  );
};
