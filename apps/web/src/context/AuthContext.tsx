'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, ApiError } from '@/lib/api';
import type { User } from '@/lib/types';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  mfa_required?: boolean;
  mfa_token?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<{ mfa_required: boolean; mfa_token?: string }>;
  register: (username: string, email: string, password: string, displayName: string) => Promise<void>;
  verifyMfa: (mfaToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setAuthData: (data: LoginResponse) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await api.get<User>('/users/me');
      setUser(userData);
    } catch {
      setUser(null);
      api.clearTokens();
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('beehive_access_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    async function loadUser() {
      try {
        const userData = await api.get<User>('/users/me');
        if (isMounted) setUser(userData);
      } catch {
        if (isMounted) setUser(null);
        api.clearTokens();
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadUser();
    return () => { isMounted = false; };
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const data = await api.post<LoginResponse>('/auth/login', { username, password });

      if (data.mfa_required) {
        return { mfa_required: true, mfa_token: data.mfa_token };
      }

      api.setTokens(data.access_token, data.refresh_token);
      await refreshUser();
      return { mfa_required: false };
    } catch (error: unknown) {
      // Check if MFA required is in error response
      if (error instanceof ApiError && error.status === 403 && typeof error.detail === 'object' && error.detail !== null && 'mfa_token' in error.detail) {
        const detail = error.detail as Pick<LoginResponse, 'mfa_token'>;
        return { mfa_required: true, mfa_token: detail.mfa_token };
      }
      throw error;
    }
  };

  const register = async (username: string, email: string, password: string, displayName: string) => {
    const data = await api.post<LoginResponse>('/auth/register', {
      username,
      email,
      password,
      display_name: displayName,
    });
    api.setTokens(data.access_token, data.refresh_token);
    await refreshUser();
  };

  const verifyMfa = async (mfaToken: string, code: string) => {
    const data = await api.post<LoginResponse>('/auth/mfa/verify', { mfa_token: mfaToken, code });
    api.setTokens(data.access_token, data.refresh_token);
    await refreshUser();
  };

  const setAuthData = async (data: LoginResponse) => {
    api.setTokens(data.access_token, data.refresh_token);
    await refreshUser();
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('beehive_refresh_token');
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refresh_token: refreshToken });
      }
    } catch {}
    api.clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      verifyMfa,
      logout,
      refreshUser,
      setAuthData,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

