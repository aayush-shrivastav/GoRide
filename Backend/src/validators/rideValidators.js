const { z } = require("zod");
const { VEHICLE_TYPES, PAYMENT_METHOD } = require("../constants/enums");

const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().min(1),
});

const estimateRideSchema = z.object({
  pickup: coordinatesSchema,
  drop: coordinatesSchema,
  stops: z.array(coordinatesSchema).max(5).optional().default([]),
  vehicleType: z.enum(VEHICLE_TYPES),
});

const createRideSchema = z.object({
  pickup: coordinatesSchema,
  drop: coordinatesSchema,
  stops: z.array(coordinatesSchema).max(5).optional().default([]),
  vehicleType: z.enum(VEHICLE_TYPES),
  paymentMethod: z.enum(Object.values(PAYMENT_METHOD)).default(PAYMENT_METHOD.CASH),
  preferFemaleDriver: z.boolean().optional(),
});

const verifyOtpSchema = z.object({
  otp: z.string().min(4).max(8),
});

const cancelRideSchema = z.object({
  reason: z.string().min(1).max(300),
});

const sosSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

module.exports = { estimateRideSchema, createRideSchema, verifyOtpSchema, cancelRideSchema, sosSchema };
