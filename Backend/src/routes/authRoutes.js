const router = require("express").Router();
const ctrl = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimiter");
const {
  registerPassengerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../validators/authValidators");

router.post("/register", authLimiter, validate(registerPassengerSchema), ctrl.register);
router.post("/login", authLimiter, validate(loginSchema), ctrl.login);
router.post("/refresh", authLimiter, ctrl.refresh);
router.post("/logout", authenticate, ctrl.logout);
router.get("/me", authenticate, ctrl.getMe);
router.patch("/profile", authenticate, validate(updateProfileSchema), ctrl.updateProfile);
router.patch("/change-password", authenticate, validate(changePasswordSchema), ctrl.changePassword);
router.post("/forgot-password", authLimiter, validate(forgotPasswordSchema), ctrl.forgotPassword);
router.post("/reset-password", authLimiter, validate(resetPasswordSchema), ctrl.resetPassword);

// Emergency contacts (passenger only)
router.get("/emergency-contacts", authenticate, ctrl.getEmergencyContacts);
router.post("/emergency-contacts", authenticate, ctrl.addEmergencyContact);
router.delete("/emergency-contacts/:contactId", authenticate, ctrl.deleteEmergencyContact);

module.exports = router;
