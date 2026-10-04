import apiClient from './apiClient';
import { API_PATHS } from '../constants/api';
import type { User, UserPreferences, ApiResponse } from '../types';

export const authService = {
  register: (data: { username: string; password: string; email?: string }) =>
    apiClient.post<unknown, ApiResponse<{ token: string; user: User }>>(API_PATHS.authRegister, data),

  login: (data: { username: string; password: string }) =>
    apiClient.post<unknown, ApiResponse<{ token: string; user: User }>>(API_PATHS.authLogin, data),

  me: () =>
    apiClient.get<unknown, ApiResponse<User>>(API_PATHS.authMe),

  updateProfile: (data: { display_name?: string; avatar_url?: string }) =>
    apiClient.put<unknown, ApiResponse<User>>(API_PATHS.authProfile, data),

  updatePassword: (data: { old_password: string; new_password: string }) =>
    apiClient.put<unknown, ApiResponse<void>>(API_PATHS.authPassword, data),

  getPreferences: () =>
    apiClient.get<unknown, ApiResponse<UserPreferences>>(API_PATHS.preferences),

  updatePreferences: (data: Partial<UserPreferences>) =>
    apiClient.put<unknown, ApiResponse<UserPreferences>>(API_PATHS.preferences, data),
};
