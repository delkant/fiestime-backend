export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: any;
  public readonly timestamp: string;
  public readonly requestId?: string;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.INTERNAL_ERROR,
    statusCode: number = 500,
    details?: any,
    requestId?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.requestId = requestId;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  toJSON() {
    return {
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
      requestId: this.requestId,
    };
  }
}

// Validation Error
export class ValidationError extends AppError {
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorCode.VALIDATION_ERROR, 400, details, requestId);
  }
}

// Not Found Error
export class NotFoundError extends AppError {
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorCode.NOT_FOUND, 404, details, requestId);
  }
}

// External Service Error
export class ExternalServiceError extends AppError {
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorCode.EXTERNAL_SERVICE_ERROR, 502, details, requestId);
  }
}

// Rate Limit Error
export class RateLimitError extends AppError {
  constructor(message: string, details?: any, requestId?: string) {
    super(message, ErrorCode.RATE_LIMIT_EXCEEDED, 429, details, requestId);
  }
}