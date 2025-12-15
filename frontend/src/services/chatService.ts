/**
 * Chat Service
 *
 * Handles communication with the chat API endpoints.
 * Uses secure endpoints with input/output inspection enabled.
 */

import { apiClient } from './api';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
}

export interface ChatSession {
  id: string;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface SendMessageResponse {
  response: string;
  wasRedacted: boolean;
  sessionId: string;
}

export type ChatMode = 'assistant' | 'coach';

/**
 * Create a new chat session
 */
export async function createSession(): Promise<ChatSession> {
  const response = await apiClient.post<{ session: ChatSession }>('/api/chat/sessions');
  return response.data.session;
}

/**
 * Get all chat sessions for the current user
 */
export async function getSessions(): Promise<ChatSession[]> {
  const response = await apiClient.get<{ sessions: ChatSession[] }>('/api/chat/sessions');
  return response.data.sessions;
}

/**
 * Get messages for a specific session
 */
export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const response = await apiClient.get<{ messages: ChatMessage[] }>(
    `/api/chat/sessions/${sessionId}/messages`
  );
  return response.data.messages;
}

/**
 * Send a message to a session
 */
export async function sendMessage(
  sessionId: string,
  message: string,
  mode: ChatMode = 'assistant'
): Promise<SendMessageResponse> {
  const response = await apiClient.post<SendMessageResponse>(
    `/api/chat/sessions/${sessionId}/messages`,
    { message, mode }
  );
  return response.data;
}

/**
 * Quick message - auto-creates session if needed
 */
export async function quickMessage(
  message: string,
  mode: ChatMode = 'assistant'
): Promise<SendMessageResponse> {
  const response = await apiClient.post<SendMessageResponse>('/api/chat/message', {
    message,
    mode,
  });
  return response.data;
}

export const chatService = {
  createSession,
  getSessions,
  getSessionMessages,
  sendMessage,
  quickMessage,
};
