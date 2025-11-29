// Global test setup file

// Set test environment
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.UPLOAD_BUCKET = 'test-bucket';
process.env.PRESIGNED_URL_TTL_SECONDS = '900';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Mock console to reduce noise during tests
const originalConsole = { ...console };

beforeEach(() => {
  // Reset console mocks before each test
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  // Restore console after each test if needed for debugging
  if (process.env.DEBUG_TESTS === 'true') {
    Object.assign(console, originalConsole);
  }
});

// Global test timeout
jest.setTimeout(30000);