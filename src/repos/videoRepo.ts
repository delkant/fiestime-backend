import { ObjectId } from 'mongodb';
import { getVideosCollection } from '../db/mongo';
import { Video, VideoStatus, VideoFilters } from '../models/Video';
import { NotFoundError, ValidationError, ExternalServiceError } from '../models/Error';
import { validateFileName, validateContentType } from '../utils/eventUtils';

export class VideoRepository {
  /**
   * Create a new video record
   */
  async createVideo(video: Omit<Video, '_id' | 'createdAt' | 'updatedAt'>): Promise<Video> {
    // Validate input
    const fileNameValidation = validateFileName(video.originalFileName);
    if (!fileNameValidation.valid) {
      throw new ValidationError(fileNameValidation.error!);
    }

    const contentTypeValidation = validateContentType(video.contentType);
    if (!contentTypeValidation.valid) {
      throw new ValidationError(contentTypeValidation.error!);
    }

    if (video.sourceDevice && video.sourceDevice.length > 50) {
      throw new ValidationError('Source device must be 50 characters or less');
    }

    if (video.sourceCameraLabel && video.sourceCameraLabel.length > 50) {
      throw new ValidationError('Source camera label must be 50 characters or less');
    }

    try {
      const collection = await getVideosCollection();

      const now = new Date();

      const videoToInsert: Video = {
        ...video,
        createdAt: now,
        updatedAt: now
      };

      const result = await collection.insertOne(videoToInsert);

      return {
        ...videoToInsert,
        _id: result.insertedId
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new ExternalServiceError(`Failed to create video: ${error.message}`);
      }

      throw new ExternalServiceError('Failed to create video');
    }
  }

  /**
   * Get a video by ID
   */
  async getVideoById(id: string): Promise<Video | null> {
    try {
      const collection = await getVideosCollection();
      const objectId = new ObjectId(id);

      const video = await collection.findOne({ _id: objectId });

      return video;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ObjectId')) {
        throw new ValidationError('Invalid video ID format');
      }

      throw new ExternalServiceError('Failed to fetch video');
    }
  }

  /**
   * Get videos by event ID
   */
  async getVideosByEventId(eventId: string | ObjectId, filters: Omit<VideoFilters, 'eventId'> = {}): Promise<Video[]> {
    try {
      const collection = await getVideosCollection();

      // Convert eventId to ObjectId if it's a string
      const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;

      const limit = Math.min(filters.limit || 20, 100); // Max 100 items
      const offset = filters.offset || 0;

      let query: any = { eventId: eventObjectId };

      if (filters.status) {
        query.status = filters.status;
      }

      const videos = await collection
        .find(query)
        .sort({ createdAt: -1 }) // Most recent first
        .skip(offset)
        .limit(limit)
        .toArray();

      return videos;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ObjectId')) {
        throw new ValidationError('Invalid event ID format');
      }

      throw new ExternalServiceError('Failed to fetch videos');
    }
  }

  /**
   * Update video status
   */
  async updateVideoStatus(id: string, status: VideoStatus, uploadedAt?: Date): Promise<Video> {
    try {
      const collection = await getVideosCollection();
      const objectId = new ObjectId(id);

      const updateDoc: any = {
        status,
        updatedAt: new Date()
      };

      if (status === 'UPLOADED' && uploadedAt) {
        updateDoc.uploadedAt = uploadedAt;
      }

      const result = await collection.findOneAndUpdate(
        { _id: objectId },
        { $set: updateDoc },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new NotFoundError('Video not found');
      }

      return result;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }

      if (error instanceof Error && error.message.includes('ObjectId')) {
        throw new ValidationError('Invalid video ID format');
      }

      throw new ExternalServiceError('Failed to update video status');
    }
  }

  /**
   * Update video size
   */
  async updateVideoSize(id: string, sizeBytes: number): Promise<Video> {
    try {
      const collection = await getVideosCollection();
      const objectId = new ObjectId(id);

      const result = await collection.findOneAndUpdate(
        { _id: objectId },
        {
          $set: {
            sizeBytes,
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new NotFoundError('Video not found');
      }

      return result;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }

      if (error instanceof Error && error.message.includes('ObjectId')) {
        throw new ValidationError('Invalid video ID format');
      }

      throw new ExternalServiceError('Failed to update video size');
    }
  }

  /**
   * Delete video
   */
  async deleteVideo(id: string): Promise<boolean> {
    try {
      const collection = await getVideosCollection();
      const objectId = new ObjectId(id);

      const result = await collection.deleteOne({ _id: objectId });

      return result.deletedCount > 0;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ObjectId')) {
        throw new ValidationError('Invalid video ID format');
      }

      throw new ExternalServiceError('Failed to delete video');
    }
  }

  /**
   * Delete all videos for an event
   */
  async deleteVideosByEventId(eventId: string | ObjectId): Promise<number> {
    try {
      const collection = await getVideosCollection();

      // Convert eventId to ObjectId if it's a string
      const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;

      const result = await collection.deleteMany({ eventId: eventObjectId });

      return result.deletedCount || 0;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ObjectId')) {
        throw new ValidationError('Invalid event ID format');
      }

      throw new ExternalServiceError('Failed to delete event videos');
    }
  }

  /**
   * Get video count for an event
   */
  async getVideoCountByEventId(eventId: string | ObjectId): Promise<number> {
    try {
      const collection = await getVideosCollection();

      // Convert eventId to ObjectId if it's a string
      const eventObjectId = typeof eventId === 'string' ? new ObjectId(eventId) : eventId;

      const count = await collection.countDocuments({ eventId: eventObjectId });

      return count;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ObjectId')) {
        throw new ValidationError('Invalid event ID format');
      }

      throw new ExternalServiceError('Failed to count videos');
    }
  }

  /**
   * Get video by S3 key
   */
  async getVideoByS3Key(s3Key: string): Promise<Video | null> {
    try {
      const collection = await getVideosCollection();

      const video = await collection.findOne({ s3Key });

      return video;
    } catch (error) {
      throw new ExternalServiceError('Failed to fetch video by S3 key');
    }
  }

  /**
   * Get videos by status
   */
  async getVideosByStatus(status: VideoStatus, limit: number = 100): Promise<Video[]> {
    try {
      const collection = await getVideosCollection();

      const videos = await collection
        .find({ status })
        .sort({ createdAt: -1 })
        .limit(Math.min(limit, 1000)) // Safety limit
        .toArray();

      return videos;
    } catch (error) {
      throw new ExternalServiceError('Failed to fetch videos by status');
    }
  }
}