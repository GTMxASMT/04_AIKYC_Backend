"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleUncaughtException = exports.handleUnhandledRejection = exports.errorHandler = void 0;
const ApiError_1 = require("../utilities/ApiError");
const config_1 = require("../config");
const errorHandler = (err, req, res, next) => {
    let error = err;
    // Convert non-ApiError errors to ApiError
    if (!(error instanceof ApiError_1.ApiError)) {
        const statusCode = error.statusCode || error.status || 500;
        const message = error.message || "Internal Server Error";
        error = new ApiError_1.ApiError(statusCode, message, [], err.stack);
    }
    // Log error in development
    if (config_1.config.server.nodeEnv === "development") {
        console.error("🚨 Error:", {
            message: error.message,
            stack: error.stack,
            url: req.url,
            method: req.method,
        });
    }
    const response = Object.assign(Object.assign({ success: false, message: error.message, statusCode: error.statusCode }, (config_1.config.server.nodeEnv === "development" && { stack: error.stack })), (error.errors && error.errors.length > 0 && { errors: error.errors }));
    res.status(error.statusCode).json(response);
};
exports.errorHandler = errorHandler;
// Handle unhandled promise rejections
const handleUnhandledRejection = () => {
    process.on("unhandledRejection", (err) => {
        console.error("🚨 Unhandled Promise Rejection:", err);
        process.exit(1);
    });
};
exports.handleUnhandledRejection = handleUnhandledRejection;
// Handle uncaught exceptions
const handleUncaughtException = () => {
    process.on("uncaughtException", (err) => {
        console.error("🚨 Uncaught Exception:", err);
        process.exit(1);
    });
};
exports.handleUncaughtException = handleUncaughtException;
