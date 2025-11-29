# GitHub Secrets Setup for Sandbox Deployment

This guide explains how to configure the required GitHub secrets for deploying the fiestime backend to AWS.

## Required GitHub Secrets

Navigate to your repository settings: `https://github.com/delkant/fiestime-backend/settings/secrets/actions`

### 1. AWS Credentials

**AWS_ACCESS_KEY_ID_SANDBOX**
- Your AWS access key ID for the sandbox environment
- Example: `AKIA1234567890ABCDEF`

**AWS_SECRET_ACCESS_KEY_SANDBOX**
- Your AWS secret access key for the sandbox environment
- Example: `abcdef1234567890abcdef1234567890abcdef12`

**AWS_REGION_SANDBOX**
- AWS region for deployment
- Example: `us-east-1`

### 2. S3 Bucket Names

**CODE_BUCKET_SANDBOX**
- S3 bucket for storing deployment artifacts (Lambda zip files)
- Example: `fiestime-deployment-artifacts-sandbox`
- Must be globally unique
- Will be created automatically by CloudFormation if it doesn't exist

**UPLOAD_BUCKET_SANDBOX**
- S3 bucket for storing uploaded videos
- Example: `fiestime-video-uploads-sandbox`
- Must be globally unique
- Will be created by CloudFormation template

### 3. CloudFormation Stack

**CLOUDFORMATION_STACK_NAME_SANDBOX**
- Name for the CloudFormation stack
- Example: `fiestime-backend-sandbox`
- Must be unique within your AWS account/region

## AWS Setup Prerequisites

### 1. Create AWS IAM User

Create an IAM user with these permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "cloudformation:*",
                "lambda:*",
                "apigateway:*",
                "s3:*",
                "iam:*",
                "logs:*",
                "secretsmanager:*"
            ],
            "Resource": "*"
        }
    ]
}
```

### 2. Create MongoDB Connection

#### Option A: MongoDB Atlas (Recommended)
1. Create a MongoDB Atlas cluster
2. Get the connection string (format: `mongodb+srv://username:password@cluster.mongodb.net/dbname`)
3. Store in AWS Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name "fiestime/sandbox/mongodb" \
  --description "MongoDB connection for fiestime sandbox" \
  --secret-string '{"uri":"mongodb+srv://username:password@cluster.mongodb.net/fiestime_sandbox"}'
```

#### Option B: Local MongoDB (Development Only)
If using a local MongoDB instance, update the CloudFormation template to remove the Secrets Manager dependency.

### 3. Pre-create S3 Buckets (Optional)

The CloudFormation template will create the buckets automatically, but you can pre-create them:

```bash
# Create deployment artifacts bucket
aws s3 mb s3://fiestime-deployment-artifacts-sandbox

# Create video uploads bucket
aws s3 mb s3://fiestime-video-uploads-sandbox
```

## Example Secret Values

Here are example values for a complete sandbox setup:

```
AWS_ACCESS_KEY_ID_SANDBOX=AKIA1234567890EXAMPLE
AWS_SECRET_ACCESS_KEY_SANDBOX=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION_SANDBOX=us-east-1
CODE_BUCKET_SANDBOX=fiestime-code-artifacts-sandbox-12345
UPLOAD_BUCKET_SANDBOX=fiestime-uploads-sandbox-12345
CLOUDFORMATION_STACK_NAME_SANDBOX=fiestime-backend-sandbox
```

**Note**: Bucket names must be globally unique across all AWS accounts, so append a random number or your account ID.

## Deployment Process

Once secrets are configured:

1. **Trigger Deployment**: Push to the `sandbox` branch
2. **Monitor Progress**: Check GitHub Actions tab
3. **Get API Endpoint**: After successful deployment, find the API Gateway URL in:
   - CloudFormation stack outputs
   - GitHub Actions deployment logs

## Troubleshooting

### Common Issues

**Build fails with "Input required and not supplied: aws-region"**
- Ensure all required secrets are configured in GitHub
- Check secret names match exactly (case-sensitive)

**S3 bucket creation fails**
- Bucket names must be globally unique
- Try adding random numbers to bucket names

**Lambda deployment fails**
- Check IAM permissions for the deployment user
- Verify the CloudFormation template is valid

**Database connection fails**
- Ensure MongoDB URI is stored in AWS Secrets Manager
- Check the secret name matches CloudFormation parameter

### Getting Help

1. Check GitHub Actions logs for specific error messages
2. Review AWS CloudFormation events in the AWS console
3. Verify all secrets are configured correctly
4. Test AWS credentials locally: `aws sts get-caller-identity`

## Security Best Practices

- Use IAM roles with minimal required permissions
- Rotate AWS access keys regularly
- Store sensitive data in AWS Secrets Manager, not environment variables
- Enable AWS CloudTrail for audit logging
- Use separate AWS accounts for different environments (dev/staging/prod)