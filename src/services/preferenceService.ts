import apiClient from './apiClient';

export interface UserPreferences {
  id: string;
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  onboarding_completed: number;
  default_text_model: string | null;
  default_image_model: string | null;
  default_video_model: string | null;
  default_audio_model: string | null;
  default_vision_model: string | null;
  preferences: string | null;
  created_at: string;
  updated_at: string;
}

export const preferenceService = {
  get: () => apiClient.get<unknown, { success: boolean; data: UserPreferences }>('/preferences'),
  update: (data: Partial<UserPreferences>) =>
    apiClient.put<unknown, { success: boolean; data: UserPreferences }>('/preferences', data),
};
