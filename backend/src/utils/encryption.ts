import * as crypto from 'crypto';
import logger from '../config/logger';

/**
 * Encryption Utility - Secure Implementation
 *
 * Provides AES-256-GCM encryption for sensitive data at rest.
 * Uses a secure key from environment variable.
 *
 * Security Controls:
 * - AES-256-GCM authenticated encryption
 * - Random IV for each encryption
 * - Auth tag verification on decryption
 * - Key stored in environment variable
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get encryption key from environment
 * SECURE: Key must be set in environment, no hardcoded fallback
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env['ENCRYPTION_KEY'];

  if (!keyHex) {
    logger.error('ENCRYPTION_KEY environment variable not set');
    throw new Error('Encryption key not configured. Set ENCRYPTION_KEY environment variable.');
  }

  // Key should be 32 bytes (64 hex characters) for AES-256
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    logger.error('Invalid encryption key length', { expected: 32, actual: key.length });
    throw new Error('Invalid encryption key. Must be 32 bytes (64 hex characters).');
  }

  return key;
}

/**
 * Encrypt data using AES-256-GCM
 * Returns base64 encoded string: iv + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt empty value');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Combine: IV (16 bytes) + Auth Tag (16 bytes) + Ciphertext
  const combined = Buffer.concat([
    iv,
    authTag,
    Buffer.from(encrypted, 'hex'),
  ]);

  return combined.toString('base64');
}

/**
 * Decrypt data encrypted with encrypt()
 * Expects base64 encoded string: iv + authTag + ciphertext
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) {
    throw new Error('Cannot decrypt empty value');
  }

  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, 'base64');

  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid encrypted data format');
  }

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext.toString('hex'), 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Hash sensitive data for comparison without decryption
 * Uses SHA-256 with a secret pepper
 */
export function hashSensitive(data: string): string {
  const pepper = process.env['HASH_PEPPER'] || 'default-pepper-change-in-production';
  return crypto
    .createHash('sha256')
    .update(pepper + data)
    .digest('hex');
}

/**
 * Mask sensitive data for display
 * Shows only last N digits, masks the rest
 */
export function maskSensitive(data: string, showLast = 4): string {
  if (data.length <= showLast) {
    return '*'.repeat(data.length);
  }
  const masked = '*'.repeat(data.length - showLast);
  const visible = data.slice(-showLast);
  return masked + visible;
}

/**
 * Generate a secure random encryption key
 * For initial setup only - returns hex string
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Validate credit card number using Luhn algorithm
 */
export function isValidLuhn(number: string): boolean {
  const digits = number.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i] || '0', 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Detect card type from number
 */
export function detectCardType(number: string): string {
  const digits = number.replace(/\D/g, '');

  if (/^4/.test(digits)) return 'visa';
  if (/^5[1-5]/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^6(?:011|5)/.test(digits)) return 'discover';

  return 'unknown';
}

export const encryption = {
  encrypt,
  decrypt,
  hashSensitive,
  maskSensitive,
  generateEncryptionKey,
  isValidLuhn,
  detectCardType,
};
