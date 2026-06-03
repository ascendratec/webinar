import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export function extractOrGenerateCorrelationId(event: APIGatewayProxyEventV2): string {
  const headerValue = event.headers?.['x-correlation-id'];

  if (headerValue && headerValue.trim().length > 0) {
    return headerValue;
  }

  return crypto.randomUUID();
}
