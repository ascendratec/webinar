import { Pool, PoolClient } from 'pg';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Participant, Registration, RegistrationStatus } from '../types';
import { RegistrationRepository } from './interfaces/registration-repository';

interface ParticipantRow {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

interface RegistrationRow {
  id: string;
  participant_id: string;
  event_id: string;
  status: string;
  document_s3_key: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface RegistrationWithParticipantRow extends RegistrationRow {
  participant_name: string;
  participant_email: string;
  participant_created_at: string;
}

const secretsClient = new SecretsManagerClient({});

let pool: Pool;

async function getPool(): Promise<Pool> {
  if (pool) return pool;

  let password = process.env.PG_PASSWORD;

  if (!password && process.env.DB_SECRET_ARN) {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN })
    );
    const secret = JSON.parse(response.SecretString || '{}');
    password = secret.password;
  }

  pool = new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT ? parseInt(process.env.PG_PORT, 10) : undefined,
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password,
    ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  return pool;
}

export class AuroraRegistrationRepository implements RegistrationRepository {
  private async getPool(): Promise<Pool> {
    return getPool();
  }

  async createParticipantAndRegistration(
    participant: Omit<Participant, 'id' | 'createdAt'>,
    eventId: string
  ): Promise<{ participant: Participant; registration: Registration }> {
    const db = await this.getPool();
    let client: PoolClient | undefined;

    try {
      client = await db.connect();

      await client.query('SET statement_timeout = \'10s\'');
      await client.query('BEGIN');

      const participantResult = await client.query<ParticipantRow>(
        `INSERT INTO participants (name, email)
         VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id, name, email, created_at`,
        [participant.name, participant.email]
      );

      const participantRow = participantResult.rows[0];

      const registrationResult = await client.query<RegistrationRow>(
        `INSERT INTO registrations (participant_id, event_id, status)
         VALUES ($1, $2, 'PENDING_DOCUMENT')
         RETURNING id, participant_id, event_id, status, document_s3_key, rejection_reason, created_at, updated_at`,
        [participantRow.id, eventId]
      );

      const registrationRow = registrationResult.rows[0];

      await client.query('COMMIT');

      return {
        participant: this.mapToParticipant(participantRow),
        registration: this.mapToRegistration(registrationRow),
      };
    } catch (error: unknown) {
      if (client) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async getRegistrationById(id: string): Promise<Registration | null> {
    const result = await (await this.getPool()).query<RegistrationRow>(
      `SELECT id, participant_id, event_id, status, document_s3_key, rejection_reason, created_at, updated_at
       FROM registrations
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToRegistration(result.rows[0]);
  }

  async getRegistrationWithParticipant(
    id: string
  ): Promise<(Registration & { participant: Participant }) | null> {
    const result = await (await this.getPool()).query<RegistrationWithParticipantRow>(
      `SELECT
         r.id, r.participant_id, r.event_id, r.status, r.document_s3_key,
         r.rejection_reason, r.created_at, r.updated_at,
         p.name AS participant_name, p.email AS participant_email,
         p.created_at AS participant_created_at
       FROM registrations r
       INNER JOIN participants p ON p.id = r.participant_id
       WHERE r.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      ...this.mapToRegistration(row),
      participant: {
        id: row.participant_id,
        name: row.participant_name,
        email: row.participant_email,
        createdAt: new Date(row.participant_created_at).toISOString(),
      },
    };
  }

  async listAllRegistrations(): Promise<Registration[]> {
    const result = await (await this.getPool()).query<RegistrationRow>(
      `SELECT id, participant_id, event_id, status, document_s3_key, rejection_reason, created_at, updated_at
       FROM registrations
       ORDER BY created_at DESC`
    );

    return result.rows.map((row) => this.mapToRegistration(row));
  }

  async updateStatus(
    id: string,
    newStatus: RegistrationStatus,
    reason?: string
  ): Promise<Registration> {
    const result = await (await this.getPool()).query<RegistrationRow>(
      `UPDATE registrations
       SET status = $1, rejection_reason = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, participant_id, event_id, status, document_s3_key, rejection_reason, created_at, updated_at`,
      [newStatus, reason ?? null, id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Registration not found: ${id}`);
    }

    return this.mapToRegistration(result.rows[0]);
  }

  async findByEmailAndEvent(
    email: string,
    eventId: string
  ): Promise<Registration | null> {
    const result = await (await this.getPool()).query<RegistrationRow>(
      `SELECT r.id, r.participant_id, r.event_id, r.status, r.document_s3_key,
              r.rejection_reason, r.created_at, r.updated_at
       FROM registrations r
       INNER JOIN participants p ON p.id = r.participant_id
       WHERE p.email = $1 AND r.event_id = $2`,
      [email, eventId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToRegistration(result.rows[0]);
  }

  async createAuditLog(
    registrationId: string,
    oldStatus: string,
    newStatus: string,
    reason?: string
  ): Promise<void> {
    await (await this.getPool()).query(
      `INSERT INTO registration_audit_logs (registration_id, old_status, new_status, reason)
       VALUES ($1, $2, $3, $4)`,
      [registrationId, oldStatus, newStatus, reason ?? null]
    );
  }

  async deleteRegistration(registrationId: string): Promise<void> {
    let client: PoolClient | undefined;

    try {
      client = await (await this.getPool()).connect();
      await client.query('BEGIN');

      const regResult = await client.query<{ participant_id: string }>(
        `DELETE FROM registrations WHERE id = $1 RETURNING participant_id`,
        [registrationId]
      );

      if (regResult.rows.length > 0) {
        const participantId = regResult.rows[0].participant_id;

        // Delete participant only if no other registrations reference it
        const otherRegs = await client.query(
          `SELECT id FROM registrations WHERE participant_id = $1 LIMIT 1`,
          [participantId]
        );

        if (otherRegs.rows.length === 0) {
          await client.query(`DELETE FROM participants WHERE id = $1`, [participantId]);
        }
      }

      await client.query('COMMIT');
    } catch (error: unknown) {
      if (client) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  private mapToParticipant(row: ParticipantRow): Participant {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private mapToRegistration(row: RegistrationRow): Registration {
    return {
      id: row.id,
      participantId: row.participant_id,
      eventId: row.event_id,
      status: row.status as RegistrationStatus,
      documentS3Key: row.document_s3_key ?? undefined,
      rejectionReason: row.rejection_reason ?? undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
