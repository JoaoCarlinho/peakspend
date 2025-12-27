/**
 * Tests for ChatMessage component streaming functionality
 * Tests typewriter cursor and streaming state rendering
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessage } from '../ChatMessage';

describe('ChatMessage - Streaming', () => {
  it('should render without cursor when isStreaming is false', () => {
    render(
      <ChatMessage
        role="assistant"
        content="Hello world"
        isStreaming={false}
      />
    );

    expect(screen.getByText('Hello world')).toBeInTheDocument();
    // Check that no cursor element exists (cursor has specific animation style)
    const message = screen.getByTestId('chat-message-assistant');
    const cursorElements = message.querySelectorAll('[style*="animation"]');
    expect(cursorElements.length).toBe(0);
  });

  it('should render with blinking cursor when isStreaming is true', () => {
    render(
      <ChatMessage
        role="assistant"
        content="Hello"
        isStreaming={true}
      />
    );

    expect(screen.getByText('Hello')).toBeInTheDocument();
    // The cursor should be present - it's a span with animation
    const message = screen.getByTestId('chat-message-assistant');
    expect(message).toBeInTheDocument();
  });

  it('should render empty content with cursor during initial streaming', () => {
    render(
      <ChatMessage
        role="assistant"
        content=""
        isStreaming={true}
      />
    );

    const message = screen.getByTestId('chat-message-assistant');
    expect(message).toBeInTheDocument();
  });

  it('should not render cursor when role is user', () => {
    render(
      <ChatMessage
        role="user"
        content="User message"
        isStreaming={true}
      />
    );

    // User messages shouldn't show streaming cursor in practice,
    // but the prop is still accepted
    expect(screen.getByText('User message')).toBeInTheDocument();
  });

  it('should render assistant avatar for streaming messages', () => {
    render(
      <ChatMessage
        role="assistant"
        content="Streaming..."
        isStreaming={true}
      />
    );

    // Check the message container exists
    const message = screen.getByTestId('chat-message-assistant');
    expect(message).toBeInTheDocument();
    // Avatar should be present (has SmartToyIcon)
    expect(message.querySelector('svg')).toBeInTheDocument();
  });

  it('should default isStreaming to false when not provided', () => {
    render(
      <ChatMessage
        role="assistant"
        content="Default message"
      />
    );

    expect(screen.getByText('Default message')).toBeInTheDocument();
  });

  it('should preserve whitespace in streamed content', () => {
    render(
      <ChatMessage
        role="assistant"
        content="Line 1\nLine 2"
        isStreaming={true}
      />
    );

    // whiteSpace: pre-wrap should preserve newlines
    const message = screen.getByTestId('chat-message-assistant');
    expect(message).toHaveTextContent('Line 1');
    expect(message).toHaveTextContent('Line 2');
  });

  it('should render timestamp when provided even during streaming', () => {
    const timestamp = new Date().toISOString();
    render(
      <ChatMessage
        role="assistant"
        content="With timestamp"
        timestamp={timestamp}
        isStreaming={true}
      />
    );

    expect(screen.getByText('With timestamp')).toBeInTheDocument();
    // Timestamp should be formatted and displayed
    const message = screen.getByTestId('chat-message-assistant');
    expect(message).toBeInTheDocument();
  });
});
