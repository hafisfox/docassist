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
    super(message, { statusCode: options.statusCode ?? 502, ...options });
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
    super(message, { statusCode: options.statusCode ?? 502, ...options });
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
    super(message, { statusCode: 400, ...options });
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
    super(message, { statusCode: 429, ...options });
    this.name = "RateLimitError";
  }
}
