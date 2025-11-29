import { MongoClient, Db, Collection } from 'mongodb';
import { getMongoUri } from '../config/secrets';
import { loadEnv } from '../config/env';
import { Event } from '../models/Event';
import { Video } from '../models/Video';
import { ExternalServiceError } from '../models/Error';

const env = loadEnv();

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  if (cachedClient) {
    // Simple check - if we have a cached client, try to use it
    // In newer MongoDB driver versions, topology property may not be available
    return cachedClient;
  }

  try {
    const uri = await getMongoUri();

    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      minPoolSize: 1,
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      retryReads: true,
    });

    await client.connect();
    cachedClient = client;
    return client;
  } catch (error) {
    if (error instanceof Error) {
      throw new ExternalServiceError(`Failed to connect to MongoDB: ${error.message}`);
    }
    throw new ExternalServiceError('Failed to connect to MongoDB');
  }
}

export async function getDb(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }

  const client = await getMongoClient();

  // Determine database name based on environment
  let dbName = 'fiestime_development';

  if (env.NODE_ENV === 'production') {
    dbName = 'fiestime_prod';
  } else if (env.NODE_ENV === 'qa') {
    dbName = 'fiestime_qa';
  } else if (env.NODE_ENV === 'staging') {
    dbName = 'fiestime_sandbox';
  } else if (env.NODE_ENV === 'test') {
    dbName = 'fiestime_test';
  }

  cachedDb = client.db(dbName);
  return cachedDb;
}

export async function getEventsCollection(): Promise<Collection<Event>> {
  const db = await getDb();
  return db.collection<Event>('events');
}

export async function getVideosCollection(): Promise<Collection<Video>> {
  const db = await getDb();
  return db.collection<Video>('videos');
}

// Database initialization and indexing
export async function initializeDatabase(): Promise<void> {
  try {
    const eventsCollection = await getEventsCollection();
    const videosCollection = await getVideosCollection();

    // Create indexes for events collection
    await eventsCollection.createIndex({ "normalizedName": 1, "date": 1 }); // For folder uniqueness
    await eventsCollection.createIndex({ "joinCode": 1 }); // For join URL lookups
    await eventsCollection.createIndex({ "createdAt": -1 }); // For recent events

    // Create indexes for videos collection
    await videosCollection.createIndex({ "eventId": 1, "createdAt": -1 }); // For event videos
    await videosCollection.createIndex({ "status": 1 }); // For status queries
    await videosCollection.createIndex({ "s3Key": 1 }); // For S3 key lookups

    console.log('Database indexes created successfully');
  } catch (error) {
    console.error('Error creating database indexes:', error);
    throw new ExternalServiceError('Failed to initialize database indexes');
  }
}

// Graceful shutdown
export async function closeConnection(): Promise<void> {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
  }
}

// Health check
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const db = await getDb();
    const result = await db.admin().ping();
    return result.ok === 1;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}