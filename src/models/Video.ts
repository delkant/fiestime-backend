import { ObjectId } from 'mongodb';

export type VideoStatus = 'PENDING' | 'UPLOADED' | 'FAILED';

export interface Video {
  _id?: ObjectId;

  eventId: ObjectId;       // FK to Events._id
  eventS3Folder: string;   // denormalized copy of Event.s3Folder for convenience

  // Upload info
  s3Key: string;           // e.g. "events/soccer-game-2025-03-03-2/raw/1739212123_cam1.mp4"
  originalFileName: string;
  contentType: string;     // e.g. "video/mp4"
  sizeBytes?: number;      // optional, can be filled post-upload
  status: VideoStatus;

  // Device / source metadata
  sourceDevice?: string;   // e.g. "iPhone 14", or generic string provided by client
  sourceCameraLabel?: string; // e.g. "Cam 1", "Goal Cam", "Phone A"

  // Timestamps
  createdAt: Date;         // when upload URL was requested
  updatedAt: Date;
  uploadedAt?: Date;       // optional, set when confirmed uploaded in future phases
}

export interface CreateUploadUrlInput {
  eventId: string;
  fileName: string;
  contentType: string;
  sourceDevice?: string;
  sourceCameraLabel?: string;
}

export interface CreateUploadUrlPayload {
  uploadUrl: string;
  bucket: string;
  key: string;
  expiresInSeconds: number;
  videoId: string;
}

export interface VideoFilters {
  eventId: string;
  limit?: number;
  offset?: number;
  status?: VideoStatus;
}