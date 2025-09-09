// server.ts - Updated with WebRTC support
import "reflect-metadata";
import { AppDataSource } from "./database/db";
import { config } from "./config";
import { server, socketManager } from "./app";

const startServer = async () => {
  try {
    console.log("Starting WebRTC KYC Server...");

    // Initialize database connection
    console.log("Connecting to database...");
    await AppDataSource.initialize();
    console.log("Database connected successfully");

    // Start HTTP server (includes Socket.IO for WebRTC)
    const PORT = config.server.port;
    const HOST = config.server.host;

    server.listen(PORT, HOST, () => {
  
      console.log(`Server run on: http://${HOST}:${PORT}`);
      console.log(`Environment: ${config.server.nodeEnv}`);

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
        const webrtcService = require("./services/XWebrtc.service").XWebRTCService;
        const service = new webrtcService();
        await service.cleanupInactiveSessions();
      } catch (error) {
        console.error("Session cleanup error:", error);
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  } catch (error: any) {
    console.error("Failed to start server:", error);

    if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      console.error("Database connection failed. Check your database configuration:");
      console.error(`- Host: ${config.database.host}:${config.database.port}`);
      console.error(`- Database: ${config.database.database}`);
      console.error(`- Username: ${config.database.username}`);
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
