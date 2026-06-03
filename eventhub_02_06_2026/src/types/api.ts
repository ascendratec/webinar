export interface ApiErrorResponse {
  statusCode: number;
  message: string;
  correlationId: string;
}

export interface UploadUrlResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number; // seconds
}

export interface CreateRegistrationRequest {
  name: string;
  email: string;
  eventId: string;
}

export interface RejectRegistrationRequest {
  reason: string;
}
