import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { extractOrGenerateCorrelationId } from '../shared/correlation-id';
import { logger } from '../shared/logger';
import { success, error } from '../shared/response';
import { AppError, InvalidStateError, NotFoundError } from '../shared/errors';
import { validateRegistrationId } from '../shared/validator';
import { AuroraRegistrationRepository } from '../repositories/aurora-registration-repository';

const repository = new AuroraRegistrationRepository();

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const correlationId = extractOrGenerateCorrelationId(event);
  logger.appendKeys({ correlationId });

  try {
    const id = event.pathParameters?.id ?? '';

    logger.info('Recebida requisição para aprovar inscrição', { id });

    // Validate ID format
    const validation = validateRegistrationId(id);
    if (!validation.isValid) {
      logger.warn('ID de inscrição com formato inválido', { correlationId, id, errors: validation.errors });
      return error(400, validation.errors.join(', '), correlationId);
    }

    // Get registration
    const registration = await repository.getRegistrationById(id);
    if (!registration) {
      throw new NotFoundError('Inscrição', id);
    }

    // Validate state
    if (registration.status !== 'DOCUMENT_UPLOADED') {
      throw new InvalidStateError(registration.status, 'approve');
    }

    // Update status to APPROVED
    const updated = await repository.updateStatus(id, 'APPROVED');

    // Create audit log
    await repository.createAuditLog(id, 'DOCUMENT_UPLOADED', 'APPROVED');

    logger.info('Inscrição aprovada com sucesso', { id, status: updated.status });

    return success(200, {
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    if (err instanceof AppError && err.isOperational) {
      logger.warn('Erro operacional ao aprovar inscrição', { correlationId, error: err.message });
      return error(err.statusCode, err.message, correlationId);
    }

    logger.error('Erro interno ao aprovar inscrição', { correlationId, error: err, stack: (err as Error).stack });
    return error(500, 'Erro interno do servidor', correlationId);
  }
};
