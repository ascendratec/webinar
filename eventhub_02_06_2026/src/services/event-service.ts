import { Event } from '../types';
import { EventRepository } from '../repositories/interfaces/event-repository';
import { NotFoundError, ValidationError } from '../shared/errors';
import { randomUUID } from 'crypto';

export class EventService {
  constructor(private readonly repository: EventRepository) {}

  async listActiveEvents(): Promise<Event[]> {
    return this.repository.listActiveEvents();
  }

  async getEventById(eventId: string): Promise<Event> {
    const event = await this.repository.getEventById(eventId);

    if (!event) {
      throw new NotFoundError('Evento', eventId);
    }

    return event;
  }

  async createEvent(input: {
    title: string;
    description: string;
    date: string;
    location: string;
    capacity: number;
  }): Promise<Event> {
    const errors: string[] = [];

    if (!input.title || input.title.length < 3 || input.title.length > 200) {
      errors.push('title (3-200 characters)');
    }
    if (!input.description || input.description.length < 10 || input.description.length > 2000) {
      errors.push('description (10-2000 characters)');
    }
    if (!input.date || isNaN(Date.parse(input.date))) {
      errors.push('date (valid ISO 8601)');
    }
    if (!input.location || input.location.length < 3 || input.location.length > 200) {
      errors.push('location (3-200 characters)');
    }
    if (!input.capacity || input.capacity < 1 || input.capacity > 10000) {
      errors.push('capacity (1-10000)');
    }

    if (errors.length > 0) {
      throw new ValidationError(errors);
    }

    const event: Event = {
      eventId: randomUUID(),
      title: input.title,
      description: input.description,
      date: input.date,
      location: input.location,
      capacity: input.capacity,
      availableSlots: input.capacity,
      status: 'ACTIVE',
    };

    return this.repository.createEvent(event);
  }

  async deleteEvent(eventId: string): Promise<void> {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!eventId || !uuidRegex.test(eventId)) {
      throw new ValidationError(['eventId (valid UUID v4)']);
    }

    const deleted = await this.repository.deleteEvent(eventId);
    if (!deleted) {
      throw new NotFoundError('Evento', eventId);
    }
  }
}
