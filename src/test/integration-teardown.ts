// Global teardown for integration tests
import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalTeardown() {
  const mongod = (global as any).__MONGOD__ as MongoMemoryServer;

  if (mongod) {
    console.log('Stopping MongoDB Memory Server...');
    await mongod.stop();
    console.log('MongoDB Memory Server stopped');
  }

  // Restore AWS SDK
  const AWS = require('aws-sdk-mock');
  AWS.restore();
}