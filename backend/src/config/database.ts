import { PrismaClient } from '../generated/prisma/client';

/**
 * Database connection singleton using Prisma Client
 *
 * Implements connection pooling and ensures single instance across application
 * Per AC-6: Prisma connection with singleton pattern for efficiency
 */
let prisma: PrismaClient;

/**
 * Get or create Prisma client instance
 *
 * Uses singleton pattern to prevent multiple connections
 * Configures connection pooling automatically via DATABASE_URL
 *
 * @returns {PrismaClient} Prisma client instance
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log:
        process.env['NODE_ENV'] === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['warn', 'error'],
    });

    // Handle graceful shutdown
    process.on('beforeExit', () => {
      void prisma.$disconnect();
    });
  }

  return prisma;
}

/**
 * Test database connection
 *
 * @returns {Promise<boolean>} True if connection successful
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = getPrismaClient();
    await client.$connect();
    console.warn('✓ Database connection successful');
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    return false;
  }
}

/**
 * Disconnect from database
 *
 * Should be called on application shutdown
 */
export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    console.warn('✓ Database disconnected');
  }
}

// Export default instance for convenience
export default getPrismaClient();
