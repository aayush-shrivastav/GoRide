const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const mongoSanitize = require("express-mongo-sanitize");

const { corsOptions } = require("./config/cors");
const env = require("./config/env");
const logger = require("./utils/logger");
const errorHandler = require("./middleware/errorHandler");
const notFound = require("./middleware/notFound");
const { generalLimiter } = require("./middleware/rateLimiter");

const authRoutes = require("./routes/authRoutes");
const driverRoutes = require("./routes/driverRoutes");
const rideRoutes = require("./routes/rideRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const ratingRoutes = require("./routes/ratingRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const paymentController = require("./controllers/paymentController");

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(cors(corsOptions));
app.use(
  morgan(env.NODE_ENV === "production" ? "combined" : "dev", {
    stream: { write: (msg) => logger.info(msg.trim()) },
  })
);

// Razorpay webhook needs the raw request body to verify the HMAC signature,
// so it must be mounted BEFORE the JSON body parser below.
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    req.rawBody = req.body; // Buffer
    try {
      req.body = JSON.parse(req.body.toString("utf8"));
    } catch {
      req.body = {};
    }
    next();
  },
  paymentController.handleWebhook
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(generalLimiter);

app.get("/health", (req, res) => res.status(200).json({ success: true, message: "OK" }));

app.use("/api/auth", authRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/rides", rideRoutes);
app.use("/api/payments", paymentRoutes); // create-order/verify/:paymentId (webhook handled above)
app.use("/api/ratings", ratingRoutes);
app.use("/api/notifications", notificationRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
