"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const config_1 = require("./config");
const db_1 = require("./database/db");
const error_middleware_1 = require("./middlewares/error.middleware");
// Handle uncaught exceptions and unhandled rejections
(0, error_middleware_1.handleUncaughtException)();
(0, error_middleware_1.handleUnhandledRejection)();
const startServer = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield (0, db_1.connectDatabase)();
        const server = app_1.default.listen(config_1.config.server.port, () => {
            console.log(`
    🚀 Server is running successfully!
    📍 Port: ${config_1.config.server.port}
    🌍 Environment: ${config_1.config.server.nodeEnv}
    📊 Database: Connected to MySQL
    🔗 API Base URL: http://localhost:${config_1.config.server.port}/api/v1
    📋 Health Check: http://localhost:${config_1.config.server.port}/api/v1/health
      `);
        });
        // Graceful shutdown handling
        const gracefulShutdown = (signal) => {
            console.log(`\n${signal} received. Initiating graceful shutdown...`);
            server.close((err) => {
                if (err) {
                    console.error("❌ Error during server shutdown:", err);
                    process.exit(1);
                }
                console.log("✅ Server closed successfully");
                console.log("✅ Database connections closed");
                process.exit(0);
            });
        };
        // Listen for termination signals
        process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
        process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    }
    catch (error) {
        console.error("❌ Failed to start server:", error);
        process.exit(1);
    }
});
startServer();
