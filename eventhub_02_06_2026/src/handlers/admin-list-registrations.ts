import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { extractOrGenerateCorrelationId } from '../shared/correlation-id';
import { logger } from '../shared/logger';
import { success, error } from '../shared/response';
import { AuroraRegistrationRepository } from '../repositories/aurora-registration-repository';

const repository = new AuroraRegistrationRepository();

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const correlationId = extractOrGenerateCorrelationId(event);
  logger.appendKeys({ correlationId });

  try {
    logger.info('Listando todas as inscrições (admin)');

    const registrations = await repository.listAllRegistrations();

    logger.info('Inscrições listadas com sucesso', { count: registrations.length });

    return success(200, registrations);
  } catch (err) {
    logger.error('Erro interno ao listar inscrições', { correlationId, error: err, stack: (err as Error).stack });
    return error(500, 'Erro interno do servidor', correlationId);
  }
};
