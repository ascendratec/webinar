import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { extractOrGenerateCorrelationId } from '../shared/correlation-id';
import { success, error } from '../shared/response';
import { logger } from '../shared/logger';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const correlationId = extractOrGenerateCorrelationId(event);
  logger.appendKeys({ correlationId });

  try {
    return success(200, {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Erro interno no health check', { correlationId, error: err, stack: (err as Error).stack });
    return error(500, 'Erro interno do servidor', correlationId);
  }
};
