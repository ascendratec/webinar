# EventHub Serverless — Project Context

## Overview

EventHub is a serverless event management and registration platform built with AWS SAM (Serverless Application Model) and TypeScript. It enables administrators to create events and manage registrations, while participants can register for events and upload required documents.

## Tech Stack

- **Runtime:** Node.js 22.x (TypeScript)
- **IaC:** AWS SAM (template.yaml)
- **Build:** esbuild (via SAM BuildMethod)
- **Testing:** Jest + fast-check (property-based testing)
- **Linting:** TypeScript strict mode (`tsc --noEmit`)

## AWS Services

| Service | Purpose |
|---------|---------|
| API Gateway (HTTP API) | REST endpoints with CORS |
| Lambda | Business logic handlers |
| DynamoDB | Event catalog (single-table, pk=eventId) |
| Aurora Serverless v2 (PostgreSQL 16.4) | Registrations, participants, audit logs |
| S3 | Document uploads (presigned URLs) |
| SQS | Dead Letter Queue for failed document processing |
| SNS | Alarm notifications to admin email |
| CloudWatch Alarms | 5xx errors, DLQ messages, Lambda errors |
| CloudFront + S3 | Frontend static hosting |
| VPC | Private subnets for Aurora access |
| Secrets Manager | Aurora master password (auto-managed) |
| Lambda Powertools | Logger, Metrics, Tracer (layer) |

## Architecture Patterns

- **Layered architecture:** handlers → services → repositories → interfaces
- **Repository pattern:** `EventRepository` (DynamoDB), `RegistrationRepository` (Aurora/pg)
- **Saga/compensation:** Registration creation spans DynamoDB + Aurora; if DynamoDB decrement fails, Aurora is rolled back
- **Async document processing:** S3 event notification → Lambda (with DLQ on failure)
- **Correlation IDs:** Propagated via `x-correlation-id` header or auto-generated UUID

## Key Commands

```bash
sam build          # Build all Lambda functions
sam deploy         # Deploy stack
sam validate       # Validate template
npm test           # Run all tests with coverage
npm run test:unit  # Unit tests only
npm run test:property  # Property-based tests only
npm run lint       # TypeScript type check
```

## Project Structure

```
├── src/
│   ├── handlers/       # Lambda handler entry points
│   ├── services/       # Business logic layer
│   ├── repositories/   # Data access layer
│   │   └── interfaces/ # Repository contracts
│   ├── shared/         # Cross-cutting: logger, errors, response, validator
│   └── types/          # Domain types (Event, Registration, Participant)
├── tests/
│   ├── unit/           # Unit tests
│   └── property/       # Property-based tests (fast-check)
├── sql/                # Aurora PostgreSQL schema
├── scripts/            # Deployment and seed scripts
├── layers/powertools/  # Lambda Powertools layer
├── frontend/           # Static HTML/JS frontend
└── template.yaml       # SAM CloudFormation template
```
