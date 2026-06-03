import { Participant, Registration, RegistrationStatus } from '../../types';

export interface RegistrationRepository {
  createParticipantAndRegistration(
    participant: Omit<Participant, 'id' | 'createdAt'>,
    eventId: string
  ): Promise<{ participant: Participant; registration: Registration }>;

  getRegistrationById(id: string): Promise<Registration | null>;

  getRegistrationWithParticipant(
    id: string
  ): Promise<(Registration & { participant: Participant }) | null>;

  listAllRegistrations(): Promise<Registration[]>;

  updateStatus(
    id: string,
    newStatus: RegistrationStatus,
    reason?: string
  ): Promise<Registration>;

  findByEmailAndEvent(
    email: string,
    eventId: string
  ): Promise<Registration | null>;

  createAuditLog(
    registrationId: string,
    oldStatus: string,
    newStatus: string,
    reason?: string
  ): Promise<void>;

  deleteRegistration(registrationId: string): Promise<void>;
}
