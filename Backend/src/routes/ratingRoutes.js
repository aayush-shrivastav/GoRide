const router = require("express").Router();
const ctrl = require("../controllers/ratingController");
const { authenticate, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { createRatingSchema } = require("../validators/ratingValidators");

router.post("/", authenticate, authorize("passenger"), validate(createRatingSchema), ctrl.createRating);
router.get("/driver/:driverId", ctrl.getDriverRatings);

module.exports = router;
