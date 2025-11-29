import AWS from "aws-sdk";
import { loadEnv } from "./env";

const env = loadEnv();

AWS.config.update({
  region: env.AWS_REGION
});

export const s3 = new AWS.S3({
  signatureVersion: "v4"
});

export const UPLOAD_BUCKET = env.UPLOAD_BUCKET;
export const PRESIGNED_URL_TTL_SECONDS = env.PRESIGNED_URL_TTL_SECONDS;
