export class AppError extends Error {
  public readonly statusCode: number;
  public readonly correlationId: string | undefined;
  public readonly context: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      correlationId?: string;
      context?: Record<string, unknown>;
      cause?: unknown;
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "AppError";
    this.statusCode = options.statusCode ?? 500;
    this.correlationId = options.correlationId;
    this.context = options.context ?? {};
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      correlationId: this.correlationId,
      context: this.context,
    };
  }
}

export class UnipileError extends AppError {
  constructor(
    message: string,
    options: {
      statusCode?: number;
      correlationId?: string;
      context?: Record<string, unknown>;
      cause?: unknown;
    } = {}
  ) {
    super(message, { ...options, statusCode: options.statusCode ?? 502 });
    this.name = "UnipileError";
  }
}

export class ApifyError extends AppError {
  constructor(
    message: string,
    options: {
      statusCode?: number;
      correlationId?: string;
      context?: Record<string, unknown>;
      cause?: unknown;
    } = {}
  ) {
    super(message, { ...options, statusCode: options.statusCode ?? 502 });
    this.name = "ApifyError";
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    options: {
      correlationId?: string;
      context?: Record<string, unknown>;
      cause?: unknown;
    } = {}
  ) {
    super(message, { ...options, statusCode: 400 });
    this.name = "ValidationError";
  }
}

export class RateLimitError extends AppError {
  constructor(
    message: string,
    options: {
      correlationId?: string;
      context?: Record<string, unknown>;
      cause?: unknown;
    } = {}
  ) {
    super(message, { ...options, statusCode: 429 });
    this.name = "RateLimitError";
  }
}

export class CircuitOpenError extends AppError {
  constructor(
    message: string,
    options: {
      correlationId?: string;
      context?: Record<string, unknown>;
      cause?: unknown;
    } = {}
  ) {
    super(message, { ...options, statusCode: 503 });
    this.name = "CircuitOpenError";
  }
}
