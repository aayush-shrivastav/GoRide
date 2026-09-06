const router = require("express").Router();
const ctrl = require("../controllers/paymentController");
const { authenticate, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { createOrderSchema, verifyPaymentSchema } = require("../validators/paymentValidators");

// NOTE: POST /api/payments/webhook is registered directly in app.js with
// express.raw() BEFORE the JSON body parser, since Razorpay's signature
// check requires the exact raw request body. It is intentionally not
// re-declared here to avoid a second, JSON-parsed handler shadowing it.

router.use(authenticate, authorize("passenger"));
router.post("/create-order", validate(createOrderSchema), ctrl.createOrder);
router.post("/verify", validate(verifyPaymentSchema), ctrl.verifyPayment);
router.get("/:paymentId", ctrl.getPayment);

module.exports = router;
