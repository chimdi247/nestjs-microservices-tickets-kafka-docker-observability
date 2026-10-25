import { http } from '@/lib/api-client';
import type { User, LoginCredentials, RegisterData } from '@/types';

interface LoginResponse {
  accessToken: string;
  user: User;
}

export async function loginUser(
  credentials: LoginCredentials,
): Promise<LoginResponse> {
  // the auth-service answers { access_token, user }
  const data = await http.post<{ access_token: string; user: User }>(
    '/auth/login',
    credentials,
  );

  return {
    accessToken: data.access_token,
    user: data.user,
  };
}

export async function registerUser(
  data: RegisterData,
): Promise<{ userId: string }> {
  return http.post<{ userId: string }>('/auth/register', data);
}

export async function getProfile(): Promise<User> {
  return http.get<User>('/auth/profile');
}
