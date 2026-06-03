export type RegistrationStatus = 'PENDING_DOCUMENT' | 'DOCUMENT_UPLOADED' | 'APPROVED' | 'REJECTED';

export interface Registration {
  id: string; // UUID
  participantId: string; // UUID
  eventId: string;
  status: RegistrationStatus;
  documentS3Key?: string;
  rejectionReason?: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
