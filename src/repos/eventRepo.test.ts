import { ObjectId } from 'mongodb';
import { EventRepository } from './eventRepo';
import { CreateEventInput } from '../models/Event';
import { ValidationError, NotFoundError } from '../models/Error';

// Mock the database module
jest.mock('../db/mongo');

// Mock the utilities
jest.mock('../utils/eventUtils', () => ({
  normalizeEventName: jest.fn((name: string) => name.toLowerCase().replace(/\s+/g, '-')),
  generateS3Folder: jest.fn((normalizedName: string, date: string, count: number) =>
    count === 0 ? `events/${normalizedName}-${date}` : `events/${normalizedName}-${date}-${count + 1}`
  ),
  generateJoinCode: jest.fn(() => 'ABC123'),
  generateJoinUrl: jest.fn((code: string) => `https://app.fiestime.com/join/${code}`),
  validateEventName: jest.fn(() => ({ valid: true })),
  validateEventDate: jest.fn(() => ({ valid: true }))
}));

describe('EventRepository', () => {
  let eventRepo: EventRepository;
  let mockCollection: any;

  beforeEach(() => {
    eventRepo = new EventRepository();

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
      countDocuments: jest.fn()
    };

    const { getEventsCollection } = require('../db/mongo');
    getEventsCollection.mockResolvedValue(mockCollection);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createEvent', () => {
    const validInput: CreateEventInput = {
      name: 'Test Event',
      date: '2025-03-03',
      description: 'Test description',
      location: 'Test location'
    };

    it('should create an event successfully', async () => {
      const mockInsertedId = new ObjectId();
      mockCollection.countDocuments.mockResolvedValue(0);
      mockCollection.insertOne.mockResolvedValue({ insertedId: mockInsertedId });

      const result = await eventRepo.createEvent(validInput);

      expect(result).toMatchObject({
        name: 'Test Event',
        normalizedName: 'test-event',
        date: '2025-03-03',
        description: 'Test description',
        location: 'Test location',
        s3Folder: 'events/test-event-2025-03-03',
        joinCode: 'ABC123',
        joinUrl: 'https://app.fiestime.com/join/ABC123',
        _id: mockInsertedId
      });

      expect(mockCollection.countDocuments).toHaveBeenCalledWith({
        normalizedName: 'test-event',
        date: '2025-03-03'
      });
      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Event',
          s3Folder: 'events/test-event-2025-03-03'
        })
      );
    });

    it('should handle duplicate event names with suffix', async () => {
      const mockInsertedId = new ObjectId();
      mockCollection.countDocuments.mockResolvedValue(1); // One existing event
      mockCollection.insertOne.mockResolvedValue({ insertedId: mockInsertedId });

      const result = await eventRepo.createEvent(validInput);

      expect(result.s3Folder).toBe('events/test-event-2025-03-03-2');
    });

    it('should validate event name', async () => {
      const { validateEventName } = require('../utils/eventUtils');
      validateEventName.mockReturnValue({ valid: false, error: 'Invalid name' });

      await expect(eventRepo.createEvent(validInput))
        .rejects.toThrow(ValidationError);

      expect(validateEventName).toHaveBeenCalledWith('Test Event');
    });

    it('should validate event date', async () => {
      const { validateEventDate } = require('../utils/eventUtils');
      validateEventDate.mockReturnValue({ valid: false, error: 'Invalid date' });

      await expect(eventRepo.createEvent(validInput))
        .rejects.toThrow(ValidationError);
    });

    it('should validate description length', async () => {
      const inputWithLongDescription = {
        ...validInput,
        description: 'a'.repeat(501) // Too long
      };

      await expect(eventRepo.createEvent(inputWithLongDescription))
        .rejects.toThrow(ValidationError);
    });

    it('should validate location length', async () => {
      const inputWithLongLocation = {
        ...validInput,
        location: 'a'.repeat(101) // Too long
      };

      await expect(eventRepo.createEvent(inputWithLongLocation))
        .rejects.toThrow(ValidationError);
    });

    it('should trim whitespace from inputs', async () => {
      const mockInsertedId = new ObjectId();
      mockCollection.countDocuments.mockResolvedValue(0);
      mockCollection.insertOne.mockResolvedValue({ insertedId: mockInsertedId });

      const inputWithWhitespace = {
        name: '  Test Event  ',
        date: '2025-03-03',
        description: '  Test description  ',
        location: '  Test location  '
      };

      const result = await eventRepo.createEvent(inputWithWhitespace);

      expect(result.name).toBe('Test Event');
      expect(result.description).toBe('Test description');
      expect(result.location).toBe('Test location');
    });
  });

  describe('getEventById', () => {
    it('should return event when found', async () => {
      const mockEvent = {
        _id: new ObjectId(),
        name: 'Test Event',
        date: '2025-03-03'
      };
      mockCollection.findOne.mockResolvedValue(mockEvent);

      const result = await eventRepo.getEventById(mockEvent._id.toString());

      expect(result).toEqual(mockEvent);
      expect(mockCollection.findOne).toHaveBeenCalledWith({ _id: mockEvent._id });
    });

    it('should return null when event not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await eventRepo.getEventById('507f1f77bcf86cd799439011');

      expect(result).toBeNull();
    });

    it('should throw ValidationError for invalid ObjectId', async () => {
      await expect(eventRepo.getEventById('invalid-id'))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('getEventByJoinCode', () => {
    it('should return event when found by join code', async () => {
      const mockEvent = {
        _id: new ObjectId(),
        name: 'Test Event',
        joinCode: 'ABC123'
      };
      mockCollection.findOne.mockResolvedValue(mockEvent);

      const result = await eventRepo.getEventByJoinCode('ABC123');

      expect(result).toEqual(mockEvent);
      expect(mockCollection.findOne).toHaveBeenCalledWith({ joinCode: 'ABC123' });
    });

    it('should return null when event not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await eventRepo.getEventByJoinCode('NOTFOUND');

      expect(result).toBeNull();
    });
  });

  describe('listEvents', () => {
    it('should list events with default parameters', async () => {
      const mockEvents = [
        { _id: new ObjectId(), name: 'Event 1' },
        { _id: new ObjectId(), name: 'Event 2' }
      ];

      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(mockEvents)
      };
      mockCollection.find.mockReturnValue(mockQuery);

      const result = await eventRepo.listEvents();

      expect(result).toEqual(mockEvents);
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockQuery.skip).toHaveBeenCalledWith(0);
      expect(mockQuery.limit).toHaveBeenCalledWith(20);
    });

    it('should apply custom filters', async () => {
      const mockEvents = [{ _id: new ObjectId(), name: 'Event 1' }];

      const mockQuery = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn().mockResolvedValue(mockEvents)
      };
      mockCollection.find.mockReturnValue(mockQuery);

      await eventRepo.listEvents({
        limit: 10,
        offset: 5,
        sortBy: 'name',
        sortOrder: 'asc'
      });

      expect(mockQuery.sort).toHaveBeenCalledWith({ name: 1 });
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

      await eventRepo.listEvents({ limit: 200 }); // Over maximum

      expect(mockQuery.limit).toHaveBeenCalledWith(100); // Should be capped
    });
  });

  describe('updateEvent', () => {
    const mockEventId = '507f1f77bcf86cd799439011';

    it('should update event successfully', async () => {
      const mockUpdatedEvent = {
        _id: new ObjectId(mockEventId),
        name: 'Updated Event',
        updatedAt: new Date()
      };
      mockCollection.findOneAndUpdate.mockResolvedValue(mockUpdatedEvent);

      const result = await eventRepo.updateEvent(mockEventId, { name: 'Updated Event' });

      expect(result).toEqual(mockUpdatedEvent);
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: new ObjectId(mockEventId) },
        { $set: expect.objectContaining({ name: 'Updated Event', updatedAt: expect.any(Date) }) },
        { returnDocument: 'after' }
      );
    });

    it('should throw NotFoundError when event not found', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValue(null);

      await expect(eventRepo.updateEvent(mockEventId, { name: 'Updated' }))
        .rejects.toThrow(NotFoundError);
    });

    it('should validate name when updating', async () => {
      const { validateEventName } = require('../utils/eventUtils');
      validateEventName.mockReturnValue({ valid: false, error: 'Invalid name' });

      await expect(eventRepo.updateEvent(mockEventId, { name: 'Invalid' }))
        .rejects.toThrow(ValidationError);
    });

    it('should not allow updating protected fields', async () => {
      const mockUpdatedEvent = { _id: new ObjectId(mockEventId) };
      mockCollection.findOneAndUpdate.mockResolvedValue(mockUpdatedEvent);

      await eventRepo.updateEvent(mockEventId, {
        name: 'Updated',
        _id: new ObjectId(), // Should be ignored
        createdAt: new Date(), // Should be ignored
        s3Folder: 'new-folder', // Should be ignored
        joinCode: 'NEWCODE' // Should be ignored
      } as any);

      const setArg = mockCollection.findOneAndUpdate.mock.calls[0][1].$set;
      expect(setArg._id).toBeUndefined();
      expect(setArg.createdAt).toBeUndefined();
      expect(setArg.s3Folder).toBeUndefined();
      expect(setArg.joinCode).toBeUndefined();
      expect(setArg.name).toBe('Updated');
    });
  });

  describe('deleteEvent', () => {
    it('should delete event successfully', async () => {
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 });

      const result = await eventRepo.deleteEvent('507f1f77bcf86cd799439011');

      expect(result).toBe(true);
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({
        _id: new ObjectId('507f1f77bcf86cd799439011')
      });
    });

    it('should return false when event not found', async () => {
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 0 });

      const result = await eventRepo.deleteEvent('507f1f77bcf86cd799439011');

      expect(result).toBe(false);
    });

    it('should throw ValidationError for invalid ObjectId', async () => {
      await expect(eventRepo.deleteEvent('invalid-id'))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('doesS3FolderExist', () => {
    it('should return true when folder exists', async () => {
      mockCollection.countDocuments.mockResolvedValue(1);

      const result = await eventRepo.doesS3FolderExist('events/test-folder');

      expect(result).toBe(true);
      expect(mockCollection.countDocuments).toHaveBeenCalledWith({
        s3Folder: 'events/test-folder'
      });
    });

    it('should return false when folder does not exist', async () => {
      mockCollection.countDocuments.mockResolvedValue(0);

      const result = await eventRepo.doesS3FolderExist('events/nonexistent');

      expect(result).toBe(false);
    });
  });
});