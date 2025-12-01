import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://rczwkm4t9i.us-east-1.awsapprunner.com/';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add JWT auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling and auto-logout on 401
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log error details for debugging
    if (error.response) {
      console.error('API Error:', {
        status: error.response.status,
        data: error.response.data,
        url: error.config?.url,
        method: error.config?.method,
      });
      // Log validation errors separately for clarity
      if (error.response.data?.errors) {
        console.error('Validation Errors:', error.response.data.errors);
      }
    }

    if (error.response?.status === 401) {
      // Clear token and redirect to login on unauthorized
      localStorage.removeItem('auth_token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
