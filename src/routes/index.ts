import { Router } from "express";
import userRoutes from "./user.routes";
import AIRoutes from "./ai.routes";
import AdminRoutes from "./admin.routes";
import chatRoutes from "./chat.routes";
import webrtcRoutes from "./Xwebrtc.routes"; // Add this import

// Add WebRTC routes

const router = Router();

// API routes
router.use("/users", userRoutes);
router.use("/AI", AIRoutes);
router.use("/c", chatRoutes);
router.use("/admin", AdminRoutes);
router.use("/webrtc", webrtcRoutes);

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running successfully",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// API info endpoint
router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to Node.js Backend API",
    version: "1.0.0",
    endpoints: {
      auth: "/api/v1/users/register, /api/v1/users/login, /api/v1/users/logout",
      users: "/api/v1/users/",
      ai: "/api/v1/AI/",
      admin: "/api/v1/admin/",
      webrtc: "/api/v1/webrtc/", // Add WebRTC endpoint info
      chat: "/api/v1/c/",
      health: "/api/v1/health",
    },
  });
});

export default router;
