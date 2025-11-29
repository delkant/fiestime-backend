// Unit test setup - mock external dependencies

// Mock AWS SDK globally for unit tests
jest.mock('aws-sdk', () => {
  const mockS3 = {
    getSignedUrlPromise: jest.fn(),
    listObjectsV2: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({ Contents: [] })
    }),
    upload: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({ Location: 'test-url' })
    }),
    putObject: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({})
    })
  };

  const mockSecretsManager = {
    getSecretValue: jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({
        SecretString: JSON.stringify({ uri: 'mongodb://localhost:27017/test' })
      })
    })
  };

  return {
    S3: jest.fn(() => mockS3),
    SecretsManager: jest.fn(() => mockSecretsManager),
    config: {
      update: jest.fn()
    }
  };
});

// Mock MongoDB for unit tests
jest.mock('mongodb', () => {
  const mockCollection = {
    insertOne: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(() => ({
      sort: jest.fn(() => ({
        skip: jest.fn(() => ({
          limit: jest.fn(() => ({
            toArray: jest.fn()
          }))
        }))
      }))
    })),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
    countDocuments: jest.fn(),
    createIndex: jest.fn()
  };

  const mockDb = {
    collection: jest.fn(() => mockCollection),
    admin: jest.fn(() => ({
      ping: jest.fn().mockResolvedValue({ ok: 1 })
    }))
  };

  const mockClient = {
    connect: jest.fn(),
    close: jest.fn(),
    db: jest.fn(() => mockDb),
    topology: {
      isConnected: jest.fn(() => true)
    }
  };

  return {
    MongoClient: jest.fn(() => mockClient),
    ObjectId: jest.fn((id) => ({ toString: () => id || '507f1f77bcf86cd799439011' }))
  };
});

