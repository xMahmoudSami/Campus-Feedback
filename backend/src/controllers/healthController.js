const db = require('../config/db');

/**
 * Basic HTTP service liveness check.
 */
function getLiveness(req, res) {
  res.status(200).json({
    status: 'ok',
    service: 'student-feedback-backend',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
  });
}

/**
 * Accurate database readiness/connectivity check.
 * Performs a real query and returns 503 if database is unreachable.
 */
async function getDatabaseHealth(req, res) {
  const result = await db.testConnection();

  if (!result.ok) {
    return res.status(503).json({
      status: 'error',
      database: 'disconnected',
      message: 'Database connection failed or database is not reachable.',
      error: process.env.NODE_ENV === 'production' ? undefined : result.error,
      timestamp: new Date().toISOString(),
    });
  }

  res.status(200).json({
    status: 'ok',
    database: 'connected',
    latency_ms: result.latencyMs,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  getLiveness,
  getDatabaseHealth,
};
