// Test script with MongoDB Memory Server
const { MongoMemoryServer } = require('mongodb-memory-server');
const { runTests } = require('./test-workflow');

let mongod;

async function setupDatabase() {
  console.log('🔧 Starting MongoDB Memory Server...');
  mongod = await MongoMemoryServer.create({
    instance: {
      port: 27017, // Use standard MongoDB port
    },
  });

  const uri = mongod.getUri();
  console.log('✅ MongoDB Memory Server started at:', uri);

  // Set environment variable for the application
  process.env.MONGODB_URI = uri;
  process.env.NODE_ENV = 'development';

  return uri;
}

async function teardownDatabase() {
  if (mongod) {
    console.log('🔧 Stopping MongoDB Memory Server...');
    await mongod.stop();
    console.log('✅ MongoDB Memory Server stopped');
  }
}

async function runTestsWithDatabase() {
  try {
    await setupDatabase();

    // Wait a moment for the server to be fully ready
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('🚀 Running tests with in-memory database...');
    await runTests();

  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
  } finally {
    await teardownDatabase();
  }
}

if (require.main === module) {
  runTestsWithDatabase();
}

module.exports = { runTestsWithDatabase, setupDatabase, teardownDatabase };