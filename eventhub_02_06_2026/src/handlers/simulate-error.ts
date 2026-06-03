import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { extractOrGenerateCorrelationId } from '../shared/correlation-id';
import { error } from '../shared/response';
import { logger } from '../shared/logger';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const correlationId = extractOrGenerateCorrelationId(event);
  logger.appendKeys({ correlationId });

  logger.error('Erro simulado para demonstração de alarmes', {
    correlationId,
    simulatedError: true,
    stack: new Error('Erro simulado para demonstração de alarmes').stack,
  });

  return error(500, 'Erro simulado para demonstração de alarmes', correlationId);
};
