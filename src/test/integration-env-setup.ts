// Environment setup for individual integration tests
import { closeConnection } from '../db/mongo';

// Clean up after each integration test
afterEach(async () => {
  // Close any open database connections
  try {
    await closeConnection();
  } catch (error) {
    // Ignore cleanup errors
  }
});