const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { UnauthorizedError, ForbiddenError } = require('./errorHandler');

/**
 * Middleware to verify JWT authentication token from the Authorization header.
 * Attaches decoded user payload ({ id, username, email, role }) to req.user.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next(new UnauthorizedError('Authorization header missing. Please provide a Bearer token.'));
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return next(new UnauthorizedError('Invalid authorization format. Format must be: Bearer <token>'));
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, env.jwt.secret);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Authentication token has expired. Please log in again.'));
    }
    return next(new UnauthorizedError('Invalid authentication token.'));
  }
}

/**
 * Factory middleware to require one or more specific roles.
 * @param {...string} allowedRoles
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(`Access denied: Requires role ${allowedRoles.join(' or ')}, but user has role '${req.user.role}'.`)
      );
    }

    next();
  };
}

/**
 * Optional authentication: if token is present, decode and set req.user, but don't fail if absent.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }

  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    try {
      const decoded = jwt.verify(parts[1], env.jwt.secret);
      req.user = decoded;
    } catch (err) {
      // Ignored for optional authentication
    }
  }

  next();
}

module.exports = {
  authenticateToken,
  requireRole,
  requireAdmin: requireRole('admin'),
  requireStudent: requireRole('student'),
  optionalAuth,
};
