// Global setup for integration tests
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;

export default async function globalSetup() {
  console.log('Starting MongoDB Memory Server for integration tests...');

  // Start in-memory MongoDB
  mongod = await MongoMemoryServer.create({
    binary: {
      version: '6.0.0'
    }
  });

  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;
  process.env.NODE_ENV = 'test';

  console.log(`MongoDB Memory Server started at: ${uri}`);

  // Store mongod instance for cleanup
  (global as any).__MONGOD__ = mongod;

  // Setup AWS SDK mocks for integration tests
  const AWS = require('aws-sdk-mock');

  AWS.mock('S3', 'getSignedUrlPromise', (operation: string, params: any) => {
    return Promise.resolve(`https://test-bucket.s3.amazonaws.com/${params.Key}?signature=test`);
  });

  AWS.mock('S3', 'listObjectsV2', (params: any, callback: Function) => {
    callback(null, {
      Contents: [
        {
          Key: 'events/test-event-2025-03-03/raw/1234567890_test.mp4',
          Size: 1024,
          LastModified: new Date()
        }
      ]
    });
  });

  AWS.mock('SecretsManager', 'getSecretValue', (params: any, callback: Function) => {
    callback(null, {
      SecretString: JSON.stringify({
        uri: process.env.MONGODB_URI
      })
    });
  });
}