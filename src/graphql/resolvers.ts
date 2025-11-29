import { GraphQLScalarType, Kind } from 'graphql';
import { ObjectId } from 'mongodb';
import { s3, UPLOAD_BUCKET, PRESIGNED_URL_TTL_SECONDS } from "../config/aws";
import { EventRepository } from '../repos/eventRepo';
import { VideoRepository } from '../repos/videoRepo';
import { NotFoundError, ValidationError, AppError } from '../models/Error';
import { CreateEventInput, EventFilters } from '../models/Event';
import { VideoFilters, VideoStatus } from '../models/Video';
import { generateVideoS3Key } from '../utils/eventUtils';

// Create repository instances
const eventRepo = new EventRepository();
const videoRepo = new VideoRepository();

// DateTime scalar resolver
const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'Date custom scalar type',
  serialize(value: any): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    throw new Error('Value is not an instance of Date: ' + value);
  },
  parseValue(value: any): Date {
    if (typeof value === 'string') {
      return new Date(value);
    }
    throw new Error('Value is not a string: ' + value);
  },
  parseLiteral(ast): Date {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    throw new Error('Can only parse strings to dates but got a: ' + ast.kind);
  },
});

export const resolvers = {
  DateTime: DateTimeScalar,

  // Event field resolvers
  Event: {
    videoCount: async (parent: any) => {
      try {
        return await videoRepo.getVideoCountByEventId(parent._id);
      } catch (error) {
        console.error('Error getting video count:', error);
        return 0; // Return 0 on error to prevent GraphQL errors
      }
    }
  },

  Query: {
    health: () => "OK",

    getEvent: async (_parent: unknown, args: { id: string }) => {
      try {
        const event = await eventRepo.getEventById(args.id);

        if (!event) {
          throw new NotFoundError('Event not found');
        }

        return event;
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        console.error('Error fetching event:', error);
        throw new Error('Failed to fetch event');
      }
    },

    listEvents: async (_parent: unknown, args: EventFilters) => {
      try {
        // Validate and sanitize arguments
        const filters: EventFilters = {
          limit: Math.min(args.limit || 20, 100),
          offset: Math.max(args.offset || 0, 0),
          sortBy: args.sortBy || 'createdAt',
          sortOrder: args.sortOrder || 'desc'
        };

        return await eventRepo.listEvents(filters);
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        console.error('Error listing events:', error);
        throw new Error('Failed to list events');
      }
    },

    listEventVideos: async (_parent: unknown, args: VideoFilters) => {
      try {
        // Validate eventId exists
        const event = await eventRepo.getEventById(args.eventId);
        if (!event) {
          throw new NotFoundError('Event not found');
        }

        // Sanitize filters
        const filters = {
          limit: Math.min(args.limit || 20, 100),
          offset: Math.max(args.offset || 0, 0),
          status: args.status
        };

        return await videoRepo.getVideosByEventId(args.eventId, filters);
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        console.error('Error listing event videos:', error);
        throw new Error('Failed to list event videos');
      }
    },

    getVideo: async (_parent: unknown, args: { id: string }) => {
      try {
        const video = await videoRepo.getVideoById(args.id);

        if (!video) {
          throw new NotFoundError('Video not found');
        }

        return video;
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        console.error('Error fetching video:', error);
        throw new Error('Failed to fetch video');
      }
    }
  },

  Mutation: {
    createEvent: async (_parent: unknown, args: CreateEventInput) => {
      try {
        return await eventRepo.createEvent(args);
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        console.error('Error creating event:', error);
        throw new Error('Failed to create event');
      }
    },

    createUploadUrl: async (_parent: unknown, args: {
      eventId: string;
      fileName: string;
      contentType: string;
      sourceDevice?: string;
      sourceCameraLabel?: string;
    }) => {
      try {
        // Validate event exists
        const event = await eventRepo.getEventById(args.eventId);
        if (!event) {
          throw new NotFoundError('Event not found');
        }

        // Generate S3 key
        const s3Key = generateVideoS3Key(event.s3Folder, args.fileName);

        // Create video record in database
        const video = await videoRepo.createVideo({
          eventId: new ObjectId(args.eventId),
          eventS3Folder: event.s3Folder,
          s3Key,
          originalFileName: args.fileName,
          contentType: args.contentType,
          status: 'PENDING',
          sourceDevice: args.sourceDevice,
          sourceCameraLabel: args.sourceCameraLabel
        });

        // Generate pre-signed URL
        const params = {
          Bucket: UPLOAD_BUCKET,
          Key: s3Key,
          Expires: PRESIGNED_URL_TTL_SECONDS,
          ContentType: args.contentType
        };

        const uploadUrl = await s3.getSignedUrlPromise("putObject", params);

        return {
          uploadUrl,
          bucket: UPLOAD_BUCKET,
          key: s3Key,
          expiresInSeconds: PRESIGNED_URL_TTL_SECONDS,
          videoId: video._id!.toString()
        };
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        console.error('Error creating upload URL:', error);
        throw new Error('Failed to create upload URL');
      }
    },

    updateVideoStatus: async (_parent: unknown, args: {
      videoId: string;
      status: VideoStatus;
    }) => {
      try {
        const uploadedAt = args.status === 'UPLOADED' ? new Date() : undefined;

        return await videoRepo.updateVideoStatus(args.videoId, args.status, uploadedAt);
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        console.error('Error updating video status:', error);
        throw new Error('Failed to update video status');
      }
    }
  }
};
