import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { extractOrGenerateCorrelationId } from '../shared/correlation-id';
import { logger } from '../shared/logger';
import { tracer } from '../shared/tracer';
import { success, error } from '../shared/response';
import { AuroraRegistrationRepository } from '../repositories/aurora-registration-repository';
import { DynamoEventRepository } from '../repositories/dynamo-event-repository';

const registrationRepo = new AuroraRegistrationRepository();
const eventRepo = new DynamoEventRepository();

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('## handler');
  tracer.setSegment(subsegment!);

  const correlationId = extractOrGenerateCorrelationId(event);
  logger.appendKeys({ correlationId });
  tracer.putAnnotation('correlationId', correlationId);

  try {
    const id = event.pathParameters?.id;

    if (!id) {
      return error(400, 'id é obrigatório', correlationId);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return error(400, 'id inválido (formato UUID esperado)', correlationId);
    }

    tracer.putAnnotation('registrationId', id);
    logger.info('Deletando inscrição', { registrationId: id });

    // Get registration to find eventId for slot restoration
    const registration = await registrationRepo.getRegistrationById(id);
    if (!registration) {
      return error(404, 'Inscrição não encontrada', correlationId);
    }

    // Delete registration (and orphan participant if no other registrations)
    await registrationRepo.deleteRegistration(id);

    // Restore the available slot in the event (best effort)
    try {
      await eventRepo.incrementAvailableSlots(registration.eventId);
    } catch (err) {
      logger.warn('Falha ao restaurar vaga no evento (best effort)', {
        eventId: registration.eventId,
        error: err,
      });
    }

    logger.info('Inscrição deletada com sucesso', { registrationId: id });

    return success(200, { message: 'Inscrição deletada com sucesso', id });
  } catch (err) {
    logger.error('Erro interno ao deletar inscrição', { correlationId, error: err });
    subsegment?.addError(err as Error);
    return error(500, 'Erro interno do servidor', correlationId);
  } finally {
    subsegment?.close();
    tracer.setSegment(segment!);
  }
};
