import { useState, useEffect, createContext, useContext, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// Configure global Axios settings for RouteGuardian
axios.defaults.baseURL = import.meta.env.VITE_BACKEND_URL || '';
axios.defaults.withCredentials = true;

// Request interceptor to attach X-XSRF-TOKEN header on mutating requests
axios.interceptors.request.use(
  (config) => {
    const getCookie = (name) => {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(';').shift();
      return null;
    };
    const xsrfToken = getCookie('XSRF-TOKEN');
    if (xsrfToken && ['post', 'put', 'delete', 'patch'].includes(config.method?.toLowerCase())) {
      config.headers['X-XSRF-TOKEN'] = xsrfToken;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const API = axios;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const didInitRef = useRef(false);

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

    // Clear accessible document cookies
    try {
      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });
    } catch (e) {
      console.warn("Failed to clear document cookies:", e);
    }

    // Clear all storage
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn("Failed to clear storage:", e);
    }

    clearAuthData();
    window.location.replace(window.location.origin + '/');
  }, [clearAuthData]);

  useEffect(() => {
    let isRefreshing = false;
    let failedQueue = [];

    const processQueue = (error) => {
      failedQueue.forEach((prom) => {
        if (error) {
          prom.reject(error);
        } else {
          prom.resolve();
        }
      });
      failedQueue = [];
    };

    const resInt = axios.interceptors.response.use(
      (res) => res,
      async (err) => {
        const originalRequest = err.config;
        const requestUrl = originalRequest?.url || '';
        const isProfileRequest = requestUrl.includes('/api/auth/profile');
        const isRefreshRequest = requestUrl.includes('/api/auth/refresh');

        if (err.response?.status === 429) {
          window.location.href = '/too-many-requests';
          return Promise.reject(err);
        }

        // Silent Refresh if access token expired (401)
        if (err.response?.status === 401 && !isRefreshRequest && !originalRequest._retry) {
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              failedQueue.push({ resolve, reject });
            })
              .then(() => {
                return axios(originalRequest);
              })
              .catch((err) => {
                return Promise.reject(err);
              });
          }

          originalRequest._retry = true;
          isRefreshing = true;

          try {
            console.info('[AUTH] Access token expired, attempting silent refresh...');
            const refreshRes = await axios.post('/api/auth/refresh', {});
            if (refreshRes.data?.success) {
              console.info('[AUTH] Session refreshed successfully, retrying original request.');
              processQueue(null);
              return axios(originalRequest);
            }
          } catch (refreshErr) {
            console.error('[AUTH] Silent refresh failed:', refreshErr.message);
            processQueue(refreshErr);
            clearAuthData();
            if (!isProfileRequest && window.location.pathname !== '/auth' && window.location.pathname !== '/') {
              window.location.replace('/auth');
            }
            return Promise.reject(refreshErr);
          } finally {
            isRefreshing = false;
          }
        }

        // Default 401 handling if not retrying or refresh failed
        if (err.response?.status === 401) {
          clearAuthData();
          if (isProfileRequest) {
            console.info('[AUTH] No active session');
          } else if (window.location.pathname !== '/auth' && window.location.pathname !== '/') {
            window.location.replace('/auth');
          }
        }

        return Promise.reject(err);
      }
    );

    return () => {
      axios.interceptors.response.eject(resInt);
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
    if (didInitRef.current) return;
    didInitRef.current = true;
    initAuth();
  }, [initAuth]);

  const value = useMemo(
    () => ({ user, authenticated, loading, setUser, logout }),
    [user, authenticated, loading, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};