import axios from 'axios';

const BACKEND = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/+$/, '');
const API_URL = `${BACKEND}/api/auth`;

const authService = {
  startOAuth(provider) {
    window.location.assign(`${API_URL}/${provider}`);
  },

  async logout() {
    await axios.post(`${API_URL}/logout`, {}, { withCredentials: true });
  },
};

export default authService;