# EventHub — Security Guide

## Authentication & Authorization

- **Current state:** No authentication on any endpoint (workshop/demo scope)
- Admin endpoints (`/admin/*`) are unprotected — suitable only for demos
- Production would require: API Gateway authorizer (Cognito, Lambda, or JWT)

## Secrets Management

- Aurora master password managed by AWS Secrets Manager (`ManageMasterUserPassword: true`)
- Secret ARN passed to Lambda via `DB_SECRET_ARN` environment variable
- Lambda functions have `secretsmanager:GetSecretValue` permission scoped to the specific secret
- Password auto-rotated by Secrets Manager

## Network Security

- Aurora accessible only from private subnets
- Lambda Security Group allows:
  - Egress to Aurora on port 5432 only (via SG reference)
  - Egress HTTPS (443) to 0.0.0.0/0 (for AWS API calls)
- Aurora Security Group allows:
  - Ingress on port 5432 only from Lambda SG
- NAT Instance provides internet access for private subnets

## Data Protection

- **S3 Documents bucket:**
  - Server-side encryption (AES256)
  - Versioning enabled
  - Public access fully blocked
  - Access logging to separate bucket
  - CORS limited to PUT method
- **DynamoDB:** SSE enabled, PITR enabled
- **Aurora:** Storage encryption enabled (`StorageEncrypted: true`)

## Input Validation

- Request body parsed with try/catch (malformed JSON → 400)
- `validateCreateRegistration` checks required fields
- Event service validates field lengths and formats
- UUID format validation on eventId
- SQL injection prevented via parameterized queries (pg)
- S3 key injection prevented via controlled key generation (`registrations/{id}/{filename}`)

## Least Privilege (IAM)

- Each Lambda function has only the permissions it needs:
  - Read-only functions: `DynamoDBReadPolicy`
  - Write functions: `DynamoDBCrudPolicy`
  - VPC-attached functions: `VPCAccessPolicy`
  - S3 access: specific object-level actions per function
  - Secrets Manager: scoped to the Aurora secret ARN

## Error Handling & Information Disclosure

- Internal errors return generic message: "Erro interno do servidor"
- Operational errors return safe, user-facing messages
- Stack traces logged to CloudWatch but never returned to clients
- CorrelationId returned in error responses for support reference
