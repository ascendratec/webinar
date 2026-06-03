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
    logger.info('Criando novo evento');

    const body = event.body ? JSON.parse(event.body) : {};

    const created = await eventService.createEvent({
      title: body.title,
      description: body.description,
      date: body.date,
      location: body.location,
      capacity: body.capacity,
    });

    logger.info('Evento criado com sucesso', { eventId: created.eventId });

    return success(201, created);
  } catch (err) {
    if (err instanceof SyntaxError) {
      logger.warn('JSON inválido no body', { correlationId });
      return error(400, 'Invalid JSON body', correlationId);
    }

    if (err instanceof AppError && err.isOperational) {
      logger.warn('Erro operacional ao criar evento', { correlationId, error: err.message });
      return error(err.statusCode, err.message, correlationId);
    }

    logger.error('Erro interno ao criar evento', { correlationId, error: err });
    return error(500, 'Erro interno do servidor', correlationId);
  }
};
