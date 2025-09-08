// server.ts - Updated with WebRTC support
import "reflect-metadata";
import { AppDataSource } from "./database/db";
import { config } from "./config";
import { app, server, socketManager } from "./app";

const startServer = async () => {
  try {
    console.log("Starting WebRTC KYC Server...");

    // Initialize database connection
    console.log("Connecting to database...");
    await AppDataSource.initialize();
    console.log("✅ Database connected successfully");

    // Start HTTP server (includes Socket.IO for WebRTC)
    const PORT = config.server.port;
    const HOST = config.server.host;

    server.listen(PORT, HOST, () => {
      console.log("\n" + "=".repeat(60));
      // console.log(" WebRTC KYC Server is running!");
      // console.log("=".repeat(60));
      console.log(`Server: http://${HOST}:${PORT}`);
      console.log(`Environment: ${config.server.nodeEnv}`);
      // console.log(`🔌 Socket.IO: Enabled for WebRTC`);
      // console.log(`Database: Connected`);
      // console.log(`Health Check: http://${HOST}:${PORT}/health`);
      // console.log(` API Routes: http://${HOST}:${PORT}/api/v1`);
      // console.log(` WebRTC Info: http://${HOST}:${PORT}/api/webrtc`);
      console.log("=".repeat(60) + "\n");

      // console.log("📋 WebRTC API Endpoints:");
      // console.log("   POST /api/v1/auth/login - User authentication");
      // console.log("   POST /api/sessions - Frontend session compatibility");
      // console.log("   POST /api/v1/webrtc/sessions - Create WebRTC session");
      // console.log("   GET  /api/v1/webrtc/sessions/:id - Get session info");
      // console.log("   POST /api/v1/webrtc/sessions/:id/join - Join session");
      // console.log("   POST /api/v1/webrtc/sessions/:id/leave - Leave session");
      // console.log(
      //   "   POST /api/v1/webrtc/sessions/:id/verify - Submit verification"
      // );
      // console.log("   GET  /api/v1/webrtc/health - WebRTC health check");
      // console.log("   GET  /api/v1/webrtc/stats - WebRTC statistics");
      // console.log("");

      // console.log("🔗 Socket.IO Events for WebRTC:");
      // console.log("   Client -> Server:");
      // console.log("   - authenticate: Authenticate socket connection");
      // console.log("   - join-session: Join a WebRTC session");
      // console.log("   - leave-session: Leave a WebRTC session");
      // console.log("   - webrtc-signal: WebRTC signaling (offer/answer/ICE)");
      // console.log("   - verification-completed: Submit verification results");
      // console.log("   - recording-status: Update recording status");
      // console.log("   - ping: Connection health check");
      // console.log("");
      // console.log("   Server -> Client:");
      // console.log("   - connected: Initial connection acknowledgment");
      // console.log("   - authenticated: Authentication successful");
      // console.log("   - auth-error: Authentication failed");
      // console.log("   - session-joined: Successfully joined session");
      // console.log("   - user-joined/onUserJoined: User joined notification");
      // console.log("   - user-left/onUserLeft: User left notification");
      // console.log("   - webrtc-signal: WebRTC signaling relay");
      // console.log("   - verification-completed: Verification complete");
      // console.log("   - onVerificationCompleted: Verification notification");
      // console.log("   - onServerConnected: Server connection status");
      // console.log("   - recording-status-changed: Recording status update");
      // console.log("   - pong: Health check response");
      // console.log("");

      // console.log("Frontend Connection Instructions:");
      // console.log(`   1. Connect to Socket.IO: ws://${HOST}:${PORT}`);
      // console.log(
      //   `   2. Authenticate with token: socket.emit('authenticate', { token })`
      // );
      // console.log(
      //   `   3. Join session: socket.emit('join-session', { sessionId, user })`
      // );
      // console.log(
      //   `   4. Send WebRTC signals: socket.emit('webrtc-signal', signalData)`
      // );
      // console.log("");

      // if (config.server.nodeEnv === "development") {
      //   console.log("📝 Development Mode Notes:");
      //   console.log("   - CORS is set to allow all origins");
      //   console.log("   - Use ngrok for external access:");
      //   console.log("     ngrok http " + PORT);
      //   console.log("   - Frontend should use the ngrok URL for connections");
      //   console.log("");
      // }

      const socketHealth = socketManager.getServerHealth();
      // console.log("🔌 Socket.IO Status:");
      // console.log(`   Active Connections: ${socketHealth.activeConnections}`);
      // console.log(`   Active Sessions: ${socketHealth.activeSessions}`);
      // console.log("=".repeat(60) + "\n");
    });

    // Handle server errors
    server.on("error", (error: any) => {
      if (error.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use`);
        console.log("Try changing the PORT in your .env file");
      } else {
        console.error("Server error:", error);
      }
      process.exit(1);
    });

    // Periodic cleanup of inactive sessions
    setInterval(async () => {
      try {
        const webrtcService =
          require("./services/XWebrtc.service").XWebRTCService;
        const service = new webrtcService();
        await service.cleanupInactiveSessions();
      } catch (error) {
        console.error("Session cleanup error:", error);
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  } catch (error: any) {
    console.error("Failed to start server:", error);

    if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      console.error(
        " Database connection failed. Check your database configuration:"
      );
      console.error(
        `   - Host: ${config.database.host}:${config.database.port}`
      );
      console.error(`   - Database: ${config.database.database}`);
      console.error(`   - Username: ${config.database.username}`);
    }

    process.exit(1);
  }
};

process.on("SIGTERM", async () => {
  console.log("\nSIGTERM received, shutting down gracefully...");
  await socketManager.gracefulShutdown();
  await AppDataSource.destroy();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("\nSIGINT received, shutting down gracefully...");
  await socketManager.gracefulShutdown();
  await AppDataSource.destroy();
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start the server
startServer();
