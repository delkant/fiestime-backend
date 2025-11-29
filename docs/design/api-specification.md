# fiestime Backend API Specification

## Overview

This document provides comprehensive API documentation for the fiestime backend GraphQL API. The API is event-centric, requiring all video uploads to be associated with an existing event.

## Base Information

- **Protocol**: GraphQL over HTTPS
- **Content-Type**: `application/json`
- **Endpoint**: `/graphql`
- **Environments**:
  - **Sandbox**: `https://api-sandbox.fiestime.app/graphql`
  - **QA**: `https://api-qa.fiestime.app/graphql`
  - **Production**: `https://api.fiestime.app/graphql`

## Authentication

**Phase 1**: No authentication required (trusted client model)
**Future Phases**: JWT-based authentication with user accounts

## GraphQL Schema

### Types

#### Event
Represents a real-world event where videos are collected.

```graphql
type Event {
  _id: ID!
  name: String!
  normalizedName: String!
  date: String!
  description: String
  location: String
  s3Folder: String!
  joinCode: String!
  joinUrl: String!
  createdAt: DateTime!
  updatedAt: DateTime!
  videoCount: Int!
}
```

#### Video
Represents an uploaded video file associated with an event.

```graphql
type Video {
  _id: ID!
  eventId: ID!
  eventS3Folder: String!
  s3Key: String!
  originalFileName: String!
  contentType: String!
  sizeBytes: Int
  status: VideoStatus!
  sourceDevice: String
  sourceCameraLabel: String
  createdAt: DateTime!
  updatedAt: DateTime!
  uploadedAt: DateTime
}
```

#### VideoStatus
```graphql
enum VideoStatus {
  PENDING
  UPLOADED
  FAILED
}
```

#### CreateUploadUrlPayload
```graphql
type CreateUploadUrlPayload {
  uploadUrl: String!
  bucket: String!
  key: String!
  expiresInSeconds: Int!
  videoId: ID!
}
```

### Mutations

#### createEvent
Creates a new event for organizing video uploads.

```graphql
createEvent(
  name: String!
  date: String!
  description: String
  location: String
): Event!
```

**Parameters:**
- `name` (required): Human-readable event name (max 100 chars)
- `date` (required): ISO date string (YYYY-MM-DD format)
- `description` (optional): Event description (max 500 chars)
- `location` (optional): Event location (max 100 chars)

**Example:**
```graphql
mutation {
  createEvent(
    name: "Emma's 5th Birthday Party"
    date: "2025-03-15"
    description: "Birthday celebration at the park"
    location: "Central Park, NYC"
  ) {
    _id
    name
    s3Folder
    joinCode
    joinUrl
    createdAt
  }
}
```

**Response:**
```json
{
  "data": {
    "createEvent": {
      "_id": "60f7b8c8d4e5a12345678901",
      "name": "Emma's 5th Birthday Party",
      "s3Folder": "events/emmas-5th-birthday-party-2025-03-15",
      "joinCode": "X4H29Q",
      "joinUrl": "https://app.fiestime.com/join/X4H29Q",
      "createdAt": "2025-03-03T10:30:00.000Z"
    }
  }
}
```

#### createUploadUrl
Generates a pre-signed S3 URL for uploading videos to a specific event.

```graphql
createUploadUrl(
  eventId: ID!
  fileName: String!
  contentType: String!
  sourceDevice: String
  sourceCameraLabel: String
): CreateUploadUrlPayload!
```

**Parameters:**
- `eventId` (required): ID of the event to upload to
- `fileName` (required): Original filename (max 255 chars)
- `contentType` (required): MIME type (video/mp4, video/mov, video/avi, video/mkv)
- `sourceDevice` (optional): Device identifier (max 50 chars)
- `sourceCameraLabel` (optional): Camera label (max 50 chars)

**Example:**
```graphql
mutation {
  createUploadUrl(
    eventId: "60f7b8c8d4e5a12345678901"
    fileName: "birthday_cake_moment.mp4"
    contentType: "video/mp4"
    sourceDevice: "iPhone 14 Pro"
    sourceCameraLabel: "Main Camera"
  ) {
    uploadUrl
    bucket
    key
    expiresInSeconds
    videoId
  }
}
```

**Response:**
```json
{
  "data": {
    "createUploadUrl": {
      "uploadUrl": "https://fiestime-sandbox-uploads.s3.amazonaws.com/events/emmas-5th-birthday-party-2025-03-15/raw/1739212123456_birthday_cake_moment.mp4?...",
      "bucket": "fiestime-sandbox-uploads",
      "key": "events/emmas-5th-birthday-party-2025-03-15/raw/1739212123456_birthday_cake_moment.mp4",
      "expiresInSeconds": 900,
      "videoId": "60f7b8c8d4e5a12345678902"
    }
  }
}
```

### Queries

#### listEvents
Lists events with optional pagination and filtering.

```graphql
listEvents(
  limit: Int = 20
  offset: Int = 0
  sortBy: EventSortField = CREATED_AT
  sortOrder: SortOrder = DESC
): [Event!]!
```

**Parameters:**
- `limit` (optional): Maximum number of events to return (max 100)
- `offset` (optional): Number of events to skip
- `sortBy` (optional): Field to sort by (CREATED_AT, NAME, DATE)
- `sortOrder` (optional): Sort direction (ASC, DESC)

**Example:**
```graphql
query {
  listEvents(limit: 10, offset: 0) {
    _id
    name
    date
    videoCount
    createdAt
  }
}
```

#### getEvent
Retrieves a specific event by ID.

```graphql
getEvent(id: ID!): Event
```

**Example:**
```graphql
query {
  getEvent(id: "60f7b8c8d4e5a12345678901") {
    _id
    name
    date
    description
    location
    s3Folder
    joinCode
    videoCount
    createdAt
  }
}
```

#### listEventVideos
Lists videos for a specific event.

```graphql
listEventVideos(
  eventId: ID!
  limit: Int = 20
  offset: Int = 0
  status: VideoStatus
): [Video!]!
```

**Parameters:**
- `eventId` (required): ID of the event
- `limit` (optional): Maximum number of videos to return
- `offset` (optional): Number of videos to skip
- `status` (optional): Filter by video status

**Example:**
```graphql
query {
  listEventVideos(eventId: "60f7b8c8d4e5a12345678901") {
    _id
    originalFileName
    sizeBytes
    status
    sourceDevice
    createdAt
  }
}
```

## Error Handling

### Error Format
All errors follow GraphQL specification with additional context:

```json
{
  "errors": [
    {
      "message": "Event not found",
      "code": "NOT_FOUND",
      "path": ["getEvent"],
      "extensions": {
        "details": {
          "eventId": "60f7b8c8d4e5a12345678901"
        },
        "timestamp": "2025-03-03T10:30:00.000Z",
        "requestId": "req-abc123"
      }
    }
  ]
}
```

### Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `VALIDATION_ERROR` | Input validation failed | 400 |
| `NOT_FOUND` | Resource not found | 404 |
| `INTERNAL_ERROR` | Server error | 500 |
| `EXTERNAL_SERVICE_ERROR` | AWS/MongoDB error | 502 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |

### Validation Rules

#### Event Creation
- `name`: 1-100 characters, no special characters except spaces, hyphens, apostrophes
- `date`: Valid ISO date (YYYY-MM-DD), not more than 1 year in the future
- `description`: 0-500 characters
- `location`: 0-100 characters

#### Upload URL Generation
- `fileName`: 1-255 characters, valid file extension
- `contentType`: Must be video MIME type (video/mp4, video/mov, video/avi, video/mkv)
- `eventId`: Must reference existing event
- File size limit: 5GB (enforced by S3)

## Rate Limiting

**Current Limits (per IP address):**
- **Event creation**: 10 requests/minute
- **Upload URL generation**: 50 requests/minute
- **Query operations**: 100 requests/minute

**Headers:**
- `X-RateLimit-Limit`: Maximum requests per window
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Unix timestamp when window resets

## S3 Upload Process

### 1. Request Upload URL
Use `createUploadUrl` mutation to get pre-signed URL.

### 2. Upload File to S3
```bash
curl -X PUT "${uploadUrl}" \
  -H "Content-Type: ${contentType}" \
  --data-binary "@${filePath}"
```

### 3. Verify Upload (Optional)
Query `listEventVideos` to confirm upload completed successfully.

## Integration Examples

### JavaScript/TypeScript
```typescript
// Create event
const CREATE_EVENT = gql`
  mutation CreateEvent($name: String!, $date: String!) {
    createEvent(name: $name, date: $date) {
      _id
      s3Folder
      joinCode
    }
  }
`;

// Request upload URL
const CREATE_UPLOAD_URL = gql`
  mutation CreateUploadUrl($eventId: ID!, $fileName: String!, $contentType: String!) {
    createUploadUrl(eventId: $eventId, fileName: $fileName, contentType: $contentType) {
      uploadUrl
      key
      expiresInSeconds
    }
  }
`;

// Upload file
async function uploadVideo(file: File, eventId: string) {
  // 1. Get upload URL
  const { data } = await apolloClient.mutate({
    mutation: CREATE_UPLOAD_URL,
    variables: {
      eventId,
      fileName: file.name,
      contentType: file.type
    }
  });

  // 2. Upload to S3
  const response = await fetch(data.createUploadUrl.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type
    }
  });

  if (!response.ok) {
    throw new Error('Upload failed');
  }
}
```

### React Native
```javascript
import { DocumentPicker } from 'expo-document-picker';

async function selectAndUploadVideo(eventId) {
  // 1. Select video file
  const result = await DocumentPicker.getDocumentAsync({
    type: 'video/*',
    copyToCacheDirectory: true
  });

  if (result.type === 'success') {
    // 2. Get upload URL
    const uploadUrlResult = await client.mutate({
      mutation: CREATE_UPLOAD_URL,
      variables: {
        eventId,
        fileName: result.name,
        contentType: result.mimeType
      }
    });

    // 3. Upload file
    const formData = new FormData();
    formData.append('file', {
      uri: result.uri,
      type: result.mimeType,
      name: result.name
    });

    await fetch(uploadUrlResult.data.createUploadUrl.uploadUrl, {
      method: 'PUT',
      body: formData
    });
  }
}
```

## Performance Considerations

### Pagination
- Use limit/offset for large result sets
- Maximum limit is 100 items per request
- Consider cursor-based pagination for real-time applications

### Caching
- Event metadata can be cached for 5 minutes
- Upload URLs should not be cached (short-lived)
- Video lists can be cached for 1 minute

### Upload Optimization
- Use multipart uploads for files > 100MB (future phase)
- Compress videos on client side when possible
- Consider resumable uploads for unreliable networks (future phase)

## Monitoring & Debugging

### Request Tracing
Include `X-Request-ID` header for request correlation:
```bash
curl -H "X-Request-ID: req-123" -X POST /graphql
```

### GraphQL Query Complexity
- Queries are analyzed for complexity
- Maximum depth: 10 levels
- Maximum complexity score: 1000

### Debugging Headers
Response includes debugging information:
- `X-Response-Time`: Server processing time
- `X-Request-ID`: Request correlation ID
- `X-Environment`: Environment (sandbox/qa/prod)

## Changelog

### v1.0.0 (Phase 1)
- Initial GraphQL API
- Event-centric video uploads
- Pre-signed S3 URLs
- Basic event management

### Future Versions
- v1.1.0: User authentication
- v1.2.0: Real-time collaboration
- v1.3.0: Video processing pipeline
- v2.0.0: Multi-camera synchronization