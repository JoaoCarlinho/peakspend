import request from 'supertest';
import app from '../src/app';
import { PrismaClient } from '../src/generated/prisma/client';
import { signToken } from '../src/utils/jwt.utils';

// Ensure DATABASE_URL is set for test database
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://supertutors:devpassword@localhost:5432/peakspend_test';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

describe('Simple Test', () => {
  let testUserId: string;
  let testUserEmail: string;
  let authToken: string;

  beforeAll(async () => {
    await prisma.$connect();

    testUserEmail = `simple-test-${Date.now()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email: testUserEmail,
        passwordHash: 'testpassword',
        name: 'Simple Test User',
      },
    });
    testUserId = user.id;

    // Generate JWT token for authentication
    authToken = signToken({
      userId: testUserId,
      email: testUserEmail,
    });
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } });
    }
    await prisma.$disconnect();
  });

  it('should access health endpoint', async () => {
    const response = await request(app)
      .get('/health')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('status', 'healthy');
  });

  it('should list categories', async () => {
    const response = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('categories');
  });
});
