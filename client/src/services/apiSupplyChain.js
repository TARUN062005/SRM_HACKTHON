import axios from 'axios';

const API = axios.create({ baseURL: '/api' });
// Add request interceptor for JWT insertion if needed

export const optimizeRoute = (source, destination) => API.post('/route/optimize', { source, destination });
export const createShipment = (source, destination) => API.post('/shipment', { source, destination });
export const getShipment = (id) => API.get(`/shipment/${id}`);
export const getAlerts = () => API.get('/alerts');
