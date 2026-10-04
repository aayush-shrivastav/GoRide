import { apiClient } from './apiClient';
import { Driver, AuthResponse, LoginData } from '../../types/auth.types';

export async function loginDriver(data: LoginData): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/drivers/login', data);
  return response.data;
}

export async function registerDriver(data: any): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/drivers/register', data);
  return response.data;
}

export async function toggleDriverStatus(isOnline: boolean): Promise<{ message: string }> {
  const endpoint = isOnline ? '/drivers/online' : '/drivers/offline';
  const response = await apiClient.post(endpoint);
  return response.data;
}

export async function getDriverStatus(): Promise<{ isOnline: boolean; isAvailable: boolean }> {
  const response = await apiClient.get('/drivers/status');
  return response.data.data;
}

export async function updateDriverLocation(latitude: number, longitude: number): Promise<void> {
  await apiClient.patch('/drivers/location', {
    latitude,
    longitude,
  });
}

export async function rejectRide(rideId: string): Promise<void> {
  await apiClient.post(`/rides/${rideId}/reject`);
}

export async function getDriverProfile(): Promise<{ driver: Driver }> {
  const response = await apiClient.get('/drivers/profile');
  // Backend: { success, message, data: { driver } }
  return response.data.data || response.data;
}

export async function updateDriverProfile(data: Partial<Driver>): Promise<{ driver: Driver }> {
  const response = await apiClient.patch('/drivers/profile', data);
  // Keep the client contract aligned with the backend response envelope.
  return response.data.data || response.data;
}

export async function getTodayEarnings(): Promise<{ earnings: number; ridesCount: number }> {
  const response = await apiClient.get('/rides/driver/earnings/today');
  return response.data.data;
}

export async function getDriverPendingRequest(): Promise<any> {
  const response = await apiClient.get('/rides/driver/pending-request');
  return response.data?.data?.pendingRequest || null;
}

export async function logoutDriver(): Promise<void> {
  await apiClient.post('/drivers/logout');
}
