# fiestime Backend – Local Development How-To

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Environment Setup](#environment-setup)
4. [Database Setup](#database-setup)
5. [AWS Configuration](#aws-configuration)
6. [Running the Application](#running-the-application)
7. [Testing Your Setup](#testing-your-setup)
8. [Development Workflow](#development-workflow)
9. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software
- **Node.js 20+** - [Download from nodejs.org](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** - For version control
- **VS Code** (recommended) - With TypeScript and GraphQL extensions

### Required Accounts & Access
- **MongoDB Atlas account** - [Sign up at mongodb.com](https://www.mongodb.com/cloud/atlas)
- **AWS account** - With programmatic access credentials
- **AWS CLI** (optional but recommended) - [Installation guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

### System Requirements
- **RAM**: Minimum 8GB (16GB recommended)
- **Storage**: 5GB free space for dependencies and local files
- **Network**: Reliable internet connection for MongoDB Atlas and AWS S3

## Quick Start

If you're already familiar with the setup, here's the minimal command sequence:

```bash
# Clone and install
git clone <repository-url>
cd fiestime-backend
npm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your credentials

# Start development server
npm run start:local
```

## Environment Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd fiestime-backend
npm install
```

### 2. Create Environment File

Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

```bash
# AWS Configuration
AWS_REGION=us-east-1
UPLOAD_BUCKET=your-fiestime-dev-bucket
PRESIGNED_URL_TTL_SECONDS=900

# MongoDB Configuration
MONGODB_URI_SECRET_NAME=fiestime/local/mongodb
# OR for direct connection (development only):
# MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/fiestime_local

# Application Settings
NODE_ENV=development
LOG_LEVEL=debug
PORT=4000
```

### 3. Install Dependencies

```bash
npm install
```

This will install all required packages including:
- `apollo-server-express` - GraphQL server
- `mongodb` - Database driver
- `aws-sdk` - AWS services integration
- `typescript` - Type checking and compilation

## Database Setup

### Option 1: MongoDB Atlas (Recommended)

1. **Create Atlas Cluster**:
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Create a new cluster (M0 free tier is sufficient for development)
   - Create a database user with read/write permissions
   - Whitelist your IP address (or use 0.0.0.0/0 for development)

2. **Get Connection String**:
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your database user password
   - Replace `<dbname>` with `fiestime_local`

3. **Configure Environment**:
   ```bash
   # Add to .env.local
   MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/fiestime_local?retryWrites=true&w=majority
   ```

### Option 2: Local MongoDB (Alternative)

If you prefer running MongoDB locally:

```bash
# Install MongoDB Community Edition
# macOS
brew tap mongodb/brew
brew install mongodb-community

# Start MongoDB
brew services start mongodb/brew/mongodb-community

# Add to .env.local
MONGODB_URI=mongodb://localhost:27017/fiestime_local
```

## AWS Configuration

### 1. Create S3 Bucket

```bash
# Using AWS CLI
aws s3 mb s3://your-fiestime-dev-bucket --region us-east-1

# Or create via AWS Console:
# 1. Go to S3 service in AWS Console
# 2. Click "Create bucket"
# 3. Enter bucket name: your-fiestime-dev-bucket
# 4. Choose region: us-east-1
# 5. Keep default settings and create
```

### 2. Configure AWS Credentials

Choose one of these methods:

**Option A: AWS Credentials File** (Recommended)
```bash
# Create credentials file
aws configure

# Enter your credentials:
AWS Access Key ID: YOUR_ACCESS_KEY
AWS Secret Access Key: YOUR_SECRET_KEY
Default region name: us-east-1
Default output format: json
```

**Option B: Environment Variables**
```bash
# Add to .env.local
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
```

**Option C: IAM Role** (For EC2 instances)
- Attach appropriate IAM role to your EC2 instance
- No additional configuration needed

### 3. Verify AWS Access

```bash
# Test S3 access
aws s3 ls s3://your-fiestime-dev-bucket

# Test from Node.js
node -e "
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
s3.listBuckets().promise().then(data => console.log('AWS configured correctly:', data.Buckets.length, 'buckets found'));
"
```

## Running the Application

### 1. Start Development Server

```bash
# Start with hot-reloading
npm run start:local

# Or start with debugging
npm run start:local:debug
```

### 2. Available Endpoints

Once running, these endpoints are available:

- **GraphQL Playground**: http://localhost:4000/graphql
- **Health Check**: http://localhost:4000/health
- **Metrics** (if enabled): http://localhost:4000/metrics

### 3. Environment-Specific Scripts

```bash
# Development with hot reload
npm run dev

# Build TypeScript
npm run build

# Start production build locally
npm run start

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format
```

## Testing Your Setup

### 1. Health Check

First, verify the server is running:

```bash
curl http://localhost:4000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-03-03T10:30:00Z",
  "version": "1.0.0",
  "environment": "development"
}
```

### 2. GraphQL Introspection

Test GraphQL endpoint:

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { types { name } } }"}'
```

### 3. Create Test Event

Open GraphQL Playground at http://localhost:4000/graphql and run:

```graphql
mutation CreateTestEvent {
  createEvent(
    name: "Test Event"
    date: "2025-03-03"
  ) {
    _id
    name
    s3Folder
    joinCode
    createdAt
  }
}
```

### 4. Request Upload URL

```graphql
mutation CreateUploadUrl {
  createUploadUrl(
    eventId: "EVENT_ID_FROM_PREVIOUS_STEP"
    fileName: "test-video.mp4"
    contentType: "video/mp4"
  ) {
    uploadUrl
    bucket
    key
    expiresInSeconds
  }
}
```

### 5. Test S3 Upload

```bash
# Use the uploadUrl from previous step
curl -X PUT "UPLOAD_URL_FROM_GRAPHQL" \
  -H "Content-Type: video/mp4" \
  --data-binary "@path/to/test-video.mp4"
```

## Development Workflow

### 1. Project Structure

```
fiestime-backend/
├── src/
│   ├── config/          # Configuration modules
│   ├── db/             # Database connections and repos
│   ├── graphql/        # GraphQL schema and resolvers
│   ├── handlers/       # Lambda handlers
│   ├── models/         # TypeScript type definitions
│   └── local/          # Local development server
├── docs/               # Documentation
├── cloudformation/     # Infrastructure as Code
└── .github/           # CI/CD workflows
```

### 2. Code Style Guidelines

- **TypeScript**: Use strict mode, explicit types
- **Naming**: camelCase for variables, PascalCase for types
- **Imports**: Use absolute imports with path mapping
- **Error Handling**: Always use proper error types and logging

### 3. Git Workflow

```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push origin feature/new-feature
```

### 4. Testing Strategy

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# End-to-end tests
npm run test:e2e

# Test specific file
npm test -- --testPathPattern=event.test.ts
```

## Troubleshooting

### Common Issues

#### 1. MongoDB Connection Failed

**Error**: `MongoNetworkError: failed to connect to server`

**Solutions**:
- Verify MongoDB URI in `.env.local`
- Check network connectivity to Atlas cluster
- Ensure IP address is whitelisted in Atlas
- Verify username/password are correct

```bash
# Test connection manually
node -e "
const { MongoClient } = require('mongodb');
const uri = 'YOUR_MONGODB_URI';
MongoClient.connect(uri).then(() => console.log('Connected')).catch(console.error);
"
```

#### 2. S3 Access Denied

**Error**: `AccessDenied: Access Denied`

**Solutions**:
- Verify AWS credentials are configured
- Check bucket name in `.env.local`
- Ensure IAM user has S3 permissions
- Verify bucket exists and is in correct region

```bash
# Test S3 access
aws s3api head-bucket --bucket your-fiestime-dev-bucket
```

#### 3. Port Already in Use

**Error**: `Error: listen EADDRINUSE: address already in use :::4000`

**Solutions**:
```bash
# Find process using port 4000
lsof -ti:4000

# Kill process
kill -9 $(lsof -ti:4000)

# Or use different port
PORT=4001 npm run start:local
```

#### 4. TypeScript Compilation Errors

**Error**: Various TypeScript errors during build

**Solutions**:
```bash
# Clear TypeScript cache
npm run clean

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Check TypeScript configuration
npx tsc --noEmit
```

#### 5. GraphQL Schema Issues

**Error**: Schema validation errors or resolver conflicts

**Solutions**:
- Check `src/graphql/schema.ts` for syntax errors
- Verify all resolvers are properly implemented
- Use GraphQL Playground's schema documentation
- Enable schema validation in development

```bash
# Validate GraphQL schema
npm run validate:schema
```

### Debug Mode

Enable debug logging for detailed troubleshooting:

```bash
# Start with debug logging
DEBUG=* npm run start:local

# Or set log level
LOG_LEVEL=debug npm run start:local
```

### Performance Issues

If experiencing slow performance:

1. **Check MongoDB queries**:
   ```javascript
   // Enable MongoDB query logging
   mongoose.set('debug', true);
   ```

2. **Monitor memory usage**:
   ```bash
   # Check Node.js memory usage
   node --inspect npm run start:local
   # Open chrome://inspect in Chrome
   ```

3. **Profile S3 operations**:
   ```javascript
   // Add timing logs around S3 operations
   const start = Date.now();
   await s3.getSignedUrlPromise('putObject', params);
   console.log(`S3 operation took ${Date.now() - start}ms`);
   ```

### Getting Help

If you continue to experience issues:

1. **Check the logs**: Review application logs for specific error messages
2. **Search documentation**: Check the backend architecture document
3. **Create an issue**: Document your problem with:
   - Error messages
   - Environment details
   - Steps to reproduce
   - Expected vs actual behavior

### Useful Commands Reference

```bash
# View application logs
npm run logs

# Reset database (development only)
npm run db:reset

# Generate sample data
npm run db:seed

# Check code coverage
npm run coverage

# Profile application
npm run profile

# Generate API documentation
npm run docs:generate
```
