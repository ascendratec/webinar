export interface Event {
  eventId: string;
  title: string;
  description: string;
  date: string; // ISO 8601
  location: string;
  capacity: number;
  availableSlots: number;
  status: 'ACTIVE' | 'INACTIVE';
}
