import bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client';
import { signToken } from '../utils/jwt.utils';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: Date;
  };
}

/**
 * Validates email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates password strength (min 8 characters)
 */
function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

/**
 * Register a new user with email and password
 * @param input - Registration data
 * @returns JWT token and user data
 * @throws Error if validation fails or email exists
 */
export async function register(input: RegisterInput): Promise<AuthResponse> {
  const { email, password, name } = input;

  // Validate email format
  if (!isValidEmail(email)) {
    const error: Error & { statusCode?: number } = new Error('Invalid email format');
    error.statusCode = 400;
    throw error;
  }

  // Validate password strength
  if (!isValidPassword(password)) {
    const error: Error & { statusCode?: number } = new Error(
      'Password must be at least 8 characters'
    );
    error.statusCode = 400;
    throw error;
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    const error: Error & { statusCode?: number } = new Error(
      'Email already registered'
    );
    error.statusCode = 409;
    throw error;
  }

  // Hash password with bcrypt (salt rounds 12)
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Create user in database with default consent
  const now = new Date();
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: name || null,
      // Set consent defaults - terms must be accepted during registration
      termsAcceptedAt: now,
      termsVersion: '1.0.0',
      privacyPolicyAcceptedAt: now,
      privacyPolicyVersion: '1.0.0',
      marketingConsent: false,
      analyticsConsent: true,
      mlTrainingConsent: true,
    },
  });

  // Generate JWT token (24h expiration)
  const token = signToken({
    userId: user.id,
    email: user.email,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
  };
}

/**
 * Login user with email and password
 * @param input - Login credentials
 * @returns JWT token and user data
 * @throws Error if credentials are invalid
 */
export async function login(input: LoginInput): Promise<AuthResponse> {
  const { email, password } = input;

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    const error: Error & { statusCode?: number } = new Error(
      'Invalid credentials'
    );
    error.statusCode = 401;
    throw error;
  }

  // Verify password with bcrypt
  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    const error: Error & { statusCode?: number } = new Error(
      'Invalid credentials'
    );
    error.statusCode = 401;
    throw error;
  }

  // Generate JWT token (24h expiration)
  const token = signToken({
    userId: user.id,
    email: user.email,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
  };
}

/**
 * Get user by ID (for /me endpoint)
 * @param userId - User ID from JWT
 * @returns User data without password
 * @throws Error if user not found
 */
export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    const error: Error & { statusCode?: number } = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return user;
}
