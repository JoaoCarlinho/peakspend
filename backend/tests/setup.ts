/**
 * Jest setup file for tests
 */

// Set test environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://supertutors:devpassword@localhost:5432/peakspend_test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.AWS_REGION = 'us-east-1';
process.env.S3_BUCKET_NAME = 'test-bucket';

// Ensure OCR mock is used in tests (clear any AWS credentials)
process.env.AWS_ACCESS_KEY_ID = '';
process.env.AWS_SECRET_ACCESS_KEY = '';

// Alert configuration for tests
process.env.ALERT_WEBHOOK_URL = 'https://test.example.com/webhook';
process.env.ALERT_WEBHOOK_AUTH = 'Bearer test-token';
process.env.ALERT_EMAIL_PRIMARY = 'test@example.com';
process.env.SMTP_HOST = 'smtp.test.example.com';
process.env.SMTP_USER = 'test-user';
process.env.SMTP_PASS = 'test-pass';

// Extend Jest timeout for integration tests
jest.setTimeout(10000);

// Log the DATABASE_URL being used (without password for security)
const dbUrl = process.env.DATABASE_URL || '';
const sanitizedUrl = dbUrl.replace(/:([^@]+)@/, ':****@');
console.log(`Test DATABASE_URL: ${sanitizedUrl}`);
