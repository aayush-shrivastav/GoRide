import { apiClient } from './apiClient';
import { Passenger, AuthResponse, LoginData, RegisterData } from '../../types/auth.types';

export async function loginPassenger(data: LoginData): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/login', data);
  return response.data;
}

export async function registerPassenger(data: RegisterData): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/register', data);
  return response.data;
}

export async function getProfile(): Promise<{ user: Passenger }> {
  const response = await apiClient.get('/auth/me');
  // Backend: { success, message, data: { user } }
  return response.data.data || response.data;
}

export async function updateProfile(data: any): Promise<{ user: any }> {
  const response = await apiClient.patch('/auth/profile', data);
  // The API wraps successful responses in { success, message, data }.
  return response.data.data || response.data;
}

export async function forgotPassword(email: string): Promise<{ devOtp?: string }> {
  const response = await apiClient.post('/auth/forgot-password', { email });
  return response.data.data || {};
}

export async function resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/reset-password', { email, otp, newPassword });
}

export async function changePassword(data: any): Promise<void> {
  await apiClient.patch('/auth/change-password', data);
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}

export const getMe = getProfile;
export const logoutPassenger = logout;

export interface EmergencyContact {
  _id: string;
  name: string;
  phone: string;
  email?: string;
}

export async function getEmergencyContacts(): Promise<{ contacts: Array<EmergencyContact> }> {
  const response = await apiClient.get('/auth/emergency-contacts');
  return response.data.data;
}

export async function addEmergencyContact(data: { name: string; phone: string; email?: string }): Promise<{ contacts: Array<EmergencyContact> }> {
  const response = await apiClient.post('/auth/emergency-contacts', data);
  return response.data.data;
}

export async function deleteEmergencyContact(contactId: string): Promise<{ contacts: Array<EmergencyContact> }> {
  const response = await apiClient.delete(`/auth/emergency-contacts/${contactId}`);
  return response.data.data;
}

export function clearTokens() {
  // A helper function to export to apiClient without circular dependency
}
