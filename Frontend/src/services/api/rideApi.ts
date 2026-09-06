import apiClient from './apiClient';
import { GeoLocation, Ride, RideEstimate, RideListResponse, SosRecord } from '../../types/ride.types';
import { PaymentMethod, VehicleType, RIDE_STATUS } from '../../constants/enums';

// ─── Passenger APIs ────────────────────────────────────────────

export interface NearbyDriver {
  _id: string;
  name: string;
  vehicleType: string;
  vehicleModel: string;
  vehicleColor: string;
  rating: number;
  gender: string;
  latitude: number;
  longitude: number;
  distanceKm: number | null;
  etaMin: number | null;
}

/**
 * GET /api/rides/nearby-drivers
 * Returns online+available drivers near the given coordinates for map display.
 */
export async function getNearbyDrivers(
  lat: number,
  lng: number,
  vehicleType?: string,
  radiusKm = 5,
): Promise<NearbyDriver[]> {
  const params: Record<string, any> = { lat, lng, radiusKm };
  if (vehicleType) params.vehicleType = vehicleType;
  const res = await apiClient.get('/rides/nearby-drivers', { params });
  return (res.data.data?.drivers || []) as NearbyDriver[];
}

/**
 * POST /api/rides/all-estimates
 * Returns fare estimates for ALL vehicle types in one API call.
 */
export async function getAllEstimates(
  pickup: GeoLocation,
  drop: GeoLocation,
  stops: GeoLocation[] = [],
): Promise<{ distanceKm: number; durationMin: number; estimates: Record<string, RideEstimate['fare']> }> {
  const res = await apiClient.post('/rides/all-estimates', { pickup, drop, stops });
  return res.data.data;
}

/**
 * POST /api/rides/estimate
 * Returns fare estimate for a given pickup/drop/vehicleType.
 * Backend is the authoritative source of fare — never calculate on client.
 */
export async function estimateRide(payload: {
  pickup: GeoLocation;
  drop: GeoLocation;
  stops?: GeoLocation[];
  vehicleType: VehicleType;
}): Promise<RideEstimate> {
  const res = await apiClient.post('/rides/estimate', payload);
  return res.data.data as RideEstimate;
}


/**
 * POST /api/rides
 * Creates a new ride and starts the driver matching loop on the backend.
 */
export async function createRide(payload: {
  pickup: GeoLocation;
  drop: GeoLocation;
  stops?: GeoLocation[];
  vehicleType: VehicleType;
  paymentMethod: PaymentMethod;
  preferFemaleDriver?: boolean;
}): Promise<Ride> {
  const res = await apiClient.post('/rides', payload);
  return res.data.data.ride as Ride;
}

/**
 * GET /api/rides/my-rides
 * Returns paginated ride history for the authenticated passenger.
 */
export async function getMyRides(params?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<RideListResponse> {
  const res = await apiClient.get('/rides/my-rides', { params });
  return res.data.data as RideListResponse;
}

export const getRideHistory = getMyRides;

/**
 * GET /api/rides/my-rides?status=active
 * Fetches the passenger's currently active ride (if any).
 */
export async function getActiveRide(): Promise<Ride | null> {
  try {
    const res = await apiClient.get('/rides/my-rides', {
      params: {
        status: [
          'SEARCHING_DRIVER',
          'DRIVER_ASSIGNED',
          'DRIVER_ARRIVING',
          'DRIVER_ARRIVED',
          'RIDE_STARTED',
          'REQUESTED',
        ].join(','),
        limit: 1,
      },
    });
    const rides: Ride[] = res.data.data?.rides || [];
    return rides.length > 0 ? rides[0] : null;
  } catch {
    return null;
  }
}


/**
 * GET /api/rides/driver-rides
 * Returns paginated ride history for the authenticated driver.
 */
export async function getDriverRides(params?: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<RideListResponse> {
  const res = await apiClient.get('/rides/driver-rides', { params });
  return res.data.data as RideListResponse;
}

/**
 * GET /api/rides/:rideId
 * Returns a single ride (accessible by both passenger and driver who own it).
 */
export async function getRide(rideId: string): Promise<Ride> {
  const res = await apiClient.get(`/rides/${rideId}`);
  return res.data.data.ride as Ride;
}

/**
 * POST /api/rides/:rideId/cancel
 */
export async function cancelRide(
  rideId: string,
  reason: string,
): Promise<Ride> {
  const res = await apiClient.post(`/rides/${rideId}/cancel`, { reason });
  return res.data.data.ride as Ride;
}

/**
 * POST /api/rides/:rideId/sos
 * Triggers SOS alert. Only callable by passenger during an active ride.
 * Does NOT contact police/emergency services — backend creates an SOS record
 * and notifies the driver via socket.
 */
export async function triggerSos(
  rideId: string,
  latitude: number,
  longitude: number,
): Promise<SosRecord> {
  const res = await apiClient.post(`/rides/${rideId}/sos`, {
    latitude,
    longitude,
  });
  return res.data.data.sos as SosRecord;
}

// ─── Driver APIs ───────────────────────────────────────────────

/**
 * POST /api/rides/:rideId/accept
 * Only succeeds if the driver has a PENDING invitation for this ride.
 * 409 = ride already taken by another driver.
 * 403 = driver was never invited to this ride.
 */
export async function acceptRide(rideId: string): Promise<Ride> {
  const res = await apiClient.post(`/rides/${rideId}/accept`);
  return res.data.data.ride as Ride;
}

/**
 * POST /api/rides/:rideId/reject
 */
export async function rejectRide(rideId: string): Promise<void> {
  await apiClient.post(`/rides/${rideId}/reject`);
}

/**
 * POST /api/rides/:rideId/arriving
 * Transitions: DRIVER_ASSIGNED → DRIVER_ARRIVING
 */
export async function markArriving(rideId: string): Promise<Ride> {
  const res = await apiClient.post(`/rides/${rideId}/arriving`);
  return res.data.data.ride as Ride;
}

/**
 * POST /api/rides/:rideId/arrived
 * Transitions: DRIVER_ARRIVING → DRIVER_ARRIVED
 * Backend sends driver_arrived socket event to passenger.
 */
export async function markArrived(rideId: string): Promise<Ride> {
  const res = await apiClient.post(`/rides/${rideId}/arrived`);
  return res.data.data.ride as Ride;
}

/**
 * POST /api/rides/:rideId/verify-otp
 * Driver submits the OTP given verbally by the passenger.
 * Backend validates. Frontend must NOT assume success without backend confirmation.
 */
export async function verifyOtp(rideId: string, otp: string): Promise<void> {
  await apiClient.post(`/rides/${rideId}/verify-otp`, { otp });
}

/**
 * POST /api/rides/:rideId/start
 * Can only be called after OTP verification.
 * Transitions: DRIVER_ARRIVED → RIDE_STARTED
 */
export async function startRide(rideId: string): Promise<Ride> {
  const res = await apiClient.post(`/rides/${rideId}/start`);
  return res.data.data.ride as Ride;
}

/**
 * POST /api/rides/:rideId/complete
 * Transitions: RIDE_STARTED → RIDE_COMPLETED
 * Backend sets finalFare and updates driver earnings.
 */
export async function completeRide(rideId: string): Promise<Ride> {
  const res = await apiClient.post(`/rides/${rideId}/complete`);
  return res.data.data.ride as Ride;
}

export async function updateRideStatus(rideId: string, status: string): Promise<Ride> {
  if (status === RIDE_STATUS.DRIVER_ARRIVING) return markArriving(rideId);
  if (status === RIDE_STATUS.DRIVER_ARRIVED) return markArrived(rideId);
  if (status === RIDE_STATUS.RIDE_STARTED) return startRide(rideId);
  if (status === RIDE_STATUS.RIDE_COMPLETED) return completeRide(rideId);
  if (status === RIDE_STATUS.CANCELLED_BY_DRIVER) return cancelRide(rideId, 'Driver cancelled');
  if (status === RIDE_STATUS.CANCELLED_BY_PASSENGER) return cancelRide(rideId, 'Passenger cancelled');
  const res = await apiClient.post(`/rides/${rideId}/status`, { status });
  return res.data.data.ride as Ride;
}
