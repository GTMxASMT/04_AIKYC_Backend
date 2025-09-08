// XSocket.manager.ts
import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { XWebRTCService } from "./Xwebrtc.service";
import { AppDataSource } from "../database/db";
import { User } from "../entities/User.entity";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: any;
  sessionId?: string;
}

interface WebRTCSignal {
  type: "offer" | "answer" | "ice-candidate";
  data: any;
  targetUserId?: string;
}

export class XSocketManager {
  private io: SocketIOServer;
  private webrtcService: XWebRTCService;
  private connectedUsers: Map<string, AuthenticatedSocket> = new Map();
  private sessionRooms: Map<string, Set<string>> = new Map();

  constructor(server: HTTPServer) {
    this.webrtcService = new XWebRTCService();

    // Initialize Socket.IO with CORS configuration
    this.io = new SocketIOServer(server, {
      cors: {
        origin: (origin, callback) => {
          // Allow all origins in development
          if (config.server.nodeEnv === "development") {
            return callback(null, true);
          }

          // In production, use configured origins
          const allowedOrigins = process.env.CORS_ORIGINS
            ? process.env.CORS_ORIGINS.split(",")
            : ["http://localhost:3000"];

          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error("Not allowed by CORS"));
          }
        },
        credentials: true,
        methods: ["GET", "POST"],
      },
      allowEIO3: true,

      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ["websocket", "polling"],
    });

    this.setupSocketHandlers();

    console.log("✅ Socket.IO server initialized");
  }

  private setupSocketHandlers(): void {
    this.io.on("connection", (socket: AuthenticatedSocket) => {
      console.log(`🔌 New socket connection: ${socket.id}`);

      // Send immediate acknowledgment
      socket.emit("connected", { socketId: socket.id });

      // Handle authentication
      socket.on("authenticate", async (data: { token: string }) => {
        await this.handleAuthentication(socket, data);
      });

      // Handle joining session
      socket.on(
        "join-session",
        async (data: { sessionId: string; user: any }) => {
          await this.handleJoinSession(socket, data);
        }
      );

      // Handle leaving session
      socket.on("leave-session", async (data: { sessionId: string }) => {
        await this.handleLeaveSession(socket, data);
      });

      // Handle WebRTC signaling
      socket.on("webrtc-signal", (data: WebRTCSignal) => {
        this.handleWebRTCSignal(socket, data);
      });

      // Handle verification completion (agent only)
      socket.on("verification-completed", async (data: any) => {
        await this.handleVerificationCompleted(socket, data);
      });

      // Handle recording status
      socket.on(
        "recording-status",
        (data: { isRecording: boolean; sessionId: string }) => {
          this.handleRecordingStatus(socket, data);
        }
      );

      // Handle ping for connection health
      socket.on("ping", () => {
        socket.emit("pong", { timestamp: new Date().toISOString() });
      });

      // socket.on("user:message", ({ message, to }) => {
      //   console.log("msg", message, to, "Socket ID:", socket.id);
      //   socket.to(to).emit("user:message", { message });
      // });

      // socket.on("agent:message", ({ message, to }) => {
      //   console.log("msg", message, to, "Socket ID:", socket.id);
      //   socket.to(to).emit("agent:message", { message });
      // });

      // Handle disconnection
      socket.on("disconnect", () => {
        this.handleDisconnect(socket);
      });

      // Handle errors
      socket.on("error", (error) => {
        console.error(`Socket error for ${socket.id}:`, error);
      });
    });
  }

  private async handleAuthentication(
    socket: AuthenticatedSocket,
    data: { token: string }
  ): Promise<void> {
    try {
      if (!data.token) {
        socket.emit("auth-error", { message: "No token provided" });
        return;
      }

      // Verify JWT token
      const decoded = jwt.verify(data.token, config.jwt.accessSecret) as any;

      // Get user from database
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({
        where: { id: decoded.id, isActive: true },
        select: ["id", "name", "email", "role"],
      });

      if (!user) {
        socket.emit("auth-error", {
          message: "Invalid token or user not found",
        });
        return;
      }

      // Store user info in socket
      socket.userId = user.id;
      socket.user = user;

      // Store socket in connected users map
      this.connectedUsers.set(user.id, socket);

      console.log(`✅ User authenticated: ${user.email} (${user.role})`);

      socket.emit("authenticated", {
        user: {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });

      // Notify about server connection status
      socket.emit("onServerConnected", true);
    } catch (error) {
      console.error("Authentication error:", error);
      socket.emit("auth-error", {
        message:
          error instanceof Error ? error.message : "Authentication failed",
      });
    }
  }

  private async handleJoinSession(
    socket: AuthenticatedSocket,
    data: { sessionId: string; user: any }
  ): Promise<void> {
    try {
      const { sessionId, user } = data;

      if (!sessionId) {
        socket.emit("error", { message: "Session ID required" });
        return;
      }

      // Use provided user data or socket's authenticated user
      const userInfo = user || socket.user;

      if (!userInfo) {
        socket.emit("error", { message: "User information required" });
        return;
      }

      // Join the socket room
      socket.join(sessionId);
      socket.sessionId = sessionId;

      // Add to session room tracking
      if (!this.sessionRooms.has(sessionId)) {
        this.sessionRooms.set(sessionId, new Set());
      }
      this.sessionRooms.get(sessionId)!.add(socket.id);

      // Join session in service
      const result = await this.webrtcService.joinSession(sessionId, {
        userId: userInfo.userId || userInfo.id,
        name: userInfo.name,
        email: userInfo.email,
        role: userInfo.role,
      });

      console.log(`User ${userInfo.name} joined session ${sessionId}`);

      // Notify the user who joined
      socket.emit("session-joined", {
        sessionId,
        participants: result.session.participants,
      });

      // Notify others in the room
      socket.to(sessionId).emit("user-joined", {
        userId: userInfo.userId || userInfo.id,
        name: userInfo.name,
        email: userInfo.email,
        role: userInfo.role,
      });

      // Emit onUserJoined event for frontend compatibility
      socket.to(sessionId).emit("onUserJoined", {
        userId: userInfo.userId || userInfo.id,
        name: userInfo.name,
        email: userInfo.email,
        role: userInfo.role,
      });
    } catch (error) {
      console.error("Join session error:", error);
      socket.emit("error", {
        message:
          error instanceof Error ? error.message : "Failed to join session",
      });
    }
  }

  private async handleLeaveSession(
    socket: AuthenticatedSocket,
    data: { sessionId: string }
  ): Promise<void> {
    try {
      const { sessionId } = data;

      if (!sessionId || !socket.userId) {
        return;
      }

      // Leave the socket room
      socket.leave(sessionId);

      // Remove from session room tracking
      const roomSockets = this.sessionRooms.get(sessionId);
      if (roomSockets) {
        roomSockets.delete(socket.id);
        if (roomSockets.size === 0) {
          this.sessionRooms.delete(sessionId);
        }
      }

      // Leave session in service
      await this.webrtcService.leaveSession(sessionId, socket.userId);

      // Notify others in the room
      socket.to(sessionId).emit("user-left", socket.userId);
      socket.to(sessionId).emit("onUserLeft", socket.userId);

      console.log(`User ${socket.userId} left session ${sessionId}`);
    } catch (error) {
      console.error("Leave session error:", error);
    }
  }

  private handleWebRTCSignal(
    socket: AuthenticatedSocket,
    signal: WebRTCSignal
  ): void {
    try {
      const sessionId = socket.sessionId;

      if (!sessionId) {
        socket.emit("error", { message: "Not in a session" });
        return;
      }

      // Forward signal to target user or broadcast to room
      if (signal.targetUserId) {
        const targetSocket = this.connectedUsers.get(signal.targetUserId);
        if (targetSocket) {
          targetSocket.emit("webrtc-signal", {
            ...signal,
            fromUserId: socket.userId,
          });
        }
      } else {
        // Broadcast to all others in the session
        socket.to(sessionId).emit("webrtc-signal", {
          ...signal,
          fromUserId: socket.userId,
        });
      }
    } catch (error) {
      console.error("WebRTC signal error:", error);
      socket.emit("error", { message: "Failed to send WebRTC signal" });
    }
  }

  private async handleVerificationCompleted(
    socket: AuthenticatedSocket,
    data: any
  ): Promise<void> {
    try {
      const { sessionId, checklist, status, notes } = data;

      if (!sessionId || !socket.userId) {
        socket.emit("error", {
          message: "Session ID and authentication required",
        });
        return;
      }

      // Submit verification through service
      const result = await this.webrtcService.submitVerification(
        sessionId,
        socket.userId,
        { checklist, status, notes }
      );

      // Notify all participants in the session
      this.io.to(sessionId).emit("verification-completed", result);
      this.io.to(sessionId).emit("onVerificationCompleted", { checklist });

      console.log(`Verification completed for session ${sessionId}`);
    } catch (error) {
      console.error("Verification error:", error);
      socket.emit("error", {
        message:
          error instanceof Error
            ? error.message
            : "Failed to submit verification",
      });
    }
  }

  private handleRecordingStatus(
    socket: AuthenticatedSocket,
    data: { isRecording: boolean; sessionId: string }
  ): void {
    try {
      const { sessionId, isRecording } = data;

      if (!sessionId) {
        socket.emit("error", { message: "Session ID required" });
        return;
      }

      // Broadcast recording status to all participants in the session
      this.io.to(sessionId).emit("recording-status-changed", {
        isRecording,
        userId: socket.userId,
      });

      console.log(
        `Recording status changed for session ${sessionId}: ${isRecording}`
      );
    } catch (error) {
      console.error("Recording status error:", error);
      socket.emit("error", { message: "Failed to update recording status" });
    }
  }

  private handleDisconnect(socket: AuthenticatedSocket): void {
    console.log(`🔌 Socket disconnected: ${socket.id}`);

    // Remove from connected users
    if (socket.userId) {
      this.connectedUsers.delete(socket.userId);

      // Leave any sessions
      if (socket.sessionId) {
        this.handleLeaveSession(socket, { sessionId: socket.sessionId }).catch(
          console.error
        );
      }
    }

    // Clean up session rooms
    for (const [sessionId, sockets] of this.sessionRooms.entries()) {
      if (sockets.has(socket.id)) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          this.sessionRooms.delete(sessionId);
        }

        // Notify others in the session
        if (socket.userId) {
          socket.to(sessionId).emit("user-left", socket.userId);
          socket.to(sessionId).emit("onUserLeft", socket.userId);
        }
      }
    }
  }

  public getActiveConnections(): number {
    return this.connectedUsers.size;
  }

  public getServerHealth(): any {
    return {
      connected: true,
      activeConnections: this.connectedUsers.size,
      activeSessions: this.sessionRooms.size,
      timestamp: new Date().toISOString(),
    };
  }

  public async gracefulShutdown(): Promise<void> {
    console.log("Shutting down Socket.IO server...");

    // Notify all connected clients
    this.io.emit("server-shutdown", { message: "Server is shutting down" });

    // Close all connections
    this.io.close();

    // Clear maps
    this.connectedUsers.clear();
    this.sessionRooms.clear();

    console.log("Socket.IO server shut down complete");
  }
}
