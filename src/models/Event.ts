import { ObjectId } from 'mongodb';

export interface Event {
  _id?: ObjectId;

  // User-facing info
  name: string;            // e.g. "Leo's Birthday", "U12 Final", "Company All-Hands"
  normalizedName: string;  // e.g. "leos-birthday" (lowercase, slugified)
  date: string;            // ISO date-only string, e.g. "2025-03-03"
  description?: string;
  location?: string;

  // S3 / storage info
  s3Folder: string;        // e.g. "events/U12Final-2025-03-03-2"
                           // this is the base prefix used for videos in S3

  // Sharing / joining
  joinCode: string;        // short random string used in join URL (e.g. "X4H29Q")
  joinUrl: string;         // fully qualified URL in the client app / web (future)

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEventInput {
  name: string;
  date: string;
  description?: string;
  location?: string;
}

export interface EventFilters {
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'date' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}