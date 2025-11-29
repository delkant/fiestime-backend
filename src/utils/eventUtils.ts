/**
 * Utility functions for event processing
 */

/**
 * Normalize an event name to be used in S3 folder names
 * Converts to lowercase, replaces spaces and special characters with hyphens
 */
export function normalizeEventName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/-+/g, '-')         // Replace multiple consecutive hyphens with single
    .replace(/^-|-$/g, '');      // Remove leading/trailing hyphens
}

/**
 * Generate S3 folder name based on normalized name, date, and suffix count
 */
export function generateS3Folder(normalizedName: string, date: string, suffixCount: number): string {
  const baseName = `${normalizedName}-${date}`;

  if (suffixCount === 0) {
    return `events/${baseName}`;
  }

  return `events/${baseName}-${suffixCount + 1}`;
}

/**
 * Generate a random join code for events
 */
export function generateJoinCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';

  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

/**
 * Generate join URL from join code
 * In Phase 1, this is a placeholder. In future phases, this would be a real app URL
 */
export function generateJoinUrl(joinCode: string): string {
  return `https://app.fiestime.com/join/${joinCode}`;
}

/**
 * Sanitize filename for S3 storage
 * Replace unsafe characters with underscores
 */
export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9\.\-_]/g, '_');
}

/**
 * Generate S3 key for video files
 */
export function generateVideoS3Key(eventS3Folder: string, originalFileName: string): string {
  const timestamp = Date.now();
  const sanitizedName = sanitizeFileName(originalFileName);

  return `${eventS3Folder}/raw/${timestamp}_${sanitizedName}`;
}

/**
 * Validate event name
 */
export function validateEventName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Event name is required' };
  }

  if (name.length < 1 || name.length > 100) {
    return { valid: false, error: 'Event name must be between 1 and 100 characters' };
  }

  // Only allow letters, numbers, spaces, hyphens, and apostrophes
  if (!/^[a-zA-Z0-9\s\-']+$/.test(name)) {
    return { valid: false, error: 'Event name can only contain letters, numbers, spaces, hyphens, and apostrophes' };
  }

  return { valid: true };
}

/**
 * Validate event date
 */
export function validateEventDate(date: string): { valid: boolean; error?: string } {
  if (!date || typeof date !== 'string') {
    return { valid: false, error: 'Event date is required' };
  }

  // Check if it matches YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return { valid: false, error: 'Event date must be in YYYY-MM-DD format' };
  }

  // Check if it's a valid date
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    return { valid: false, error: 'Event date must be a valid date' };
  }

  // Check if date is not too far in the future (1 year)
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  if (parsedDate > oneYearFromNow) {
    return { valid: false, error: 'Event date cannot be more than 1 year in the future' };
  }

  return { valid: true };
}

/**
 * Validate file name
 */
export function validateFileName(fileName: string): { valid: boolean; error?: string } {
  if (!fileName || typeof fileName !== 'string') {
    return { valid: false, error: 'File name is required' };
  }

  if (fileName.length < 1 || fileName.length > 255) {
    return { valid: false, error: 'File name must be between 1 and 255 characters' };
  }

  // Check for valid video file extensions
  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv'];
  const hasValidExtension = videoExtensions.some(ext =>
    fileName.toLowerCase().endsWith(ext)
  );

  if (!hasValidExtension) {
    return {
      valid: false,
      error: `File must have a valid video extension: ${videoExtensions.join(', ')}`
    };
  }

  return { valid: true };
}

/**
 * Validate content type
 */
export function validateContentType(contentType: string): { valid: boolean; error?: string } {
  if (!contentType || typeof contentType !== 'string') {
    return { valid: false, error: 'Content type is required' };
  }

  const validContentTypes = [
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/webm',
    'video/x-flv',
    'video/x-ms-wmv'
  ];

  if (!validContentTypes.includes(contentType.toLowerCase())) {
    return {
      valid: false,
      error: `Content type must be a valid video MIME type: ${validContentTypes.join(', ')}`
    };
  }

  return { valid: true };
}