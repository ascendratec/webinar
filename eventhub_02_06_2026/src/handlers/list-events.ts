import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { extractOrGenerateCorrelationId } from '../shared/correlation-id';
import { logger } from '../shared/logger';
import { tracer } from '../shared/tracer';
import { success, error } from '../shared/response';
import { AppError } from '../shared/errors';
import { EventService } from '../services/event-service';
import { DynamoEventRepository } from '../repositories/dynamo-event-repository';

const repository = new DynamoEventRepository();
const eventService = new EventService(repository);

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('## handler');
  tracer.setSegment(subsegment!);

  const correlationId = extractOrGenerateCorrelationId(event);
  logger.appendKeys({ correlationId });
  tracer.putAnnotation('correlationId', correlationId);

  try {
    logger.info('Listando eventos ativos');

    const events = await eventService.listActiveEvents();

    logger.info('Eventos ativos retornados com sucesso', { count: events.length });

    return success(200, events);
  } catch (err) {
    if (err instanceof AppError && err.isOperational) {
      logger.warn('Erro operacional ao listar eventos', { correlationId, error: err.message });
      return error(err.statusCode, err.message, correlationId);
    }

    logger.error('Erro interno ao listar eventos', { correlationId, error: err, stack: (err as Error).stack });
    subsegment?.addError(err as Error);
    return error(500, 'Erro interno do servidor', correlationId);
  } finally {
    subsegment?.close();
    tracer.setSegment(segment!);
  }
};
