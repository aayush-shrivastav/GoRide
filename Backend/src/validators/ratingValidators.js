const { z } = require("zod");

const createRatingSchema = z.object({
  rideId: z.string().min(1),
  stars: z.number().int().min(1).max(5).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  review: z.string().max(500).optional(),
  comment: z.string().max(500).optional(),
  targetRole: z.string().optional(),
}).refine(data => data.stars !== undefined || data.rating !== undefined, {
  message: "Rating stars are required",
});

module.exports = { createRatingSchema };
