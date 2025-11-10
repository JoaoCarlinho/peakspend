import request from 'supertest';
import app from '../src/app';
import { PrismaClient } from '../src/generated/prisma/client';

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

  beforeAll(async () => {
    await prisma.$connect();

    const user = await prisma.user.create({
      data: {
        email: `simple-test-${Date.now()}@example.com`,
        passwordHash: 'testpassword',
        name: 'Simple Test User',
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } });
    }
    await prisma.$disconnect();
  });

  it('should access health endpoint', async () => {
    const response = await request(app)
      .set('x-user-id', testUserId)
      .get('/health')
      .expect(200);

    expect(response.body).toHaveProperty('status', 'ok');
  });

  it('should list categories', async () => {
    const response = await request(app)
      .set('x-user-id', testUserId)
      .get('/api/categories')
      .expect(200);

    expect(response.body).toHaveProperty('categories');
  });
});
