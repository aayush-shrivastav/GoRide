export interface Passenger {
  _id: string;
  name: string;
  email: string;
  phone: string;
  profileImage?: string;
  rating?: number;
  ratingCount?: number;
  gender?: string;
  preferredPaymentMethod?: 'cash' | 'online';
  safetyPreferences?: { shareTripStatus?: boolean; sosConfirmation?: boolean };
  preferences?: { language?: string; notificationsEnabled?: boolean; communicationPreference?: 'push' | 'sms' | 'email' };
  isOnline?: boolean;
  vehicleType?: string;
  vehicleModel?: string;
  vehicleNumber?: string;
  licenseNumber?: string;
  emergencyContacts?: Array<{
    _id?: string;
    name: string;
    phone: string;
    email?: string;
  }>;
}

export type User = Passenger;

export interface Driver {
  _id: string;
  name: string;
  email: string;
  phone: string;
  profileImage?: string;
  gender?: string;
  vehicleType: string;
  vehicleModel: string;
  vehicleNumber: string;
  licenseNumber: string;
  licenseExpiryDate?: string;
  vehicleMake?: string;
  vehicleColor?: string;
  vehicleRegistrationDetails?: string;
  documents?: {
    drivingLicense?: string;
    registrationCertificate?: string;
    insurance?: string;
    permit?: string;
    pollutionCertificate?: string;
    other?: string;
    verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED';
  };
  emergencyContacts?: Array<{ name: string; phone: string; email?: string }>;
  safetyPreferences?: { shareTripStatus?: boolean; sosConfirmation?: boolean };
  preferences?: { language?: string; notificationsEnabled?: boolean; communicationPreference?: 'push' | 'sms' | 'email' };
  isOnline: boolean;
  isAvailable: boolean;
  currentLocation?: {
    type: string;
    coordinates: number[]; // [longitude, latitude]
  };
  rating?: number;
  ratingCount?: number;
}

export interface AuthResponse {
  message?: string;
  user?: Passenger;
  driver?: Driver;
  accessToken?: string;
  refreshToken?: string;
  data?: {
    user?: Passenger;
    driver?: Driver;
    accessToken: string;
    refreshToken: string;
  };
}

export interface LoginData {
  phone?: string;
  email?: string;
  password?: string;
}

export interface RegisterData {
  name: string;
  email: string;
  phone: string;
  password?: string;
  gender?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactEmail?: string;
}

