import axios from 'axios';

const BACKEND = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/+$/, '');
const API_URL = `${BACKEND}/api/auth`;

const authService = {
  startOAuth(provider) {
    window.location.assign(`${API_URL}/${provider}`);
  },

  async login(email, password, rememberMe) {
    return await axios.post(`${API_URL}/login`, { email, password, rememberMe }, { withCredentials: true });
  },

  async register(email, password, name) {
    return await axios.post(`${API_URL}/register`, { email, password, name }, { withCredentials: true });
  },

  async verifyEmail(email, code) {
    return await axios.post(`${API_URL}/verify-email`, { email, code }, { withCredentials: true });
  },

  async forgotPassword(email) {
    return await axios.post(`${API_URL}/forgot-password`, { email }, { withCredentials: true });
  },

  async resetPassword(email, code, newPassword) {
    return await axios.post(`${API_URL}/reset-password`, { email, code, newPassword }, { withCredentials: true });
  },

  async logout() {
    await axios.post(`${API_URL}/logout`, {}, { withCredentials: true });
  },
};

export default authService;