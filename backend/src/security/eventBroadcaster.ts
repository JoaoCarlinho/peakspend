/**
 * EventBroadcasterService - Server-Sent Events (SSE) broadcaster for security events
 *
 * Provides real-time push notifications for security events to connected clients.
 * Supports filtering by event type and severity.
 */

import { Response } from 'express';
import logger from '../config/logger';

/**
 * Security event data structure for broadcasting
 */
export interface BroadcastSecurityEvent {
  id: string;
  timestamp: string | Date;
  eventType: string;
  severity: string;
  userId: string | null;
  sessionId: string | null;
  requestId: string | null;
  details: unknown;
  status: string;
}

/**
 * SSE client connection with optional filters
 */
interface SSEClient {
  id: string;
  res: Response;
  filters?: {
    eventTypes?: string[];
    severities?: string[];
  };
  connectedAt: Date;
}

/**
 * EventBroadcasterService class
 * Manages SSE connections and broadcasts security events
 */
export class EventBroadcasterService {
  private static instance: EventBroadcasterService;
  private clients: Map<string, SSEClient> = new Map();

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): EventBroadcasterService {
    if (!EventBroadcasterService.instance) {
      EventBroadcasterService.instance = new EventBroadcasterService();
    }
    return EventBroadcasterService.instance;
  }

  /**
   * Reset instance for testing
   */
  public static resetInstance(): void {
    EventBroadcasterService.instance = undefined as unknown as EventBroadcasterService;
  }

  /**
   * Register a new SSE client
   * @param id - Unique client ID
   * @param res - Express response object
   * @param filters - Optional event filters
   */
  addClient(id: string, res: Response, filters?: SSEClient['filters']): void {
    this.clients.set(id, {
      id,
      res,
      filters,
      connectedAt: new Date(),
    });

    // Send initial connection message
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId: id, connectedAt: new Date().toISOString() })}\n\n`);

    logger.info('SSE client connected', {
      event: 'SSE_CLIENT_CONNECTED',
      clientId: id,
      totalClients: this.clients.size,
      filters,
    });
  }

  /**
   * Remove a client on disconnect
   * @param id - Client ID to remove
   */
  removeClient(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      this.clients.delete(id);
      logger.info('SSE client disconnected', {
        event: 'SSE_CLIENT_DISCONNECTED',
        clientId: id,
        totalClients: this.clients.size,
        sessionDuration: Date.now() - client.connectedAt.getTime(),
      });
    }
  }

  /**
   * Broadcast a security event to all connected clients
   * @param event - Security event to broadcast
   */
  broadcast(event: BroadcastSecurityEvent): void {
    const eventData = this.formatEvent(event);
    const message = `event: security-event\ndata: ${JSON.stringify(eventData)}\n\n`;

    let sentCount = 0;
    const clientsToRemove: string[] = [];

    for (const client of this.clients.values()) {
      // Apply filters if set
      if (client.filters) {
        if (
          client.filters.eventTypes &&
          client.filters.eventTypes.length > 0 &&
          !client.filters.eventTypes.includes(event.eventType)
        ) {
          continue;
        }
        if (
          client.filters.severities &&
          client.filters.severities.length > 0 &&
          !client.filters.severities.includes(event.severity)
        ) {
          continue;
        }
      }

      try {
        client.res.write(message);
        sentCount++;
      } catch {
        // Client disconnected, mark for removal
        clientsToRemove.push(client.id);
      }
    }

    // Remove disconnected clients
    for (const id of clientsToRemove) {
      this.removeClient(id);
    }

    if (sentCount > 0) {
      logger.debug('Security event broadcast', {
        event: 'SSE_EVENT_BROADCAST',
        eventType: event.eventType,
        severity: event.severity,
        sentToClients: sentCount,
      });
    }
  }

  /**
   * Format event for SSE transmission
   */
  private formatEvent(event: BroadcastSecurityEvent): object {
    return {
      id: event.id,
      timestamp:
        event.timestamp instanceof Date
          ? event.timestamp.toISOString()
          : event.timestamp,
      eventType: event.eventType,
      severity: event.severity,
      userId: event.userId,
      sessionId: event.sessionId,
      requestId: event.requestId,
      details: event.details,
      status: event.status,
    };
  }

  /**
   * Get count of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get list of connected client IDs
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Send heartbeat to all clients to keep connections alive
   */
  sendHeartbeat(): void {
    const clientsToRemove: string[] = [];

    for (const client of this.clients.values()) {
      try {
        client.res.write(': heartbeat\n\n');
      } catch {
        clientsToRemove.push(client.id);
      }
    }

    for (const id of clientsToRemove) {
      this.removeClient(id);
    }
  }
}

// Export singleton instance
export const eventBroadcaster = EventBroadcasterService.getInstance();
