import { useState } from 'react';
import { Alert, Linking } from 'react-native';

import { triggerSos } from '../services/api/rideApi';
import { parseApiError } from '../utils/formatters';

interface UseSosEmergencyProps {
  rideId: string;
  getLocation: () =>
    | { latitude: number; longitude: number }
    | null
    | undefined;
}

export function useSosEmergency({
  rideId,
  getLocation,
}: UseSosEmergencyProps) {
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosLoading, setSosLoading] = useState(false);

  async function handleConfirmSos() {
    if (!rideId) {
      Alert.alert(
        'Error',
        'Unable to identify the current ride.'
      );
      setShowSosModal(false);
      return;
    }

    setSosLoading(true);
    setShowSosModal(false);

    try {
      const loc = getLocation();

      if (
        !loc ||
        !Number.isFinite(loc.latitude) ||
        !Number.isFinite(loc.longitude)
      ) {
        throw new Error(
          'Unable to determine current location for SOS.'
        );
      }

      await triggerSos(
        rideId,
        loc.latitude,
        loc.longitude
      );

      // Try to open the emergency dialer.
      try {
        const phoneUrl = 'tel:112';
        const supported = await Linking.canOpenURL(
          phoneUrl
        );

        if (supported) {
          await Linking.openURL(phoneUrl);
        }
      } catch {
        // Do not fail the SOS flow if the dialer cannot be opened.
      }

      Alert.alert(
        '🚨 SOS Emergency Triggered',
        'Emergency alert with your current location has been sent. Please contact emergency services if required.',
        [{ text: 'OK' }]
      );
    } catch (err) {
      Alert.alert(
        'SOS Failed',
        parseApiError(err)
      );
    } finally {
      setSosLoading(false);
    }
  }

  return {
    showSosModal,
    setShowSosModal,
    sosLoading,
    handleConfirmSos,
  };
}