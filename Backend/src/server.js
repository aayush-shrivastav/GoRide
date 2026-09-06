const http = require("http");
const app = require("./app");
const env = require("./config/env");
const connectDB = require("./config/db");
const { initSocket } = require("./sockets");
const logger = require("./utils/logger");

async function start() {
  await connectDB();

  const server = http.createServer(app);
  initSocket(server);

  server.listen(env.PORT, () => {
    logger.info(`Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  });

  process.on("unhandledRejection", (err) => {
    logger.error({ err }, "Unhandled promise rejection — shutting down");
    server.close(() => process.exit(1));
  });

  process.on("SIGTERM", () => {
    logger.info("SIGTERM received — shutting down gracefully");
    server.close(() => process.exit(0));
  });
}

start();
