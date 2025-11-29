import { ObjectId } from 'mongodb';
import { getEventsCollection } from '../db/mongo';
import { Event, CreateEventInput, EventFilters } from '../models/Event';
import { NotFoundError, ValidationError, ExternalServiceError } from '../models/Error';
import {
  normalizeEventName,
  generateS3Folder,
  generateJoinCode,
  generateJoinUrl,
  validateEventName,
  validateEventDate
} from '../utils/eventUtils';

export class EventRepository {
  /**
   * Create a new event with unique S3 folder
   */
  async createEvent(input: CreateEventInput): Promise<Event> {
    // Validate input
    const nameValidation = validateEventName(input.name);
    if (!nameValidation.valid) {
      throw new ValidationError(nameValidation.error!);
    }

    const dateValidation = validateEventDate(input.date);
    if (!dateValidation.valid) {
      throw new ValidationError(dateValidation.error!);
    }

    if (input.description && input.description.length > 500) {
      throw new ValidationError('Event description must be 500 characters or less');
    }

    if (input.location && input.location.length > 100) {
      throw new ValidationError('Event location must be 100 characters or less');
    }

    try {
      const collection = await getEventsCollection();
      const normalizedName = normalizeEventName(input.name);

      // Find existing events with same normalized name and date to determine suffix
      const existingCount = await collection.countDocuments({
        normalizedName,
        date: input.date
      });

      // Generate unique S3 folder
      const s3Folder = generateS3Folder(normalizedName, input.date, existingCount);

      // Generate join code and URL
      const joinCode = generateJoinCode();
      const joinUrl = generateJoinUrl(joinCode);

      const now = new Date();

      const event: Event = {
        name: input.name.trim(),
        normalizedName,
        date: input.date,
        description: input.description?.trim(),
        location: input.location?.trim(),
        s3Folder,
        joinCode,
        joinUrl,
        createdAt: now,
        updatedAt: now
      };

      const result = await collection.insertOne(event);

      return {
        ...event,
        _id: result.insertedId
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new ExternalServiceError(`Failed to create event: ${error.message}`);
      }

      throw new ExternalServiceError('Failed to create event');
    }
  }

  /**
   * Get an event by ID
   */
  async getEventById(id: string): Promise<Event | null> {
    try {
      const collection = await getEventsCollection();
      const objectId = new ObjectId(id);

      const event = await collection.findOne({ _id: objectId });

      return event;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ObjectId')) {
        throw new ValidationError('Invalid event ID format');
      }

      throw new ExternalServiceError('Failed to fetch event');
    }
  }

  /**
   * Get an event by join code
   */
  async getEventByJoinCode(joinCode: string): Promise<Event | null> {
    try {
      const collection = await getEventsCollection();

      const event = await collection.findOne({ joinCode });

      return event;
    } catch (error) {
      throw new ExternalServiceError('Failed to fetch event by join code');
    }
  }

  /**
   * List events with filtering and pagination
   */
  async listEvents(filters: EventFilters = {}): Promise<Event[]> {
    try {
      const collection = await getEventsCollection();

      const limit = Math.min(filters.limit || 20, 100); // Max 100 items
      const offset = filters.offset || 0;
      const sortBy = filters.sortBy || 'createdAt';
      const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;

      const events = await collection
        .find({})
        .sort({ [sortBy]: sortOrder })
        .skip(offset)
        .limit(limit)
        .toArray();

      return events;
    } catch (error) {
      throw new ExternalServiceError('Failed to list events');
    }
  }

  /**
   * Update event
   */
  async updateEvent(id: string, updates: Partial<Event>): Promise<Event> {
    try {
      const collection = await getEventsCollection();
      const objectId = new ObjectId(id);

      // Validate updates
      if (updates.name) {
        const nameValidation = validateEventName(updates.name);
        if (!nameValidation.valid) {
          throw new ValidationError(nameValidation.error!);
        }
      }

      if (updates.date) {
        const dateValidation = validateEventDate(updates.date);
        if (!dateValidation.valid) {
          throw new ValidationError(dateValidation.error!);
        }
      }

      const updateDoc = {
        ...updates,
        updatedAt: new Date()
      };

      // Remove fields that shouldn't be updated
      delete (updateDoc as any)._id;
      delete (updateDoc as any).createdAt;
      delete (updateDoc as any).s3Folder; // S3 folder should not be changed after creation
      delete (updateDoc as any).joinCode; // Join code should not be changed

      const result = await collection.findOneAndUpdate(
        { _id: objectId },
        { $set: updateDoc },
        { returnDocument: 'after' }
      );

      if (!result) {
        throw new NotFoundError('Event not found');
      }

      return result;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }

      if (error instanceof Error && error.message.includes('ObjectId')) {
        throw new ValidationError('Invalid event ID format');
      }

      throw new ExternalServiceError('Failed to update event');
    }
  }

  /**
   * Delete event
   */
  async deleteEvent(id: string): Promise<boolean> {
    try {
      const collection = await getEventsCollection();
      const objectId = new ObjectId(id);

      const result = await collection.deleteOne({ _id: objectId });

      return result.deletedCount > 0;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ObjectId')) {
        throw new ValidationError('Invalid event ID format');
      }

      throw new ExternalServiceError('Failed to delete event');
    }
  }

  /**
   * Check if S3 folder exists (for testing purposes)
   */
  async doesS3FolderExist(s3Folder: string): Promise<boolean> {
    try {
      const collection = await getEventsCollection();

      const count = await collection.countDocuments({ s3Folder });

      return count > 0;
    } catch (error) {
      throw new ExternalServiceError('Failed to check S3 folder existence');
    }
  }
}