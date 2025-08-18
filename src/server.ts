import app from "./app";
import { config } from "./config";
import { connectDatabase } from "./database/db";
import {
  handleUnhandledRejection,
  handleUncaughtException,
} from "./middlewares/error.middleware";

// Handle uncaught exceptions and unhandled rejections
handleUncaughtException();
handleUnhandledRejection();

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();

    const server = app.listen(config.server.port, () => {
      console.log(`
    🚀 Server is running successfully!
    📍 Port: ${config.server.port}
    🌍 Environment: ${config.server.nodeEnv}
    📊 Database: Connected to MySQL
    🔗 API Base URL: http://localhost:${config.server.port}/api/v1
    📋 Health Check: http://localhost:${config.server.port}/api/v1/health
      `);
    });

    // Graceful shutdown handling
    const gracefulShutdown = (signal: string) => {
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
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
