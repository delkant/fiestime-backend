import { gql } from "graphql-tag";

export const typeDefs = gql`
  scalar DateTime

  # Event Types
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

  # Video Types
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

  enum VideoStatus {
    PENDING
    UPLOADED
    FAILED
  }

  # Upload URL Types
  type CreateUploadUrlPayload {
    uploadUrl: String!
    bucket: String!
    key: String!
    expiresInSeconds: Int!
    videoId: ID!
  }

  # Sorting and Filtering Enums
  enum EventSortField {
    NAME
    DATE
    CREATED_AT
  }

  enum SortOrder {
    ASC
    DESC
  }

  # Queries
  type Query {
    # Get a specific event by ID
    getEvent(id: ID!): Event

    # List events with optional pagination and sorting
    listEvents(
      limit: Int = 20
      offset: Int = 0
      sortBy: EventSortField = CREATED_AT
      sortOrder: SortOrder = DESC
    ): [Event!]!

    # List videos for a specific event
    listEventVideos(
      eventId: ID!
      limit: Int = 20
      offset: Int = 0
      status: VideoStatus
    ): [Video!]!

    # Get a specific video by ID
    getVideo(id: ID!): Video

    # Health check
    health: String!
  }

  # Mutations
  type Mutation {
    # Create a new event
    createEvent(
      name: String!
      date: String!
      description: String
      location: String
    ): Event!

    # Create a pre-signed upload URL for a video
    createUploadUrl(
      eventId: ID!
      fileName: String!
      contentType: String!
      sourceDevice: String
      sourceCameraLabel: String
    ): CreateUploadUrlPayload!

    # Update video status (for future use - webhook integration)
    updateVideoStatus(
      videoId: ID!
      status: VideoStatus!
    ): Video!
  }
`;
