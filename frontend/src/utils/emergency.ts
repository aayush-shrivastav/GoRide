import { Linking, Alert } from 'react-native';

export interface EmergencyMessageParams {
  passengerName?: string;
  passengerPhone?: string;
  driverName?: string;
  driverPhone?: string;
  vehicleNumber?: string;
  vehicleModel?: string;
  pickupAddress?: string;
  dropAddress?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Builds the official emergency WhatsApp text with live Google Maps tracking,
 * cab & driver details, and 112 Police helpline.
 */
export function buildEmergencyWhatsAppMessage({
  passengerName,
  passengerPhone,
  driverName,
  driverPhone,
  vehicleNumber,
  vehicleModel,
  pickupAddress,
  dropAddress,
  latitude,
  longitude,
}: EmergencyMessageParams): string {
  const mapsUrl =
    latitude && longitude && Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `https://maps.google.com/?q=${latitude},${longitude}`
      : '';

  const timeStr = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    `🚨 *EMERGENCY SOS ALERT - GoRide Safety* 🚨\n\n` +
    `Dear Family / Guardian,\n` +
    `*${passengerName || 'Your family member'}* (${passengerPhone || 'Passenger'}) needs *IMMEDIATE HELP* during their cab ride at ${timeStr}!\n\n` +
    (mapsUrl ? `📍 *Live GPS Location & Route:*\n${mapsUrl}\n(Coordinates: ${latitude}, ${longitude})\n\n` : '') +
    `🚖 *Cab & Driver Details:*\n` +
    `• Vehicle: ${vehicleModel || 'Cab'} - *${vehicleNumber || 'Reg. Unavailable'}*\n` +
    `• Driver: ${driverName || 'Driver'} (${driverPhone || 'N/A'})\n\n` +
    `🗺️ *Route:*\n` +
    `• Pickup: ${pickupAddress || 'N/A'}\n` +
    `• Destination: ${dropAddress || 'N/A'}\n\n` +
    `⚠️ *IMMEDIATE ACTIONS FOR PARENTS:*\n` +
    `1. Call passenger immediately: tel:${passengerPhone || ''}\n` +
    `2. Police Helpline: *112* (or *100* / *1091* for Women Safety)\n\n` +
    `_Dispatched via GoRide Safety Emergency System._`
  );
}

/**
 * Opens WhatsApp with pre-filled emergency message addressed to the specified phone,
 * or opens contact picker if no phone is specified.
 */
export async function openWhatsAppEmergencyAlert({
  phone,
  message,
}: {
  phone?: string;
  message: string;
}): Promise<boolean> {
  const encodedText = encodeURIComponent(message);
  let cleanedPhone = phone ? phone.replace(/[^\d]/g, '') : '';
  if (cleanedPhone.length === 10) {
    cleanedPhone = `91${cleanedPhone}`;
  }

  const deepLink = cleanedPhone
    ? `whatsapp://send?phone=${cleanedPhone}&text=${encodedText}`
    : `whatsapp://send?text=${encodedText}`;

  const webUrl = cleanedPhone
    ? `https://wa.me/${cleanedPhone}?text=${encodedText}`
    : `https://api.whatsapp.com/send?text=${encodedText}`;

  try {
    const supported = await Linking.canOpenURL(deepLink);
    if (supported) {
      await Linking.openURL(deepLink);
      return true;
    }
  } catch (e) {
    // deepLink failed, fallback to webUrl
  }

  try {
    await Linking.openURL(webUrl);
    return true;
  } catch (err) {
    Alert.alert(
      'Could not open WhatsApp',
      'Please ensure WhatsApp is installed on your device, or call 112 directly.'
    );
    return false;
  }
}
