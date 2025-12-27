/**
 * Tests for useStreamingChat hook
 * Tests streaming functionality with mocked fetch
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStreamingChat } from '../useStreamingChat';

// Store original fetch
const originalFetch = global.fetch;

// Mock localStorage
const mockGetItem = vi.fn();
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: mockGetItem,
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    length: 0,
    key: vi.fn(),
  },
  writable: true,
});

describe('useStreamingChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetItem.mockReturnValue('test-auth-token');
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.fetch = originalFetch;
  });

  it('should initialize with isStreaming false', () => {
    const { result } = renderHook(() => useStreamingChat());

    expect(result.current.isStreaming).toBe(false);
    expect(typeof result.current.streamMessage).toBe('function');
    expect(typeof result.current.cancelStream).toBe('function');
  });

  it('should include auth token in request headers', async () => {
    // Create a mock ReadableStream that completes immediately
    const mockReader = {
      read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
    };
    const mockResponse = {
      ok: true,
      body: { getReader: () => mockReader },
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    global.fetch = mockFetch;

    const { result } = renderHook(() => useStreamingChat());
    const callbacks = {
      onToken: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };

    await act(async () => {
      result.current.streamMessage('session-123', 'Hello', 'assistant', callbacks);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('api/chat/sessions/session-123/messages/stream');
    expect(options.headers.Authorization).toBe('Bearer test-auth-token');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      message: 'Hello',
      chatMode: 'assistant',
    });
  });

  it('should call onToken callback for each token', async () => {
    // Create mock stream data
    const encoder = new TextEncoder();
    const tokens = ['Hello', ' ', 'world'];
    let readIndex = 0;

    const mockReader = {
      read: vi.fn().mockImplementation(async () => {
        if (readIndex < tokens.length) {
          const token = tokens[readIndex++];
          const data = `data: ${JSON.stringify({ token })}\n\n`;
          return { done: false, value: encoder.encode(data) };
        }
        return { done: true, value: undefined };
      }),
    };

    const mockResponse = {
      ok: true,
      body: { getReader: () => mockReader },
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    global.fetch = mockFetch;

    const { result } = renderHook(() => useStreamingChat());
    const callbacks = {
      onToken: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };

    await act(async () => {
      result.current.streamMessage('session-123', 'Hello', 'assistant', callbacks);
    });

    await waitFor(() => {
      expect(callbacks.onToken).toHaveBeenCalledTimes(3);
    });

    expect(callbacks.onToken).toHaveBeenNthCalledWith(1, 'Hello');
    expect(callbacks.onToken).toHaveBeenNthCalledWith(2, ' ');
    expect(callbacks.onToken).toHaveBeenNthCalledWith(3, 'world');
  });

  it('should call onComplete when done event is received', async () => {
    const encoder = new TextEncoder();
    const doneEvent = {
      done: true,
      wasRedacted: false,
      messageId: 'msg-123',
      fullResponse: 'Hello world',
    };
    let hasRead = false;

    const mockReader = {
      read: vi.fn().mockImplementation(async () => {
        if (!hasRead) {
          hasRead = true;
          const data = `data: ${JSON.stringify(doneEvent)}\n\n`;
          return { done: false, value: encoder.encode(data) };
        }
        return { done: true, value: undefined };
      }),
    };

    const mockResponse = {
      ok: true,
      body: { getReader: () => mockReader },
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    global.fetch = mockFetch;

    const { result } = renderHook(() => useStreamingChat());
    const callbacks = {
      onToken: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };

    await act(async () => {
      result.current.streamMessage('session-123', 'Hello', 'assistant', callbacks);
    });

    await waitFor(() => {
      expect(callbacks.onComplete).toHaveBeenCalled();
    });

    expect(callbacks.onComplete).toHaveBeenCalledWith({
      wasRedacted: false,
      messageId: 'msg-123',
      fullResponse: 'Hello world',
    });
  });

  it('should call onError when error event is received', async () => {
    const encoder = new TextEncoder();
    let hasRead = false;

    const mockReader = {
      read: vi.fn().mockImplementation(async () => {
        if (!hasRead) {
          hasRead = true;
          const data = `data: ${JSON.stringify({ error: 'Stream failed' })}\n\n`;
          return { done: false, value: encoder.encode(data) };
        }
        return { done: true, value: undefined };
      }),
    };

    const mockResponse = {
      ok: true,
      body: { getReader: () => mockReader },
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    global.fetch = mockFetch;

    const { result } = renderHook(() => useStreamingChat());
    const callbacks = {
      onToken: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };

    await act(async () => {
      result.current.streamMessage('session-123', 'Hello', 'assistant', callbacks);
    });

    await waitFor(() => {
      expect(callbacks.onError).toHaveBeenCalled();
    });

    expect(callbacks.onError.mock.calls[0][0].message).toBe('Stream failed');
  });

  it('should call onError when HTTP response is not ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    });
    global.fetch = mockFetch;

    const { result } = renderHook(() => useStreamingChat());
    const callbacks = {
      onToken: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };

    await act(async () => {
      result.current.streamMessage('session-123', 'Hello', 'assistant', callbacks);
    });

    await waitFor(() => {
      expect(callbacks.onError).toHaveBeenCalled();
    });

    expect(callbacks.onError.mock.calls[0][0].message).toBe('Server error');
  });

  it('should cancel stream when cancelStream is called', async () => {
    const abortError = new Error('AbortError');
    abortError.name = 'AbortError';

    const mockFetch = vi.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        setTimeout(() => reject(abortError), 100);
      });
    });
    global.fetch = mockFetch;

    const { result } = renderHook(() => useStreamingChat());
    const callbacks = {
      onToken: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };

    act(() => {
      result.current.streamMessage('session-123', 'Hello', 'assistant', callbacks);
    });

    act(() => {
      result.current.cancelStream();
    });

    // AbortError should not call onError
    await waitFor(() => {
      expect(callbacks.onError).not.toHaveBeenCalled();
    });
  });

  it('should use coach mode when specified', async () => {
    const mockReader = {
      read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
    };
    const mockResponse = {
      ok: true,
      body: { getReader: () => mockReader },
    };
    const mockFetch = vi.fn().mockResolvedValue(mockResponse);
    global.fetch = mockFetch;

    const { result } = renderHook(() => useStreamingChat());
    const callbacks = {
      onToken: vi.fn(),
      onComplete: vi.fn(),
      onError: vi.fn(),
    };

    await act(async () => {
      result.current.streamMessage('session-123', 'Help with budget', 'coach', callbacks);
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const [, options] = mockFetch.mock.calls[0];
    expect(JSON.parse(options.body).chatMode).toBe('coach');
  });
});
