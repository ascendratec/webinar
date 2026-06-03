export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly isOperational: boolean;
}

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly isOperational = true;

  constructor(public fields: string[]) {
    super(`Campos inválidos: ${fields.join(', ')}`);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly isOperational = true;

  constructor(resource: string, id: string) {
    super(`${resource} não encontrado: ${id}`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly isOperational = true;

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class InvalidStateError extends AppError {
  readonly statusCode = 400;
  readonly isOperational = true;

  constructor(currentState: string, operation: string) {
    super(`Operação '${operation}' não permitida no estado '${currentState}'`);
    this.name = 'InvalidStateError';
  }
}
