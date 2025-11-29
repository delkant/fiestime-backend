import { ObjectId } from 'mongodb';
import { VideoRepository } from './videoRepo';
import { Video, VideoStatus } from '../models/Video';
import { ValidationError, NotFoundError } from '../models/Error';

// Mock the database module
jest.mock('../db/mongo');

// Mock the utilities
jest.mock('../utils/eventUtils', () => ({
  validateFileName: jest.fn(() => ({ valid: true })),
  validateContentType: jest.fn(() => ({ valid: true }))
}));

describe('VideoRepository', () => {
  let videoRepo: VideoRepository;
  let mockCollection: any;

  beforeEach(() => {
    videoRepo = new VideoRepository();

    // Set up mock collection
    mockCollection = {
      insertOne: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(() => ({
        sort: jest.fn(() => ({
          skip: jest.fn(() => ({
            limit: jest.fn(() => ({
              toArray: jest.fn()
            }))
          }))
        }))
      })),
      findOneAndUpdate: jest.fn(),
      deleteOne: jest.fn(),
      deleteMany: jest.fn(),
      countDocuments: jest.fn()
    };

    const { getVideosCollection } = require('../db/mongo');
    getVideosCollection.mockResolvedValue(mockCollection);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createVideo', () => {
    const validVideo: Omit<Video, '_id' | 'createdAt' | 'updatedAt'> = {
      eventId: new ObjectId(),
      eventS3Folder: 'events/test-event-2025-03-03',
      s3Key: 'events/test-event-2025-03-03/raw/1234567890_test.mp4',
      originalFileName: 'test.mp4',
      contentType: 'video/mp4',
      status: 'pending',
      sourceDevice: 'iPhone 14',
      sourceCameraLabel: 'Main Camera'
    };

    it('should create video successfully', async () => {
      const mockInsertedId = new ObjectId();
      mockCollection.insertOne.mockResolvedValue({ insertedId: mockInsertedId });

      const result = await videoRepo.createVideo(validVideo);

      expect(result).toMatchObject({
        ...validVideo,
        _id: mockInsertedId,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date)
      });

      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          ...validVideo,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date)
        })
      );
    });

    it('should validate file name', async () => {
      const { validateFileName } = require('../utils/eventUtils');
      validateFileName.mockReturnValue({ valid: false, error: 'Invalid filename' });

      await expect(videoRepo.createVideo(validVideo))
        .rejects.toThrow(ValidationError);

      expect(validateFileName).toHaveBeenCalledWith('test.mp4');
    });

    it('should validate content type', async () => {
      const { validateContentType } = require('../utils/eventUtils');
      validateContentType.mockReturnValue({ valid: false, error: 'Invalid content type' });

      await expect(videoRepo.createVideo(validVideo))
        .rejects.toThrow(ValidationError);

      expect(validateContentType).toHaveBeenCalledWith('video/mp4');
    });

    it('should validate source device length', async () => {
      const videoWithLongDevice = {
        ...validVideo,
        sourceDevice: 'a'.repeat(51) // Too long
      };

      await expect(videoRepo.createVideo(videoWithLongDevice))
        .rejects.toThrow(ValidationError);
    });

    it('should validate source camera label length', async () => {
      const videoWithLongLabel = {
        ...validVideo,
        sourceCameraLabel: 'a'.repeat(51) // Too long
      };

      await expect(videoRepo.createVideo(videoWithLongLabel))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('getVideoById', () => {
    it('should return video when found', async () => {
      const mockVideo = {
        _id: new ObjectId(),
        eventId: new ObjectId(),
        originalFileName: 'test.mp4'
      };
      mockCollection.findOne.mockResolvedValue(mockVideo);

      const result = await videoRepo.getVideoById(mockVideo._id.toString());

      expect(result).toEqual(mockVideo);
      expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: mockVideo._id });
    });

    it('should return null when video not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await videoRepo.getVideoById('507f1f77bcf86cd799439011');

      expect(result).toBeNull();
    });

    it('should throw ValidationError for invalid ObjectId', async () => {
      await expect(videoRepo.getVideoById('invalid-id'))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('getVideosByEventId', () => {
    const eventId = '507f1f77bcf86cd799439011';

    it('should return videos for event', async () => {
      const mockVideos = [
        { _id: new ObjectId(), eventId: new ObjectId(eventId) },
        { _id: new ObjectId(), eventId: new ObjectId(eventId) }
      ];

      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(mockVideos)
      };
      mockCollection.find.mockReturnValue(mockQuery);

      const result = await videoRepo.getVideosByEventId(eventId);

      expect(result).toEqual(mockVideos);
      expect(mockCollection.find).toHaveBeenCalledWith({ eventId: new ObjectId(eventId) });
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('should handle ObjectId as eventId', async () => {
      const objectId = new ObjectId(eventId);
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([])
      };
      mockCollection.find.mockReturnValue(mockQuery);

      await videoRepo.getVideosByEventId(objectId);

      expect(mockCollection.find).toHaveBeenCalledWith({ eventId: objectId });
    });

    it('should apply filters', async () => {
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([])
      };
      mockCollection.find.mockReturnValue(mockQuery);

      await videoRepo.getVideosByEventId(eventId, {
        limit: 10,
        offset: 5,
        status: 'uploaded'
      });

      expect(mockCollection.find).toHaveBeenCalledWith({
        eventId: new ObjectId(eventId),
        status: 'uploaded'
      });
      expect(mockQuery.skip).toHaveBeenCalledWith(5);
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });

    it('should enforce maximum limit', async () => {
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([])
      };
      mockCollection.find.mockReturnValue(mockQuery);

      await videoRepo.getVideosByEventId(eventId, { limit: 200 });

      expect(mockQuery.limit).toHaveBeenCalledWith(100); // Should be capped
    });
  });

  describe('updateVideoStatus', () => {
    const videoId = '507f1f77bcf86cd799439011';

    it('should update video status successfully', async () => {
      const mockUpdatedVideo = {
        _id: new ObjectId(videoId),
        status: 'uploaded',
        updatedAt: new Date()
      };
      mockCollection.findOneAndUpdate.mockResolvedValue(mockUpdatedVideo);

      const result = await videoRepo.updateVideoStatus(videoId, 'uploaded');

      expect(result).toEqual(mockUpdatedVideo);
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: new ObjectId(videoId) },
        { $set: { status: 'uploaded', updatedAt: expect.any(Date) } },
        { returnDocument: 'after' }
      );
    });

    it('should set uploadedAt when status is uploaded', async () => {
      const uploadedAt = new Date();
      const mockUpdatedVideo = {
        _id: new ObjectId(videoId),
        status: 'uploaded',
        uploadedAt
      };
      mockCollection.findOneAndUpdate.mockResolvedValue(mockUpdatedVideo);

      await videoRepo.updateVideoStatus(videoId, 'uploaded', uploadedAt);

      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: new ObjectId(videoId) },
        { $set: { status: 'uploaded', updatedAt: expect.any(Date), uploadedAt } },
        { returnDocument: 'after' }
      );
    });

    it('should throw NotFoundError when video not found', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValue(null);

      await expect(videoRepo.updateVideoStatus(videoId, 'uploaded'))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('updateVideoSize', () => {
    const videoId = '507f1f77bcf86cd799439011';

    it('should update video size successfully', async () => {
      const mockUpdatedVideo = {
        _id: new ObjectId(videoId),
        sizeBytes: 1024000
      };
      mockCollection.findOneAndUpdate.mockResolvedValue(mockUpdatedVideo);

      const result = await videoRepo.updateVideoSize(videoId, 1024000);

      expect(result).toEqual(mockUpdatedVideo);
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: new ObjectId(videoId) },
        { $set: { sizeBytes: 1024000, updatedAt: expect.any(Date) } },
        { returnDocument: 'after' }
      );
    });
  });

  describe('deleteVideo', () => {
    it('should delete video successfully', async () => {
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await videoRepo.deleteVideo('507f1f77bcf86cd799439011');

      expect(result).toBe(true);
    });

    it('should return false when video not found', async () => {
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const result = await videoRepo.deleteVideo('507f1f77bcf86cd799439011');

      expect(result).toBe(false);
    });
  });

  describe('deleteVideosByEventId', () => {
    it('should delete all videos for event', async () => {
      mockCollection.deleteMany.mockResolvedValue({ deletedCount: 3 });

      const result = await videoRepo.deleteVideosByEventId('507f1f77bcf86cd799439011');

      expect(result).toBe(3);
      expect(mockCollection.deleteMany).toHaveBeenCalledWith({
        eventId: new ObjectId('507f1f77bcf86cd799439011')
      });
    });

    it('should handle ObjectId as eventId', async () => {
      const objectId = new ObjectId();
      mockCollection.deleteMany.mockResolvedValue({ deletedCount: 2 });

      const result = await videoRepo.deleteVideosByEventId(objectId);

      expect(result).toBe(2);
      expect(mockCollection.deleteMany).toHaveBeenCalledWith({ eventId: objectId });
    });
  });

  describe('getVideoCountByEventId', () => {
    it('should return video count for event', async () => {
      mockCollection.countDocuments.mockResolvedValue(5);

      const result = await videoRepo.getVideoCountByEventId('507f1f77bcf86cd799439011');

      expect(result).toBe(5);
      expect(mockCollection.countDocuments).toHaveBeenCalledWith({
        eventId: new ObjectId('507f1f77bcf86cd799439011')
      });
    });
  });

  describe('getVideoByS3Key', () => {
    it('should return video when found by S3 key', async () => {
      const mockVideo = {
        _id: new ObjectId(),
        s3Key: 'events/test/raw/123_video.mp4'
      };
      mockCollection.findOne.mockResolvedValue(mockVideo);

      const result = await videoRepo.getVideoByS3Key('events/test/raw/123_video.mp4');

      expect(result).toEqual(mockVideo);
      expect(mockCollection.findOne).toHaveBeenCalledWith({
        s3Key: 'events/test/raw/123_video.mp4'
      });
    });

    it('should return null when video not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await videoRepo.getVideoByS3Key('nonexistent-key');

      expect(result).toBeNull();
    });
  });

  describe('getVideosByStatus', () => {
    it('should return videos by status', async () => {
      const mockVideos = [
        { _id: new ObjectId(), status: 'pending' },
        { _id: new ObjectId(), status: 'pending' }
      ];

      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(mockVideos)
      };
      mockCollection.find.mockReturnValue(mockQuery);

      const result = await videoRepo.getVideosByStatus('pending');

      expect(result).toEqual(mockVideos);
      expect(mockCollection.find).toHaveBeenCalledWith({ status: 'pending' });
      expect(mockQuery.limit).toHaveBeenCalledWith(100);
    });

    it('should apply custom limit', async () => {
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([])
      };
      mockCollection.find.mockReturnValue(mockQuery);

      await videoRepo.getVideosByStatus('uploaded', 50);

      expect(mockQuery.limit).toHaveBeenCalledWith(50);
    });

    it('should enforce safety limit', async () => {
      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue([])
      };
      mockCollection.find.mockReturnValue(mockQuery);

      await videoRepo.getVideosByStatus('failed', 2000); // Over safety limit

      expect(mockQuery.limit).toHaveBeenCalledWith(1000); // Should be capped
    });
  });
});