import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { logger } from '../shared/logger';
import { extractOrGenerateCorrelationId } from '../shared/correlation-id';
import { error } from '../shared/response';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const correlationId = extractOrGenerateCorrelationId(event);
  logger.appendKeys({ correlationId });

  // Log a CRITICAL error — this triggers the CloudWatch Logs Subscription Filter
  // which invokes the LogAlarmNotifier Lambda → SNS → email in real-time (~2-5 seconds)
  logger.error('CRITICAL: Falha crítica simulada para demonstração de alerta em tempo real', {
    correlationId,
    severity: 'CRITICAL',
    simulatedAt: new Date().toISOString(),
    source: 'simulate-critical-error',
  });

  return error(500, 'Erro crítico simulado — notificação em tempo real enviada via SNS', correlationId);
};
