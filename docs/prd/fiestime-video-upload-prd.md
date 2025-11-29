
# PRD: fiestime Event-Centric Video Upload Backend (Phase 1)

## 1. Overview

This PRD defines Phase 1 of the **fiestime** backend, now centered around the concept of **Events**.

An *Event* represents any real‑world gathering that users may capture from multiple angles:
- Birthday party  
- Soccer game  
- End‑of‑year meeting  
- School performance  
- Family reunion  
- Etc.

### New Core Principle  
**Before uploading any videos, users MUST first create an Event.**  
Events serve as the parent container for all related uploaded videos, metadata, and participant collaboration.

After an Event is created:

1. The system generates a **shareable link**.
2. Other participants can **join the Event** using this link.
3. Each participant may upload videos to that Event.
4. All videos for that Event are stored in S3 under an Event‑specific folder.

---

## 2. Event Folder Structure in S3

When an Event is created, the backend creates a dedicated S3 subfolder with the following rules:

### 2.1 Base Naming Convention

```
events/{eventName}-{eventDate}/
```

Example:

```
events/BirthdayParty-2025-07-19/
```

### 2.2 Handling Name Collisions

If an event with the same name and date already exists, the S3 folder name receives an incrementing integer suffix:

```
events/{eventName}-{eventDate}-{n}/
```

Where:

- `n` starts at **2**
- Increments for every additional Event with matching name + date  
- Example:

```
events/SoccerGame-2025-03-03/
events/SoccerGame-2025-03-03-2/
events/SoccerGame-2025-03-03-3/
```

### 2.3 Video Upload Placement

All videos for an event are stored under:

```
events/{eventFolder}/raw/{timestamp}_{sanitizedFileName}
```

Example:

```
events/SoccerGame-2025-03-03-2/raw/1739212123_cam3.mp4
```

---

## 3. Updated Workflow

### Step 1 — User Creates an Event

User supplies:

- `name` (string)
- `date` (ISO date, e.g., 2025-03-03)
- Optional: description, location, tags

Backend returns:

- `eventId`
- `eventFolderName`
- `shareableJoinUrl`

### Step 2 — Participants Join Event  
Using the shareable link, other users join without needing to create their own event.

### Step 3 — Participants Upload Videos  
Upload flow includes:

1. Requesting a **pre‑signed upload URL** via GraphQL:
   - Must include `eventId`
   - Backend places file in the correct S3 folder
2. Uploading directly to S3 using `PUT`

### Step 4 — Listing Uploaded Videos  
GraphQL supports listing videos for a specific event based on its folder.

---

## 4. GraphQL (Phase 1 Scope)

Phase 1 includes:

### Mutations
- `createEvent(name, date)` → returns `eventId`, `eventFolder`, `joinUrl`
- `createUploadUrl(eventId, fileName, contentType)` → S3 PUT URL

### Queries
- `listEvents()`
- `listEventVideos(eventId)`
- (optional) `getEvent(eventId)`

---

## 5. Acceptance Criteria

1. Video uploads cannot occur without an existing Event.
2. Event folder naming rules must enforce deterministic uniqueness.
3. All videos for an Event must reside under that Event’s S3 subfolder.
4. Pre‑signed URLs must point to paths within the correct Event folder.
5. Joining via shared link must allow multiple contributors.
6. Large uploads (several GB) must succeed reliably.

---

## 6. User Personas & Use Cases

### 6.1 Primary Personas

**Event Organizer (Creator)**
- Typically the person hosting/organizing the event
- Needs to create events and share access with participants
- Wants centralized control over event video collection
- Example: Parent organizing birthday party, coach managing sports event

**Event Participant (Contributor)**
- Joins existing events via shareable links
- Uploads videos from their mobile device
- Wants simple, reliable upload process
- Example: Party guest, team parent, attendee at meeting

### 6.2 Key Use Cases

**Primary Flow: Birthday Party**
1. Parent creates "Emma's 5th Birthday" event for 2025-03-15
2. System generates shareable link
3. Parent shares link with family members via WhatsApp
4. 6 family members join the event
5. Each uploads 2-4 videos from different angles during party
6. All videos stored under single event for later compilation

**Secondary Flow: Sports Event**
1. Coach creates "U12 Championship Final" event
2. Shares link with team parents
3. Multiple parents record from sidelines during game
4. Videos automatically organized by event date and name
5. Coach later has access to all game footage

## 7. Technical Requirements & Constraints

### 7.1 Performance Requirements
- **Upload file size limit**: Maximum 5GB per video file
- **Concurrent uploads**: Support up to 50 simultaneous uploads per event
- **Pre-signed URL validity**: 15 minutes (900 seconds)
- **GraphQL response time**: < 2 seconds for all operations
- **Event creation**: < 1 second response time

### 7.2 Reliability Requirements
- **Uptime**: 99.5% availability during business hours
- **Upload success rate**: 95% for files under 1GB in good network conditions
- **Data durability**: 99.999999999% (11 9's) via S3 standard storage
- **Recovery time**: < 4 hours for critical system failures

### 7.3 Scalability Requirements
- Support up to 1,000 concurrent events
- Handle up to 10,000 video uploads per day
- Scale to accommodate seasonal peaks (holidays, graduation season)

### 7.4 Security Considerations
- **Data in transit**: All API calls over HTTPS/TLS 1.2+
- **Upload security**: Pre-signed URLs prevent unauthorized uploads
- **Access control**: Event-based isolation (no cross-event access)
- **Data retention**: No automatic deletion (customer-controlled)

### 7.5 Compliance & Privacy
- **Data residency**: US-based storage (AWS US regions)
- **Privacy**: No personal data required for event creation
- **GDPR considerations**: Event creators responsible for participant consent

## 8. Error Handling & Edge Cases

### 8.1 Event Creation Errors
- **Duplicate event names**: System handles via auto-incrementing suffixes
- **Invalid date formats**: Return clear validation errors
- **S3 folder creation failures**: Rollback event creation, return error

### 8.2 Upload Errors
- **Expired pre-signed URLs**: Client must request new URL
- **Network interruptions**: Client responsible for retry logic
- **File type validation**: Accept video formats: mp4, mov, avi, mkv
- **Upload size exceeded**: Reject with clear error message

### 8.3 Database Failures
- **MongoDB connection loss**: Return 503 Service Unavailable
- **Write failures**: Implement exponential backoff retry
- **Inconsistent state**: Log errors for manual reconciliation

## 9. Monitoring & Analytics Requirements

### 9.1 Core Metrics
- **Event creation rate**: Events created per day/hour
- **Upload success rate**: Percentage of successful uploads
- **Upload duration**: Time from URL request to S3 completion
- **Error rates**: By error type and endpoint
- **Storage utilization**: Total GB stored per environment

### 9.2 Business Metrics
- **Events per user session**: Average events created per session
- **Videos per event**: Distribution of video counts per event
- **Popular event types**: Most common event names/categories
- **Seasonal patterns**: Usage patterns by time of year

### 9.3 Alerting Thresholds
- **Error rate > 5%**: Immediate alert
- **Upload success rate < 90%**: Warning alert
- **Response time > 5s**: Performance alert
- **Database connection failures**: Critical alert

## 10. Out of Scope (Future Phases)

- Authentication / user accounts
- Multipart upload orchestration
- Real‑time collaboration
- Event timeline synchronization between camera angles
- Video processing/transcoding pipelines
- Player UI & multi‑angle playback APIs
- Advanced permissions (private events, admin controls)
- Video thumbnails and preview generation
- Mobile app push notifications
- Real-time upload progress tracking
