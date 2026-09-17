import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

import {
  Ride,
  DriverAssignedPayload,
  DriverLocationUpdatePayload,
  RideCancelledPayload,
  RideCompletedPayload,
  RideRequestReceivedPayload,
  PaymentUpdatedPayload,
} from '../types/ride.types';

import { socketService } from '../services/socket';
import { useAuth } from './AuthContext';
import { RIDE_STATUS } from '../constants/enums';

interface DriverLocation {
  latitude: number;
  longitude: number;
  timestamp: number;
}

interface RideRequestSocketPayload
  extends Partial<RideRequestReceivedPayload> {
  rideId?: string;
  _id?: string;
  ride?: Ride;
}

interface RideContextValue {
  currentRide: Ride | null;

  driverLocation: DriverLocation | null;

  setDriverLocation: (
    loc: DriverLocation | null
  ) => void;

  otp: string | null;

  incomingRideRequest:
  | RideRequestReceivedPayload
  | null;

  pendingRequest?:
  | RideRequestReceivedPayload
  | null;

  setCurrentRide: (
    ride: Ride | null
  ) => void;

  clearRide: () => void;

  setOtp: (
    otp: string | null
  ) => void;

  dismissIncomingRequest: () => void;

  clearPendingRequest?: () => void;

  setIncomingRideRequest?: (
    req: RideRequestReceivedPayload | null
  ) => void;

  setPendingRequest?: (
    req: RideRequestReceivedPayload | null
  ) => void;
}

const RideContext =
  createContext<RideContextValue | null>(null);

export function RideProvider({
  children,
}: {
  children: ReactNode;
}) {
  const {
    isAuthenticated,
    role,
  } = useAuth();

  const [
    currentRide,
    setCurrentRideState,
  ] = useState<Ride | null>(null);

  const [
    driverLocation,
    setDriverLocation,
  ] = useState<DriverLocation | null>(null);

  const [
    otp,
    setOtp,
  ] = useState<string | null>(null);

  const [
    incomingRideRequest,
    setIncomingRideRequest,
  ] =
    useState<RideRequestReceivedPayload | null>(
      null
    );

  /*
   * Set current ride.
   */
  const setCurrentRide = useCallback(
    (ride: Ride | null) => {
      setCurrentRideState(ride);

      if (!ride) {
        setDriverLocation(null);
        setOtp(null);
      }
    },
    []
  );

  /*
   * Clear current ride and all ride-specific state.
   */
  const clearRide = useCallback(() => {
    setCurrentRideState(null);
    setDriverLocation(null);
    setOtp(null);
    setIncomingRideRequest(null);
  }, []);

  /*
   * Dismiss incoming driver request.
   */
  const dismissIncomingRequest =
    useCallback(() => {
      setIncomingRideRequest(null);
    }, []);

  /*
   * Remove stale terminal ride on initial mount.
   *
   * NOTE:
   * This only runs once intentionally.
   */
  useEffect(() => {
    if (!currentRide) {
      return;
    }

    const terminalStatuses = [
      RIDE_STATUS.RIDE_COMPLETED,
      RIDE_STATUS.CANCELLED_BY_DRIVER,
      RIDE_STATUS.CANCELLED_BY_PASSENGER,
      RIDE_STATUS.NO_DRIVER_FOUND,
    ];

    if (
      terminalStatuses.includes(
        currentRide.rideStatus as RIDE_STATUS
      )
    ) {
      clearRide();
    }

    // Intentionally only runs on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Socket listeners.
   */
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    /*
     * ============================================================
     * PASSENGER SOCKET EVENTS
     * ============================================================
     */
    if (role === 'passenger') {
      /*
       * Driver assigned.
       *
       * Payload:
       * {
       *   rideId,
       *   driver,
       *   otp
       * }
       */
      const handleDriverAssigned = (
        payload: DriverAssignedPayload
      ) => {
        if (!payload?.rideId) {
          return;
        }

        setOtp(payload.otp);

        setCurrentRideState((prev) => ({
          ...(prev || {}),
          _id: payload.rideId,
          driver: payload.driver,
          rideStatus:
            RIDE_STATUS.DRIVER_ASSIGNED,
        } as Ride));
      };

      /*
       * Driver arriving.
       */
      const handleDriverArriving = (
        payload: { rideId?: string }
      ) => {
        setCurrentRideState((prev) => {
          if (
            !prev ||
            (payload?.rideId &&
              prev._id !== payload.rideId)
          ) {
            return prev;
          }

          return {
            ...prev,
            rideStatus:
              RIDE_STATUS.DRIVER_ARRIVING,
          };
        });
      };

      /*
       * Driver arrived.
       */
      const handleDriverArrived = (
        payload: { rideId?: string }
      ) => {
        setCurrentRideState((prev) => {
          if (
            !prev ||
            (payload?.rideId &&
              prev._id !== payload.rideId)
          ) {
            return prev;
          }

          return {
            ...prev,
            rideStatus:
              RIDE_STATUS.DRIVER_ARRIVED,
          };
        });
      };

      /*
       * Driver live location.
       */
      const handleDriverLocationUpdate = (
        payload: DriverLocationUpdatePayload
      ) => {
        if (
          !payload ||
          !Number.isFinite(payload.latitude) ||
          !Number.isFinite(payload.longitude)
        ) {
          return;
        }

        setDriverLocation({
          latitude: payload.latitude,
          longitude: payload.longitude,
          timestamp:
            payload.timestamp || Date.now(),
        });
      };

      /*
       * Ride started.
       */
      const handleRideStarted = (
        payload: { rideId?: string }
      ) => {
        setCurrentRideState((prev) => {
          if (
            !prev ||
            (payload?.rideId &&
              prev._id !== payload.rideId)
          ) {
            return prev;
          }

          return {
            ...prev,
            rideStatus:
              RIDE_STATUS.RIDE_STARTED,
          };
        });

        // OTP is no longer needed after ride starts.
        setOtp(null);
      };

      /*
       * Ride completed.
       */
      const handleRideCompleted = (
        payload: RideCompletedPayload
      ) => {
        setCurrentRideState((prev) => {
          if (
            !prev ||
            (payload?.rideId &&
              prev._id !== payload.rideId)
          ) {
            return prev;
          }

          return {
            ...prev,
            rideStatus:
              RIDE_STATUS.RIDE_COMPLETED,
            finalFare:
              payload.finalFare,
          };
        });
      };

      /*
       * Ride cancelled.
       */
      const handleRideCancelled = (
        payload: RideCancelledPayload
      ) => {
        setCurrentRideState((prev) => {
          if (
            !prev ||
            (payload?.rideId &&
              prev._id !== payload.rideId)
          ) {
            return prev;
          }

          return {
            ...prev,
            rideStatus:
              payload.cancelledBy === 'driver'
                ? RIDE_STATUS.CANCELLED_BY_DRIVER
                : RIDE_STATUS.CANCELLED_BY_PASSENGER,
            cancellationReason:
              payload.reason,
            cancelledBy:
              payload.cancelledBy,
          };
        });
      };

      /*
       * No driver found.
       */
      const handleNoDriverFound = (
        payload: { rideId?: string }
      ) => {
        if (!payload?.rideId) {
          return;
        }

        setCurrentRideState((prev) => {
          if (!prev || prev._id !== payload.rideId) {
            return prev;
          }

          return {
            ...prev,
            rideStatus:
              RIDE_STATUS.NO_DRIVER_FOUND,
          };
        });
      };

      /*
       * Payment updated.
       */
      const handlePaymentUpdated = (
        payload: PaymentUpdatedPayload
      ) => {
        if (!payload?.rideId) {
          return;
        }

        setCurrentRideState((prev) => {
          if (!prev || prev._id !== payload.rideId) {
            return prev;
          }

          return {
            ...prev,
            paymentStatus:
              payload.status,
          };
        });
      };

      socketService.on(
        'driver_assigned',
        handleDriverAssigned
      );

      socketService.on(
        'driver_arriving',
        handleDriverArriving
      );

      socketService.on(
        'driver_arrived',
        handleDriverArrived
      );

      socketService.on(
        'driver_location_update',
        handleDriverLocationUpdate
      );

      socketService.on(
        'ride_started',
        handleRideStarted
      );

      socketService.on(
        'ride_completed',
        handleRideCompleted
      );

      socketService.on(
        'ride_cancelled',
        handleRideCancelled
      );

      socketService.on(
        'no_driver_found',
        handleNoDriverFound
      );

      socketService.on(
        'payment_updated',
        handlePaymentUpdated
      );

      return () => {
        socketService.off(
          'driver_assigned',
          handleDriverAssigned
        );

        socketService.off(
          'driver_arriving',
          handleDriverArriving
        );

        socketService.off(
          'driver_arrived',
          handleDriverArrived
        );

        socketService.off(
          'driver_location_update',
          handleDriverLocationUpdate
        );

        socketService.off(
          'ride_started',
          handleRideStarted
        );

        socketService.off(
          'ride_completed',
          handleRideCompleted
        );

        socketService.off(
          'ride_cancelled',
          handleRideCancelled
        );

        socketService.off(
          'no_driver_found',
          handleNoDriverFound
        );

        socketService.off(
          'payment_updated',
          handlePaymentUpdated
        );
      };
    }

    /*
     * ============================================================
     * DRIVER SOCKET EVENTS
     * ============================================================
     */
    if (role === 'driver') {
      /*
       * Backend emits:
       *
       * io.to(`driver:${driverId}`)
       *   .emit('ride_request', payload)
       */
      const handleRideRequest = (
        payload: RideRequestSocketPayload
      ) => {
        if (!payload) {
          return;
        }

        const rideId =
          payload.rideId ||
          payload.ride?._id ||
          payload._id;

        /*
         * Never put an invalid request into state.
         */
        if (!rideId) {
          console.warn(
            '[Socket] Received ride_request without rideId',
            payload
          );

          return;
        }

        const ride =
          payload.ride;

        const normalized: RideRequestReceivedPayload =
        {
          rideId: String(rideId),

          _id: String(rideId),

          pickupAddress:
            payload.pickupAddress ||
            ride?.pickupAddress ||
            'Pickup location',

          dropAddress:
            payload.dropAddress ||
            ride?.dropAddress ||
            'Dropoff location',

          distanceKm:
            payload.distanceKm ??
            ride?.distanceKm ??
            0,

          estimatedDurationMin:
            payload.estimatedDurationMin ??
            ride?.estimatedDurationMin ??
            0,

          estimatedFare:
            payload.estimatedFare ??
            ride?.estimatedFare ??
            0,

          vehicleType:
            payload.vehicleType ||
            ride?.vehicleType ||
            'cab',

          paymentMethod:
            payload.paymentMethod ||
            ride?.paymentMethod ||
            'cash',

          stops:
            payload.stops ??
            ride?.stops ??
            [],

          stopCount:
            payload.stopCount ??
            payload.stops?.length ??
            ride?.stops?.length ??
            0,

          expiresInSeconds:
            payload.expiresInSeconds ??
            30,

          passenger:
            payload.passenger ??
            ride?.passenger,

          ride:
            ride || (payload as Ride),
        };

        console.log(
          '[Socket] Driver received ride_request:',
          normalized
        );

        /*
         * Show request in driver UI.
         */
        setIncomingRideRequest(
          normalized
        );
      };

      /*
       * Ride was accepted by another driver.
       */
      const handleRideTaken = (
        payload: { rideId?: string }
      ) => {
        if (!payload?.rideId) {
          return;
        }

        setIncomingRideRequest(
          (prev) =>
            prev?.rideId ===
              String(payload.rideId)
              ? null
              : prev
        );
      };

      /*
       * Passenger cancelled ride while searching.
       */
      const handleRideCancelled = (
        payload: RideCancelledPayload
      ) => {
        if (!payload?.rideId) {
          return;
        }

        setIncomingRideRequest(
          (prev) =>
            prev?.rideId === payload.rideId
              ? null
              : prev
        );

        setCurrentRideState((prev) =>
          prev?._id === payload.rideId
            ? {
              ...prev,
              rideStatus:
                RIDE_STATUS.CANCELLED_BY_PASSENGER,
              cancellationReason:
                payload.reason,
              cancelledBy:
                payload.cancelledBy,
            }
            : prev
        );
      };

      /*
       * Payment status.
       */
      const handlePaymentUpdated = (
        payload: PaymentUpdatedPayload
      ) => {
        if (!payload?.rideId) {
          return;
        }

        setCurrentRideState((prev) =>
          prev?._id === payload.rideId
            ? {
              ...prev,
              paymentStatus:
                payload.status,
            }
            : prev
        );
      };

      socketService.on(
        'ride_request',
        handleRideRequest
      );

      socketService.on(
        'ride_taken',
        handleRideTaken
      );

      socketService.on(
        'ride_cancelled',
        handleRideCancelled
      );

      socketService.on(
        'payment_updated',
        handlePaymentUpdated
      );

      return () => {
        socketService.off(
          'ride_request',
          handleRideRequest
        );

        socketService.off(
          'ride_taken',
          handleRideTaken
        );

        socketService.off(
          'ride_cancelled',
          handleRideCancelled
        );

        socketService.off(
          'payment_updated',
          handlePaymentUpdated
        );
      };
    }
  }, [
    isAuthenticated,
    role,
  ]);

  return (
    <RideContext.Provider
      value={{
        currentRide,
        driverLocation,
        setDriverLocation,
        otp,

        incomingRideRequest,

        pendingRequest:
          incomingRideRequest,

        setCurrentRide,

        clearRide,

        setOtp,

        dismissIncomingRequest,

        clearPendingRequest:
          dismissIncomingRequest,

        setIncomingRideRequest,

        setPendingRequest:
          setIncomingRideRequest,
      }}
    >
      {children}
    </RideContext.Provider>
  );
}

export function useRide(): RideContextValue {
  const context =
    useContext(RideContext);

  if (!context) {
    throw new Error(
      'useRide must be used within RideProvider'
    );
  }

  return context;
}