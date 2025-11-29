# fiestime Backend Testing Strategy

## Overview

This document outlines the comprehensive testing strategy for the fiestime backend, covering unit tests, integration tests, end-to-end tests, and performance testing. The strategy ensures code quality, reliability, and maintainability across all environments.

## Testing Pyramid

```
    /\
   /  \     E2E Tests (Few)
  /    \    - Full user workflows
 /______\   - Cross-service integration
/        \
|        |  Integration Tests (Some)
|        |  - API endpoints
|        |  - Database operations
|        |  - AWS service mocks
|________|
           Unit Tests (Many)
           - Pure functions
           - Business logic
           - Individual components
```

## Test Categories

### 1. Unit Tests (70% of test suite)

**Purpose**: Test individual functions and components in isolation.

**Scope**:
- Pure business logic functions
- GraphQL resolvers (mocked dependencies)
- Data validation and transformation
- Utility functions
- Error handling logic

**Tools**:
- **Jest** - Test framework and runner
- **@types/jest** - TypeScript definitions
- **ts-jest** - TypeScript preprocessor

**Location**: `src/**/*.test.ts`

**Example Structure**:
```typescript
// src/utils/eventUtils.test.ts
import { normalizeEventName, generateS3Folder } from './eventUtils';

describe('Event Utils', () => {
  describe('normalizeEventName', () => {
    it('should convert name to lowercase and replace spaces', () => {
      expect(normalizeEventName('Birthday Party')).toBe('birthday-party');
    });

    it('should handle special characters', () => {
      expect(normalizeEventName("Emma's 5th Party!")).toBe('emmas-5th-party');
    });

    it('should handle empty strings', () => {
      expect(normalizeEventName('')).toBe('');
    });
  });

  describe('generateS3Folder', () => {
    it('should create unique folder name', () => {
      const result = generateS3Folder('soccer-game', '2025-03-03', 0);
      expect(result).toBe('events/soccer-game-2025-03-03');
    });

    it('should append suffix for duplicates', () => {
      const result = generateS3Folder('soccer-game', '2025-03-03', 2);
      expect(result).toBe('events/soccer-game-2025-03-03-2');
    });
  });
});
```

### 2. Integration Tests (25% of test suite)

**Purpose**: Test component interactions and external service integrations.

**Scope**:
- GraphQL API endpoints
- Database operations (with test database)
- S3 operations (with mocked AWS SDK)
- Secrets Manager integration
- Error handling across layers

**Tools**:
- **Jest** - Test framework
- **@shelf/jest-mongodb** - In-memory MongoDB for testing
- **aws-sdk-mock** - Mock AWS services
- **supertest** - HTTP endpoint testing
- **apollo-server-testing** - GraphQL server testing

**Location**: `src/**/*.integration.test.ts`

**Example Structure**:
```typescript
// src/graphql/resolvers.integration.test.ts
import { createTestClient } from 'apollo-server-testing';
import { gql } from 'apollo-server-express';
import { createApolloServer } from '../server';
import { setupTestDatabase, cleanupTestDatabase } from '../test/db-setup';

describe('GraphQL Resolvers Integration', () => {
  let server: ApolloServer;
  let query: any, mutate: any;

  beforeAll(async () => {
    await setupTestDatabase();
    server = createApolloServer({ testing: true });
    const testClient = createTestClient(server);
    query = testClient.query;
    mutate = testClient.mutate;
  });

  afterAll(async () => {
    await cleanupTestDatabase();
    await server.stop();
  });

  describe('Event Operations', () => {
    it('should create event successfully', async () => {
      const CREATE_EVENT = gql`
        mutation {
          createEvent(name: "Test Event", date: "2025-03-03") {
            _id
            name
            s3Folder
          }
        }
      `;

      const response = await mutate({ mutation: CREATE_EVENT });

      expect(response.errors).toBeUndefined();
      expect(response.data.createEvent).toMatchObject({
        name: "Test Event",
        s3Folder: "events/test-event-2025-03-03"
      });
    });

    it('should handle duplicate event names', async () => {
      // Create first event
      await mutate({
        mutation: CREATE_EVENT,
        variables: { name: "Soccer Game", date: "2025-03-03" }
      });

      // Create second event with same name/date
      const response = await mutate({
        mutation: CREATE_EVENT,
        variables: { name: "Soccer Game", date: "2025-03-03" }
      });

      expect(response.data.createEvent.s3Folder)
        .toBe("events/soccer-game-2025-03-03-2");
    });
  });
});
```

### 3. End-to-End Tests (5% of test suite)

**Purpose**: Test complete user workflows across the entire system.

**Scope**:
- Full event creation and video upload workflow
- Error scenarios (network failures, invalid data)
- Performance under realistic conditions
- Cross-environment validation

**Tools**:
- **Jest** - Test framework
- **Playwright** or **Puppeteer** - Browser automation (for future frontend)
- **Newman** - Postman collection runner
- **Artillery** - Load testing

**Location**: `e2e/**/*.test.ts`

**Example Structure**:
```typescript
// e2e/video-upload-workflow.test.ts
import { GraphQLClient } from 'graphql-request';
import { uploadFileToS3 } from './utils/s3-upload';
import { generateTestVideoFile } from './utils/test-data';

describe('Video Upload Workflow E2E', () => {
  let client: GraphQLClient;
  let testVideoFile: Buffer;

  beforeAll(() => {
    client = new GraphQLClient(process.env.TEST_GRAPHQL_ENDPOINT!);
    testVideoFile = generateTestVideoFile();
  });

  it('should complete full video upload workflow', async () => {
    // 1. Create event
    const createEventResponse = await client.request(`
      mutation {
        createEvent(name: "E2E Test Event", date: "2025-03-03") {
          _id
          name
        }
      }
    `);

    const eventId = createEventResponse.createEvent._id;

    // 2. Request upload URL
    const uploadUrlResponse = await client.request(`
      mutation {
        createUploadUrl(
          eventId: "${eventId}"
          fileName: "test-video.mp4"
          contentType: "video/mp4"
        ) {
          uploadUrl
          key
        }
      }
    `);

    // 3. Upload file to S3
    const uploadResult = await uploadFileToS3(
      uploadUrlResponse.createUploadUrl.uploadUrl,
      testVideoFile,
      'video/mp4'
    );

    expect(uploadResult.status).toBe(200);

    // 4. Verify video appears in event
    const videosResponse = await client.request(`
      query {
        listEventVideos(eventId: "${eventId}") {
          _id
          originalFileName
          status
        }
      }
    `);

    expect(videosResponse.listEventVideos).toHaveLength(1);
    expect(videosResponse.listEventVideos[0].status).toBe('UPLOADED');
  });
});
```

## Test Configuration

### Jest Configuration (`jest.config.js`)

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/e2e'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/*.test.ts',
    '**/*.integration.test.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.integration.test.ts',
    '!src/types/**/*.ts',
    '!src/**/*.d.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  testTimeout: 30000,
  // Separate configurations for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.test.ts'],
      testEnvironment: 'node'
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/src/**/*.integration.test.ts'],
      globalSetup: '<rootDir>/src/test/integration-setup.ts',
      globalTeardown: '<rootDir>/src/test/integration-teardown.ts'
    },
    {
      displayName: 'e2e',
      testMatch: ['<rootDir>/e2e/**/*.test.ts'],
      globalSetup: '<rootDir>/e2e/setup.ts',
      globalTeardown: '<rootDir>/e2e/teardown.ts'
    }
  ]
};
```

### Test Environment Setup

**Unit Test Setup** (`src/test/setup.ts`):
```typescript
import { setupTestEnv } from './test-utils';

// Mock AWS SDK globally for unit tests
jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    getSignedUrlPromise: jest.fn(),
    listObjectsV2: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({ Contents: [] })
    })
  })),
  SecretsManager: jest.fn(() => ({
    getSecretValue: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        SecretString: JSON.stringify({ uri: 'mongodb://localhost:27017/test' })
      })
    })
  }))
}));

// Setup test environment variables
setupTestEnv();
```

**Integration Test Setup** (`src/test/integration-setup.ts`):
```typescript
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;

export default async function globalSetup() {
  // Start in-memory MongoDB
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;

  // Setup AWS SDK mocks for integration tests
  const AWS = require('aws-sdk-mock');

  AWS.mock('S3', 'getSignedUrlPromise', (operation: string, params: any) => {
    return Promise.resolve(`https://test-bucket.s3.amazonaws.com/${params.Key}?signature=test`);
  });

  // Store mongod instance for cleanup
  (global as any).__MONGOD__ = mongod;
}
```

## Test Data Management

### Test Fixtures

Create reusable test data for consistent testing:

```typescript
// src/test/fixtures/events.ts
export const eventFixtures = {
  validEvent: {
    name: 'Test Birthday Party',
    date: '2025-03-15',
    description: 'A fun birthday celebration',
    location: 'Central Park'
  },
  invalidEvent: {
    name: '', // Invalid: empty name
    date: 'invalid-date', // Invalid: bad date format
  },
  duplicateEvent: {
    name: 'Soccer Game',
    date: '2025-03-03'
  }
};

// src/test/fixtures/videos.ts
export const videoFixtures = {
  validVideo: {
    fileName: 'test-video.mp4',
    contentType: 'video/mp4',
    sourceDevice: 'iPhone 14',
    sourceCameraLabel: 'Main Camera'
  },
  largeVideo: {
    fileName: 'large-video.mov',
    contentType: 'video/mov',
    // Simulate large file characteristics
  }
};
```

### Test Utilities

```typescript
// src/test/test-utils.ts
export function setupTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.AWS_REGION = 'us-east-1';
  process.env.UPLOAD_BUCKET = 'test-bucket';
  process.env.PRESIGNED_URL_TTL_SECONDS = '900';
}

export function createMockEvent(overrides = {}) {
  return {
    _id: new ObjectId(),
    name: 'Test Event',
    normalizedName: 'test-event',
    date: '2025-03-03',
    s3Folder: 'events/test-event-2025-03-03',
    joinCode: 'ABC123',
    joinUrl: 'https://app.fiestime.com/join/ABC123',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

export function createMockVideo(eventId: ObjectId, overrides = {}) {
  return {
    _id: new ObjectId(),
    eventId,
    eventS3Folder: 'events/test-event-2025-03-03',
    s3Key: 'events/test-event-2025-03-03/raw/1234567890_test.mp4',
    originalFileName: 'test-video.mp4',
    contentType: 'video/mp4',
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}
```

## Continuous Integration

### GitHub Actions Test Workflow

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, sandbox, qa]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run unit tests
      run: npm run test:unit

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info

  integration-tests:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: 20
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run integration tests
      run: npm run test:integration
      env:
        NODE_ENV: test

  e2e-tests:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: 20
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run E2E tests
      run: npm run test:e2e
      env:
        TEST_GRAPHQL_ENDPOINT: ${{ secrets.TEST_GRAPHQL_ENDPOINT }}
        AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
        AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

## Performance Testing

### Load Testing with Artillery

```yaml
# artillery/load-test.yml
config:
  target: 'https://api-sandbox.fiestime.app'
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 300
      arrivalRate: 50
      name: "Sustained load"
    - duration: 120
      arrivalRate: 100
      name: "Peak load"

scenarios:
  - name: "Event Creation and Upload"
    weight: 70
    flow:
      - post:
          url: "/graphql"
          headers:
            Content-Type: "application/json"
          json:
            query: |
              mutation {
                createEvent(name: "Load Test Event", date: "2025-03-03") {
                  _id
                }
              }
          capture:
            - json: "$.data.createEvent._id"
              as: "eventId"

      - post:
          url: "/graphql"
          headers:
            Content-Type: "application/json"
          json:
            query: |
              mutation {
                createUploadUrl(
                  eventId: "{{ eventId }}"
                  fileName: "test-video.mp4"
                  contentType: "video/mp4"
                ) {
                  uploadUrl
                }
              }

  - name: "Event Listing"
    weight: 30
    flow:
      - post:
          url: "/graphql"
          headers:
            Content-Type: "application/json"
          json:
            query: |
              query {
                listEvents(limit: 20) {
                  _id
                  name
                  videoCount
                }
              }
```

## Test Scripts (package.json)

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest --selectProjects unit",
    "test:integration": "jest --selectProjects integration",
    "test:e2e": "jest --selectProjects e2e",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --watchAll=false",
    "test:load": "artillery run artillery/load-test.yml",
    "test:smoke": "newman run postman/smoke-tests.json",
    "test:mutation": "stryker run",
    "test:debug": "node --inspect-brk node_modules/.bin/jest --runInBand"
  }
}
```

## Code Quality Gates

### Coverage Requirements
- **Overall coverage**: Minimum 80%
- **Statement coverage**: Minimum 85%
- **Branch coverage**: Minimum 75%
- **Function coverage**: Minimum 90%

### Quality Checks
```javascript
// jest.config.js coverage thresholds
coverageThreshold: {
  global: {
    branches: 75,
    functions: 90,
    lines: 85,
    statements: 85
  },
  // Stricter requirements for critical modules
  './src/graphql/resolvers.ts': {
    branches: 90,
    functions: 95,
    lines: 95,
    statements: 95
  }
}
```

## Testing Best Practices

### 1. Test Naming Conventions
- **Describe blocks**: Use component/feature names
- **Test cases**: Use "should [expected behavior] when [conditions]"
- **File names**: `*.test.ts` for unit, `*.integration.test.ts` for integration

### 2. Test Organization
```typescript
describe('EventService', () => {
  describe('createEvent', () => {
    describe('when input is valid', () => {
      it('should create event successfully', () => {});
      it('should generate unique S3 folder', () => {});
      it('should return created event data', () => {});
    });

    describe('when input is invalid', () => {
      it('should throw validation error for empty name', () => {});
      it('should throw validation error for invalid date', () => {});
    });

    describe('when database operation fails', () => {
      it('should throw database error', () => {});
    });
  });
});
```

### 3. Mocking Strategy
- **External services**: Always mock (AWS, MongoDB in unit tests)
- **Internal modules**: Mock only when testing in isolation
- **Time-dependent code**: Mock Date.now() for consistent tests

### 4. Test Data Management
- **Use factories**: Create reusable test data generators
- **Avoid hardcoded values**: Use constants and configuration
- **Clean up**: Ensure tests don't leave side effects

### 5. Async Testing
```typescript
// Proper async test handling
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});

// Promise rejection testing
it('should handle promise rejection', async () => {
  await expect(asyncFunction()).rejects.toThrow('Error message');
});
```

## Debugging Tests

### Running Individual Tests
```bash
# Run specific test file
npm test -- event.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="createEvent"

# Run tests in specific directory
npm test -- src/graphql/

# Debug mode
npm run test:debug -- --testNamePattern="createEvent"
```

### Test Debugging Tips
1. **Use `fit` and `fdescribe`**: Focus on specific tests during debugging
2. **Add `console.log`**: Temporary debugging output
3. **Use `--verbose`**: See individual test results
4. **Check test order**: Ensure tests don't depend on execution order

## Monitoring & Reporting

### Test Metrics Dashboard
- **Test execution time trends**
- **Coverage trends over time**
- **Flaky test detection**
- **Performance regression detection**

### Integration with Monitoring Tools
- **Datadog**: Custom metrics for test performance
- **Slack notifications**: For test failures in CI
- **GitHub status checks**: Prevent merging if tests fail

This comprehensive testing strategy ensures the fiestime backend maintains high quality, reliability, and performance across all development phases.