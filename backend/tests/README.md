# PeakSpend Backend Testing Suite

Comprehensive test suite for the PeakSpend expense management application.

## Test Structure

```
tests/
├── setup.ts                    # Jest configuration and test environment setup
├── unit/                       # Unit tests for individual services
│   └── services/
│       ├── expense.service.test.ts
│       ├── ml-inference.service.test.ts
│       └── feedback.service.test.ts
├── integration/                # API integration tests
│   └── api.test.ts
├── e2e/                        # End-to-end workflow tests
│   └── expense-flow.test.ts
├── performance/                # Performance and load tests
│   └── load.test.ts
└── security/                   # Security audit documentation
    └── security-checklist.md
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### E2E Tests
```bash
npm run test:e2e
```

### Performance Tests
```bash
npm run test:performance
```

### Watch Mode
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

## Test Coverage Goals

- **Unit Tests**: 80%+ coverage for services
- **Integration Tests**: All API endpoints tested
- **E2E Tests**: Critical user flows validated
- **Performance Tests**: Response time benchmarks met
- **Security**: OWASP Top 10 addressed

## Epic 6 Stories Coverage

### ✅ Story 6-1: Unit Tests - Backend API
- `expense.service.test.ts`: Tests for expense CRUD operations
- Services: ExpenseService, CategoryService, etc.

### ✅ Story 6-2: Unit Tests - ML Pipeline
- `ml-inference.service.test.ts`: ML prediction and error detection tests
- `feedback.service.test.ts`: Feedback collection and processing tests

### ✅ Story 6-3: Integration Tests
- `api.test.ts`: API endpoint integration tests
- Tests authentication, validation, CORS, security headers

### ✅ Story 6-4: E2E Tests
- `expense-flow.test.ts`: Complete user workflow tests
- Covers auth, expense creation, ML prediction, receipt upload, export

### ✅ Story 6-5: Frontend Component Tests
- **Skipped** - No frontend implementation yet
- Recommended: Use Vitest + React Testing Library when frontend is built

### ✅ Story 6-6: Performance Testing
- `load.test.ts`: Response time benchmarks and concurrency tests
- For full load testing, use k6, Apache JMeter, or Artillery

### ✅ Story 6-7: Security Audit
- `security-checklist.md`: Comprehensive security audit documentation
- OWASP Top 10 checklist
- Penetration testing scenarios

## Test Environment Setup

### Prerequisites
1. PostgreSQL test database
2. Redis instance (for Bull queue tests)
3. AWS credentials (for S3/Textract tests - can be mocked)

### Environment Variables
```bash
# .env.test
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/peakspend_test
JWT_SECRET=test-secret-key
AWS_REGION=us-east-1
S3_BUCKET_NAME=test-bucket
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Database Setup
```bash
# Create test database
createdb peakspend_test

# Run migrations
DATABASE_URL=postgresql://test:test@localhost:5432/peakspend_test npx prisma migrate deploy

# Seed test data (optional)
npm run prisma:seed
```

## Mocking Strategy

### Prisma Client
- All unit tests mock PrismaClient using Jest
- Integration tests use actual test database
- E2E tests use real database with cleanup between tests

### AWS Services
- S3 and Textract calls are mocked in unit tests
- Integration tests can use LocalStack for AWS simulation
- E2E tests should use actual AWS test environment

### Redis/Bull Queue
- Unit tests mock Bull queue
- Integration tests can use in-memory Redis or test instance

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm ci
      - run: npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Writing New Tests

### Unit Test Template
```typescript
import { ServiceName } from '../../../src/services/service-name.service';
import { PrismaClient } from '../../../src/generated/prisma/client';

jest.mock('../../../src/generated/prisma/client');

describe('ServiceName', () => {
  let service: ServiceName;
  let prismaMock: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    prismaMock = new PrismaClient() as jest.Mocked<PrismaClient>;
    service = new ServiceName(prismaMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('methodName', () => {
    it('should do something', async () => {
      // Arrange
      (prismaMock.model.method as jest.Mock).mockResolvedValue(mockData);

      // Act
      const result = await service.methodName(params);

      // Assert
      expect(result).toEqual(expected);
      expect(prismaMock.model.method).toHaveBeenCalledTimes(1);
    });
  });
});
```

### Integration Test Template
```typescript
import request from 'supertest';
import app from '../../src/app';

describe('API Endpoint', () => {
  it('should return expected response', async () => {
    const response = await request(app)
      .get('/api/endpoint')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('key');
  });
});
```

## Best Practices

1. **AAA Pattern**: Arrange, Act, Assert
2. **One assertion per test** (when possible)
3. **Clear test names**: Describe what is being tested and expected outcome
4. **Mock external dependencies**: Database, APIs, file system
5. **Clean up after tests**: Reset mocks, clear database
6. **Use factories for test data**: Consistent test data generation
7. **Test edge cases**: Empty inputs, null values, errors
8. **Keep tests fast**: Unit tests < 50ms, Integration tests < 500ms

## Troubleshooting

### Tests timing out
- Check database connection
- Verify Redis is running
- Increase jest.setTimeout in setup.ts

### Mock not working
- Ensure jest.mock is called before imports
- Check mock path matches actual import path
- Use jest.clearAllMocks() in afterEach

### Coverage not accurate
- Check collectCoverageFrom in jest.config.js
- Ensure all source files are included
- Verify test files are in correct directories

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
