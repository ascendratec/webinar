/**
 * Gera a chave S3 para armazenamento de documentos de inscrição.
 * Formato: "registrations/{registrationId}/{fileName}"
 */
export function generateS3Key(registrationId: string, fileName: string): string {
  return `registrations/${registrationId}/${fileName}`;
}

/**
 * Extrai o registrationId de uma chave S3 no formato "registrations/{registrationId}/{fileName}".
 * Lança erro se a chave não estiver no formato esperado.
 */
export function extractRegistrationIdFromS3Key(key: string): string {
  const parts = key.split('/');

  if (parts.length < 3 || parts[0] !== 'registrations') {
    throw new Error(`Chave S3 inválida: ${key}. Esperado: registrations/{registrationId}/{fileName}`);
  }

  return parts[1];
}
