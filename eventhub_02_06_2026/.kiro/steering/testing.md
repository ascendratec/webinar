# EventHub — Testing Guide

## Framework

- **Test runner:** Jest 29
- **Assertion:** Jest built-in (`expect`)
- **Property-based testing:** fast-check 3.x
- **TypeScript support:** ts-jest
- **AWS SDK mocking:** aws-sdk-client-mock

## Configuration

Jest config is in `jest.config.ts` at the project root.

## Test Structure

```
tests/
├── unit/           # Unit tests for services, handlers, shared utilities
└── property/       # Property-based tests (invariants, fuzzing)
```

## Running Tests

```bash
npm test                  # All tests with coverage
npm run test:unit         # Unit tests only
npm run test:property     # Property-based tests only
```

## Writing Unit Tests

### Handler Tests

Mock the repository/service layer and test HTTP response behavior:

```typescript
import { handler } from '../../src/handlers/create-registration';
import { mockClient } from 'aws-sdk-client-mock';

describe('create-registration handler', () => {
  it('returns 400 when body is missing', async () => {
    const event = buildApiGatewayEvent({ body: null });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });
});
```

### Service Tests

Test business logic with mocked repositories:

```typescript
import { RegistrationService } from '../../src/services/registration-service';

describe('RegistrationService', () => {
  const mockRegistrationRepo = {
    createParticipantAndRegistration: jest.fn(),
    findByEmailAndEvent: jest.fn(),
    // ...
  };
  const mockEventRepo = {
    getEventById: jest.fn(),
    decrementAvailableSlots: jest.fn(),
    // ...
  };

  const service = new RegistrationService(mockRegistrationRepo, mockEventRepo);

  it('throws ConflictError when email already registered', async () => {
    mockEventRepo.getEventById.mockResolvedValue({ availableSlots: 10 });
    mockRegistrationRepo.findByEmailAndEvent.mockResolvedValue({ id: 'existing' });

    await expect(service.createRegistration({ name: 'Test', email: 'a@b.com', eventId: 'evt1' }))
      .rejects.toThrow('E-mail já registrado para este evento');
  });
});
```

## Writing Property-Based Tests

Use fast-check to verify invariants across random inputs:

```typescript
import * as fc from 'fast-check';
import { extractRegistrationIdFromS3Key, generateS3Key } from '../../src/services/document-service';

describe('document-service properties', () => {
  it('extractRegistrationIdFromS3Key is inverse of generateS3Key', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('/')),
        (registrationId, fileName) => {
          const key = generateS3Key(registrationId, fileName);
          const extracted = extractRegistrationIdFromS3Key(key);
          return extracted === registrationId;
        }
      )
    );
  });
});
```

## Mocking Patterns

### AWS SDK v3

```typescript
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddbMock.reset());

ddbMock.on(GetCommand).resolves({ Item: { pk: 'event-1', title: 'Test' } });
```

### Environment Variables

```typescript
beforeAll(() => {
  process.env.EVENTS_TABLE_NAME = 'test-table';
  process.env.PG_HOST = 'localhost';
});
```

## Coverage

Coverage reports are generated with `npm test`. Aim for:
- Services: 90%+ branch coverage
- Handlers: 80%+ line coverage
- Shared utilities: 95%+ coverage
