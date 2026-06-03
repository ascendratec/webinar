import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { extractOrGenerateCorrelationId } from '../shared/correlation-id';
import { logger } from '../shared/logger';
import { tracer } from '../shared/tracer';
import { success, error } from '../shared/response';
import { AppError } from '../shared/errors';
import { validateCreateRegistration } from '../shared/validator';
import { RegistrationService } from '../services/registration-service';
import { DynamoEventRepository } from '../repositories/dynamo-event-repository';
import { AuroraRegistrationRepository } from '../repositories/aurora-registration-repository';

const eventRepository = new DynamoEventRepository();
const registrationRepository = new AuroraRegistrationRepository();
const registrationService = new RegistrationService(registrationRepository, eventRepository);

const metrics = new Metrics({ namespace: 'EventHub', serviceName: 'create-registration' });

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('## handler');
  tracer.setSegment(subsegment!);

  const correlationId = extractOrGenerateCorrelationId(event);
  logger.appendKeys({ correlationId });
  tracer.putAnnotation('correlationId', correlationId);

  try {
    logger.info('Recebida requisição para criar inscrição');

    // Parse request body
    let body: unknown;
    try {
      body = event.body ? JSON.parse(event.body) : null;
    } catch {
      return error(400, 'O corpo da requisição deve ser um JSON válido', correlationId);
    }

    // Validate input
    const validation = validateCreateRegistration(body);
    if (!validation.isValid) {
      logger.warn('Validação falhou para criação de inscrição', { correlationId, errors: validation.errors });
      return error(400, validation.errors.join('; '), correlationId);
    }

    const { name, email, eventId } = body as { name: string; email: string; eventId: string };
    tracer.putAnnotation('eventId', eventId);

    // Create registration via service
    const result = await registrationService.createRegistration({ name, email, eventId });

    tracer.putAnnotation('registrationId', result.id);

    // Emit custom metric
    metrics.addMetric('RegistrationsCreated', MetricUnit.Count, 1);
    metrics.publishStoredMetrics();

    logger.info('Inscrição criada com sucesso', { registrationId: result.id, eventId });

    return success(201, result);
  } catch (err) {
    if (err instanceof AppError && err.isOperational) {
      logger.warn('Erro operacional ao criar inscrição', { correlationId, error: err.message });
      return error(err.statusCode, err.message, correlationId);
    }

    logger.error('Erro interno ao criar inscrição', { correlationId, error: err, stack: (err as Error).stack });
    subsegment?.addError(err as Error);
    return error(500, 'Erro interno do servidor', correlationId);
  } finally {
    subsegment?.close();
    tracer.setSegment(segment!);
  }
};
