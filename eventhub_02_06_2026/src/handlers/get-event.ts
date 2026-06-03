import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { extractOrGenerateCorrelationId } from '../shared/correlation-id';
import { logger } from '../shared/logger';
import { success, error } from '../shared/response';
import { AppError } from '../shared/errors';
import { validateEventId } from '../shared/validator';
import { EventService } from '../services/event-service';
import { DynamoEventRepository } from '../repositories/dynamo-event-repository';

const repository = new DynamoEventRepository();
const eventService = new EventService(repository);

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const correlationId = extractOrGenerateCorrelationId(event);
  logger.appendKeys({ correlationId });

  try {
    const eventId = event.pathParameters?.eventId ?? '';

    logger.info('Buscando evento por ID', { eventId });

    const validation = validateEventId(eventId);
    if (!validation.isValid) {
      logger.warn('eventId com formato inválido', { correlationId, eventId, errors: validation.errors });
      return error(400, validation.errors.join(', '), correlationId);
    }

    const foundEvent = await eventService.getEventById(eventId);

    logger.info('Evento encontrado com sucesso', { eventId });

    return success(200, foundEvent);
  } catch (err) {
    if (err instanceof AppError && err.isOperational) {
      logger.warn('Erro operacional ao buscar evento', { correlationId, error: err.message });
      return error(err.statusCode, err.message, correlationId);
    }

    logger.error('Erro interno ao buscar evento', { correlationId, error: err, stack: (err as Error).stack });
    return error(500, 'Erro interno do servidor', correlationId);
  }
};
