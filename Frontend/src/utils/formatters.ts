import { VehicleType } from '../constants/enums';

export function formatFare(amount?: number): string {
  if (amount === undefined) return '₹0.00';
  return `₹${amount.toFixed(2)}`;
}

export function formatDistance(meters?: number): string {
  if (meters === undefined) return '0 km';
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds?: number): string {
  if (seconds === undefined) return '0 min';
  const mins = Math.round(seconds / 60);
  if (mins > 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  }
  return `${mins} min`;
}

export function formatDateTime(isoString?: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getVehicleLabel(type?: VehicleType | string): string {
  switch (type) {
    case VehicleType.BIKE:
    case 'bike':
      return 'Bike';
    case VehicleType.AUTO:
    case 'auto':
      return 'Auto Rickshaw';
    case VehicleType.CAR:
    case 'car':
      return 'Cab / Car';
    case VehicleType.SUV:
    case 'suv':
      return 'SUV (XL)';
    default:
      return (type as string) || 'Unknown';
  }
}

export function parseApiError(error: any): string {
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  if (error.message) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

export function truncateAddress(address?: string, maxLength: number = 30): string {
  if (!address) return '';
  if (address.length <= maxLength) return address;
  return `${address.substring(0, maxLength)}...`;
}

export function getRideStatusLabel(status?: string): string {
  if (!status) return 'Unknown';
  return status.replace(/_/g, ' ');
}

export function getRideStatusColor(status?: string): string {
  switch (status) {
    case 'RIDE_COMPLETED':
      return '#10B981';
    case 'CANCELLED_BY_PASSENGER':
    case 'CANCELLED_BY_DRIVER':
    case 'NO_DRIVER_FOUND':
      return '#EF4444';
    case 'RIDE_STARTED':
    case 'DRIVER_ARRIVED':
    case 'DRIVER_ARRIVING':
      return '#F59E0B';
    default:
      return '#6B7280';
  }
}

export function getInitials(name?: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/** Alias for RideDetailScreen and other components */
export const formatDate = formatDateTime;
export const formatCurrency = formatFare;
