# EventHub — SAM Deployment Guide

## Prerequisites

- AWS CLI configured with appropriate credentials
- SAM CLI installed (v1.100+)
- Node.js 22.x
- Docker (for SAM build with layers)

## Parameters

| Parameter | Description | Required |
|-----------|-------------|----------|
| AdminEmail | Email for SNS alarm notifications | Yes |
| NATInstanceAMI | fck-nat AMI ID for the target region | No (default: us-east-1) |

## Deploy Commands

```bash
# First deploy (guided)
sam deploy --guided

# Subsequent deploys
sam deploy

# Validate template before deploy
sam validate

# Build only
sam build
```

## samconfig.toml

The project uses `samconfig.toml` for deployment configuration. Key settings:
- Stack name
- Region
- S3 bucket for artifacts
- Parameter overrides
- Capability confirmations (IAM, auto-expand)

## Post-Deploy Steps

1. **Apply Aurora schema:**
   ```bash
   npx tsx scripts/apply-schema.ts
   ```

2. **Deploy frontend:**
   ```bash
   bash scripts/deploy-frontend.sh
   ```

3. **Confirm SNS subscription:**
   Check the AdminEmail inbox and confirm the subscription.

## Infrastructure Notes

- Aurora uses `ManageMasterUserPassword: true` — Secrets Manager auto-rotates
- NAT Instance (fck-nat) is cheaper than NAT Gateway for workshop use
- DynamoDB uses PAY_PER_REQUEST billing
- Aurora scales 0.5 → 2 ACU (Serverless v2)
- S3 buckets have versioning enabled and server-side encryption
- CloudFront uses OAC (Origin Access Control) for S3 access

## Cleanup

```bash
# Empty S3 buckets first (required before stack deletion)
aws s3 rm s3://{stack-name}-documents-{account-id} --recursive
aws s3 rm s3://{stack-name}-documents-logs-{account-id} --recursive
aws s3 rm s3://{stack-name}-frontend-{account-id} --recursive

# Delete stack
sam delete
```

## Outputs

| Output | Description |
|--------|-------------|
| FrontendUrl | CloudFront HTTPS URL |
| FrontendBucketName | S3 bucket for frontend deploy |
| FrontendDistributionId | CloudFront distribution ID (for invalidation) |
| ApiUrl | API Gateway base URL |
