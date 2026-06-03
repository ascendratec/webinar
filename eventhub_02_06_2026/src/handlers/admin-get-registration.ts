import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { extractOrGenerateCorrelationId } from '../shared/correlation-id';
import { logger } from '../shared/logger';
import { success, error } from '../shared/response';
import { AppError, NotFoundError } from '../shared/errors';
import { validateRegistrationId } from '../shared/validator';
import { AuroraRegistrationRepository } from '../repositories/aurora-registration-repository';

const repository = new AuroraRegistrationRepository();

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const correlationId = extractOrGenerateCorrelationId(event);
  logger.appendKeys({ correlationId });

  try {
    const id = event.pathParameters?.id ?? '';

    logger.info('Buscando inscrição com dados do participante (admin)', { id });

    const validation = validateRegistrationId(id);
    if (!validation.isValid) {
      logger.warn('ID de inscrição com formato inválido', { correlationId, id, errors: validation.errors });
      return error(400, validation.errors.join(', '), correlationId);
    }

    const registration = await repository.getRegistrationWithParticipant(id);

    if (!registration) {
      throw new NotFoundError('Inscrição', id);
    }

    logger.info('Inscrição encontrada com sucesso (admin)', { id, status: registration.status });

    return success(200, registration);
  } catch (err) {
    if (err instanceof AppError && err.isOperational) {
      logger.warn('Erro operacional ao buscar inscrição (admin)', { correlationId, error: err.message });
      return error(err.statusCode, err.message, correlationId);
    }

    logger.error('Erro interno ao buscar inscrição (admin)', { correlationId, error: err, stack: (err as Error).stack });
    return error(500, 'Erro interno do servidor', correlationId);
  }
};
