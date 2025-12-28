/**
 * Unit tests for BedrockService - Streaming functionality
 * Story: streaming-chat-1
 */

import { BedrockService } from '../../../src/services/bedrock.service';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-bedrock-runtime');

// Mock logger
jest.mock('../../../src/config/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('BedrockService', () => {
  let bedrockService: BedrockService;
  let mockClient: jest.Mocked<BedrockRuntimeClient>;

  beforeEach(() => {
    // Reset environment
    process.env['LLM_PROVIDER'] = 'bedrock';
    process.env['AWS_REGION'] = 'us-east-1';
    process.env['BEDROCK_MODEL_ID'] = 'anthropic.claude-3-haiku-20240307-v1:0';

    // Clear mocks
    jest.clearAllMocks();

    // Create mock client
    mockClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<BedrockRuntimeClient>;

    // Mock BedrockRuntimeClient constructor
    (BedrockRuntimeClient as jest.Mock).mockImplementation(() => mockClient);

    // Create service instance
    bedrockService = new BedrockService();
  });

  afterEach(() => {
    delete process.env['LLM_PROVIDER'];
    delete process.env['AWS_REGION'];
    delete process.env['BEDROCK_MODEL_ID'];
  });

  describe('chatStream', () => {
    it('should yield tokens from Bedrock streaming response', async () => {
      // Create mock streaming response
      const mockStreamEvents = [
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'message_start' })) } },
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'content_block_start', index: 0 })) } },
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } })) } },
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } })) } },
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: '!' } })) } },
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'content_block_stop', index: 0 })) } },
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'message_stop' })) } },
      ];

      // Create async iterator from mock events
      async function* mockAsyncIterator() {
        for (const event of mockStreamEvents) {
          yield event;
        }
      }

      mockClient.send.mockResolvedValue({
        body: mockAsyncIterator(),
      });

      const messages = [
        { role: 'user' as const, content: 'Say hello' },
      ];

      const tokens: string[] = [];
      for await (const token of bedrockService.chatStream(messages)) {
        tokens.push(token);
      }

      expect(tokens).toEqual(['Hello', ' world', '!']);
      expect(mockClient.send).toHaveBeenCalledTimes(1);
    });

    it('should handle system message separately', async () => {
      const mockStreamEvents = [
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Response' } })) } },
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'message_stop' })) } },
      ];

      async function* mockAsyncIterator() {
        for (const event of mockStreamEvents) {
          yield event;
        }
      }

      mockClient.send.mockResolvedValue({
        body: mockAsyncIterator(),
      });

      const messages = [
        { role: 'system' as const, content: 'You are a helpful assistant' },
        { role: 'user' as const, content: 'Hello' },
      ];

      const tokens: string[] = [];
      for await (const token of bedrockService.chatStream(messages)) {
        tokens.push(token);
      }

      expect(tokens).toEqual(['Response']);

      // Verify the request body structure
      const sendCall = mockClient.send.mock.calls[0];
      expect(sendCall).toBeDefined();
    });

    it('should throw error when client is not initialized', async () => {
      // Create service with disabled LLM provider
      process.env['LLM_PROVIDER'] = 'ollama';
      const disabledService = new BedrockService();

      const messages = [{ role: 'user' as const, content: 'Hello' }];

      await expect(async () => {
        const generator = disabledService.chatStream(messages);
        await generator.next();
      }).rejects.toThrow('Bedrock client not initialized');
    });

    it('should throw error when response body is missing', async () => {
      mockClient.send.mockResolvedValue({
        body: null,
      });

      const messages = [{ role: 'user' as const, content: 'Hello' }];

      await expect(async () => {
        const generator = bedrockService.chatStream(messages);
        await generator.next();
      }).rejects.toThrow('No response body received from Bedrock stream');
    });

    it('should handle streaming errors gracefully', async () => {
      const streamError = new Error('Stream connection lost');

      async function* mockFailingIterator() {
        yield { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Start' } })) } };
        throw streamError;
      }

      mockClient.send.mockResolvedValue({
        body: mockFailingIterator(),
      });

      const messages = [{ role: 'user' as const, content: 'Hello' }];

      const tokens: string[] = [];
      await expect(async () => {
        for await (const token of bedrockService.chatStream(messages)) {
          tokens.push(token);
        }
      }).rejects.toThrow('Stream connection lost');

      // Should have received the first token before error
      expect(tokens).toEqual(['Start']);
    });

    it('should ignore non-text delta events', async () => {
      const mockStreamEvents = [
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'message_start' })) } },
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'content_block_start' })) } },
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } })) } },
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'message_delta' })) } }, // Should be ignored
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'content_block_stop' })) } },
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'message_stop' })) } },
      ];

      async function* mockAsyncIterator() {
        for (const event of mockStreamEvents) {
          yield event;
        }
      }

      mockClient.send.mockResolvedValue({
        body: mockAsyncIterator(),
      });

      const messages = [{ role: 'user' as const, content: 'Test' }];

      const tokens: string[] = [];
      for await (const token of bedrockService.chatStream(messages)) {
        tokens.push(token);
      }

      expect(tokens).toEqual(['Hello']);
    });

    it('should handle empty text tokens', async () => {
      const mockStreamEvents = [
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } })) } },
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: '' } })) } }, // Empty - should be ignored
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: ' there' } })) } },
        { chunk: { bytes: new TextEncoder().encode(JSON.stringify({ type: 'message_stop' })) } },
      ];

      async function* mockAsyncIterator() {
        for (const event of mockStreamEvents) {
          yield event;
        }
      }

      mockClient.send.mockResolvedValue({
        body: mockAsyncIterator(),
      });

      const messages = [{ role: 'user' as const, content: 'Test' }];

      const tokens: string[] = [];
      for await (const token of bedrockService.chatStream(messages)) {
        tokens.push(token);
      }

      expect(tokens).toEqual(['Hi', ' there']);
    });
  });

  describe('isAvailable', () => {
    it('should return true when bedrock is enabled', async () => {
      expect(await bedrockService.isAvailable()).toBe(true);
    });

    it('should return false when bedrock is disabled', async () => {
      process.env['LLM_PROVIDER'] = 'ollama';
      const disabledService = new BedrockService();
      expect(await disabledService.isAvailable()).toBe(false);
    });
  });
});
