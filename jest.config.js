module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/*.test.ts',
    '**/*.integration.test.ts'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.integration.test.ts',
    '!src/types/**/*.ts',
    '!src/**/*.d.ts',
    '!src/local/dev-server.ts' // Exclude dev server from coverage
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
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/src/test/unit-setup.ts']
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/src/**/*.integration.test.ts'],
      globalSetup: '<rootDir>/src/test/integration-setup.ts',
      globalTeardown: '<rootDir>/src/test/integration-teardown.ts',
      setupFilesAfterEnv: ['<rootDir>/src/test/integration-env-setup.ts']
    }
  ],
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 85,
      lines: 85,
      statements: 85
    },
    // Stricter requirements for critical modules
    './src/repos/': {
      branches: 85,
      functions: 95,
      lines: 90,
      statements: 90
    },
    './src/utils/': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    }
  }
};