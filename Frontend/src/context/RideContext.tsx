import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { Ride, DriverAssignedPayload, DriverLocationUpdatePayload, RideCancelledPayload, RideCompletedPayload, RideRequestReceivedPayload, PaymentUpdatedPayload } from '../types/ride.types';
import { socketService } from '../services/socket';
import { useAuth } from './AuthContext';
import { RIDE_STATUS } from '../constants/enums';

interface DriverLocation {
  latitude: number;
  longitude: number;
  timestamp: number;
}

interface RideContextValue {
  currentRide: Ride | null;
  driverLocation: DriverLocation | null;
  setDriverLocation: (loc: DriverLocation | null) => void;
  otp: string | null;                       // Passenger-side OTP from driver_assigned
  incomingRideRequest: RideRequestReceivedPayload | null; // Driver-side incoming request
  pendingRequest?: RideRequestReceivedPayload | null;
  setCurrentRide: (ride: Ride | null) => void;
  clearRide: () => void;
  setOtp: (otp: string | null) => void;
  dismissIncomingRequest: () => void;
  clearPendingRequest?: () => void;
}

const RideContext = createContext<RideContextValue | null>(null);

export function RideProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, role } = useAuth();
  const [currentRide, setCurrentRideState] = useState<Ride | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [otp, setOtp] = useState<string | null>(null);
  const [incomingRideRequest, setIncomingRideRequest] = useState<RideRequestReceivedPayload | null>(null);

  const setCurrentRide = useCallback((ride: Ride | null) => {
    setCurrentRideState(ride);
    if (!ride) {
      setDriverLocation(null);
      setOtp(null);
    }
  }, []);

  // Auto-clear stale terminal rides on startup so they never ghost-navigate
  useEffect(() => {
    if (!currentRide) return;
    const terminal = [
      RIDE_STATUS.RIDE_COMPLETED,
      RIDE_STATUS.CANCELLED_BY_DRIVER,
      RIDE_STATUS.CANCELLED_BY_PASSENGER,
      RIDE_STATUS.NO_DRIVER_FOUND,
    ];
    if (terminal.includes(currentRide.rideStatus as RIDE_STATUS)) {
      clearRide();
    }
  // Only run once on mount (currentRide intentionally omitted to avoid loop)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const clearRide = useCallback(() => {
    setCurrentRideState(null);
    setDriverLocation(null);
    setOtp(null);
    setIncomingRideRequest(null);
  }, []);

  const dismissIncomingRequest = useCallback(() => {
    setIncomingRideRequest(null);
  }, []);

  // Register socket listeners when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    if (role === 'passenger') {
      // driver_assigned: { rideId, driver, otp }
      const handleDriverAssigned = (payload: DriverAssignedPayload) => {
        setOtp(payload.otp);
        setCurrentRideState(prev => ({
          ...(prev || {}),
          _id: payload.rideId,
          driver: payload.driver,
          rideStatus: RIDE_STATUS.DRIVER_ASSIGNED,
        } as any));
      };

      // driver_arriving: { rideId }
      const handleDriverArriving = () => {
        setCurrentRideState(prev =>
          prev ? { ...prev, rideStatus: RIDE_STATUS.DRIVER_ARRIVING } : prev,
        );
      };

      // driver_arrived: { rideId }
      const handleDriverArrived = () => {
        setCurrentRideState(prev =>
          prev ? { ...prev, rideStatus: RIDE_STATUS.DRIVER_ARRIVED } : prev,
        );
      };

      // driver_location_update: { rideId, latitude, longitude, timestamp }
      const handleDriverLocationUpdate = (payload: DriverLocationUpdatePayload) => {
        setDriverLocation({
          latitude: payload.latitude,
          longitude: payload.longitude,
          timestamp: payload.timestamp,
        });
      };

      // ride_started: { rideId }
      const handleRideStarted = () => {
        setCurrentRideState(prev =>
          prev ? { ...prev, rideStatus: RIDE_STATUS.RIDE_STARTED } : prev,
        );
        setOtp(null); // OTP no longer needed
      };

      // ride_completed: { rideId, finalFare }
      const handleRideCompleted = (payload: RideCompletedPayload) => {
        setCurrentRideState(prev =>
          prev
            ? { ...prev, rideStatus: RIDE_STATUS.RIDE_COMPLETED, finalFare: payload.finalFare }
            : prev,
        );
      };

      // ride_cancelled: { rideId, reason, cancelledBy }
      const handleRideCancelled = (payload: RideCancelledPayload) => {
        setCurrentRideState(prev =>
          prev
            ? {
                ...prev,
                rideStatus:
                  payload.cancelledBy === 'driver'
                    ? RIDE_STATUS.CANCELLED_BY_DRIVER
                    : RIDE_STATUS.CANCELLED_BY_PASSENGER,
                cancellationReason: payload.reason,
                cancelledBy: payload.cancelledBy,
              }
            : prev,
        );
      };

      const handleNoDriverFound = (payload: { rideId: string }) => {
        setCurrentRideState(prev =>
          prev?._id === payload.rideId
            ? { ...prev, rideStatus: RIDE_STATUS.NO_DRIVER_FOUND }
            : prev,
        );
      };

      // payment_updated: { rideId, status }
      const handlePaymentUpdated = (payload: PaymentUpdatedPayload) => {
        if (!payload?.rideId) return;
        setCurrentRideState(prev =>
          prev?._id === payload.rideId
            ? { ...prev, paymentStatus: payload.status }
            : prev,
        );
      };

      socketService.on('driver_assigned', handleDriverAssigned);
      socketService.on('driver_arriving', handleDriverArriving);
      socketService.on('driver_arrived', handleDriverArrived);
      socketService.on('driver_location_update', handleDriverLocationUpdate);
      socketService.on('ride_started', handleRideStarted);
      socketService.on('ride_completed', handleRideCompleted);
      socketService.on('ride_cancelled', handleRideCancelled);
      socketService.on('no_driver_found', handleNoDriverFound);
      socketService.on('payment_updated', handlePaymentUpdated);

      return () => {
        socketService.off('driver_assigned', handleDriverAssigned);
        socketService.off('driver_arriving', handleDriverArriving);
        socketService.off('driver_arrived', handleDriverArrived);
        socketService.off('driver_location_update', handleDriverLocationUpdate);
        socketService.off('ride_started', handleRideStarted);
        socketService.off('ride_completed', handleRideCompleted);
        socketService.off('ride_cancelled', handleRideCancelled);
        socketService.off('no_driver_found', handleNoDriverFound);
        socketService.off('payment_updated', handlePaymentUpdated);
      };
    }

    if (role === 'driver') {
      const handleRideRequest = (payload: any) => {
        console.log('[Socket] Driver received ride_request:', payload);
        const rideId = payload.rideId || payload.ride?._id || payload._id;
        const normalized: RideRequestReceivedPayload = {
          rideId,
          _id: rideId,
          pickupAddress: payload.pickupAddress || payload.ride?.pickupAddress || 'Pickup location',
          dropAddress: payload.dropAddress || payload.ride?.dropAddress || 'Dropoff location',
          distanceKm: payload.distanceKm ?? payload.ride?.distanceKm ?? 0,
          estimatedDurationMin: payload.estimatedDurationMin ?? payload.ride?.estimatedDurationMin ?? 0,
          estimatedFare: payload.estimatedFare ?? payload.ride?.estimatedFare ?? 0,
          vehicleType: payload.vehicleType || payload.ride?.vehicleType || 'cab',
          paymentMethod: payload.paymentMethod || payload.ride?.paymentMethod || 'cash',
          stops: payload.stops || payload.ride?.stops || [],
          stopCount: payload.stopCount ?? payload.stops?.length ?? payload.ride?.stops?.length ?? 0,
          expiresInSeconds: payload.expiresInSeconds || 30,
          passenger: payload.passenger || payload.ride?.passenger,
          ride: payload.ride || payload,
        };
        setIncomingRideRequest(normalized);
      };

      // Listen to both 'ride_request' (emitted by backend) and 'ride_request_received'
      const handleRideTaken = (payload: { rideId?: string }) => {
        setIncomingRideRequest(prev => (prev?.rideId === payload?.rideId ? null : prev));
      };

      // ride_cancelled by passenger during search (driver side)
      const handleRideCancelled = (payload: RideCancelledPayload) => {
        setIncomingRideRequest(prev =>
          prev?.rideId === payload.rideId ? null : prev,
        );
        setCurrentRideState(prev =>
          prev?._id === payload.rideId
            ? {
                ...prev,
                rideStatus: RIDE_STATUS.CANCELLED_BY_PASSENGER,
                cancellationReason: payload.reason,
              }
            : prev,
        );
      };

      // payment_updated: { rideId, status }
      const handlePaymentUpdated = (payload: PaymentUpdatedPayload) => {
        if (!payload?.rideId) return;
        setCurrentRideState(prev =>
          prev?._id === payload.rideId
            ? { ...prev, paymentStatus: payload.status }
            : prev,
        );
      };

      socketService.on('ride_request', handleRideRequest);
      socketService.on('ride_request_received', handleRideRequest);
      socketService.on('ride_taken', handleRideTaken);
      socketService.on('ride_cancelled', handleRideCancelled);
      socketService.on('payment_updated', handlePaymentUpdated);

      return () => {
        socketService.off('ride_request', handleRideRequest);
        socketService.off('ride_request_received', handleRideRequest);
        socketService.off('ride_taken', handleRideTaken);
        socketService.off('ride_cancelled', handleRideCancelled);
        socketService.off('payment_updated', handlePaymentUpdated);
      };
    }
  }, [isAuthenticated, role]);

  return (
    <RideContext.Provider
      value={{
        currentRide,
        driverLocation,
        setDriverLocation,
        otp,
        incomingRideRequest,
        pendingRequest: incomingRideRequest,
        setCurrentRide,
        clearRide,
        setOtp,
        dismissIncomingRequest,
        clearPendingRequest: dismissIncomingRequest,
      }}>
      {children}
    </RideContext.Provider>
  );
}

export function useRide(): RideContextValue {
  const ctx = useContext(RideContext);
  if (!ctx) throw new Error('useRide must be used within RideProvider');
  return ctx;
}
