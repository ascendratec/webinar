# EventHub — Observability Guide

inclusion: auto

## Current State

### Logging (✅ Active)

- **Tool:** AWS Lambda Powertools Logger v2
- **Format:** Structured JSON to CloudWatch Logs
- **Service name:** `eventhub-webinar` (shared across all handlers)
- **Correlation:** `correlationId` appended to every log entry via `logger.appendKeys()`
- **Propagation:** `x-correlation-id` HTTP header extracted or UUID auto-generated

### Metrics (✅ Active)

- **Tool:** AWS Lambda Powertools Metrics v2
- **Namespace:** `EventHub`
- **Custom metrics emitted:**
  - `RegistrationsCreated` (Count) — in `create-registration` handler
- **Per-function service tag:** `Service: {handler-name}` on each Lambda

### Tracing (✅ Active)

- **X-Ray Active Tracing:** Enabled globally (`Globals.Function.Tracing: Active`)
- **Powertools Tracer:** Instantiated in `src/shared/tracer.ts`, used in all handlers
- **AWS SDK patching:** DynamoDB, S3, and SecretsManager clients wrapped with `tracer.captureAWSv3Client()`
- **Aurora subsegments:** All repository methods wrapped with custom subsegments (`Aurora: {operation}`)
- **Annotations indexed for X-Ray queries:**
  - `correlationId` — on every handler invocation
  - `eventId` — on event-related and registration-creation handlers
  - `registrationId` — on registration-related handlers
  - `simulatedError` — on simulate-error handler
- **Current visibility in X-Ray:**
  - Lambda invocation segments
  - Handler subsegments with error capture
  - DynamoDB call subsegments (auto via SDK patching)
  - S3 call subsegments (auto via SDK patching)
  - SecretsManager call subsegments (auto via SDK patching)
  - Aurora/pg manual subsegments per repository operation
  - Custom annotations for filter queries
  - Cross-service trace correlation (API GW → Lambda → downstream)

### Alarms (✅ Active)

| Alarm | Metric | Threshold | Period | Action |
|-------|--------|-----------|--------|--------|
| ApiGateway-5xx | AWS/ApiGateway 5xx | > 5 | 5 min | SNS → AdminEmail |
| DLQ-Messages | AWS/SQS NumberOfMessagesSent | ≥ 1 | 1 min | SNS → AdminEmail |
| ProcessDocument-Errors | AWS/Lambda Errors | > 3 | 5 min | SNS → AdminEmail |

## What's Needed for Full Trace Map / X-Ray Queries

To correlate flows across API Gateway → Lambda → DynamoDB/Aurora → S3 → ProcessDocument → DLQ:

### 1. Instantiate Tracer in handlers

```typescript
import { Tracer } from '@aws-lambda-powertools/tracer';

const tracer = new Tracer({ serviceName: 'create-registration' });
```

### 2. Capture Lambda handler

```typescript
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import middy from '@middy/core';

export const handler = middy(lambdaHandler).use(captureLambdaHandler(tracer));
```

Or manually:
```typescript
export const handler = async (event) => {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('## handler');
  tracer.setSegment(subsegment!);
  try { /* ... */ } finally {
    subsegment?.close();
    tracer.setSegment(segment!);
  }
};
```

### 3. Patch AWS SDK clients

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const client = tracer.captureAWSv3Client(new DynamoDBClient({}));
```

### 4. Add annotations for X-Ray filter queries

```typescript
tracer.putAnnotation('registrationId', registrationId);
tracer.putAnnotation('eventId', eventId);
tracer.putMetadata('requestBody', body);
```

### 5. Trace pg (Aurora) queries manually

```typescript
const subsegment = tracer.getSegment()?.addNewSubsegment('Aurora: createRegistration');
try {
  const result = await pool.query(sql, params);
  subsegment?.addMetadata('rowCount', result.rowCount);
} catch (err) {
  subsegment?.addError(err as Error);
  throw err;
} finally {
  subsegment?.close();
}
```

## X-Ray Insights Queries (once instrumented)

```
# Find all traces for a specific registration
annotation.registrationId = "uuid-here"

# Find slow Aurora queries (>2s)
service("Aurora: *") { responsetime > 2 }

# Find traces with DynamoDB errors
service("DynamoDB") { fault = true }

# Find all traces hitting the DLQ path
service("process-uploaded-document") { fault = true }

# Trace a full registration flow by correlationId
annotation.correlationId = "uuid-here"
```

## CloudWatch Logs Insights Queries

```sql
-- Find all logs for a correlationId across services
fields @timestamp, @message, correlationId, registrationId
| filter correlationId = "uuid-here"
| sort @timestamp asc

-- Error rate by handler
filter level = "ERROR"
| stats count() as errors by @log
| sort errors desc

-- Registration processing latency
filter @message like /Inscrição criada com sucesso/
| stats avg(@duration) as avg_ms, max(@duration) as max_ms by bin(5m)
```
