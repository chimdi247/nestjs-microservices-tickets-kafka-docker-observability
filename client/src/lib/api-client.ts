import axios from 'axios';
import { useAuthStore } from '@/stores/auth-store';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

apiClient.interceptors.response.use(
  (response) => {
    // the gateway wraps every payload as { success, data, meta }
    return response.data.data;
  },
  (error) => {
    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      const firstDetail = Array.isArray(apiError.details)
        ? apiError.details.find((d: unknown) => typeof d === 'string')
        : undefined;
      error.message = firstDetail || apiError.message || 'An error occurred';
      error.code = apiError.code || error.code;
      error.details = apiError.details || null;
    } else if (!error.response) {
      error.message =
        'Cannot reach the server. Check your connection and try again.';
    }

    // expired / invalid token: drop the session and send the user to the login page
    const url: string = error.config?.url ?? '';
    if (
      error.response?.status === 401 &&
      typeof window !== 'undefined' &&
      useAuthStore.getState().accessToken &&
      !url.startsWith('/auth/login')
    ) {
      useAuthStore.getState().clearAuth();
      const here = window.location.pathname + window.location.search;
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign(`/login?redirect=${encodeURIComponent(here)}`);
      }
    }

    return Promise.reject(error);
  },
);

/** typed helpers: the response interceptor already unwraps `{ data }` */
export const http = {
  get: async <T>(url: string): Promise<T> =>
    (await apiClient.get(url)) as unknown as T,
  post: async <T>(url: string, body?: unknown): Promise<T> =>
    (await apiClient.post(url, body)) as unknown as T,
  put: async <T>(url: string, body?: unknown): Promise<T> =>
    (await apiClient.put(url, body)) as unknown as T,
};
