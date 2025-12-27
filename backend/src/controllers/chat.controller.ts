import { Request, Response, NextFunction } from 'express';
import { chatService, ChatMode, processMessageStream } from '../services/chat.service';
import logger from '../config/logger';

/**
 * Chat Controller - Secure Implementation
 *
 * Handles HTTP requests for chat functionality.
 * Authentication is enforced at the route level via auth middleware.
 */

interface AuthenticatedRequest extends Request {
  userId?: string;
}

/**
 * Start a new chat session or get existing one
 * POST /api/chat/sessions
 */
export async function createSession(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const sessionId = await chatService.getOrCreateSession(userId);

    res.status(201).json({
      sessionId,
      message: 'Session created successfully',
    });
  } catch (error) {
    logger.error('Failed to create chat session', {
      event: 'CHAT_SESSION_CREATE_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Get user's chat sessions
 * GET /api/chat/sessions
 */
export async function getSessions(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const limit = parseInt(req.query['limit'] as string) || 10;
    const sessions = await chatService.getUserSessions(userId, Math.min(limit, 50));

    res.json({ sessions });
  } catch (error) {
    logger.error('Failed to get chat sessions', {
      event: 'CHAT_SESSIONS_GET_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Get chat history for a session
 * GET /api/chat/sessions/:sessionId/messages
 */
export async function getMessages(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const sessionId = req.params['sessionId'];
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID is required', code: 'INVALID_SESSION_ID' });
      return;
    }

    const limit = parseInt(req.query['limit'] as string) || 50;
    const messages = await chatService.getChatHistory(userId, sessionId, Math.min(limit, 100));

    res.json({ messages });
  } catch (error) {
    logger.error('Failed to get chat messages', {
      event: 'CHAT_MESSAGES_GET_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Send a message and get response
 * POST /api/chat/sessions/:sessionId/messages
 *
 * Body: { message: string, chatMode?: 'assistant' | 'coach' }
 */
export async function sendMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const sessionId = req.params['sessionId'];
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID is required', code: 'INVALID_SESSION_ID' });
      return;
    }

    const { message, chatMode } = req.body as { message?: string; chatMode?: string };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: 'Message is required', code: 'INVALID_MESSAGE' });
      return;
    }

    // Validate chat mode
    const validModes: ChatMode[] = ['assistant', 'coach'];
    const mode: ChatMode = validModes.includes(chatMode as ChatMode)
      ? (chatMode as ChatMode)
      : 'assistant';

    // Process message through the secure pipeline
    const result = await chatService.processMessage(userId, sessionId, message.trim(), mode);

    res.json({
      response: result.response,
      wasRedacted: result.wasRedacted,
      sessionId,
    });
  } catch (error) {
    logger.error('Failed to process chat message', {
      event: 'CHAT_MESSAGE_PROCESS_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Quick chat endpoint (creates session automatically if needed)
 * POST /api/chat/message
 *
 * Body: { message: string, sessionId?: string, chatMode?: 'assistant' | 'coach' }
 */
export async function quickMessage(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const { message, sessionId: providedSessionId, chatMode } = req.body as {
      message?: string;
      sessionId?: string;
      chatMode?: string;
    };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: 'Message is required', code: 'INVALID_MESSAGE' });
      return;
    }

    // Get or create session
    const sessionId = providedSessionId || (await chatService.getOrCreateSession(userId));

    // Validate chat mode
    const validModes: ChatMode[] = ['assistant', 'coach'];
    const mode: ChatMode = validModes.includes(chatMode as ChatMode)
      ? (chatMode as ChatMode)
      : 'assistant';

    // Process message through the secure pipeline
    const result = await chatService.processMessage(userId, sessionId, message.trim(), mode);

    res.json({
      response: result.response,
      wasRedacted: result.wasRedacted,
      sessionId,
    });
  } catch (error) {
    logger.error('Failed to process quick chat message', {
      event: 'CHAT_QUICK_MESSAGE_ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
    next(error);
  }
}

/**
 * Send a message and stream response via SSE
 * POST /api/chat/sessions/:sessionId/messages/stream
 *
 * Body: { message: string, chatMode?: 'assistant' | 'coach' }
 *
 * Response: Server-Sent Events stream
 * - data: {"token": "..."} for each token
 * - data: {"done": true, "wasRedacted": false, "messageId": "..."} on completion
 * - data: {"error": "...", "code": "STREAM_ERROR"} on error
 */
export async function sendMessageStream(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.userId;

  // Track if client is still connected
  let isClientConnected = true;

  // Handle client disconnect
  req.on('close', () => {
    isClientConnected = false;
    logger.info('SSE client disconnected', {
      event: 'CHAT_STREAM_CLIENT_DISCONNECT',
      userId,
    });
  });

  try {
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' });
      return;
    }

    const sessionId = req.params['sessionId'];
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID is required', code: 'INVALID_SESSION_ID' });
      return;
    }

    const { message, chatMode } = req.body as { message?: string; chatMode?: string };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ error: 'Message is required', code: 'INVALID_MESSAGE' });
      return;
    }

    // Validate chat mode
    const validModes: ChatMode[] = ['assistant', 'coach'];
    const mode: ChatMode = validModes.includes(chatMode as ChatMode)
      ? (chatMode as ChatMode)
      : 'assistant';

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Flush headers immediately
    res.flushHeaders();

    logger.info('Starting SSE stream', {
      event: 'CHAT_STREAM_START',
      userId,
      sessionId,
    });

    // Process message with streaming
    const streamGenerator = processMessageStream(userId, sessionId, message.trim(), mode);

    let result;
    try {
      // Stream tokens to client
      while (true) {
        const { value, done } = await streamGenerator.next();

        if (done) {
          // Generator returned final result
          result = value;
          break;
        }

        // Check if client is still connected before writing
        if (!isClientConnected) {
          logger.info('Stopping stream - client disconnected', {
            event: 'CHAT_STREAM_ABORT',
            userId,
            sessionId,
          });
          return;
        }

        // Send token event
        const tokenEvent = JSON.stringify({ token: value });
        res.write(`data: ${tokenEvent}\n\n`);
      }

      // Send completion event with metadata
      if (result && isClientConnected) {
        const completionEvent = JSON.stringify({
          done: true,
          wasRedacted: result.wasRedacted,
          messageId: result.messageId,
        });
        res.write(`data: ${completionEvent}\n\n`);
      }

      logger.info('SSE stream completed', {
        event: 'CHAT_STREAM_COMPLETE',
        userId,
        sessionId,
        wasRedacted: result?.wasRedacted,
      });
    } catch (streamError) {
      // Send error event
      if (isClientConnected) {
        const errorEvent = JSON.stringify({
          error: streamError instanceof Error ? streamError.message : 'Stream error occurred',
          code: 'STREAM_ERROR',
        });
        res.write(`data: ${errorEvent}\n\n`);
      }

      logger.error('SSE stream error', {
        event: 'CHAT_STREAM_ERROR',
        userId,
        sessionId,
        error: streamError instanceof Error ? streamError.message : String(streamError),
      });
    }

    // Close the connection
    res.end();
  } catch (error) {
    // If headers not sent yet, send error response
    if (!res.headersSent) {
      logger.error('Failed to start chat stream', {
        event: 'CHAT_STREAM_INIT_ERROR',
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      next(error);
    } else {
      // Headers already sent, just log and close
      logger.error('Chat stream failed after headers sent', {
        event: 'CHAT_STREAM_LATE_ERROR',
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.end();
    }
  }
}

export const chatController = {
  createSession,
  getSessions,
  getMessages,
  sendMessage,
  sendMessageStream,
  quickMessage,
};
