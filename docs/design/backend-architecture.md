# fiestime Backend Architecture – Phase 1 (Event-Centric, Upload-Only)

This document describes the **backend architecture** for the fiestime project in enough detail
that a developer (or AI code generator) can implement the backend code with minimal ambiguity.

Phase 1 scope:

- Event-centric design (an **Event** must be created first).
- Pre-signed S3 upload URLs for large video files.
- MongoDB Atlas for persistent data (Events, Videos).
- AWS Lambda + API Gateway (HTTP API) + GraphQL.
- Environment separation: **sandbox**, **qa**, **prod**.
- No authentication / authorization yet (trusted client).

---

## 1. High-Level Architecture

### 1.1 Components

- **Client** (React Native app)
  - Creates Events.
  - Requests upload URLs tied to a specific Event.
  - Uploads videos directly to S3 using pre-signed URLs.
  - Lists Events and Event videos.

- **AWS API Gateway (HTTP API)**
  - Single public endpoint: `POST /graphql`.
  - For each environment (sandbox, qa, prod) we have a separate API (separate stack).

- **AWS Lambda (GraphQL handler)**
  - Node.js 20.x + TypeScript.
  - Uses Apollo Server to process GraphQL requests.
  - Resolvers implement:
    - Event creation and lookup.
    - Upload URL creation tied to Events.
    - Listing of Event videos.
  - Uses MongoDB Atlas (via official Node driver) and S3 (via aws-sdk v2).

- **MongoDB Atlas**
  - Single logical database per environment, e.g. `fiestime_sandbox`, `fiestime_qa`, `fiestime_prod`.
  - Collections:
    - `events`
    - `videos`
    - (Future: `users`, `participants`, `teams`, etc.)
  - Accessed via a connection string stored in **AWS Secrets Manager**.

- **Amazon S3**
  - One **upload bucket** per environment, e.g.:
    - `fiestime-sandbox-uploads`
    - `fiestime-qa-uploads`
    - `fiestime-prod-uploads`
  - S3 bucket names are passed via CloudFormation parameter `UploadBucketName`.

- **AWS Secrets Manager**
  - Stores secrets needed by Lambda:
    - MongoDB connection URI.
    - (Optional) storage-related config (e.g., CDN base URL).

---

## 2. Data Models

All models live in **MongoDB Atlas**. Below are the initial Phase 1 schema outlines.

> Note: Field names and types are **guidance** for implementation. Minor adjustments are allowed as long as semantics are preserved.

### 2.1 Event Model

Collection: `events`

Represents a real-world event such as a birthday party, soccer game, or meeting.

```ts
type Event = {
  _id: ObjectId;

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
};
```

#### 2.1.1 Event Naming and S3 Folder Rules

1. Events are uniquely identified in the DB by `_id`, but they also have a **human-readable** folder name.
2. When an Event is created, the backend:
   - Slugifies `name` → `normalizedName` (e.g., `"Birthday Party"` → `"birthday-party"`).
   - Formats `date` as `YYYY-MM-DD`.
   - Computes a **base folder name**:
     - `"{NormalizedName}-{YYYY-MM-DD}"`, e.g. `"soccer-game-2025-03-03"`.
3. To ensure uniqueness across same-name/same-date events:
   - First event with name+date gets:
     - `s3Folder = "events/soccer-game-2025-03-03"`.
   - If a folder with that base exists (another event already uses it), create an incremented suffix:
     - `events/soccer-game-2025-03-03-2`
     - `events/soccer-game-2025-03-03-3`
     - etc.
4. This S3 folder is stored exactly as `s3Folder` in the Event document.

> **AI implementation note:**  
> To pick the folder name, query the `events` collection for existing events with same `normalizedName` + `date`, count them, and append `-N` when `count >= 1`.

---

### 2.2 Video Model

Collection: `videos`

Represents a single uploaded video file for an event, typically from a single device/camera.

```ts
type Video = {
  _id: ObjectId;

  eventId: ObjectId;       // FK to Events._id
  eventS3Folder: string;   // denormalized copy of Event.s3Folder for convenience

  // Upload info
  s3Key: string;           // e.g. "events/soccer-game-2025-03-03-2/raw/1739212123_cam1.mp4"
  originalFileName: string;
  contentType: string;     // e.g. "video/mp4"
  sizeBytes?: number;      // optional, can be filled post-upload
  status: "pending" | "uploaded" | "failed";

  // Device / source metadata
  sourceDevice?: string;   // e.g. "iPhone 14", or generic string provided by client
  sourceCameraLabel?: string; // e.g. "Cam 1", "Goal Cam", "Phone A"

  // Timestamps
  createdAt: Date;         // when upload URL was requested
  updatedAt: Date;
  uploadedAt?: Date;       // optional, set when confirmed uploaded in future phases
};
```

#### 2.2.1 S3 Key Rules for Videos

When a client requests a pre-signed URL for a video within an Event:

1. Backend loads the Event by `eventId`.
2. Takes the Event’s `s3Folder`, e.g. `events/soccer-game-2025-03-03-2`.
3. Builds a key:

```text
{eventS3Folder}/raw/{epochMillis}_{sanitizedFileName}
```

Example:

```text
events/soccer-game-2025-03-03-2/raw/1739212123_cam3_match1.mp4
```

Where:

- `sanitizedFileName` is the original file name with unsafe characters replaced by `_`.
- `epochMillis` is `Date.now()` in milliseconds at the time of URL generation.

The `videos.s3Key` field stores this full S3 key.

---

## 3. MongoDB Atlas Configuration

### 3.1 Databases and Collections

Per environment we have a separate Atlas database:

- `fiestime_sandbox`
- `fiestime_qa`
- `fiestime_prod`

Each database contains:

- `events`
- `videos`

Collections are created automatically when documents are first inserted.

### 3.2 MongoDB Connection Strategy (Lambda)

- Use the official `mongodb` Node.js driver (to be added to dependencies).
- Implement a **global connection singleton** to reuse the connection across Lambda invocations:

```ts
// Pseudo-code
let cachedClient: MongoClient | null = null;

async function getMongoClient(): Promise<MongoClient> {
  if (cachedClient && cachedClient.topology?.isConnected()) {
    return cachedClient;
  }

  const uri = await resolveMongoUriFromSecretsManager();
  const client = new MongoClient(uri, { /* options */ });
  await client.connect();
  cachedClient = client;
  return client;
}
```

> **AI implementation note:**  
> Create helper modules like `src/db/mongo.ts` to encapsulate connection logic and DB/collection accessors.

---

## 4. Secrets and Configuration

All sensitive configuration (DB URLs, etc.) is stored in **AWS Secrets Manager**.
Non-sensitive configuration (S3 bucket names, environment names) is passed via **CloudFormation parameters** and Lambda environment variables.

### 4.1 Secrets Manager – Naming Conventions

We use **per-environment** secret names:

- MongoDB URI:
  - `fiestime/sandbox/mongodb`
  - `fiestime/qa/mongodb`
  - `fiestime/prod/mongodb`

Each secret’s value is a JSON object:

```json
{
  "uri": "mongodb+srv://user:password@cluster0.xxxxxx.mongodb.net/fiestime_sandbox?retryWrites=true&w=majority"
}
```

> Only the `uri` key is required for now. In the future we might add other DB-related config.

Optionally, you may also define a storage config secret (future):

- `fiestime/sandbox/storage`
- `fiestime/qa/storage`
- `fiestime/prod/storage`

With value:

```json
{
  "uploadBucket": "fiestime-sandbox-uploads",
  "cdnBaseUrl": "https://cdn-sandbox.fiestime.app"
}
```

### 4.2 Lambda Environment Variables

For each environment (stack), configure Lambda with:

- `MONGODB_URI_SECRET_NAME` – e.g. `fiestime/sandbox/mongodb`
- `AWS_REGION` – injected by CloudFormation (`AWS::Region`)
- `UPLOAD_BUCKET` – from `UploadBucketName` CloudFormation parameter
- `PRESIGNED_URL_TTL_SECONDS` – e.g. `900` (15 minutes)

> **AI implementation note:**  
> Use `process.env.MONGODB_URI_SECRET_NAME` and `AWS.SecretsManager` to load the secret once per cold start and cache the URI.

---

## 5. S3 Bucket Layout

Each environment has its **own upload bucket** (supplied to the stack via `UploadBucketName` parameter).

Within that bucket, keys are organized as:

```text
events/{eventFolder}/raw/{timestamp}_{fileName}
```

Where:

- `{eventFolder}` is derived and stored in `events.s3Folder`
- `raw` is the subfolder for original, unprocessed uploads.

Examples:

```text
events/u12-final-2025-06-01/raw/1739212123_goal_cam.mp4
events/birthday-party-2025-11-20-2/raw/1739213000_cam2.mov
```

This structure ensures that:

- All files for a given Event are grouped under a single prefix.
- Multiple events with the same name+date are still uniquely separated by the `-2`, `-3`, etc. suffix.

---

## 6. GraphQL API Responsibilities (Phase 1)

Even though the current `src/graphql/schema.ts` is minimal, the **intended** GraphQL responsibilities for Phase 1 are:

### 6.1 Event Operations

1. `createEvent(name: String!, date: String!): Event!`
   - Validates input.
   - Derives `normalizedName` and `s3Folder`.
   - Ensures unique `s3Folder` using suffixing logic.
   - Inserts new Event into MongoDB.
   - Returns the created Event, including `s3Folder` and `joinUrl` (joinUrl can be a placeholder stub in Phase 1).

2. `listEvents(limit: Int, offset: Int): [Event!]`
   - Simple pagination over events.

3. `getEvent(id: ID!): Event`
   - Fetch a specific Event by `_id`.

### 6.2 Video Operations

1. `createUploadUrl(eventId: ID!, fileName: String!, contentType: String!): CreateUploadUrlPayload!`
   - Loads Event by `eventId`.
   - Generates an S3 key under Event’s `s3Folder`.
   - Optionally inserts a Video document with status `"pending"`.
   - Uses S3 `getSignedUrlPromise("putObject", ...)` to generate pre-signed URL.
   - Returns:
     - `uploadUrl`
     - `bucket`
     - `key`
     - `expiresInSeconds`

2. `listEventVideos(eventId: ID!): [Video!]`
   - Lists `videos` documents for a given Event.

> **AI implementation note:**  
> Phase 1 may not fully implement all of these, but the schema should be designed with these as the target so that later phases can extend easily.

---

## 7. Environment Separation

We support three Git branches and environments:

- `sandbox` → sandbox environment
- `qa` → qa environment
- `prod` → production environment

Each environment has:

- Its own CloudFormation stack (stack names via GitHub secrets, e.g. `FIESTIME_SANDBOX_STACK`).
- Its own S3 upload bucket.
- Its own MongoDB Atlas database and URI.
- Its own Secrets Manager entries.

The GitHub Actions workflows:

- Build and package the Lambda code.
- Upload the artifact to a **code bucket**.
- Run `aws cloudformation deploy` with environment-specific parameters.

---

## 8. What to Expect as a Developer / AI Agent

### 8.1 Code Organization Expectations

- **Config & AWS clients**
  - `src/config/env.ts` – loads non-secret env vars, applies defaults.
  - `src/config/aws.ts` – exports configured `s3` client and basic values.
  - A new module should be introduced (by developer/AI) for Mongo + Secrets:
    - `src/config/secrets.ts` – helpers to load secrets.
    - `src/db/mongo.ts` – encapsulated Mongo connection + DB/collection helpers.

- **Domain Models**
  - Represented as TypeScript types/interfaces in e.g.:
    - `src/models/Event.ts`
    - `src/models/Video.ts`
  - CRUD code lives in repository/helper modules:
    - `src/repos/eventRepo.ts`
    - `src/repos/videoRepo.ts`

- **GraphQL**
  - `src/graphql/schema.ts` – GraphQL SDL updated to include Event & Video types + operations.
  - `src/graphql/resolvers.ts` – implement resolvers using repos and config modules.

- **Handlers**
  - `src/handlers/graphql.ts` – remains the Lambda entrypoint.

### 8.2 Implementation Priorities

For Phase 1, any developer or AI agent writing code should focus on:

1. **Implementing Mongo support** (connection + Event/Video repositories).
2. **Expanding the GraphQL schema** to include Event creation and Event-bound upload URLs.
3. **Ensuring S3 keys follow the Event-based folder structure**.
4. **Wiring secrets and configuration correctly** across sandbox/qa/prod.
5. Keeping the code modular so that future phases (auth, processing, timeline sync) can be added without major refactors.

---

## 9. Error Handling & Resilience Patterns

### 9.1 GraphQL Error Handling

All GraphQL resolvers must implement consistent error handling:

```ts
// Standard error response format
type GraphQLError = {
  message: string;
  code: string;
  path?: string[];
  extensions?: {
    details?: any;
    timestamp: string;
    requestId: string;
  };
};

// Common error codes
enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}
```

### 9.2 Database Error Resilience

- **Connection pooling**: Use MongoDB driver's built-in connection pooling
- **Retry logic**: Exponential backoff for transient failures (max 3 retries)
- **Circuit breaker**: Fail fast when database is consistently unavailable
- **Graceful degradation**: Return cached responses when possible during outages

### 9.3 S3 Error Handling

- **Pre-signed URL generation failures**: Return specific error codes
- **Bucket access errors**: Log security issues, return generic errors to client
- **Quota exceeded**: Implement storage monitoring and alerts

### 9.4 Lambda Cold Start Optimization

- **Connection caching**: Reuse MongoDB connections across invocations
- **Initialization**: Load secrets and establish connections during module load
- **Provisioned concurrency**: Consider for production high-traffic periods

---

## 10. Security Architecture

### 10.1 API Security

- **HTTPS enforcement**: All API calls must use TLS 1.2+
- **CORS configuration**: Restrict origins in production environments
- **Rate limiting**: Implement per-IP rate limiting (100 requests/minute)
- **Request validation**: Strict input validation on all GraphQL inputs

### 10.2 S3 Security

- **Pre-signed URL scoping**: URLs limited to specific bucket/key combinations
- **Upload validation**: Enforce content-type restrictions
- **Bucket policies**: Prevent public read access, allow only pre-signed operations
- **Access logging**: Enable S3 access logs for audit trails

### 10.3 MongoDB Security

- **Connection encryption**: Use TLS for all database connections
- **Credential rotation**: Implement quarterly password rotation via Secrets Manager
- **Network isolation**: Database accessible only from Lambda VPC (future)
- **Audit logging**: Enable MongoDB audit logs for compliance

### 10.4 Secrets Management

- **Rotation strategy**: Automated rotation for database credentials
- **Access control**: Lambda execution role with minimal required permissions
- **Encryption**: All secrets encrypted at rest with AWS KMS
- **Audit trails**: CloudTrail logging for all secret access

---

## 11. Monitoring & Observability

### 11.1 Application Metrics

**Lambda Metrics** (via CloudWatch):
- Invocation count and duration
- Error rates by resolver
- Cold start frequency and duration
- Memory utilization patterns

**Custom Business Metrics**:
- Events created per hour/day
- Upload success/failure rates
- Average video file sizes
- S3 storage growth rate

### 11.2 Logging Strategy

**Structured Logging Format**:
```json
{
  "timestamp": "2025-03-03T10:30:00Z",
  "level": "INFO",
  "requestId": "abc123",
  "eventId": "event123",
  "operation": "createUploadUrl",
  "duration": 150,
  "error": null,
  "metadata": {}
}
```

**Log Levels**:
- `ERROR`: All failures, exceptions, and error conditions
- `WARN`: Retry attempts, degraded performance, unusual conditions
- `INFO`: Successful operations, key business events
- `DEBUG`: Detailed execution flow (development only)

### 11.3 Alerting Configuration

**Critical Alerts** (PagerDuty/immediate):
- Lambda error rate > 5% for 5 minutes
- Database connection failures
- S3 upload failure rate > 10%

**Warning Alerts** (Slack/email):
- Response time > 2 seconds sustained
- Storage quota approaching limits
- Unusual traffic patterns

### 11.4 Distributed Tracing

- **Request correlation**: Unique request IDs across all operations
- **GraphQL operation tracing**: Track resolver execution times
- **External service calls**: Trace MongoDB and S3 operations
- **Error context**: Include full request context in error logs

---

## 12. Performance Optimization

### 12.1 Database Optimization

**Indexing Strategy**:
```javascript
// Events collection
db.events.createIndex({ "normalizedName": 1, "date": 1 })  // Folder uniqueness
db.events.createIndex({ "joinCode": 1 })                   // Join URL lookups
db.events.createIndex({ "createdAt": -1 })                 // Recent events

// Videos collection
db.videos.createIndex({ "eventId": 1, "createdAt": -1 })   // Event videos
db.videos.createIndex({ "status": 1 })                     // Status queries
```

**Query Optimization**:
- Use projection to limit returned fields
- Implement pagination with cursor-based approach
- Cache frequent queries (event metadata)

### 12.2 S3 Performance

- **Transfer acceleration**: Enable for large video uploads
- **Multipart upload**: Implement for files > 100MB (future phase)
- **Intelligent tiering**: Automatic cost optimization for infrequent access
- **CloudFront CDN**: For video delivery (future phase)

### 12.3 Lambda Performance

- **Memory allocation**: Optimize based on actual usage patterns
- **Bundle optimization**: Tree-shake dependencies, minimize package size
- **Connection pooling**: Reuse database connections efficiently
- **Response caching**: Cache static responses when appropriate

---

## 13. Disaster Recovery & Business Continuity

### 13.1 Backup Strategy

**MongoDB Atlas**:
- Continuous cloud backups with point-in-time recovery
- Cross-region backup replication
- Monthly backup retention for compliance

**S3 Data Protection**:
- Cross-region replication for critical data
- Versioning enabled on upload buckets
- MFA delete protection on production buckets

### 13.2 Recovery Procedures

**Database Recovery**:
- RTO (Recovery Time Objective): 4 hours
- RPO (Recovery Point Objective): 1 hour
- Automated failover to secondary regions

**Application Recovery**:
- Multi-region Lambda deployment capability
- Infrastructure as Code for rapid redeployment
- Blue-green deployment for zero-downtime updates

### 13.3 Data Consistency

**Eventual Consistency Handling**:
- Implement read-after-write consistency checks
- Retry mechanisms for MongoDB write operations
- S3 operation completion verification

---

## 14. API Versioning Strategy

### 14.1 GraphQL Schema Evolution

**Backward Compatibility**:
- Additive changes only (new fields, types)
- Deprecation markers for fields to be removed
- Schema validation in CI/CD pipeline

**Version Management**:
- Single evolving schema (no versioned endpoints)
- Client-side compatibility via field selection
- Breaking changes require major version bump

### 14.2 Database Schema Migration

**Migration Process**:
- Automated migration scripts in deployment pipeline
- Backward-compatible field additions
- Data transformation scripts for schema changes

**Version Tracking**:
- Migration version stored in database metadata
- Rollback procedures for failed migrations
- Environment-specific migration validation

---

## 15. Future Extensions (Beyond Phase 1)

- User accounts and authenticated access to Events.
- Joining Events via joinCode / joinUrl.
- Multipart upload orchestration for extremely large videos.
- Asynchronous processing of uploaded videos:
  - Transcoding
  - Thumbnail extraction
  - Segmenting for streaming
- Multi-camera synchronization logic and timeline APIs.
- Fine-grained permissions / collaboration features.
- Real-time collaboration and live upload progress
- Video analytics and automated highlight detection
- Integration with social media platforms
- Advanced search and filtering capabilities
