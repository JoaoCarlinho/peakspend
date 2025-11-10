import { Request, Response } from 'express';
import { register, login, getCurrentUser } from '../services/auth.service';

/**
 * POST /api/auth/register
 * Register a new user with email and password
 */
export async function registerHandler(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      res.status(400).json({
        message: 'Email and password are required',
        error: 'VALIDATION_ERROR',
      });
      return;
    }

    const result = await register({ email, password, name });

    res.status(201).json(result);
  } catch (error) {
    const err = error as Error & { statusCode?: number };
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      message: err.message || 'Registration failed',
      error: statusCode === 409 ? 'EMAIL_EXISTS' : 'REGISTRATION_ERROR',
    });
  }
}

/**
 * POST /api/auth/login
 * Login user with email and password
 */
export async function loginHandler(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        message: 'Email and password are required',
        error: 'VALIDATION_ERROR',
      });
      return;
    }

    const result = await login({ email, password });

    res.status(200).json(result);
  } catch (error) {
    const err = error as Error & { statusCode?: number };
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      message: err.message || 'Login failed',
      error: 'LOGIN_ERROR',
    });
  }
}

/**
 * POST /api/auth/logout
 * Logout user (JWT is stateless, so this is mainly for client-side token clearing)
 */
export async function logoutHandler(_req: Request, res: Response): Promise<void> {
  // Since we're using stateless JWT, logout is handled client-side
  // This endpoint exists for consistency and potential future server-side session management
  res.status(200).json({
    message: 'Logged out successfully',
  });
}

/**
 * GET /api/auth/me
 * Get current authenticated user (protected route)
 */
export async function getMeHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.userId;

    if (!userId) {
      res.status(401).json({
        message: 'Unauthorized',
        error: 'AUTH_REQUIRED',
      });
      return;
    }

    const user = await getCurrentUser(userId);

    res.status(200).json({ user });
  } catch (error) {
    const err = error as Error & { statusCode?: number };
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      message: err.message || 'Failed to get user',
      error: 'GET_USER_ERROR',
    });
  }
}
