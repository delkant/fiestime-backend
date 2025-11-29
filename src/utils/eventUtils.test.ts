import {
  normalizeEventName,
  generateS3Folder,
  generateJoinCode,
  generateJoinUrl,
  sanitizeFileName,
  generateVideoS3Key,
  validateEventName,
  validateEventDate,
  validateFileName,
  validateContentType
} from './eventUtils';

describe('Event Utils', () => {
  describe('normalizeEventName', () => {
    it('should convert name to lowercase and replace spaces with hyphens', () => {
      expect(normalizeEventName('Birthday Party')).toBe('birthday-party');
    });

    it('should handle special characters', () => {
      expect(normalizeEventName("Emma's 5th Party!")).toBe('emmas-5th-party');
    });

    it('should handle multiple consecutive special characters', () => {
      expect(normalizeEventName('Test   Event!!!')).toBe('test-event');
    });

    it('should handle empty strings', () => {
      expect(normalizeEventName('')).toBe('');
    });

    it('should remove leading and trailing special characters', () => {
      expect(normalizeEventName('!@#Birthday Party$%^')).toBe('birthday-party');
    });

    it('should handle numbers and letters correctly', () => {
      expect(normalizeEventName('Event123 Test456')).toBe('event123-test456');
    });
  });

  describe('generateS3Folder', () => {
    it('should create folder name without suffix when count is 0', () => {
      const result = generateS3Folder('soccer-game', '2025-03-03', 0);
      expect(result).toBe('events/soccer-game-2025-03-03');
    });

    it('should append suffix for duplicates', () => {
      const result = generateS3Folder('soccer-game', '2025-03-03', 1);
      expect(result).toBe('events/soccer-game-2025-03-03-2');
    });

    it('should handle higher suffix counts', () => {
      const result = generateS3Folder('birthday-party', '2025-12-25', 4);
      expect(result).toBe('events/birthday-party-2025-12-25-5');
    });
  });

  describe('generateJoinCode', () => {
    it('should generate a 6-character string', () => {
      const code = generateJoinCode();
      expect(code).toHaveLength(6);
    });

    it('should only contain uppercase letters and numbers', () => {
      const code = generateJoinCode();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    });

    it('should generate different codes on multiple calls', () => {
      const code1 = generateJoinCode();
      const code2 = generateJoinCode();
      // While theoretically they could be the same, it's very unlikely
      expect(code1).not.toBe(code2);
    });
  });

  describe('generateJoinUrl', () => {
    it('should create a proper join URL', () => {
      const code = 'ABC123';
      const url = generateJoinUrl(code);
      expect(url).toBe('https://app.fiestime.com/join/ABC123');
    });
  });

  describe('sanitizeFileName', () => {
    it('should replace unsafe characters with underscores', () => {
      expect(sanitizeFileName('video file!@#.mp4')).toBe('video_file___.mp4');
    });

    it('should preserve safe characters', () => {
      expect(sanitizeFileName('video_file-123.mp4')).toBe('video_file-123.mp4');
    });

    it('should handle empty string', () => {
      expect(sanitizeFileName('')).toBe('');
    });

    it('should handle filename with spaces', () => {
      expect(sanitizeFileName('my video file.mp4')).toBe('my_video_file.mp4');
    });
  });

  describe('generateVideoS3Key', () => {
    beforeEach(() => {
      // Mock Date.now() to return a consistent timestamp
      jest.spyOn(Date, 'now').mockReturnValue(1640995200000); // 2022-01-01T00:00:00.000Z
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should generate S3 key with timestamp and sanitized filename', () => {
      const key = generateVideoS3Key('events/test-event-2025-03-03', 'test video.mp4');
      expect(key).toBe('events/test-event-2025-03-03/raw/1640995200000_test_video.mp4');
    });

    it('should handle special characters in filename', () => {
      const key = generateVideoS3Key('events/party-2025-12-25', 'birthday!@#.mov');
      expect(key).toBe('events/party-2025-12-25/raw/1640995200000_birthday___.mov');
    });
  });

  describe('validateEventName', () => {
    it('should accept valid event names', () => {
      const result = validateEventName('Birthday Party');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept names with numbers', () => {
      const result = validateEventName('Event 2025');
      expect(result.valid).toBe(true);
    });

    it('should accept names with hyphens and apostrophes', () => {
      const result = validateEventName("Emma's Birthday-Party");
      expect(result.valid).toBe(true);
    });

    it('should reject empty names', () => {
      const result = validateEventName('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Event name is required');
    });

    it('should reject null/undefined names', () => {
      // @ts-ignore - intentionally testing invalid input
      const result1 = validateEventName(null);
      expect(result1.valid).toBe(false);

      // @ts-ignore - intentionally testing invalid input
      const result2 = validateEventName(undefined);
      expect(result2.valid).toBe(false);
    });

    it('should reject names that are too long', () => {
      const longName = 'a'.repeat(101);
      const result = validateEventName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('between 1 and 100 characters');
    });

    it('should reject names with invalid characters', () => {
      const result = validateEventName('Event@#$%^&*()');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('can only contain');
    });
  });

  describe('validateEventDate', () => {
    it('should accept valid dates', () => {
      const result = validateEventDate('2025-03-03');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid date formats', () => {
      const result = validateEventDate('2025/03/03');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('YYYY-MM-DD format');
    });

    it('should reject empty dates', () => {
      const result = validateEventDate('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Event date is required');
    });

    it('should reject invalid dates', () => {
      const result = validateEventDate('2025-13-45');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid date');
    });

    it('should reject dates too far in the future', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 2);
      const dateStr = futureDate.toISOString().split('T')[0];

      const result = validateEventDate(dateStr);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('more than 1 year in the future');
    });

    it('should accept dates within one year', () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 6);
      const dateStr = futureDate.toISOString().split('T')[0];

      const result = validateEventDate(dateStr);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateFileName', () => {
    it('should accept valid video filenames', () => {
      const result = validateFileName('video.mp4');
      expect(result.valid).toBe(true);
    });

    it('should accept various video extensions', () => {
      const extensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv'];
      extensions.forEach(ext => {
        const result = validateFileName(`test${ext}`);
        expect(result.valid).toBe(true);
      });
    });

    it('should be case insensitive for extensions', () => {
      const result = validateFileName('video.MP4');
      expect(result.valid).toBe(true);
    });

    it('should reject empty filenames', () => {
      const result = validateFileName('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('File name is required');
    });

    it('should reject filenames that are too long', () => {
      const longName = 'a'.repeat(250) + '.mp4';
      const result = validateFileName(longName);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('between 1 and 255 characters');
    });

    it('should reject non-video extensions', () => {
      const result = validateFileName('document.pdf');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid video extension');
    });

    it('should reject files without extensions', () => {
      const result = validateFileName('video');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid video extension');
    });
  });

  describe('validateContentType', () => {
    it('should accept valid video MIME types', () => {
      const validTypes = [
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo',
        'video/x-matroska',
        'video/webm',
        'video/x-flv',
        'video/x-ms-wmv'
      ];

      validTypes.forEach(type => {
        const result = validateContentType(type);
        expect(result.valid).toBe(true);
      });
    });

    it('should be case insensitive', () => {
      const result = validateContentType('VIDEO/MP4');
      expect(result.valid).toBe(true);
    });

    it('should reject empty content types', () => {
      const result = validateContentType('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Content type is required');
    });

    it('should reject non-video MIME types', () => {
      const result = validateContentType('image/jpeg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid video MIME type');
    });

    it('should reject invalid MIME types', () => {
      const result = validateContentType('not-a-mime-type');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('valid video MIME type');
    });
  });
});