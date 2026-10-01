'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { User } from '@/lib/types';

interface LoginResponse {
  access_token: string;
  refresh_token: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
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
    let isMounted = true;
    async function loadUser() {
      await Promise.resolve();
      const token = localStorage.getItem('beehive_access_token');
      if (!token) {
        if (isMounted) setIsLoading(false);
        return;
      }

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
