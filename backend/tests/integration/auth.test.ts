import request from 'supertest';
import { PrismaClient } from '../../src/generated/prisma/client';
import app from '../../src/app';

const prisma = new PrismaClient();

describe('Authentication Integration Tests', () => {
  const testUser = {
    email: 'test@example.com',
    password: 'testpassword123',
    name: 'Test User',
  };

  beforeEach(async () => {
    // Clean up test user before each test
    await prisma.user.deleteMany({
      where: { email: testUser.email },
    });
  });

  afterAll(async () => {
    // Clean up after all tests
    await prisma.user.deleteMany({
      where: { email: testUser.email },
    });
    await prisma.$disconnect();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully (AC-1)', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: testUser.email,
          password: testUser.password,
          name: testUser.name,
        })
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.name).toBe(testUser.name);
      expect(response.body.user).not.toHaveProperty('passwordHash');

      // Verify JWT token is valid
      expect(response.body.token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    });

    it('should hash password with bcrypt (AC-1)', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: testUser.email,
          password: testUser.password,
          name: testUser.name,
        })
        .expect(201);

      // Verify password is hashed in database
      const user = await prisma.user.findUnique({
        where: { email: testUser.email },
      });

      expect(user).not.toBeNull();
      expect(user?.passwordHash).not.toBe(testUser.password);
      expect(user?.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt hash format
    });

    it('should return 400 for invalid email format (AC-1)', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: testUser.password,
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should return 400 for password less than 8 characters (AC-1)', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: testUser.email,
          password: 'short',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should return 409 if email already exists (AC-1)', async () => {
      // Register first time
      await request(app)
        .post('/api/auth/register')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(201);

      // Try to register again with same email
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(409);

      expect(response.body).toHaveProperty('error', 'EMAIL_EXISTS');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Register a user for login tests
      await request(app).post('/api/auth/register').send({
        email: testUser.email,
        password: testUser.password,
        name: testUser.name,
      });
    });

    it('should login successfully with valid credentials (AC-2)', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user).not.toHaveProperty('passwordHash');

      // Verify JWT token format
      expect(response.body.token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    });

    it('should return 401 for invalid password (AC-2)', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body).toHaveProperty('message', 'Invalid credentials');
    });

    it('should return 401 for non-existent email (AC-2)', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testUser.password,
        })
        .expect(401);

      expect(response.body).toHaveProperty('message', 'Invalid credentials');
    });

    it('should return 400 for missing credentials (AC-2)', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);
    });
  });

  describe('GET /api/auth/me', () => {
    let authToken: string;

    beforeEach(async () => {
      // Register and login to get token
      const response = await request(app).post('/api/auth/register').send({
        email: testUser.email,
        password: testUser.password,
        name: testUser.name,
      });
      authToken = response.body.token;
    });

    it('should return current user with valid token (AC-3, AC-4)', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user.name).toBe(testUser.name);
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('createdAt');
      expect(response.body.user).not.toHaveProperty('passwordHash');
    });

    it('should return 401 for missing token (AC-3)', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'AUTH_TOKEN_REQUIRED');
    });

    it('should return 401 for invalid token (AC-3)', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);

      expect(response.body).toHaveProperty('error', 'AUTH_TOKEN_INVALID');
    });

    it('should return 401 for malformed Authorization header (AC-3)', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', authToken) // Missing "Bearer " prefix
        .expect(401);

      expect(response.body).toHaveProperty('error', 'AUTH_TOKEN_REQUIRED');
    });
  });

  describe('JWT Token Validation', () => {
    it('should include userId and email in JWT payload (AC-2)', async () => {
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      const token = registerResponse.body.token;
      const userId = registerResponse.body.user.id;

      // Verify token works and returns correct user
      const meResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(meResponse.body.user.id).toBe(userId);
      expect(meResponse.body.user.email).toBe(testUser.email);
    });
  });

  describe('Password Security', () => {
    it('should never return password in any API response (AC-6)', async () => {
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(registerResponse.body.user).not.toHaveProperty('password');
      expect(registerResponse.body.user).not.toHaveProperty('passwordHash');

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(loginResponse.body.user).not.toHaveProperty('password');
      expect(loginResponse.body.user).not.toHaveProperty('passwordHash');

      const meResponse = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${registerResponse.body.token}`);

      expect(meResponse.body.user).not.toHaveProperty('password');
      expect(meResponse.body.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('Database Constraints', () => {
    it('should enforce unique email constraint (AC-5)', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(201);

      // Attempt to register with same email should fail
      await request(app)
        .post('/api/auth/register')
        .send({
          email: testUser.email,
          password: 'different-password',
        })
        .expect(409);
    });
  });
});
