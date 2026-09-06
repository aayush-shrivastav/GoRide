const { z } = require("zod");
const { GENDER, VEHICLE_TYPES } = require("../constants/enums");

const registerDriverSchema = z.object({
  name: z.string().min(2).max(60),
  email: z.string().email(),
  phone: z.string().regex(/^[0-9]{10}$/),
  password: z.string().min(8),
  gender: z.enum(Object.values(GENDER)).optional(),
  vehicleType: z.enum(VEHICLE_TYPES),
  vehicleModel: z.string().min(1),
  vehicleNumber: z.string().min(4),
  vehicleColor: z.string().optional(),
  licenseNumber: z.string().min(4),
});

const updateDriverProfileSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  vehicleModel: z.string().min(1).optional(),
  vehicleColor: z.string().optional(),
  profileImage: z.string().url().optional(),
});

const locationUpdateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

module.exports = { registerDriverSchema, updateDriverProfileSchema, locationUpdateSchema };
