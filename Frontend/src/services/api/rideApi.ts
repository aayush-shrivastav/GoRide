import apiClient from './apiClient';

import {
  GeoLocation,
  Ride,
  RideEstimate,
  RideListResponse,
  SosRecord,
} from '../../types/ride.types';

import {
  PaymentMethod,
  VehicleType,
  RIDE_STATUS,
} from '../../constants/enums';

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
 *
 * Returns online + available drivers near the
 * given coordinates for map display.
 */
export async function getNearbyDrivers(
  lat: number,
  lng: number,
  vehicleType?: string,
  radiusKm = 5,
): Promise<NearbyDriver[]> {
  const params: Record<string, string | number> = {
    lat,
    lng,
    radiusKm,
  };

  if (vehicleType) {
    params.vehicleType = vehicleType;
  }

  const res = await apiClient.get(
    '/rides/nearby-drivers',
    { params },
  );

  return (res.data?.data?.drivers ?? []) as NearbyDriver[];
}

/**
 * POST /api/rides/all-estimates
 *
 * Returns fare estimates for all vehicle types.
 */
export async function getAllEstimates(
  pickup: GeoLocation,
  drop: GeoLocation,
  stops: GeoLocation[] = [],
): Promise<{
  distanceKm: number;
  durationMin: number;
  estimates: Record<string, RideEstimate['fare']>;
}> {
  const res = await apiClient.post(
    '/rides/all-estimates',
    {
      pickup,
      drop,
      stops,
    },
  );

  return res.data?.data;
}

/**
 * POST /api/rides/estimate
 *
 * Backend is authoritative for fare calculation.
 */
export async function estimateRide(payload: {
  pickup: GeoLocation;
  drop: GeoLocation;
  stops?: GeoLocation[];
  vehicleType: VehicleType;
}): Promise<RideEstimate> {
  const res = await apiClient.post(
    '/rides/estimate',
    payload,
  );

  return res.data?.data as RideEstimate;
}

/**
 * POST /api/rides
 *
 * Creates a ride and starts driver matching.
 */
export async function createRide(payload: {
  pickup: GeoLocation;
  drop: GeoLocation;
  stops?: GeoLocation[];
  vehicleType: VehicleType;
  paymentMethod: PaymentMethod;
  preferFemaleDriver?: boolean;
}): Promise<Ride> {
  const res = await apiClient.post(
    '/rides',
    payload,
  );

  return res.data?.data?.ride as Ride;
}

/**
 * GET /api/rides/my-rides
 *
 * Passenger ride history.
 */
export async function getMyRides(
  params?: {
    status?: string;
    page?: number;
    limit?: number;
  },
): Promise<RideListResponse> {
  const res = await apiClient.get(
    '/rides/my-rides',
    { params },
  );

  return res.data?.data as RideListResponse;
}

export const getRideHistory = getMyRides;

/**
 * Gets the passenger's currently active ride.
 */
export async function getActiveRide(): Promise<Ride | null> {
  try {
    const activeStatuses = [
      RIDE_STATUS.SEARCHING_DRIVER,
      RIDE_STATUS.DRIVER_ASSIGNED,
      RIDE_STATUS.DRIVER_ARRIVING,
      RIDE_STATUS.DRIVER_ARRIVED,
      RIDE_STATUS.RIDE_STARTED,
      RIDE_STATUS.REQUESTED,
    ];

    const res = await apiClient.get(
      '/rides/my-rides',
      {
        params: {
          status: activeStatuses.join(','),
          limit: 1,
        },
      },
    );

    const rides: Ride[] =
      res.data?.data?.rides ?? [];

    return rides.length > 0
      ? rides[0]
      : null;
  } catch {
    return null;
  }
}

// ─── Driver APIs ───────────────────────────────────────────────

/**
 * GET /api/rides/driver-rides
 */
export async function getDriverRides(
  params?: {
    status?: string;
    page?: number;
    limit?: number;
  },
): Promise<RideListResponse> {
  const res = await apiClient.get(
    '/rides/driver-rides',
    { params },
  );

  return res.data?.data as RideListResponse;
}

/**
 * GET /api/rides/:rideId
 */
export async function getRide(
  rideId: string,
): Promise<Ride> {
  if (!rideId) {
    throw new Error('Ride ID is required');
  }

  const res = await apiClient.get(
    `/rides/${rideId}`,
  );

  return res.data?.data?.ride as Ride;
}

/**
 * POST /api/rides/:rideId/cancel
 */
export async function cancelRide(
  rideId: string,
  reason: string,
): Promise<Ride> {
  if (!rideId) {
    throw new Error('Ride ID is required');
  }

  const res = await apiClient.post(
    `/rides/${rideId}/cancel`,
    {
      reason:
        reason?.trim() || 'Ride cancelled',
    },
  );

  return res.data?.data?.ride as Ride;
}

/**
 * POST /api/rides/:rideId/accept-any-driver
 */
export async function acceptAnyDriver(
  rideId: string,
): Promise<Ride> {
  if (!rideId) {
    throw new Error('Ride ID is required');
  }

  const res = await apiClient.post(
    `/rides/${rideId}/accept-any-driver`,
  );

  return res.data?.data?.ride as Ride;
}

/**
 * POST /api/rides/:rideId/sos
 *
 * Creates SOS record on backend.
 * Emergency dialing is handled separately by the SOS hook.
 */
export async function triggerSos(
  rideId: string,
  latitude: number,
  longitude: number,
): Promise<SosRecord> {
  if (!rideId) {
    throw new Error('Ride ID is required');
  }

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    throw new Error('Invalid SOS location');
  }

  const res = await apiClient.post(
    `/rides/${rideId}/sos`,
    {
      latitude,
      longitude,
    },
  );

  return res.data?.data?.sos as SosRecord;
}

/**
 * POST /api/rides/:rideId/sos/cancel
 *
 * Cancels / resolves active SOS emergency on backend.
 */
export async function cancelSos(
  rideId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  if (!rideId) {
    throw new Error('Ride ID is required');
  }

  const res = await apiClient.post(`/rides/${rideId}/sos/cancel`, { reason });
  return res.data;
}

/**
 * POST /api/rides/:rideId/accept
 */
export async function acceptRide(
  rideId: string,
): Promise<Ride> {
  if (!rideId) {
    throw new Error('Ride ID is required');
  }

  const res = await apiClient.post(
    `/rides/${rideId}/accept`,
  );

  return res.data?.data?.ride as Ride;
}

/**
 * POST /api/rides/:rideId/reject
 */
export async function rejectRide(
  rideId: string,
): Promise<void> {
  if (!rideId) {
    throw new Error('Ride ID is required');
  }

  await apiClient.post(
    `/rides/${rideId}/reject`,
  );
}

/**
 * POST /api/rides/:rideId/arriving
 */
export async function markArriving(
  rideId: string,
): Promise<Ride> {
  if (!rideId) {
    throw new Error('Ride ID is required');
  }

  const res = await apiClient.post(
    `/rides/${rideId}/arriving`,
  );

  return res.data?.data?.ride as Ride;
}

/**
 * POST /api/rides/:rideId/arrived
 */
export async function markArrived(
  rideId: string,
): Promise<Ride> {
  if (!rideId) {
    throw new Error('Ride ID is required');
  }

  const res = await apiClient.post(
    `/rides/${rideId}/arrived`,
  );

  return res.data?.data?.ride as Ride;
}

/**
 * POST /api/rides/:rideId/verify-otp
 */
export async function verifyOtp(
  rideId: string,
  otp: string,
): Promise<void> {
  if (!rideId) {
    throw new Error('Ride ID is required');
  }

  if (!otp?.trim()) {
    throw new Error('OTP is required');
  }

  await apiClient.post(
    `/rides/${rideId}/verify-otp`,
    {
      otp: otp.trim(),
    },
  );
}

/**
 * POST /api/rides/:rideId/start
 */
export async function startRide(
  rideId: string,
): Promise<Ride> {
  if (!rideId) {
    throw new Error('Ride ID is required');
  }

  const res = await apiClient.post(
    `/rides/${rideId}/start`,
  );

  return res.data?.data?.ride as Ride;
}

/**
 * POST /api/rides/:rideId/complete
 */
export async function completeRide(
  rideId: string,
  paymentMethod?: PaymentMethod | 'cash' | 'online' | string,
): Promise<Ride> {
  if (!rideId) {
    throw new Error('Ride ID is required');
  }

  const payload = paymentMethod
    ? { paymentMethod }
    : {};

  const res = await apiClient.post(
    `/rides/${rideId}/complete`,
    payload,
  );

  return res.data?.data?.ride as Ride;
}

type UpdateRideStatusPayload = {
  reason?: string;
  paymentMethod?: PaymentMethod | 'cash' | 'online' | string;
  [key: string]: unknown;
};

/**
 * Maps high-level ride statuses to their
 * dedicated backend endpoints.
 */
export async function updateRideStatus(
  rideId: string,
  status: string,
  payload?: UpdateRideStatusPayload,
): Promise<Ride> {
  if (!rideId) {
    throw new Error('Ride ID is required');
  }

  switch (status) {
    case RIDE_STATUS.DRIVER_ARRIVING:
      return markArriving(rideId);

    case RIDE_STATUS.DRIVER_ARRIVED:
      return markArrived(rideId);

    case RIDE_STATUS.RIDE_STARTED:
      return startRide(rideId);

    case RIDE_STATUS.RIDE_COMPLETED:
      return completeRide(
        rideId,
        payload?.paymentMethod,
      );

    case RIDE_STATUS.CANCELLED_BY_DRIVER:
      return cancelRide(
        rideId,
        payload?.reason ||
        'Driver cancelled',
      );

    case RIDE_STATUS.CANCELLED_BY_PASSENGER:
      return cancelRide(
        rideId,
        payload?.reason ||
        'Passenger cancelled',
      );

    default: {
      const res = await apiClient.post(
        `/rides/${rideId}/status`,
        {
          status,
          ...(payload ?? {}),
        },
      );

      return res.data?.data?.ride as Ride;
    }
  }
}