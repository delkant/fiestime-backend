# fiestime Backend Deployment Troubleshooting Guide

## Overview

This guide provides comprehensive troubleshooting procedures for deployment issues across all environments (sandbox, qa, prod). It covers common problems, diagnostic steps, and resolution strategies for the fiestime backend deployment pipeline.

## Table of Contents

1. [CI/CD Pipeline Issues](#cicd-pipeline-issues)
2. [CloudFormation Deployment Problems](#cloudformation-deployment-problems)
3. [Lambda Function Issues](#lambda-function-issues)
4. [Database Connectivity Problems](#database-connectivity-problems)
5. [S3 Configuration Issues](#s3-configuration-issues)
6. [Secrets Manager Problems](#secrets-manager-problems)
7. [API Gateway Issues](#api-gateway-issues)
8. [Performance and Scaling Issues](#performance-and-scaling-issues)
9. [Rollback Procedures](#rollback-procedures)
10. [Monitoring and Alerting](#monitoring-and-alerting)

## CI/CD Pipeline Issues

### GitHub Actions Workflow Failures

#### Issue: Build Step Failing
**Symptoms:**
- TypeScript compilation errors
- Dependency installation failures
- Test failures blocking deployment

**Diagnostic Steps:**
```bash
# Check workflow logs in GitHub Actions tab
# Look for specific error messages in build logs

# Locally reproduce the issue
npm ci
npm run build
npm test
```

**Common Solutions:**

1. **TypeScript Compilation Errors:**
```bash
# Check for type errors
npx tsc --noEmit

# Fix common issues:
# - Missing type definitions
# - Incorrect imports
# - Configuration mismatches
```

2. **Dependency Issues:**
```bash
# Clear and reinstall dependencies
rm -rf node_modules package-lock.json
npm ci

# Check for version conflicts
npm ls --depth=0
```

3. **Test Failures:**
```bash
# Run tests locally with same Node version as CI
node --version  # Should match CI matrix

# Run with verbose output
npm test -- --verbose

# Check for environment-specific issues
NODE_ENV=test npm test
```

#### Issue: Deployment Package Upload Failure
**Symptoms:**
- "Access Denied" errors when uploading to S3 code bucket
- Package size exceeds Lambda limits

**Diagnostic Steps:**
```bash
# Check S3 bucket permissions
aws s3api get-bucket-policy --bucket your-code-bucket

# Verify IAM permissions for GitHub Actions role
aws iam get-role-policy --role-name GitHubActionsRole --policy-name DeploymentPolicy

# Check package size
ls -lh dist/lambda-package.zip
```

**Solutions:**

1. **S3 Access Issues:**
```yaml
# Update GitHub repository secrets
AWS_ACCESS_KEY_ID: <access-key>
AWS_SECRET_ACCESS_KEY: <secret-key>
CODE_BUCKET: <environment-specific-bucket>

# Verify bucket policy allows uploads
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT:role/GitHubActionsRole"
      },
      "Action": ["s3:PutObject", "s3:PutObjectAcl"],
      "Resource": "arn:aws:s3:::code-bucket/*"
    }
  ]
}
```

2. **Package Size Issues:**
```bash
# Analyze package contents
unzip -l dist/lambda-package.zip | sort -k4 -n

# Exclude unnecessary files in package script
# Update .github/workflows/*.yml to exclude:
# - .git directory
# - test files
# - documentation
# - development dependencies
```

### Environment-Specific Deployment Issues

#### Issue: Wrong Environment Variables
**Symptoms:**
- Deployment succeeds but application uses wrong configuration
- Cross-environment data access

**Diagnostic Steps:**
```bash
# Verify GitHub repository secrets for each environment
# Check branch-specific workflow triggers

# Verify CloudFormation parameters
aws cloudformation describe-stacks --stack-name fiestime-sandbox
```

**Solutions:**
```yaml
# Ensure environment-specific secrets in GitHub
FIESTIME_SANDBOX_STACK: "fiestime-sandbox"
FIESTIME_QA_STACK: "fiestime-qa"
FIESTIME_PROD_STACK: "fiestime-prod"

# Update workflow to use correct parameters
- name: Deploy to Sandbox
  if: github.ref == 'refs/heads/sandbox'
  run: |
    aws cloudformation deploy \
      --stack-name ${{ secrets.FIESTIME_SANDBOX_STACK }} \
      --parameter-overrides UploadBucketName=${{ secrets.SANDBOX_UPLOAD_BUCKET }}
```

## CloudFormation Deployment Problems

### Stack Update Failures

#### Issue: Resource Already Exists
**Symptoms:**
```
Error: Resource already exists: FiestimeLambdaFunction
```

**Diagnostic Steps:**
```bash
# Check stack status
aws cloudformation describe-stacks --stack-name fiestime-sandbox

# Review stack events
aws cloudformation describe-stack-events --stack-name fiestime-sandbox

# Check resource drift
aws cloudformation detect-stack-drift --stack-name fiestime-sandbox
```

**Solutions:**

1. **Import Existing Resources:**
```bash
# Create resource import template
aws cloudformation create-change-set \
  --stack-name fiestime-sandbox \
  --change-set-name import-existing-resources \
  --change-set-type IMPORT \
  --resources-to-import file://resources-to-import.json
```

2. **Delete and Recreate (Non-Production Only):**
```bash
# Backup critical data first
aws s3 sync s3://fiestime-sandbox-uploads s3://backup-bucket/

# Delete stack
aws cloudformation delete-stack --stack-name fiestime-sandbox

# Wait for deletion to complete
aws cloudformation wait stack-delete-complete --stack-name fiestime-sandbox
```

#### Issue: Insufficient IAM Permissions
**Symptoms:**
```
User is not authorized to perform: iam:CreateRole
```

**Diagnostic Steps:**
```bash
# Check current IAM permissions
aws iam get-user
aws iam list-attached-user-policies --user-name deployment-user

# Test specific permissions
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::ACCOUNT:user/deployment-user \
  --action-names iam:CreateRole \
  --resource-arns arn:aws:iam::ACCOUNT:role/*
```

**Solutions:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "lambda:*",
        "apigateway:*",
        "s3:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### Template Validation Errors

#### Issue: Invalid Template Syntax
**Symptoms:**
```
Template format error: Every Parameters object must contain a Type member
```

**Diagnostic Steps:**
```bash
# Validate template locally
aws cloudformation validate-template --template-body file://cloudformation/template.yaml

# Use CloudFormation linting tools
cfn-lint cloudformation/template.yaml
```

**Solutions:**
```yaml
# Fix common template issues:
Parameters:
  UploadBucketName:
    Type: String  # Always include Type
    Description: Name of S3 bucket for uploads
    Default: fiestime-sandbox-uploads

Resources:
  FiestimeLambdaFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub "${AWS::StackName}-graphql-handler"
      # Use !Sub for string interpolation
```

## Lambda Function Issues

### Cold Start Problems

#### Issue: High Latency During Cold Starts
**Symptoms:**
- Initial requests take > 5 seconds
- Timeout errors on first invocations
- Poor user experience during low-traffic periods

**Diagnostic Steps:**
```bash
# Check Lambda metrics in CloudWatch
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=fiestime-sandbox-graphql-handler \
  --start-time 2025-03-03T00:00:00Z \
  --end-time 2025-03-03T23:59:59Z \
  --period 300 \
  --statistics Average,Maximum

# Check cold start frequency
aws logs filter-log-events \
  --log-group-name /aws/lambda/fiestime-sandbox-graphql-handler \
  --filter-pattern "INIT_START"
```

**Solutions:**

1. **Optimize Bundle Size:**
```bash
# Analyze bundle size
npm install webpack-bundle-analyzer
npx webpack-bundle-analyzer dist/

# Exclude unnecessary dependencies
# Use tree-shaking
# Implement code splitting for large libraries
```

2. **Connection Optimization:**
```typescript
// Cache database connections outside handler
let cachedMongoClient: MongoClient | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  if (cachedMongoClient && cachedMongoClient.topology?.isConnected()) {
    return cachedMongoClient;
  }

  const uri = await getMongoUri();
  const client = new MongoClient(uri, {
    maxPoolSize: 5,
    minPoolSize: 1,
    connectTimeoutMS: 5000,
    serverSelectionTimeoutMS: 5000
  });

  await client.connect();
  cachedMongoClient = client;
  return client;
}
```

3. **Provisioned Concurrency (Production):**
```yaml
# CloudFormation template
FiestimeLambdaFunction:
  Type: AWS::Lambda::Function
  Properties:
    ReservedConcurrencyConfiguration:
      ReservedConcurrency: 10

FiestimeProvisionedConcurrency:
  Type: AWS::Lambda::ProvisionedConcurrencyConfig
  Properties:
    FunctionName: !Ref FiestimeLambdaFunction
    ProvisionedConcurrencyConfiguration:
      ProvisionedConcurrency: 5
```

### Runtime Errors

#### Issue: Module Import Failures
**Symptoms:**
```
Runtime.ImportModuleError: Error: Cannot find module 'mongodb'
```

**Diagnostic Steps:**
```bash
# Check Lambda deployment package contents
aws lambda get-function --function-name fiestime-sandbox-graphql-handler

# Download and inspect package
aws lambda get-function --function-name fiestime-sandbox-graphql-handler \
  --query 'Code.Location' --output text | xargs curl -o function.zip
unzip -l function.zip
```

**Solutions:**

1. **Fix Package Dependencies:**
```bash
# Ensure all dependencies are in package.json
npm ls --production

# Include node_modules in deployment package
# Update build script to include dependencies
```

2. **Update Build Process:**
```json
{
  "scripts": {
    "build": "tsc && npm ci --only=production",
    "package": "zip -r lambda-package.zip dist/ node_modules/ package.json"
  }
}
```

#### Issue: Memory or Timeout Errors
**Symptoms:**
```
Task timed out after 30.00 seconds
Process exited before completing request
```

**Diagnostic Steps:**
```bash
# Check Lambda configuration
aws lambda get-function-configuration \
  --function-name fiestime-sandbox-graphql-handler

# Monitor memory usage
aws logs filter-log-events \
  --log-group-name /aws/lambda/fiestime-sandbox-graphql-handler \
  --filter-pattern "Max Memory Used"
```

**Solutions:**

1. **Increase Memory and Timeout:**
```yaml
FiestimeLambdaFunction:
  Type: AWS::Lambda::Function
  Properties:
    MemorySize: 512  # Increase from 128
    Timeout: 60      # Increase from 30
```

2. **Optimize Code Performance:**
```typescript
// Use connection pooling
// Implement caching for repeated queries
// Optimize database queries with proper indexing
// Use streaming for large responses
```

## Database Connectivity Problems

### MongoDB Atlas Connection Issues

#### Issue: Connection Timeout Errors
**Symptoms:**
```
MongoNetworkError: connection timed out
MongoServerSelectionError: Server selection timed out
```

**Diagnostic Steps:**
```bash
# Test connection from Lambda environment
# Use AWS Systems Manager Session Manager to access Lambda VPC

# Check network connectivity
nslookup cluster0.xxxxx.mongodb.net
telnet cluster0.xxxxx.mongodb.net 27017

# Verify IP whitelist in MongoDB Atlas
# Check Lambda VPC configuration
```

**Solutions:**

1. **Network Configuration:**
```yaml
# If using VPC, ensure NAT Gateway for outbound connections
FiestimeVPC:
  Type: AWS::EC2::VPC
  Properties:
    CidrBlock: 10.0.0.0/16

FiestimeNATGateway:
  Type: AWS::EC2::NatGateway
  Properties:
    AllocationId: !GetAtt FiestimeEIP.AllocationId
    SubnetId: !Ref FiestimePublicSubnet

# Update Lambda to use VPC subnets with NAT Gateway
```

2. **MongoDB Atlas Configuration:**
```bash
# Whitelist Lambda IP ranges or use 0.0.0.0/0 for development
# Configure cluster for AWS region proximity
# Enable connection string caching
```

3. **Connection String Optimization:**
```typescript
const mongoUri = await getSecretValue('fiestime/prod/mongodb');
const client = new MongoClient(mongoUri, {
  maxPoolSize: 5,
  minPoolSize: 1,
  connectTimeoutMS: 5000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  retryReads: true
});
```

#### Issue: Authentication Failures
**Symptoms:**
```
MongoError: Authentication failed
```

**Diagnostic Steps:**
```bash
# Verify credentials in Secrets Manager
aws secretsmanager get-secret-value --secret-id fiestime/prod/mongodb

# Test credentials with MongoDB client
mongosh "mongodb+srv://username:password@cluster.mongodb.net/test"
```

**Solutions:**

1. **Update Credentials:**
```bash
# Rotate MongoDB Atlas password
# Update secret in AWS Secrets Manager
aws secretsmanager update-secret \
  --secret-id fiestime/prod/mongodb \
  --secret-string '{"uri":"mongodb+srv://user:newpass@cluster.mongodb.net/fiestime_prod"}'
```

2. **Verify User Permissions:**
```javascript
// In MongoDB Atlas console, ensure user has:
// - readWrite permissions on application database
// - read permissions on admin database (for connection validation)
```

## S3 Configuration Issues

### Bucket Access Problems

#### Issue: Access Denied Errors
**Symptoms:**
```
AccessDenied: Access Denied
S3 bucket does not exist or you do not have permission
```

**Diagnostic Steps:**
```bash
# Check bucket existence and permissions
aws s3 ls s3://fiestime-prod-uploads/

# Verify Lambda execution role permissions
aws iam get-role-policy \
  --role-name fiestime-prod-lambda-execution-role \
  --policy-name S3AccessPolicy

# Check bucket policy
aws s3api get-bucket-policy --bucket fiestime-prod-uploads
```

**Solutions:**

1. **Fix IAM Role Permissions:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::fiestime-*-uploads",
        "arn:aws:s3:::fiestime-*-uploads/*"
      ]
    }
  ]
}
```

2. **Update Bucket Policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT:role/fiestime-prod-lambda-execution-role"
      },
      "Action": ["s3:*"],
      "Resource": [
        "arn:aws:s3:::fiestime-prod-uploads",
        "arn:aws:s3:::fiestime-prod-uploads/*"
      ]
    }
  ]
}
```

#### Issue: Pre-signed URL Generation Failures
**Symptoms:**
```
InvalidAccessKeyId: The AWS Access Key Id you provided does not exist
SignatureDoesNotMatch: The request signature we calculated does not match
```

**Diagnostic Steps:**
```bash
# Test S3 client configuration
aws s3 ls --profile lambda-execution-role

# Check AWS SDK configuration in Lambda
# Review CloudWatch logs for detailed error messages
```

**Solutions:**

1. **AWS SDK Configuration:**
```typescript
import AWS from 'aws-sdk';

// Ensure proper AWS region configuration
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  signatureVersion: 'v4'
});

// Generate pre-signed URL with explicit configuration
const params = {
  Bucket: process.env.UPLOAD_BUCKET,
  Key: s3Key,
  Expires: parseInt(process.env.PRESIGNED_URL_TTL_SECONDS || '900'),
  ContentType: contentType
};

const uploadUrl = await s3.getSignedUrlPromise('putObject', params);
```

## Secrets Manager Problems

### Secret Access Issues

#### Issue: SecretNotFoundException
**Symptoms:**
```
ResourceNotFoundException: Secrets Manager can't find the specified secret
```

**Diagnostic Steps:**
```bash
# List all secrets in the account
aws secretsmanager list-secrets

# Check secret name and ARN
aws secretsmanager describe-secret --secret-id fiestime/prod/mongodb

# Verify Lambda execution role permissions
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::ACCOUNT:role/lambda-execution-role \
  --action-names secretsmanager:GetSecretValue \
  --resource-arns arn:aws:secretsmanager:region:account:secret:fiestime/prod/mongodb-*
```

**Solutions:**

1. **Create Missing Secret:**
```bash
aws secretsmanager create-secret \
  --name fiestime/prod/mongodb \
  --description "MongoDB connection string for production" \
  --secret-string '{"uri":"mongodb+srv://user:pass@cluster.mongodb.net/fiestime_prod"}'
```

2. **Fix IAM Permissions:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:fiestime/*"
    }
  ]
}
```

## API Gateway Issues

### CORS Configuration Problems

#### Issue: CORS Errors in Browser
**Symptoms:**
```
Access to fetch at 'https://api.fiestime.app/graphql' from origin 'https://app.fiestime.com'
has been blocked by CORS policy
```

**Diagnostic Steps:**
```bash
# Test CORS headers
curl -H "Origin: https://app.fiestime.com" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: content-type" \
     -X OPTIONS https://api.fiestime.app/graphql

# Check API Gateway configuration
aws apigatewayv2 get-api --api-id your-api-id
```

**Solutions:**

1. **Configure CORS in API Gateway:**
```yaml
FiestimeHttpAPI:
  Type: AWS::ApiGatewayV2::Api
  Properties:
    CorsConfiguration:
      AllowHeaders:
        - content-type
        - x-amz-date
        - authorization
        - x-api-key
      AllowMethods:
        - GET
        - POST
        - OPTIONS
      AllowOrigins:
        - https://app.fiestime.com
        - https://staging.fiestime.com  # Add staging for qa environment
      AllowCredentials: true
```

2. **Handle CORS in Lambda:**
```typescript
export const handler = async (event: APIGatewayProxyEvent) => {
  // Add CORS headers to all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://app.fiestime.com',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  // ... GraphQL handling

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(result)
  };
};
```

## Performance and Scaling Issues

### High Latency Problems

#### Issue: Slow Response Times
**Symptoms:**
- API responses taking > 5 seconds
- Database query timeouts
- User experience degradation

**Diagnostic Steps:**
```bash
# Monitor Lambda performance metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=fiestime-prod-graphql-handler \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Average,Maximum

# Check database performance
# Monitor MongoDB Atlas metrics for slow queries
```

**Solutions:**

1. **Database Optimization:**
```javascript
// Add proper indexes
db.events.createIndex({ "normalizedName": 1, "date": 1 });
db.videos.createIndex({ "eventId": 1, "createdAt": -1 });

// Optimize queries with projection
const events = await db.collection('events')
  .find({}, { projection: { description: 0 } })  // Exclude large fields
  .limit(20)
  .toArray();
```

2. **Lambda Optimization:**
```typescript
// Implement response caching
const cache = new Map();

export const cachedResolver = async (parent, args, context) => {
  const cacheKey = `events_${JSON.stringify(args)}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const result = await originalResolver(parent, args, context);
  cache.set(cacheKey, result);

  // Expire cache after 5 minutes
  setTimeout(() => cache.delete(cacheKey), 5 * 60 * 1000);

  return result;
};
```

### Concurrency Issues

#### Issue: Lambda Throttling
**Symptoms:**
```
TooManyRequestsException: Rate exceeded
Lambda concurrent execution limit exceeded
```

**Diagnostic Steps:**
```bash
# Check Lambda concurrency metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name ConcurrentExecutions \
  --dimensions Name=FunctionName,Value=fiestime-prod-graphql-handler \
  --start-time $(date -d '1 hour ago' -u +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 60 \
  --statistics Maximum

# Check account-level concurrency limits
aws lambda get-account-settings
```

**Solutions:**

1. **Configure Reserved Concurrency:**
```yaml
FiestimeLambdaFunction:
  Type: AWS::Lambda::Function
  Properties:
    ReservedConcurrencyConfiguration:
      ReservedConcurrency: 50  # Reserve capacity for this function
```

2. **Implement Circuit Breaker Pattern:**
```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > 60000) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= 5) {
      this.state = 'OPEN';
    }
  }
}
```

## Rollback Procedures

### Emergency Rollback

#### Immediate Actions (< 5 minutes)

1. **Revert to Previous Lambda Version:**
```bash
# List recent versions
aws lambda list-versions-by-function --function-name fiestime-prod-graphql-handler

# Update alias to previous version
aws lambda update-alias \
  --function-name fiestime-prod-graphql-handler \
  --name LIVE \
  --function-version 42  # Previous working version
```

2. **Rollback CloudFormation Stack:**
```bash
# Cancel update in progress
aws cloudformation cancel-update-stack --stack-name fiestime-prod

# Rollback to previous template
aws cloudformation update-stack \
  --stack-name fiestime-prod \
  --use-previous-template \
  --parameters ParameterKey=LambdaCodeVersion,ParameterValue=previous-version
```

#### Data Recovery (if needed)

1. **Database Rollback:**
```bash
# MongoDB Atlas point-in-time recovery
# Use Atlas UI or API to restore to specific timestamp

# For critical data loss, contact MongoDB Atlas support
```

2. **S3 Data Recovery:**
```bash
# Restore from versioned S3 bucket
aws s3api list-object-versions --bucket fiestime-prod-uploads --prefix events/

# Restore specific version
aws s3api copy-object \
  --copy-source fiestime-prod-uploads/events/test-event/video.mp4?versionId=VERSION_ID \
  --bucket fiestime-prod-uploads \
  --key events/test-event/video.mp4
```

### Blue-Green Deployment Rollback

```yaml
# CloudFormation template for blue-green deployment
FiestimeLambdaBlue:
  Type: AWS::Lambda::Function
  Properties:
    FunctionName: !Sub "${AWS::StackName}-graphql-handler-blue"

FiestimeLambdaGreen:
  Type: AWS::Lambda::Function
  Properties:
    FunctionName: !Sub "${AWS::StackName}-graphql-handler-green"

FiestimeLambdaAlias:
  Type: AWS::Lambda::Alias
  Properties:
    FunctionName: !Ref FiestimeLambdaBlue  # Switch between blue/green
    Name: LIVE
```

## Monitoring and Alerting

### CloudWatch Alarms

```yaml
# Critical alarms for deployment monitoring
ErrorRateAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: !Sub "${AWS::StackName}-lambda-error-rate"
    MetricName: Errors
    Namespace: AWS/Lambda
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 2
    Threshold: 5
    ComparisonOperator: GreaterThanThreshold
    AlarmActions:
      - !Ref SNSTopic

DurationAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: !Sub "${AWS::StackName}-lambda-duration"
    MetricName: Duration
    Namespace: AWS/Lambda
    Statistic: Average
    Period: 300
    EvaluationPeriods: 2
    Threshold: 10000  # 10 seconds
    ComparisonOperator: GreaterThanThreshold
```

### Custom Metrics

```typescript
// Custom CloudWatch metrics for application monitoring
import AWS from 'aws-sdk';

const cloudwatch = new AWS.CloudWatch();

export async function recordMetric(metricName: string, value: number, unit = 'Count') {
  await cloudwatch.putMetricData({
    Namespace: 'FiestimeBackend',
    MetricData: [{
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Dimensions: [{
        Name: 'Environment',
        Value: process.env.NODE_ENV || 'development'
      }]
    }]
  }).promise();
}

// Usage in resolvers
await recordMetric('EventCreated', 1);
await recordMetric('UploadUrlRequested', 1);
await recordMetric('DatabaseQueryDuration', queryTime, 'Milliseconds');
```

### Deployment Health Checks

```bash
#!/bin/bash
# deployment-health-check.sh

ENDPOINT="https://api-prod.fiestime.app/graphql"
MAX_RETRIES=5
RETRY_COUNT=0

echo "Starting deployment health check..."

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  # Test GraphQL introspection query
  RESPONSE=$(curl -s -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d '{"query": "{ __schema { queryType { name } } }"}'
  )

  if echo "$RESPONSE" | jq -e '.data.__schema.queryType.name == "Query"' > /dev/null; then
    echo "✅ Health check passed"

    # Test event creation
    CREATE_RESPONSE=$(curl -s -X POST "$ENDPOINT" \
      -H "Content-Type: application/json" \
      -d '{"query": "mutation { createEvent(name: \"Health Check\", date: \"2025-03-03\") { _id } }"}'
    )

    if echo "$CREATE_RESPONSE" | jq -e '.data.createEvent._id' > /dev/null; then
      echo "✅ Event creation test passed"
      echo "🎉 Deployment health check successful"
      exit 0
    fi
  fi

  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "❌ Health check failed, retry $RETRY_COUNT/$MAX_RETRIES"
  sleep 10
done

echo "💥 Health check failed after $MAX_RETRIES attempts"
exit 1
```

## Emergency Contacts and Procedures

### Incident Response Team
- **On-call Engineer**: [Contact info]
- **DevOps Lead**: [Contact info]
- **Product Owner**: [Contact info]
- **AWS Support**: [Support case process]

### Escalation Matrix
1. **Severity 1** (Production down): Immediate page to on-call
2. **Severity 2** (Degraded performance): Slack alert + email
3. **Severity 3** (Minor issues): Email notification

### Communication Channels
- **Slack**: #fiestime-alerts, #fiestime-incidents
- **Email**: fiestime-ops@company.com
- **Status Page**: status.fiestime.app

This comprehensive troubleshooting guide should help quickly identify and resolve deployment issues across all environments.