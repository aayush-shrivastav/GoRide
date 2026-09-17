import { Passenger, Driver } from './auth.types';

export type PopulatedPassenger = Passenger;
export type PopulatedDriver = Driver;

export interface LocationPoint {
  type: 'Point';
  coordinates: number[]; // [longitude, latitude]
}

export interface RideStop {
  location: LocationPoint;
  address: string;
  order: number;
}

export interface Ride {
  _id: string;

  passenger: Passenger | string;

  driver?: Driver | string;

  pickupLocation: LocationPoint;
  pickupAddress: string;

  dropLocation: LocationPoint;
  dropAddress: string;

  stops?: RideStop[];
  stopCount?: number;

  vehicleType: string;

  estimatedFare: number;
  finalFare?: number;

  platformCommission?: number;
  driverEarning?: number;

  // Backend distance
  // distance = meters
  distance: number;
  distanceKm?: number;

  // Backend duration
  // duration = seconds
  duration: number;
  estimatedDurationMin?: number;

  requestedAt?: string;

  rideStatus: string;

  paymentMethod: 'cash' | 'online';

  paymentStatus:
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'REFUNDED';

  otp?: string;

  createdAt: string;
  updatedAt?: string;

  cancellationReason?: string;
  cancelledBy?: string;
  rating?: {
    _id?: string;
    stars: number;
    review?: string;
    createdAt?: string;
    passenger?: {
      name?: string;
      profileImage?: string;
    };
  };
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
  address?: string;
}

export interface RideEstimate {
  vehicleType: string;

  fare:
  | number
  | {
    totalFare: number;
    baseFare?: number;
    distanceFare?: number;
    timeFare?: number;
    platformFee?: number;
    surgeMultiplier?: number;
  };

  // distance = meters
  distance?: number;
  distanceKm?: number;

  // duration = seconds
  duration?: number;
  durationMin?: number;
}

export interface RideListResponse {
  rides: Ride[];
  total: number;
  page: number;
  pages: number;
  totalPages?: number;
}

export interface SosRecord {
  _id: string;
  ride: string;
  triggeredBy: string;
  location: LocationPoint;
  status: string;
  createdAt: string;
}

export interface DriverAssignedPayload {
  rideId: string;
  driver: Driver;
  otp: string;
}

export interface DriverLocationUpdatePayload {
  rideId: string;
  latitude: number;
  longitude: number;
  timestamp: number;
}

export interface RideCancelledPayload {
  rideId: string;
  reason: string;
  cancelledBy: string;
}

export interface RideCompletedPayload {
  rideId: string;
  finalFare: number;
}

export interface RideRequestReceivedPayload {
  rideId: string;
  _id?: string;

  pickupAddress?: string;
  dropAddress?: string;

  stops?: RideStop[];
  stopCount?: number;

  distanceKm?: number;
  estimatedDurationMin?: number;
  estimatedFare?: number;

  vehicleType?: string;

  paymentMethod?: 'cash' | 'online';

  expiresInSeconds?: number;

  passenger?: Passenger | string;

  ride?: Ride;
}

export interface PaymentUpdatedPayload {
  rideId: string;

  status:
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'REFUNDED';
}

export interface SosTriggeredPayload {
  rideId: string;
  sosId: string;

  location?:
  | LocationPoint
  | {
    type: 'Point';
    coordinates: number[];
  };
}