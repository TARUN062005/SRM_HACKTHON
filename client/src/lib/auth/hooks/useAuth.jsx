import { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// Create axios instance with base URL - empty string means relative URLs (proxied by Vite)
export const API = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL || '',
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, _setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Clears all stored auth credentials from memory and storage
  const clearAuthData = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('login_timestamp');
    _setUser(null);
  }, []);

  // Updates user state and refreshes the 3-day session timestamp
  const setUser = useCallback((userData) => {
    if (userData) {
      // Refresh the persistent timestamp whenever a user session is established
      localStorage.setItem('login_timestamp', Date.now().toString());
    }
    _setUser(userData);
  }, []);

  const logout = useCallback(() => {
    clearAuthData();
    // Use window.location for a clean redirect to the Landing Page
    window.location.href = window.location.origin + '/';
  }, [clearAuthData]);

  // Axios interceptors for global error handling and automatic token injection
  useEffect(() => {
    const reqInt = API.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    const resInt = API.interceptors.response.use(
      (res) => res,
      (err) => {
        // CASE 1: Rate Limit Exceeded (Too many attempts from this IP)
        if (err.response?.status === 429) {
          window.location.href = '/too-many-requests';
        } 
        // CASE 2: Unauthorized (Expired or invalid token)
        else if (err.response?.status === 401) {
          clearAuthData();
          window.location.href = '/auth';
        }
        return Promise.reject(err);
      }
    );

    return () => {
      API.interceptors.request.eject(reqInt);
      API.interceptors.response.eject(resInt);
    };
  }, [clearAuthData]);

  // Main session initialization logic (Restores state after tab/browser close)
  const initAuth = useCallback(async () => {
    const token = localStorage.getItem('token');
    const loginTimestamp = localStorage.getItem('login_timestamp');
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

    const isExpired = loginTimestamp && Date.now() - parseInt(loginTimestamp, 10) > THREE_DAYS_MS;

    // If no token or locally expired, stop loading and clear data
    if (!token || isExpired) {
      clearAuthData();
      setLoading(false);
      return;
    }

    try {
      // Verify the existing token with the backend profile endpoint
      // This route should be under a relaxed general rate limiter
      const res = await API.get('/api/auth/profile');
      if (res.data?.success) {
        _setUser(res.data.user);
      } else {
        clearAuthData();
      }
    } catch (e) {
      // If error isn't a rate limit, clear data to force re-login
      if (e.response?.status !== 429) {
        console.error('Session verification failed:', e);
        clearAuthData();
      }
    } finally {
      setLoading(false); // UI blocks until this check finishes
    }
  }, [clearAuthData]);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const value = useMemo(
    () => ({ user, loading, setUser, logout }),
    [user, loading, setUser, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};