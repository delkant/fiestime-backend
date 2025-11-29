import AWS from 'aws-sdk';
import { loadEnv } from './env';
import { ExternalServiceError } from '../models/Error';

const env = loadEnv();

// Initialize AWS Secrets Manager
// In Lambda, AWS_REGION is automatically available as a runtime environment variable
const region = process.env.AWS_REGION || env.AWS_REGION;
const secretsManager = new AWS.SecretsManager({
  region: region,
});

interface MongoSecret {
  uri: string;
}

let cachedMongoUri: string | null = null;

export async function getMongoUri(): Promise<string> {
  // Return cached URI if available
  if (cachedMongoUri) {
    return cachedMongoUri;
  }

  // For local development, use direct URI
  if (env.NODE_ENV === 'development' && env.MONGODB_URI) {
    cachedMongoUri = env.MONGODB_URI;
    return cachedMongoUri;
  }

  // For Lambda, use Secrets Manager
  if (!env.MONGODB_URI_SECRET_NAME) {
    throw new ExternalServiceError('MONGODB_URI_SECRET_NAME environment variable is required');
  }

  try {
    const result = await secretsManager
      .getSecretValue({ SecretId: env.MONGODB_URI_SECRET_NAME })
      .promise();

    if (!result.SecretString) {
      throw new ExternalServiceError('MongoDB secret string is empty');
    }

    const secret: MongoSecret = JSON.parse(result.SecretString);

    if (!secret.uri) {
      throw new ExternalServiceError('MongoDB URI not found in secret');
    }

    cachedMongoUri = secret.uri;
    return cachedMongoUri;
  } catch (error) {
    if (error instanceof Error) {
      throw new ExternalServiceError(`Failed to retrieve MongoDB URI from Secrets Manager: ${error.message}`);
    }
    throw new ExternalServiceError('Failed to retrieve MongoDB URI from Secrets Manager');
  }
}

export function clearCache(): void {
  cachedMongoUri = null;
}