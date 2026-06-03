import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { extractOrGenerateCorrelationId } from '../shared/correlation-id';
import { logger } from '../shared/logger';
import { tracer } from '../shared/tracer';
import { success, error } from '../shared/response';
import { AppError, InvalidStateError, NotFoundError } from '../shared/errors';
import { validateRegistrationId, validateRejectRequest } from '../shared/validator';
import { AuroraRegistrationRepository } from '../repositories/aurora-registration-repository';

const repository = new AuroraRegistrationRepository();

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('## handler');
  tracer.setSegment(subsegment!);

  const correlationId = extractOrGenerateCorrelationId(event);
  logger.appendKeys({ correlationId });
  tracer.putAnnotation('correlationId', correlationId);

  try {
    const id = event.pathParameters?.id ?? '';
    tracer.putAnnotation('registrationId', id);

    logger.info('Recebida requisição para rejeitar inscrição', { id });

    // Validate ID format
    const validation = validateRegistrationId(id);
    if (!validation.isValid) {
      logger.warn('ID de inscrição com formato inválido', { correlationId, id, errors: validation.errors });
      return error(400, validation.errors.join(', '), correlationId);
    }

    // Parse request body
    let body: unknown;
    try {
      body = event.body ? JSON.parse(event.body) : null;
    } catch {
      return error(400, 'O corpo da requisição deve ser um JSON válido', correlationId);
    }

    // Validate reject request (reason field)
    const bodyValidation = validateRejectRequest(body);
    if (!bodyValidation.isValid) {
      logger.warn('Validação falhou para rejeição de inscrição', { correlationId, errors: bodyValidation.errors });
      return error(400, bodyValidation.errors.join('; '), correlationId);
    }

    const { reason } = body as { reason: string };

    // Get registration
    const registration = await repository.getRegistrationById(id);
    if (!registration) {
      throw new NotFoundError('Inscrição', id);
    }

    // Validate state
    if (registration.status !== 'DOCUMENT_UPLOADED') {
      throw new InvalidStateError(registration.status, 'reject');
    }

    // Update status to REJECTED with reason
    const updated = await repository.updateStatus(id, 'REJECTED', reason);

    // Create audit log
    await repository.createAuditLog(id, 'DOCUMENT_UPLOADED', 'REJECTED', reason);

    logger.info('Inscrição rejeitada com sucesso', { id, status: updated.status, reason });

    return success(200, {
      id: updated.id,
      status: updated.status,
      reason: updated.rejectionReason,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    if (err instanceof AppError && err.isOperational) {
      logger.warn('Erro operacional ao rejeitar inscrição', { correlationId, error: err.message });
      return error(err.statusCode, err.message, correlationId);
    }

    logger.error('Erro interno ao rejeitar inscrição', { correlationId, error: err, stack: (err as Error).stack });
    subsegment?.addError(err as Error);
    return error(500, 'Erro interno do servidor', correlationId);
  } finally {
    subsegment?.close();
    tracer.setSegment(segment!);
  }
};
