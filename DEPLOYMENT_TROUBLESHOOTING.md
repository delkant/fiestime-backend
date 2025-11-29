# Deployment Troubleshooting Guide

## Current Issue: AWS Credentials Configuration Failure

The deployment is failing at the "Configure AWS credentials (Sandbox)" step. Here are the most common causes and solutions:

### 1. Check GitHub Secrets Configuration

Go to: `https://github.com/delkant/fiestime-backend/settings/secrets/actions`

Ensure ALL these secrets are configured with correct values:

#### Required Secrets:
- ✅ `AWS_ACCESS_KEY_ID_SANDBOX` - Should start with `AKIA...`
- ✅ `AWS_SECRET_ACCESS_KEY_SANDBOX` - Should be a long alphanumeric string
- ✅ `AWS_REGION_SANDBOX` - Should be like `us-east-1` or `us-west-2`
- ✅ `CODE_BUCKET_SANDBOX` - S3 bucket name (globally unique)
- ✅ `UPLOAD_BUCKET_SANDBOX` - S3 bucket name (globally unique)
- ✅ `CLOUDFORMATION_STACK_NAME_SANDBOX` - Stack name like `fiestime-backend-sandbox`

### 2. Common Issues:

#### Issue: Invalid AWS Credentials
**Symptoms**: "Invalid credentials" or "Access denied" errors
**Solution**:
- Verify the AWS Access Key ID and Secret Access Key are correct
- Ensure the IAM user has the required permissions
- Check if the credentials haven't expired

#### Issue: Incorrect AWS Region
**Symptoms**: "Invalid region" error
**Solution**:
- Use standard AWS region format: `us-east-1`, `us-west-2`, `eu-west-1`, etc.
- Don't use availability zones (like `us-east-1a`)

#### Issue: Invalid S3 Bucket Names
**Symptoms**: "Invalid bucket name" or "Bucket already exists" errors
**Solution**:
- S3 bucket names must be globally unique across ALL AWS accounts
- Use format: `your-company-service-environment-random`
- Example: `fiestime-code-artifacts-sandbox-12345`
- Must be lowercase, no underscores, 3-63 characters

### 3. How to Debug:

1. **View Detailed Logs**:
   - Go to: `https://github.com/delkant/fiestime-backend/actions`
   - Click on the latest "Deploy Sandbox stack" run
   - Expand the "Configure AWS credentials (Sandbox)" step
   - Look for the specific error message

2. **Test AWS Credentials Locally**:
   ```bash
   # Set your credentials temporarily
   export AWS_ACCESS_KEY_ID="your-access-key"
   export AWS_SECRET_ACCESS_KEY="your-secret-key"
   export AWS_DEFAULT_REGION="us-east-1"

   # Test credentials
   aws sts get-caller-identity

   # Test S3 access
   aws s3 ls
   ```

### 4. IAM Permissions Required:

Your AWS IAM user needs these permissions:
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
                "iam:PassRole",
                "iam:CreateRole",
                "iam:AttachRolePolicy",
                "iam:DetachRolePolicy",
                "iam:DeleteRole",
                "iam:GetRole",
                "logs:*",
                "secretsmanager:GetSecretValue"
            ],
            "Resource": "*"
        }
    ]
}
```

### 5. Quick Fixes to Try:

1. **Recreate the secrets**: Delete and recreate all 6 GitHub secrets
2. **Check for whitespace**: Ensure no spaces at beginning/end of secret values
3. **Use different bucket names**: Try completely different bucket names
4. **Verify region**: Use `us-east-1` which has the most AWS services available

### 6. Next Steps:

1. Check the detailed error message in GitHub Actions logs
2. Verify all secret values are correct (especially check for typos)
3. If still failing, try creating the S3 buckets manually first:
   ```bash
   aws s3 mb s3://your-code-bucket-name
   aws s3 mb s3://your-upload-bucket-name
   ```

Once you identify the specific error from the GitHub Actions logs, I can provide more targeted troubleshooting steps.