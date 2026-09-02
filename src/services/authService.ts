import apiClient from './apiClient';
import type { User, UserPreferences, ApiResponse } from '../types';

export const authService = {
  register: (data: { username: string; password: string; email?: string }) =>
    apiClient.post<unknown, ApiResponse<{ token: string; user: User }>>('/auth/register', data),

  login: (data: { username: string; password: string }) =>
    apiClient.post<unknown, ApiResponse<{ token: string; user: User }>>('/auth/login', data),

  me: () =>
    apiClient.get<unknown, ApiResponse<User>>('/auth/me'),

  updateProfile: (data: { display_name?: string; avatar_url?: string }) =>
    apiClient.put<unknown, ApiResponse<User>>('/auth/profile', data),

  updatePassword: (data: { old_password: string; new_password: string }) =>
    apiClient.put<unknown, ApiResponse<void>>('/auth/password', data),

  getPreferences: () =>
    apiClient.get<unknown, ApiResponse<UserPreferences>>('/preferences'),

  updatePreferences: (data: Partial<UserPreferences>) =>
    apiClient.put<unknown, ApiResponse<UserPreferences>>('/preferences', data),
};
