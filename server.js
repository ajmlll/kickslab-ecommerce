// ============================================================================
// a) Imports
// ============================================================================
require("dotenv").config(); // Must be first to load env vars for other imports
const connectDB = require("./config/db");
const app = require("./app");

// ============================================================================
// b) Config
// ============================================================================
const PORT = process.env.PORT || 5000;
const ENV = process.env.NODE_ENV || "development";
let server;

// ============================================================================
// c) Start Server Function
// ============================================================================
const startServer = async () => {
  try {
    // Connect to Database
    await connectDB();
    console.log("✔ Database connection established.");

    // Start Express App
    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port: ${PORT} [${ENV}]`);
    });

    // Handle Port Conflicts and Server Errors
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} is already in use. Please free the port and restart.`);
        process.exit(1);
      } else {
        console.error("❌ Server encountered an error:", error);
      }
    });

  } catch (error) {
    console.error("❌ Failed to start the server:", error.message);
    process.exit(1);
  }
};

// Initialize the server
startServer();

// ============================================================================
// d) Shutdown Logic
// ============================================================================
const shutdownServer = (signal, exitCode = 0) => {
  console.log(`\n🛑 Received ${signal}. Initiating graceful shutdown...`);
  
  if (server) {
    server.close(() => {
      console.log("✔ HTTP server closed.");
      process.exit(exitCode);
    });
  } else {
    process.exit(exitCode);
  }

  // Force close after 5 seconds if connections linger
  setTimeout(() => {
    console.error("❌ Graceful shutdown timed out. Forcing exit.");
    process.exit(1);
  }, 5000).unref();
};

// ============================================================================
// e) Process Handlers
// ============================================================================

// Graceful termination signals
process.on("SIGINT", () => shutdownServer("SIGINT", 0));
process.on("SIGTERM", () => shutdownServer("SIGTERM", 0));

// Unhandled Promise Rejections
process.on("unhandledRejection", (err) => {
  console.error("💥 UNHANDLED REJECTION! Shutting down...");
  console.error(err.name, err.message);
  shutdownServer("UNHANDLED REJECTION", 1);
});

// Uncaught Exceptions
process.on("uncaughtException", (err) => {
  console.error("💥 UNCAUGHT EXCEPTION! Shutting down...");
  console.error(err.name, err.message);
  process.exit(1);
});
