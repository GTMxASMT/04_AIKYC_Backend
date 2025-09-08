import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utilities/ApiError";
import { config } from "../config";

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let error = err;

  // Convert non-ApiError errors to ApiError
  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || error.status || 500;
    const message = error.message || "Internal Server Error";
    error = new ApiError(statusCode, message, [], err.stack);
  }

  // Log error in development
  if (config.server.nodeEnv === "development") {
    console.error(" Error:", {
      message: error.message,
      // stack: error.stack,
      url: req.url,
      method: req.method,
    });
  }

  const response = {
    success: false,
    message: error.message,
    statusCode: error.statusCode,
    ...(config.server.nodeEnv === "development" && { stack: error.stack }),
    ...(error.errors && error.errors.length > 0 && { errors: error.errors }),
  };

  res.status(error.statusCode).json(response);
};

// Handle unhandled promise rejections
export const handleUnhandledRejection = () => {
  process.on("unhandledRejection", (err: Error) => {
    console.error(" Unhandled Promise Rejection:", err);
    process.exit(1);
  });
};

// Handle uncaught exceptions
export const handleUncaughtException = () => {
  process.on("uncaughtException", (err: Error) => {
    console.error("Uncaught Exception:", err);
    process.exit(1);
  });
};
