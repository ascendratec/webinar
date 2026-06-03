# EventHub — Coding Conventions

inclusion: auto

## Language & Style

- All source code in TypeScript (strict mode)
- Target: ES2022
- Use `type` imports for type-only references (`import type { ... }`)
- Prefer `const` over `let`; avoid `var`
- Use arrow functions for inline callbacks; named `function` for top-level exports when appropriate

## Handler Pattern

Every Lambda handler follows this structure:

```typescript
import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../shared/logger';
import { extractOrGenerateCorrelationId } from '../shared/correlation-id';
import { success, error } from '../shared/response';
import { AppError } from '../shared/errors';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const correlationId = extractOrGenerateCorrelationId(event);
  logger.appendKeys({ correlationId });

  try {
    // Business logic here
    return success(200, result);
  } catch (err) {
    if (err instanceof AppError && err.isOperational) {
      return error(err.statusCode, err.message, correlationId);
    }
    logger.error('Unexpected error', { correlationId, error: err });
    return error(500, 'Erro interno do servidor', correlationId);
  }
};
```

## Error Handling

- Use `AppError` subclasses for operational errors (ValidationError, NotFoundError, ConflictError, InvalidStateError)
- Only operational errors return specific messages to the client
- Unexpected errors return generic 500 with correlationId for tracing
- Always log errors with correlationId and stack trace

## Naming Conventions

- Files: kebab-case (`create-registration.ts`, `aurora-registration-repository.ts`)
- Interfaces: PascalCase without "I" prefix (`EventRepository`, not `IEventRepository`)
- Types/Interfaces: in `src/types/` directory
- Repository interfaces: in `src/repositories/interfaces/`

## Response Format

- Success: `{ statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }`
- Error: `{ statusCode, message, correlationId }`

## Logging

- Use the shared `logger` instance (Powertools Logger)
- Always append `correlationId` at handler entry
- Use structured logging with contextual keys
- Log levels: `info` for happy path, `warn` for operational errors, `error` for unexpected failures

## Repository Layer

- Repository interfaces define contracts in `src/repositories/interfaces/`
- Implementations: `DynamoEventRepository`, `AuroraRegistrationRepository`
- Services receive repositories via constructor injection
- Database operations use parameterized queries (pg for Aurora)

## Testing

- Unit tests in `tests/unit/`
- Property-based tests in `tests/property/` using fast-check
- Mock AWS SDK clients with `aws-sdk-client-mock`
- Test file naming: `{module-name}.test.ts`
