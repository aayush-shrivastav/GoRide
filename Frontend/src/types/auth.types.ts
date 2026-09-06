export interface Passenger {
  _id: string;
  name: string;
  email: string;
  phone: string;
  profileImage?: string;
  rating?: number;
  ratingCount?: number;
  gender?: string;
  isOnline?: boolean;
  vehicleType?: string;
  vehicleModel?: string;
  vehicleNumber?: string;
  licenseNumber?: string;
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
}
