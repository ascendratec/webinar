# EventHub — Architecture Guide

inclusion: auto

## System Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  CloudFront │────▶│  S3 (Frontend)   │     │  API Gateway    │
│             │     │  Static HTML/JS  │     │  (HTTP API)     │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                      │
                                              ┌───────▼────────┐
                                              │  Lambda Funcs  │
                                              │  (Node 22.x)  │
                                              └──┬─────────┬───┘
                                                 │         │
                                    ┌────────────▼──┐  ┌───▼────────────┐
                                    │   DynamoDB    │  │ Aurora Pg v2   │
                                    │ (Events)      │  │ (Registrations)│
                                    └───────────────┘  └────────────────┘
                                                              │
                                              ┌───────────────▼───┐
                                              │  S3 (Documents)   │
                                              │  ─── S3 Event ──▶ │
                                              └───────────┬───────┘
                                                          │
                                              ┌───────────▼───────┐
                                              │ ProcessDocument   │
                                              │ Lambda            │
                                              └───────┬───────────┘
                                                      │ (on failure)
                                              ┌───────▼───────┐
                                              │   SQS (DLQ)   │
                                              └───────────────┘
```

## Data Flow: Registration Lifecycle

1. **POST /registrations** → CreateRegistrationFunction
   - Validate input
   - Check event exists (DynamoDB)
   - Check available slots
   - Check duplicate email+event (Aurora)
   - Create participant + registration (Aurora, ACID)
   - Decrement availableSlots (DynamoDB, conditional)
   - Compensation if DynamoDB fails

2. **POST /registrations/{id}/upload-url** → GenerateUploadUrlFunction
   - Verify registration exists and status = PENDING_DOCUMENT
   - Generate presigned S3 PUT URL (5 min TTL)

3. **S3 PutObject (registrations/ prefix)** → ProcessUploadedDocumentFunction
   - Extract registrationId from S3 key
   - Update status: PENDING_DOCUMENT → DOCUMENT_UPLOADED
   - Create audit log entry

4. **POST /admin/registrations/{id}/approve** → ApproveRegistrationFunction
   - Verify status = DOCUMENT_UPLOADED
   - Update status → APPROVED

5. **POST /admin/registrations/{id}/reject** → RejectRegistrationFunction
   - Verify status = DOCUMENT_UPLOADED
   - Update status → REJECTED with reason

## Database Strategy (Polyglot Persistence)

| Data | Storage | Rationale |
|------|---------|-----------|
| Events catalog | DynamoDB | Simple key-value, high throughput, atomic counter for slots |
| Registrations & Participants | Aurora PostgreSQL | Relational integrity, ACID transactions, complex queries |
| Audit logs | Aurora PostgreSQL | Foreign keys to registrations, time-series queries |
| Documents | S3 | Binary storage, presigned URL access |

## VPC & Networking

- Aurora is in private subnets (10.0.3.0/24, 10.0.4.0/24)
- Lambda functions needing Aurora access are VPC-attached
- NAT Instance (fck-nat, t3.micro) provides internet egress from private subnets
- Security groups restrict Lambda→Aurora to port 5432 only
- Lambda also has HTTPS egress (443) for AWS API calls

## Observability Stack

| Pillar | Tool | Status |
|--------|------|--------|
| Logging | Powertools Logger | ✅ Active (structured JSON, correlationId) |
| Metrics | Powertools Metrics | ✅ Active (custom namespace: EventHub) |
| Tracing | Powertools Tracer | ✅ Active (X-Ray subsegments, annotations, SDK patching) |
| Alarms | CloudWatch Alarms | ✅ Active (5xx, DLQ, Lambda errors → SNS) |

## API Endpoints

| Method | Path | Handler | Auth |
|--------|------|---------|------|
| GET | /health | HealthFunction | None |
| GET | /events | ListEventsFunction | None |
| GET | /events/{eventId} | GetEventFunction | None |
| POST | /admin/events | CreateEventFunction | None* |
| DELETE | /admin/events/{eventId} | DeleteEventFunction | None* |
| POST | /registrations | CreateRegistrationFunction | None |
| GET | /registrations/{id} | GetRegistrationFunction | None |
| POST | /registrations/{id}/upload-url | GenerateUploadUrlFunction | None |
| GET | /admin/registrations | AdminListRegistrationsFunction | None* |
| GET | /admin/registrations/{id} | AdminGetRegistrationFunction | None* |
| POST | /admin/registrations/{id}/approve | ApproveRegistrationFunction | None* |
| POST | /admin/registrations/{id}/reject | RejectRegistrationFunction | None* |
| POST | /admin/simulate-error | SimulateErrorFunction | None* |

*Admin endpoints have no authentication (workshop/demo scope)*
