import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { extractOrGenerateCorrelationId } from '../shared/correlation-id';
import { logger } from '../shared/logger';
import { success, error } from '../shared/response';
import { AppError } from '../shared/errors';
import { EventService } from '../services/event-service';
import { DynamoEventRepository } from '../repositories/dynamo-event-repository';

const repository = new DynamoEventRepository();
const eventService = new EventService(repository);

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const correlationId = extractOrGenerateCorrelationId(event);
  logger.appendKeys({ correlationId });

  try {
    const eventId = event.pathParameters?.eventId;

    if (!eventId) {
      return error(400, 'eventId is required', correlationId);
    }

    logger.info('Deletando evento', { eventId });

    await eventService.deleteEvent(eventId);

    logger.info('Evento deletado com sucesso', { eventId });

    return success(200, { message: 'Event deleted successfully', eventId });
  } catch (err) {
    if (err instanceof AppError && err.isOperational) {
      logger.warn('Erro operacional ao deletar evento', { correlationId, error: err.message });
      return error(err.statusCode, err.message, correlationId);
    }

    logger.error('Erro interno ao deletar evento', { correlationId, error: err });
    return error(500, 'Erro interno do servidor', correlationId);
  }
};
