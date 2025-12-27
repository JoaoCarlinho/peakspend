/**
 * Integration tests for Chat Streaming SSE endpoint
 * Story: streaming-chat-1
 *
 * Note: Full SSE streaming tests are challenging with supertest due to timeout issues.
 * These tests focus on request validation, authentication, and error handling.
 * E2E SSE testing should be done with Playwright or manual testing.
 */

// Mock logger - must be at the top before any imports
jest.mock('../../src/config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the chat service
jest.mock('../../src/services/chat.service', () => ({
  chatService: {
    getOrCreateSession: jest.fn(),
    getChatHistory: jest.fn(),
    processMessage: jest.fn(),
    getUserSessions: jest.fn(),
  },
  processMessageStream: jest.fn(),
  ChatMode: {},
}));

import request from 'supertest';
import express, { Express, Request, Response, NextFunction } from 'express';
import { chatController } from '../../src/controllers/chat.controller';
import { processMessageStream } from '../../src/services/chat.service';

describe('Chat Streaming SSE Endpoint', () => {
  let app: Express;
  let authApp: Express;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create express app with mock auth middleware
    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use((req: Request & { userId?: string }, _res: Response, next: NextFunction) => {
      req.userId = 'test-user-id';
      next();
    });

    // Mount the streaming endpoint
    app.post('/api/chat/sessions/:sessionId/messages/stream', chatController.sendMessageStream);

    // Create app without auth for auth tests
    authApp = express();
    authApp.use(express.json());
    authApp.post('/api/chat/sessions/:sessionId/messages/stream', chatController.sendMessageStream);
  });

  describe('Request Validation', () => {
    it('should return 400 when message is missing', async () => {
      const response = await request(app)
        .post('/api/chat/sessions/session-123/messages/stream')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Message is required');
      expect(response.body.code).toBe('INVALID_MESSAGE');
    });

    it('should return 400 when message is empty string', async () => {
      const response = await request(app)
        .post('/api/chat/sessions/session-123/messages/stream')
        .send({ message: '' })
        .expect(400);

      expect(response.body.error).toBe('Message is required');
      expect(response.body.code).toBe('INVALID_MESSAGE');
    });

    it('should return 400 when message is only whitespace', async () => {
      const response = await request(app)
        .post('/api/chat/sessions/session-123/messages/stream')
        .send({ message: '   ' })
        .expect(400);

      expect(response.body.error).toBe('Message is required');
    });

    it('should return 400 when message is not a string', async () => {
      const response = await request(app)
        .post('/api/chat/sessions/session-123/messages/stream')
        .send({ message: 123 })
        .expect(400);

      expect(response.body.error).toBe('Message is required');
    });
  });

  describe('Authentication', () => {
    it('should return 401 when userId is not set', async () => {
      const response = await request(authApp)
        .post('/api/chat/sessions/session-123/messages/stream')
        .send({ message: 'Test' })
        .expect(401);

      expect(response.body.error).toBe('Unauthorized');
      expect(response.body.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('Chat Mode Validation', () => {
    // These tests verify the mock is called with correct params
    // The actual SSE streaming is not tested here due to timeout issues

    it('should call processMessageStream with assistant mode by default', async () => {
      // Create a mock that immediately throws to avoid SSE timeout
      const mockError = new Error('Test error');
      (processMessageStream as jest.Mock).mockImplementation(function* () {
        throw mockError;
      });

      // The request will fail but we can check the mock was called correctly
      await request(app)
        .post('/api/chat/sessions/session-123/messages/stream')
        .send({ message: 'Test message' });

      expect(processMessageStream).toHaveBeenCalledWith(
        'test-user-id',
        'session-123',
        'Test message',
        'assistant'
      );
    });

    it('should call processMessageStream with coach mode when specified', async () => {
      const mockError = new Error('Test error');
      (processMessageStream as jest.Mock).mockImplementation(function* () {
        throw mockError;
      });

      await request(app)
        .post('/api/chat/sessions/session-123/messages/stream')
        .send({ message: 'Budget help', chatMode: 'coach' });

      expect(processMessageStream).toHaveBeenCalledWith(
        'test-user-id',
        'session-123',
        'Budget help',
        'coach'
      );
    });

    it('should default to assistant mode for invalid chatMode', async () => {
      const mockError = new Error('Test error');
      (processMessageStream as jest.Mock).mockImplementation(function* () {
        throw mockError;
      });

      await request(app)
        .post('/api/chat/sessions/session-123/messages/stream')
        .send({ message: 'Test', chatMode: 'invalid' });

      expect(processMessageStream).toHaveBeenCalledWith(
        'test-user-id',
        'session-123',
        'Test',
        'assistant'
      );
    });
  });

  describe('Message Trimming', () => {
    it('should trim whitespace from message', async () => {
      const mockError = new Error('Test error');
      (processMessageStream as jest.Mock).mockImplementation(function* () {
        throw mockError;
      });

      await request(app)
        .post('/api/chat/sessions/session-123/messages/stream')
        .send({ message: '  Hello world  ' });

      expect(processMessageStream).toHaveBeenCalledWith(
        'test-user-id',
        'session-123',
        'Hello world',
        'assistant'
      );
    });
  });

  describe('Session ID Handling', () => {
    it('should pass session ID from URL params', async () => {
      const mockError = new Error('Test error');
      (processMessageStream as jest.Mock).mockImplementation(function* () {
        throw mockError;
      });

      await request(app)
        .post('/api/chat/sessions/my-custom-session-id/messages/stream')
        .send({ message: 'Test' });

      expect(processMessageStream).toHaveBeenCalledWith(
        'test-user-id',
        'my-custom-session-id',
        'Test',
        'assistant'
      );
    });

    it('should handle UUID session IDs', async () => {
      const mockError = new Error('Test error');
      (processMessageStream as jest.Mock).mockImplementation(function* () {
        throw mockError;
      });

      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      await request(app)
        .post(`/api/chat/sessions/${uuid}/messages/stream`)
        .send({ message: 'Test' });

      expect(processMessageStream).toHaveBeenCalledWith(
        'test-user-id',
        uuid,
        'Test',
        'assistant'
      );
    });
  });
});
