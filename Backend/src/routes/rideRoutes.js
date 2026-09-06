const router = require("express").Router();
const ctrl = require("../controllers/rideController");
const { authenticate, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const {
  estimateRideSchema,
  createRideSchema,
  verifyOtpSchema,
  cancelRideSchema,
  sosSchema,
} = require("../validators/rideValidators");

router.use(authenticate);

router.post("/estimate", authorize("passenger", "driver"), validate(estimateRideSchema), ctrl.estimateRide);
router.post("/all-estimates", authorize("passenger", "driver"), ctrl.getAllEstimates);
router.get("/nearby-drivers", authorize("passenger"), ctrl.getNearbyDrivers);
router.post("/", authorize("passenger", "driver"), validate(createRideSchema), ctrl.createRide);

router.get("/my-rides", authorize("passenger"), ctrl.myRides);
router.get("/driver-rides", authorize("driver"), ctrl.driverRides);
router.get("/driver/earnings/today", authorize("driver"), ctrl.getTodayEarnings);

router.get("/:rideId", ctrl.getRide);

router.post("/:rideId/accept", authorize("driver"), ctrl.acceptRide);
router.post("/:rideId/reject", authorize("driver"), ctrl.rejectRide);
router.post("/:rideId/arriving", authorize("driver"), ctrl.driverArriving);
router.post("/:rideId/arrived", authorize("driver"), ctrl.driverArrived);
router.post("/:rideId/verify-otp", authorize("driver"), validate(verifyOtpSchema), ctrl.verifyOtp);
router.post("/:rideId/start", authorize("driver"), ctrl.startRide);
router.post("/:rideId/complete", authorize("driver"), ctrl.completeRide);
router.post("/:rideId/cancel", authorize("passenger", "driver"), validate(cancelRideSchema), ctrl.cancelRide);
router.post("/:rideId/sos", authorize("passenger", "driver"), validate(sosSchema), ctrl.triggerSos);

module.exports = router;
