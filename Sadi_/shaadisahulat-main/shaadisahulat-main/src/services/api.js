import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for handling common errors and providing mock data
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Mocking logic for development if backend is not available
    if (!error.response) {
      console.warn('API connection failed. Using mock logic if applicable.');
      // In a real project, we might return mock data here or handle it in hooks
    }
    return Promise.reject(error);
  }
);

export default api;
