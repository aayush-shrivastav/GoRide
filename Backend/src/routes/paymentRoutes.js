const router = require("express").Router();
const ctrl = require("../controllers/paymentController");
const { authenticate, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { createOrderSchema, verifyPaymentSchema } = require("../validators/paymentValidators");

// NOTE: POST /api/payments/webhook is registered directly in app.js with
// express.raw() BEFORE the JSON body parser, since Razorpay's signature
// check requires the exact raw request body. It is intentionally not
// re-declared here to avoid a second, JSON-parsed handler shadowing it.

router.use(authenticate);
router.post("/create-order", authorize("passenger"), validate(createOrderSchema), ctrl.createOrder);
router.post("/verify", authorize("passenger"), validate(verifyPaymentSchema), ctrl.verifyPayment);
router.get("/:paymentId", authorize("passenger", "driver"), ctrl.getPayment);

module.exports = router;
