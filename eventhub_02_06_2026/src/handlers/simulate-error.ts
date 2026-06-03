import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { extractOrGenerateCorrelationId } from '../shared/correlation-id';
import { error } from '../shared/response';
import { logger } from '../shared/logger';
import { tracer } from '../shared/tracer';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('## handler');
  tracer.setSegment(subsegment!);

  const correlationId = extractOrGenerateCorrelationId(event);
  logger.appendKeys({ correlationId });
  tracer.putAnnotation('correlationId', correlationId);
  tracer.putAnnotation('simulatedError', 'true');

  try {
    const simulatedError = new Error('Erro simulado para demonstração de alarmes');

    logger.error('Erro simulado para demonstração de alarmes', {
      correlationId,
      simulatedError: true,
      stack: simulatedError.stack,
    });

    subsegment?.addError(simulatedError);

    return error(500, 'Erro simulado para demonstração de alarmes', correlationId);
  } finally {
    subsegment?.close();
    tracer.setSegment(segment!);
  }
};
