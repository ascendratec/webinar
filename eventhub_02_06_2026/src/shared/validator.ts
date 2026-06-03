export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_CONTENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

const FILE_NAME_REGEX = /^[a-zA-Z0-9\-_.]+$/;

// RFC 5322 simplified email regex — covers the vast majority of valid addresses
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export function validateEventId(eventId: string): ValidationResult {
  const errors: string[] = [];

  if (!eventId || eventId.trim().length === 0) {
    errors.push('eventId é obrigatório');
  } else if (!UUID_V4_REGEX.test(eventId)) {
    errors.push('eventId deve ser um UUID v4 válido');
  }

  return { isValid: errors.length === 0, errors };
}

export function validateRegistrationId(id: string): ValidationResult {
  const errors: string[] = [];

  if (!id || id.trim().length === 0) {
    errors.push('id é obrigatório');
  } else if (!UUID_V4_REGEX.test(id)) {
    errors.push('id deve ser um UUID v4 válido');
  }

  return { isValid: errors.length === 0, errors };
}

export function validateCreateRegistration(body: unknown): ValidationResult {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return { isValid: false, errors: ['O corpo da requisição deve ser um objeto JSON válido'] };
  }

  const { name, email, eventId } = body as Record<string, unknown>;

  // Validate name
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('name é obrigatório');
  } else if (name.length < 2) {
    errors.push('name deve ter no mínimo 2 caracteres');
  } else if (name.length > 150) {
    errors.push('name deve ter no máximo 150 caracteres');
  }

  // Validate email
  if (!email || typeof email !== 'string' || email.trim().length === 0) {
    errors.push('email é obrigatório');
  } else if (email.length > 254) {
    errors.push('email deve ter no máximo 254 caracteres');
  } else if (!EMAIL_REGEX.test(email)) {
    errors.push('email deve ser um endereço válido (RFC 5322)');
  }

  // Validate eventId
  if (!eventId || typeof eventId !== 'string' || eventId.trim().length === 0) {
    errors.push('eventId é obrigatório');
  } else if (!UUID_V4_REGEX.test(eventId)) {
    errors.push('eventId deve ser um UUID v4 válido');
  }

  return { isValid: errors.length === 0, errors };
}

export function validateUploadUrlRequest(body: unknown): ValidationResult {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return { isValid: false, errors: ['O corpo da requisição deve ser um objeto JSON válido'] };
  }

  const { fileName, contentType } = body as Record<string, unknown>;

  // Validate fileName
  const fileNameResult = validateFileName(typeof fileName === 'string' ? fileName : '');
  if (!fileName || typeof fileName !== 'string' || fileName.trim().length === 0) {
    errors.push('fileName é obrigatório');
  } else if (!fileNameResult.isValid) {
    errors.push(...fileNameResult.errors);
  }

  // Validate contentType
  const contentTypeResult = validateContentType(typeof contentType === 'string' ? contentType : '');
  if (!contentType || typeof contentType !== 'string' || contentType.trim().length === 0) {
    errors.push('contentType é obrigatório');
  } else if (!contentTypeResult.isValid) {
    errors.push(...contentTypeResult.errors);
  }

  return { isValid: errors.length === 0, errors };
}

export function validateRejectRequest(body: unknown): ValidationResult {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return { isValid: false, errors: ['O corpo da requisição deve ser um objeto JSON válido'] };
  }

  const { reason } = body as Record<string, unknown>;

  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    errors.push('reason é obrigatório');
  } else if (reason.length > 500) {
    errors.push('reason deve ter no máximo 500 caracteres');
  }

  return { isValid: errors.length === 0, errors };
}

export function validateFileName(fileName: string): ValidationResult {
  const errors: string[] = [];

  if (!fileName || fileName.trim().length === 0) {
    errors.push('fileName é obrigatório');
  } else if (fileName.length > 255) {
    errors.push('fileName deve ter no máximo 255 caracteres');
  } else if (!FILE_NAME_REGEX.test(fileName)) {
    errors.push('fileName deve conter apenas caracteres alfanuméricos, hífens, underscores e pontos');
  }

  return { isValid: errors.length === 0, errors };
}

export function validateContentType(contentType: string): ValidationResult {
  const errors: string[] = [];

  if (!contentType || contentType.trim().length === 0) {
    errors.push('contentType é obrigatório');
  } else if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    errors.push('contentType deve ser um dos seguintes: application/pdf, image/png, image/jpeg');
  }

  return { isValid: errors.length === 0, errors };
}
