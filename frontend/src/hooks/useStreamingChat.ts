/**
 * useStreamingChat Hook
 *
 * Custom hook for streaming chat messages via SSE.
 * Uses fetch with ReadableStream since our endpoint uses POST.
 */

import { useCallback, useRef } from 'react';
import { ChatMode } from '../services/chatService';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://rczwkm4t9i.us-east-1.awsapprunner.com/';

export interface StreamingCallbacks {
  onToken: (token: string) => void;
  onComplete: (result: StreamingResult) => void;
  onError: (error: Error) => void;
}

export interface StreamingResult {
  wasRedacted: boolean;
  messageId: string;
  fullResponse: string;
}

export interface UseStreamingChatReturn {
  streamMessage: (
    sessionId: string,
    message: string,
    mode: ChatMode,
    callbacks: StreamingCallbacks
  ) => void;
  cancelStream: () => void;
  isStreaming: boolean;
}

/**
 * Hook for streaming chat messages from the backend via SSE
 */
export function useStreamingChat(): UseStreamingChatReturn {
  const abortControllerRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);

  const cancelStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isStreamingRef.current = false;
  }, []);

  const streamMessage = useCallback(
    async (
      sessionId: string,
      message: string,
      mode: ChatMode,
      callbacks: StreamingCallbacks
    ) => {
      // Cancel any existing stream
      cancelStream();

      // Create new abort controller
      abortControllerRef.current = new AbortController();
      isStreamingRef.current = true;

      const token = localStorage.getItem('auth_token');
      const url = `${API_BASE_URL}api/chat/sessions/${sessionId}/messages/stream`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ message, chatMode: mode }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonData = line.slice(6); // Remove 'data: ' prefix

              try {
                const event = JSON.parse(jsonData);

                if (event.token) {
                  callbacks.onToken(event.token);
                }

                if (event.done) {
                  callbacks.onComplete({
                    wasRedacted: event.wasRedacted || false,
                    messageId: event.messageId || '',
                    fullResponse: event.fullResponse || '',
                  });
                }

                if (event.error) {
                  callbacks.onError(new Error(event.error));
                  cancelStream();
                  return;
                }
              } catch {
                // Skip invalid JSON lines
              }
            }
          }
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          // Stream was intentionally cancelled
          return;
        }
        callbacks.onError(error as Error);
      } finally {
        isStreamingRef.current = false;
        abortControllerRef.current = null;
      }
    },
    [cancelStream]
  );

  return {
    streamMessage,
    cancelStream,
    get isStreaming() {
      return isStreamingRef.current;
    },
  };
}
