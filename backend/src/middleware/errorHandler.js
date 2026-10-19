const env = require('../config/env');

class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Invalid request data', details = null) {
    super(message, 400, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access denied: insufficient permissions') {
    super(message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Resource conflict or duplicate entry') {
    super(message, 409);
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503);
  }
}

/**
 * Maps known PostgreSQL error codes to standard application errors.
 */
function handleDatabaseError(err) {
  if (err.code === '23505') {
    // Unique violation
    return new ConflictError('A record with these details already exists.');
  }
  if (err.code === '23503') {
    // Foreign key violation
    return new ValidationError('Referenced record does not exist or cannot be modified due to dependent records.');
  }
  if (err.code === '22P02') {
    // Invalid text representation (e.g., invalid integer syntax)
    return new ValidationError('Invalid input format for identifier or numeric value.');
  }
  if (err.code === '23502') {
    // Not null violation
    return new ValidationError(`Required field missing: ${err.column || 'unspecified'}`);
  }
  if (err.code === '23514') {
    // Check constraint violation
    return new ValidationError('Provided value violates data constraints.');
  }
  return err;
}

/**
 * Centralized Express Error Handling Middleware
 */
function errorHandler(err, req, res, next) {
  // Translate database errors if applicable
  const resolvedError = handleDatabaseError(err);

  const statusCode = resolvedError.statusCode || (resolvedError.status && typeof resolvedError.status === 'number' ? resolvedError.status : 500);
  const isOperational = Boolean(resolvedError.isOperational);

  const responseBody = {
    success: false,
    error: {
      message: (isOperational || !env.isProduction) ? resolvedError.message : 'An unexpected server error occurred.',
    },
  };

  if (resolvedError.details) {
    responseBody.error.details = resolvedError.details;
  }

  // Include stack trace only in local non-production development environments
  if (!env.isProduction && !isOperational) {
    responseBody.error.stack = resolvedError.stack;
  }

  // Log non-operational errors
  if (!isOperational) {
    console.error('[UNEXPECTED ERROR]', {
      url: req.originalUrl,
      method: req.method,
      error: resolvedError.message,
      stack: resolvedError.stack,
    });
  }

  res.status(statusCode).json(responseBody);
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError,
  errorHandler,
};
