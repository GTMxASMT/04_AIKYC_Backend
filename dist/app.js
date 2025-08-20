"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const config_1 = require("./config");
const routes_1 = __importDefault(require("./routes"));
const error_middleware_1 = require("./middlewares/error.middleware");
const app = (0, express_1.default)();
// Security middleware
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));
// CORS configuration
app.use((0, cors_1.default)({
    origin: [
        config_1.config.frontend.url,
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Set-Cookie"],
}));
// Body parsing middleware
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
app.use((0, cookie_parser_1.default)());
// Logging middleware (only in development)
if (config_1.config.server.nodeEnv === "development") {
    app.use((0, morgan_1.default)("combined"));
}
// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});
// API routes
app.use("/api/v1", routes_1.default);
// Root endpoint
app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Node.js Backend API is running!",
        version: "1.0.0",
        documentation: "/api/v1",
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
            health: "/api/v1/health",
            users: "/api/v1/users",
        },
    });
});
// Global error handling middleware (must be last)
app.use(error_middleware_1.errorHandler);
exports.default = app;
