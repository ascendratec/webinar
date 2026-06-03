import { EventRepository } from '../repositories/interfaces/event-repository';
import { RegistrationRepository } from '../repositories/interfaces/registration-repository';
import { ConflictError, ValidationError } from '../shared/errors';
import { logger } from '../shared/logger';

export interface CreateRegistrationInput {
  name: string;
  email: string;
  eventId: string;
}

export interface CreateRegistrationOutput {
  id: string;
  participantId: string;
  eventId: string;
  status: string;
  createdAt: string;
}

export class RegistrationService {
  constructor(
    private readonly registrationRepository: RegistrationRepository,
    private readonly eventRepository: EventRepository
  ) {}

  async createRegistration(input: CreateRegistrationInput): Promise<CreateRegistrationOutput> {
    const { name, email, eventId } = input;

    // 1. Check event exists in DynamoDB
    const event = await this.eventRepository.getEventById(eventId);
    if (!event) {
      throw new ValidationError(['eventId: evento não encontrado']);
    }

    // 2. Check event has available slots
    if (event.availableSlots <= 0) {
      throw new ConflictError('Não há vagas disponíveis para este evento');
    }

    // 3. Check duplicate email+event
    const existingRegistration = await this.registrationRepository.findByEmailAndEvent(email, eventId);
    if (existingRegistration) {
      throw new ConflictError('E-mail já registrado para este evento');
    }

    // 4. Create participant + registration in Aurora (ACID transaction with 10s timeout)
    const { participant, registration } = await this.registrationRepository.createParticipantAndRegistration(
      { name, email },
      eventId
    );

    // 5. Decrement availableSlots in DynamoDB (conditional update)
    const decremented = await this.eventRepository.decrementAvailableSlots(eventId);

    if (!decremented) {
      // Compensation: DynamoDB decrement failed after Aurora commit — rollback Aurora
      logger.error('Falha ao decrementar availableSlots no DynamoDB após criação no Aurora. Executando compensação.', {
        registrationId: registration.id,
        eventId,
      });

      await this.compensateRegistration(registration.id);

      throw new Error('Falha no processamento: não foi possível decrementar vagas disponíveis');
    }

    logger.info('Inscrição criada com sucesso', {
      registrationId: registration.id,
      participantId: participant.id,
      eventId,
    });

    return {
      id: registration.id,
      participantId: participant.id,
      eventId: registration.eventId,
      status: registration.status,
      createdAt: registration.createdAt,
    };
  }

  private async compensateRegistration(registrationId: string): Promise<void> {
    try {
      await this.registrationRepository.deleteRegistration(registrationId);
      logger.info('Compensação executada com sucesso: inscrição removida do Aurora', { registrationId });
    } catch (compensationError: unknown) {
      logger.error('Falha na compensação: não foi possível remover inscrição do Aurora', {
        registrationId,
        error: compensationError,
      });
    }
  }
}
