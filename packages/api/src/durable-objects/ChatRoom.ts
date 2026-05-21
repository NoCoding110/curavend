/**
 * Durable Object for real-time chat via WebSocket.
 *
 * Each chat room (tied to an order) gets its own Durable Object instance.
 * Messages are persisted to D1 via the main API; this DO only handles
 * real-time broadcasting to connected clients.
 */

interface SessionInfo {
  userId: string;
  userName?: string;
}

export class ChatRoom implements DurableObject {
  private sessions: Map<WebSocket, SessionInfo> = new Map();
  private state: DurableObjectState;
  private env: any;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;

    // Restore any hibernated WebSocket sessions
    this.state.getWebSockets().forEach((ws) => {
      const meta = ws.deserializeAttachment() as SessionInfo | null;
      if (meta) {
        this.sessions.set(ws, meta);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(url);
    }

    // HTTP endpoints for the DO

    // GET /connections - list connected users
    if (request.method === 'GET' && url.pathname === '/connections') {
      const connectedUsers = Array.from(this.sessions.values()).map((s) => ({
        userId: s.userId,
        userName: s.userName,
      }));
      return Response.json({ connections: connectedUsers });
    }

    // POST /broadcast - send a message from the server side (e.g., system messages)
    if (request.method === 'POST' && url.pathname === '/broadcast') {
      try {
        const body = await request.json() as Record<string, unknown>;
        this.broadcast(
          JSON.stringify({
            type: 'system',
            ...body,
            timestamp: new Date().toISOString(),
          }),
        );
        return Response.json({ ok: true });
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
    }

    return new Response('Expected WebSocket or valid endpoint', { status: 400 });
  }

  private handleWebSocketUpgrade(url: URL): Response {
    const userId = url.searchParams.get('userId');
    if (!userId) {
      return new Response('Missing userId query parameter', { status: 400 });
    }

    const userName = url.searchParams.get('userName') ?? undefined;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const sessionInfo: SessionInfo = { userId, userName };

    // Accept using Hibernation API for efficient idle handling
    this.state.acceptWebSocket(server);
    server.serializeAttachment(sessionInfo);
    this.sessions.set(server, sessionInfo);

    // Notify others that a user joined
    this.broadcast(
      JSON.stringify({
        type: 'user_joined',
        userId,
        userName,
        timestamp: new Date().toISOString(),
        connectedCount: this.sessions.size,
      }),
      server,
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Called by the runtime when a WebSocket receives a message (Hibernation API).
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const session = this.sessions.get(ws);
    if (!session) return;

    try {
      const data = JSON.parse(
        typeof message === 'string' ? message : new TextDecoder().decode(message),
      ) as Record<string, unknown>;

      switch (data.type) {
        case 'message':
          // Broadcast chat message to all connected clients
          this.broadcast(
            JSON.stringify({
              type: 'message',
              messageId: data.messageId,
              content: data.content,
              senderId: session.userId,
              senderName: session.userName,
              attachments: data.attachments,
              timestamp: new Date().toISOString(),
            }),
          );
          break;

        case 'typing':
          // Broadcast typing indicator to everyone except the sender
          this.broadcast(
            JSON.stringify({
              type: 'typing',
              userId: session.userId,
              userName: session.userName,
              isTyping: data.isTyping ?? true,
            }),
            ws,
          );
          break;

        case 'read_receipt':
          // Notify that a user has read up to a certain message
          this.broadcast(
            JSON.stringify({
              type: 'read_receipt',
              userId: session.userId,
              lastReadMessageId: data.lastReadMessageId,
              timestamp: new Date().toISOString(),
            }),
            ws,
          );
          break;

        case 'ping':
          // Respond with pong to keep connection alive
          try {
            ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          } catch {
            // Socket already closed
          }
          break;

        default:
          // Unknown message type; ignore
          break;
      }
    } catch {
      // Ignore malformed messages
    }
  }

  /**
   * Called by the runtime when a WebSocket is closed (Hibernation API).
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.removeSession(ws);
  }

  /**
   * Called by the runtime when a WebSocket encounters an error (Hibernation API).
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    this.removeSession(ws);
  }

  private removeSession(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (session) {
      this.sessions.delete(ws);
      this.broadcast(
        JSON.stringify({
          type: 'user_left',
          userId: session.userId,
          userName: session.userName,
          timestamp: new Date().toISOString(),
          connectedCount: this.sessions.size,
        }),
      );
    }
  }

  /**
   * Send a message to all connected WebSockets, optionally excluding one.
   */
  private broadcast(message: string, exclude?: WebSocket): void {
    for (const [ws] of this.sessions) {
      if (ws === exclude) continue;
      try {
        ws.send(message);
      } catch {
        // Connection is dead; clean up on next close event
        this.sessions.delete(ws);
      }
    }
  }
}
