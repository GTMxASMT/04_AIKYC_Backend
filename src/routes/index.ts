import { Router } from "express";
import userRoutes from "./user.routes";

const router = Router();

// API routes
router.use("/users", userRoutes);

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
      health: "/api/v1/health",
    },
  });
});

export default router;
