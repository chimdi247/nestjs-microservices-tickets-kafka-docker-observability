'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { loginUser, registerUser } from '../api/auth';
import { useAuthStore } from '@/stores/auth-store';
import { safeRedirect } from '@/lib/format';
import type { LoginCredentials, RegisterData } from '@/types';

function redirectTarget(): string {
  if (typeof window === 'undefined') return '/';
  return safeRedirect(new URLSearchParams(window.location.search).get('redirect'));
}

export function useLogin() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: (credentials: LoginCredentials) => loginUser(credentials),
    onSuccess: (data) => {
      queryClient.clear();
      setAuth(data.user, data.accessToken);
      toast.success('Logged in successfully', {
        description: `Welcome back, ${data.user.name}.`,
      });
      router.push(redirectTarget());
    },
    onError: (error: Error) => {
      toast.error('Login failed', {
        description: error.message || 'Please try again later.',
      });
    },
  });
}

/** creates the account and signs the new user straight in */
export function useRegister() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setAuth = useAuthStore((s) => s.setAuth);

  return useMutation({
    mutationFn: async (data: RegisterData) => {
      await registerUser(data);
      return loginUser({ email: data.email, password: data.password });
    },
    onSuccess: (data) => {
      queryClient.clear();
      setAuth(data.user, data.accessToken);
      toast.success('Account created', {
        description: `You are signed in as ${data.user.email}.`,
      });
      router.push(redirectTarget());
    },
    onError: (error: Error) => {
      toast.error('Registration failed', {
        description: error.message || 'Please try again later.',
      });
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const queryClient = useQueryClient();

  const logout = () => {
    clearAuth();
    queryClient.clear();
    toast.success('Signed out');
    router.push('/login');
  };

  return { logout };
}
