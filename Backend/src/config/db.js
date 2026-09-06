const mongoose = require("mongoose");
const env = require("./env");
const logger = require("../utils/logger");

async function connectDB() {
  mongoose.set("strictQuery", true);
  try {
    await mongoose.connect(env.MONGODB_URI);
    logger.info(`MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    logger.error({ err }, "MongoDB connection failed");
    process.exit(1);
  }

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });
}

module.exports = connectDB;
