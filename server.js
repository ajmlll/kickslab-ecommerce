require("dotenv").config(); // ✅ Initialize environment variables FIRST

const http = require("http");
const connectDB = require("./config/db");
const app = require("./app");

/**
 * Main Server Entry Point
 */
const bootstrap = async () => {
  try {
    // 1. Connect to MongoDB
    await connectDB();
    console.log("✔ MongoDB Connected");

    // 2. Create HTTP Server
    const server = http.createServer(app);
    const PORT = process.env.PORT || 5000;

    // 3. Start Server
    server.listen(PORT, () => {
      console.log(`🚀 Server running on:${PORT}`);
      console.log(`⚙ Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Handle port conflicts properly
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use. Stop the other process or change the PORT.`);
        process.exit(1);
      }
    });

    /**
     * Graceful Shutdown Handlers
     */
    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Closing server...`);
      server.close(() => {
        console.log("✔ Server closed cleanly.");
        process.exit(0);
      });
      // Force exit after 3s if server.close hangs
      setTimeout(() => process.exit(1), 3000).unref();
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    process.exit(1);
  }
};

/**
 * Global Error Guards
 */
process.on("unhandledRejection", (err) => {
  console.error("💥 UNHANDLED REJECTION! Shutting down...");
  console.error(err.name, err.message);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("💥 UNCAUGHT EXCEPTION! Shutting down...");
  console.error(err.name, err.message);
  process.exit(1);
});

// Run Bootstrap
bootstrap();
