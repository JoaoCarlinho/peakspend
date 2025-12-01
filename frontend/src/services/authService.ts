import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://rczwkm4t9i.us-east-1.awsapprunner.com';

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

/**
 * Register a new user
 * @param email - User email
 * @param password - User password
 * @param name - Optional user name
 * @returns Auth response with token and user data
 */
export async function register(
  email: string,
  password: string,
  name?: string
): Promise<AuthResponse> {
  const response = await axios.post<AuthResponse>(`${API_BASE_URL}/api/auth/register`, {
    email,
    password,
    name,
  });

  return response.data;
}

/**
 * Login user with email and password
 * @param email - User email
 * @param password - User password
 * @returns Auth response with token and user data
 */
export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await axios.post<AuthResponse>(`${API_BASE_URL}/api/auth/login`, {
    email,
    password,
  });

  return response.data;
}

/**
 * Get current authenticated user
 * @returns Current user data
 */
export async function getCurrentUser(): Promise<User> {
  const token = localStorage.getItem('auth_token');

  if (!token) {
    throw new Error('No authentication token found');
  }

  const response = await axios.get<{ user: User }>(`${API_BASE_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data.user;
}

/**
 * Logout current user
 * Clears local token and notifies backend
 */
export async function logout(): Promise<void> {
  const token = localStorage.getItem('auth_token');

  if (token) {
    try {
      // Call backend logout endpoint
      await axios.post(
        `${API_BASE_URL}/api/auth/logout`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
    } catch (error) {
      // Continue with logout even if backend call fails
      console.error('Logout API call failed:', error);
    }
  }

  // Clear local storage
  localStorage.removeItem('auth_token');
}
