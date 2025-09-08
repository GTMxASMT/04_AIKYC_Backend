// app.ts - Updated with Socket.IO and WebRTC integration
import "reflect-metadata";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { config } from "./config";
import routes from "./routes";
import { errorHandler } from "./middlewares/error.middleware";
import { XSocketManager } from "./services/socket.manager";

const app = express();
const server = createServer(app);

// Initialize Socket.IO Manager for WebRTC
const socketManager = new XSocketManager(server);

// Enhanced CORS configuration for WebRTC support
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
  : ["http://localhost:3000", "http://127.0.0.1:5500"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) return callback(null, true);

      // In development, allow all origins (including ngrok)
      if (config.server.nodeEnv === "development") {
        return callback(null, true);
      }

      // In production, check against allowed origins
      if (
        config.server.nodeEnv === "production" &&
        corsOrigins.includes(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "ngrok-skip-browser-warning",
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Access-Control-Allow-Origin",
      "Access-Control-Allow-Credentials",
      "x-api-key",
      "Accept",
    ],
    exposedHeaders: ["Set-Cookie", "Content-Range", "X-Content-Range"],
    maxAge: 86400, // 24 hours
  })
);

// Security middleware with WebRTC considerations
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "ws:", "wss:", "https:", "http:"], // Allow WebSocket and HTTP connections
        mediaSrc: ["'self'", "blob:", "data:"], // Allow media streams for WebRTC
        scriptSrc: ["'self'", "'unsafe-inline'"], // Required for WebRTC
        imgSrc: ["'self'", "data:", "blob:", "https:"],
      },
    },
  })
);

// ngrok header handling (for development)
app.use((req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});

// Body parsing middleware with increased limits for media uploads
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Logging middleware
if (config.server.nodeEnv === "development") {
  app.use(morgan("combined"));
}

// Request logging middleware with enhanced info for WebRTC debugging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const userAgent = req.get("User-Agent") || "Unknown";
  const realIp = req.get("X-Real-IP") || req.get("X-Forwarded-For") || req.ip;

  console.log(
    `${timestamp} - ${req.method} ${req.url} - ${userAgent} - IP: ${realIp}`
  );
  next();
});

// Health check endpoint (before routes)
app.get("/health", (req, res) => {
  const socketHealth = socketManager.getServerHealth();
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "1.0.0",
    socket: socketHealth,
    webrtc: {
      enabled: true,
      status: "operational",
    },
  });
});

// API routes (including WebRTC routes)
app.use("/api/v1", routes);

// Sessions endpoint for frontend compatibility
app.post("/api/sessions", (req, res) => {
  // This endpoint is for frontend compatibility
  // The actual session creation happens through WebSocket
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      message: "Session ID is required",
    });
  }

  res.status(200).json({
    success: true,
    message: "Session endpoint acknowledged",
    sessionId,
    note: "Actual session creation happens through WebSocket connection",
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Node.js Backend API with WebRTC Support is running!",
    version: "1.0.0",
    features: {
      webrtc: "Video KYC sessions",
      socketio: "Real-time communication",
      database: "MySQL with TypeORM",
    },
    endpoints: {
      documentation: "/api/v1",
      health: "/health",
      auth: "/api/v1/auth",
      sessions: "/api/sessions",
      webrtc: "/api/v1/webrtc",
    },
    socketEvents: {
      connection: "Socket.IO connection endpoint",
      authentication: ["authenticate", "authenticated", "auth-error"],
      session: [
        "join-session",
        "leave-session",
        "session-joined",
        "user-joined",
        "user-left",
      ],
      webrtc: ["webrtc-signal"],
      verification: ["verification-completed"],
      recording: ["recording-status", "recording-status-changed"],
      health: ["ping", "pong"],
    },
  });
});

// WebRTC specific info endpoint
app.get("/api/webrtc", (req, res) => {
  res.status(200).json({
    success: true,
    message: "WebRTC API endpoints",
    endpoints: {
      health: "/health",
      auth: "/api/v1/auth",
      sessions: "/api/sessions",
      webrtcSessions: "/api/v1/webrtc/sessions",
      webrtcHealth: "/api/v1/webrtc/health",
      webrtcStats: "/api/v1/webrtc/stats",
    },
    socketEvents: {
      authentication: ["authenticate", "auth-error", "authenticated"],
      session: ["join-session", "leave-session", "user-joined", "user-left"],
      webrtc: ["webrtc-signal"],
      verification: ["verification-completed", "onVerificationCompleted"],
      recording: ["recording-status", "recording-status-changed"],
      connection: [
        "connected",
        "onServerConnected",
        "onUserJoined",
        "onUserLeft",
      ],
      health: ["ping", "pong"],
    },
    activeConnections: socketManager.getActiveConnections(),
    serverHealth: socketManager.getServerHealth(),
  });
});

// 404 handler for undefined routes
app.use("/{*any}", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: {
      base: "/",
      api: "/api/v1",
      health: "/health",
      webrtc: "/api/webrtc",
      auth: "/api/v1/auth",
      sessions: "/api/sessions",
      webrtcSessions: "/api/v1/webrtc/sessions",
    },
  });
});

// Global error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  await socketManager.gracefulShutdown();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully");
  await socketManager.gracefulShutdown();
  process.exit(0);
});

export { app, server, socketManager };
