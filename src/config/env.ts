export interface EnvConfig {
  AWS_REGION: string;
  UPLOAD_BUCKET: string;
  PRESIGNED_URL_TTL_SECONDS: number;
  MONGODB_URI_SECRET_NAME?: string;
  MONGODB_URI?: string;  // For local development
  NODE_ENV: string;
  LOG_LEVEL: string;
}

export const loadEnv = (): EnvConfig => {
  const AWS_REGION = process.env.AWS_REGION || "us-east-1";
  const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || "CHANGE_ME_FIESTIME_UPLOAD_BUCKET";
  const PRESIGNED_URL_TTL_SECONDS = Number(process.env.PRESIGNED_URL_TTL_SECONDS || 900);
  const MONGODB_URI_SECRET_NAME = process.env.MONGODB_URI_SECRET_NAME;
  const MONGODB_URI = process.env.MONGODB_URI;
  const NODE_ENV = process.env.NODE_ENV || "development";
  const LOG_LEVEL = process.env.LOG_LEVEL || "info";

  return {
    AWS_REGION,
    UPLOAD_BUCKET,
    PRESIGNED_URL_TTL_SECONDS,
    MONGODB_URI_SECRET_NAME,
    MONGODB_URI,
    NODE_ENV,
    LOG_LEVEL
  };
};
