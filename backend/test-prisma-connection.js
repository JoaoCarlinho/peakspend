// Test Prisma connection to debug DATABASE_URL issue
const { PrismaClient } = require('./src/generated/prisma');

console.log('=== Prisma Connection Diagnostic ===\n');

// Check environment variables
console.log('1. Environment Variables:');
console.log('   NODE_ENV:', process.env.NODE_ENV);
console.log('   DATABASE_URL:', process.env.DATABASE_URL);
console.log('');

// Try to create Prisma client with explicit datasource
console.log('2. Creating Prisma Client with explicit datasource...');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://supertutors:devpassword@localhost:5432/peakspend_test',
    },
  },
  log: ['query', 'info', 'warn', 'error'],
});

console.log('');
console.log('3. Attempting to connect...');

prisma.$connect()
  .then(() => {
    console.log('✓ Connection successful!');
    return prisma.$queryRaw`SELECT current_database() as db`;
  })
  .then((result) => {
    console.log('✓ Connected to database:', result);
    return prisma.user.count();
  })
  .then((count) => {
    console.log('✓ User count:', count);
  })
  .catch((error) => {
    console.error('✗ Connection failed:', error.message);
    console.error('Error details:', error);
  })
  .finally(() => {
    prisma.$disconnect();
  });
