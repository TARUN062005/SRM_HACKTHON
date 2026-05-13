import { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL || '',
  withCredentials: true,
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  const clearAuthData = useCallback(() => {
    setUser(null);
    setAuthenticated(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await API.post('/api/auth/logout');
    } catch {
      // Local sign-out should still proceed even if backend logout fails.
    }
    clearAuthData();
    window.location.href = window.location.origin + '/';
  }, [clearAuthData]);

  useEffect(() => {
    const resInt = API.interceptors.response.use(
      (res) => res,
      (err) => {
        const requestUrl = err.config?.url || '';
        const isProfileRequest = requestUrl.includes('/api/auth/profile');

        if (err.response?.status === 429) {
          window.location.href = '/too-many-requests';
        } else if (err.response?.status === 401) {
          clearAuthData();
          if (isProfileRequest) {
            console.info('[AUTH] No active session');
          } else if (window.location.pathname !== '/auth') {
            window.location.replace('/auth');
          }
        }
        return Promise.reject(err);
      }
    );

    return () => {
      API.interceptors.response.eject(resInt);
    };
  }, [clearAuthData]);

  const initAuth = useCallback(async () => {
    console.info('[AUTH] Session restore started');
    try {
      const res = await API.get('/api/auth/profile');
      if (res.data?.success) {
        setUser(res.data.user);
        setAuthenticated(true);
        console.info('[AUTH] Session restored');
      } else {
        clearAuthData();
      }
    } catch (e) {
      if (e.response?.status === 401) {
        clearAuthData();
      } else if (e.response?.status !== 429) {
        clearAuthData();
      }
    } finally {
      setLoading(false);
    }
  }, [clearAuthData]);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const value = useMemo(
    () => ({ user, authenticated, loading, setUser, logout }),
    [user, authenticated, loading, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};