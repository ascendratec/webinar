import { logger } from '../shared/logger';
import { tracer } from '../shared/tracer';
import { AuroraRegistrationRepository } from '../repositories/aurora-registration-repository';

const registrationRepo = new AuroraRegistrationRepository();

// Target participant name to auto-approve
const TARGET_NAME = 'Teste 123';

export const handler = async (): Promise<void> => {
  const subsegment = tracer.getSegment()?.addNewSubsegment('## auto-approve-scheduler');
  tracer.setSegment(subsegment!);

  try {
    logger.info('Auto-approve scheduler triggered', { targetName: TARGET_NAME });

    // Query registrations with DOCUMENT_UPLOADED status and matching participant name
    const { Pool } = await import('pg');
    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');

    const secretsClient = new SecretsManagerClient({});
    let password = process.env.PG_PASSWORD;

    if (!password && process.env.DB_SECRET_ARN) {
      const response = await secretsClient.send(
        new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN })
      );
      const secret = JSON.parse(response.SecretString || '{}');
      password = secret.password;
    }

    const pool = new Pool({
      host: process.env.PG_HOST,
      port: process.env.PG_PORT ? parseInt(process.env.PG_PORT, 10) : undefined,
      database: process.env.PG_DATABASE,
      user: process.env.PG_USER,
      password,
      ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: 2,
      connectionTimeoutMillis: 10000,
    });

    // Find registrations with DOCUMENT_UPLOADED where participant name matches
    const result = await pool.query<{ registration_id: string; participant_name: string }>(
      `SELECT r.id AS registration_id, p.name AS participant_name
       FROM registrations r
       INNER JOIN participants p ON p.id = r.participant_id
       WHERE r.status = 'DOCUMENT_UPLOADED' AND p.name = $1`,
      [TARGET_NAME]
    );

    if (result.rows.length === 0) {
      logger.info('No matching registrations to auto-approve');
      await pool.end();
      return;
    }

    logger.info(`Found ${result.rows.length} registration(s) to auto-approve`);

    for (const row of result.rows) {
      await registrationRepo.updateStatus(row.registration_id, 'APPROVED');
      await registrationRepo.createAuditLog(
        row.registration_id,
        'DOCUMENT_UPLOADED',
        'APPROVED',
        'Auto-aprovado pelo scheduler (participante: Teste 123)'
      );
      logger.info('Registration auto-approved', { registrationId: row.registration_id });
    }

    await pool.end();
    logger.info('Auto-approve scheduler completed');
  } catch (err) {
    logger.error('Auto-approve scheduler failed', { error: err });
    subsegment?.addError(err as Error);
    throw err;
  } finally {
    subsegment?.close();
    tracer.setSegment(subsegment?.parent);
  }
};
