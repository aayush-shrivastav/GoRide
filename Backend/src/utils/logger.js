const pino = require("pino");

const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } },
  redact: ["req.headers.authorization", "req.headers.cookie", "password", "*.password", "*.otp"],
});

module.exports = logger;
