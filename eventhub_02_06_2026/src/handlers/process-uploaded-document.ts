import type { S3Event } from 'aws-lambda';
import { logger } from '../shared/logger';
import { extractRegistrationIdFromS3Key } from '../services/document-service';
import { AuroraRegistrationRepository } from '../repositories/aurora-registration-repository';

const registrationRepository = new AuroraRegistrationRepository();

export const handler = async (event: S3Event): Promise<void> => {
  const correlationId = crypto.randomUUID();
  logger.appendKeys({ correlationId });

  logger.info('Processando evento S3 de upload de documento', {
    recordCount: event.Records.length,
  });

  for (const record of event.Records) {
    const s3Key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    let registrationId: string;
    try {
      registrationId = extractRegistrationIdFromS3Key(s3Key);
    } catch (err) {
      logger.error('Falha ao extrair registrationId da chave S3', {
        correlationId,
        s3Key,
        error: err,
        stack: (err as Error).stack,
      });
      continue;
    }

    logger.appendKeys({ registrationId });

    try {
      const registration = await registrationRepository.getRegistrationById(registrationId);

      if (!registration) {
        logger.error('Inscrição não encontrada para o documento enviado', {
          correlationId,
          registrationId,
          s3Key,
        });
        continue;
      }

      if (registration.status !== 'PENDING_DOCUMENT') {
        logger.warn('Ignorando processamento: status da inscrição não é PENDING_DOCUMENT', {
          registrationId,
          currentStatus: registration.status,
          s3Key,
        });
        continue;
      }

      // Atualizar status para DOCUMENT_UPLOADED
      await registrationRepository.updateStatus(registrationId, 'DOCUMENT_UPLOADED');

      // Criar registro de Audit_Log
      await registrationRepository.createAuditLog(
        registrationId,
        'PENDING_DOCUMENT',
        'DOCUMENT_UPLOADED'
      );

      logger.info('Documento processado com sucesso - status atualizado para DOCUMENT_UPLOADED', {
        registrationId,
        s3Key,
      });
    } catch (err) {
      logger.error('Erro ao processar documento enviado', {
        correlationId,
        registrationId,
        s3Key,
        error: err,
        stack: (err as Error).stack,
      });
      throw err;
    } finally {
      logger.removeKeys(['registrationId']);
    }
  }

  logger.removeKeys(['correlationId']);
};
