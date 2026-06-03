import type { APIGatewayProxyEventV2, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { extractOrGenerateCorrelationId } from '../shared/correlation-id';
import { logger } from '../shared/logger';
import { success, error } from '../shared/response';
import { AppError, NotFoundError, InvalidStateError } from '../shared/errors';
import { validateRegistrationId, validateUploadUrlRequest } from '../shared/validator';
import { generateS3Key } from '../services/document-service';
import { AuroraRegistrationRepository } from '../repositories/aurora-registration-repository';

const registrationRepository = new AuroraRegistrationRepository();

const BUCKET_NAME = process.env.DOCUMENTS_BUCKET_NAME!;
const PRESIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes

const s3Client = new S3Client({
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResult> => {
  const correlationId = extractOrGenerateCorrelationId(event);
  logger.appendKeys({ correlationId });

  try {
    logger.info('Recebida requisição para gerar URL de upload');

    // 1. Extract registrationId from path parameters
    const registrationId = event.pathParameters?.id ?? '';

    // 2. Validate registrationId format (UUID)
    const idValidation = validateRegistrationId(registrationId);
    if (!idValidation.isValid) {
      logger.warn('Validação de ID falhou', { correlationId, errors: idValidation.errors });
      return error(400, idValidation.errors.join('; '), correlationId);
    }

    // 3. Parse and validate request body (fileName, contentType)
    let body: unknown;
    try {
      body = event.body ? JSON.parse(event.body) : null;
    } catch {
      return error(400, 'O corpo da requisição deve ser um JSON válido', correlationId);
    }

    const bodyValidation = validateUploadUrlRequest(body);
    if (!bodyValidation.isValid) {
      logger.warn('Validação do body falhou', { correlationId, errors: bodyValidation.errors });
      return error(400, bodyValidation.errors.join('; '), correlationId);
    }

    const { fileName, contentType } = body as { fileName: string; contentType: string };

    // 4. Check registration exists and status is PENDING_DOCUMENT
    const registration = await registrationRepository.getRegistrationById(registrationId);

    if (!registration) {
      throw new NotFoundError('Inscrição', registrationId);
    }

    if (registration.status !== 'PENDING_DOCUMENT') {
      throw new InvalidStateError(registration.status, 'upload-url');
    }

    // 5. Generate S3 key using document-service
    const key = generateS3Key(registrationId, fileName);

    // 6. Generate presigned PUT URL with 5 min expiry
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    });

    logger.info('URL de upload gerada com sucesso', {
      registrationId,
      key,
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    });

    // 7. Return { uploadUrl, key, expiresIn: 300 }
    return success(200, {
      uploadUrl,
      key,
      expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
    });
  } catch (err) {
    if (err instanceof AppError && err.isOperational) {
      logger.warn('Erro operacional ao gerar URL de upload', { correlationId, error: err.message });
      return error(err.statusCode, err.message, correlationId);
    }

    logger.error('Erro interno ao gerar URL de upload', { correlationId, error: err, stack: (err as Error).stack });
    return error(500, 'Erro interno do servidor', correlationId);
  }
};
