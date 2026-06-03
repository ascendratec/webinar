import { Event } from '../../types';

export interface EventRepository {
  listActiveEvents(): Promise<Event[]>;
  getEventById(eventId: string): Promise<Event | null>;
  decrementAvailableSlots(eventId: string): Promise<boolean>;
  incrementAvailableSlots(eventId: string): Promise<void>;
  createEvent(event: Event): Promise<Event>;
  deleteEvent(eventId: string): Promise<boolean>;
}
