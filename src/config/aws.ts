import AWS from "aws-sdk";
import { loadEnv } from "./env";

const env = loadEnv();

// In Lambda, AWS_REGION is automatically available as a runtime environment variable
// For local development, fall back to env.AWS_REGION
const region = process.env.AWS_REGION || env.AWS_REGION;

AWS.config.update({
  region: region
});

export const s3 = new AWS.S3({
  signatureVersion: "v4"
});

export const UPLOAD_BUCKET = env.UPLOAD_BUCKET;
export const PRESIGNED_URL_TTL_SECONDS = env.PRESIGNED_URL_TTL_SECONDS;
