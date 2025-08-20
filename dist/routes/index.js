"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_routes_1 = __importDefault(require("./user.routes"));
const router = (0, express_1.Router)();
// API routes
router.use("/users", user_routes_1.default);
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
exports.default = router;
