const app = require('./app');
const env = require('./config/env');
const db = require('./config/db');

const server = app.listen(env.port, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(` Student Feedback System Backend API`);
  console.log(` Environment: ${env.nodeEnv}`);
  console.log(` Server listening on port: ${env.port}`);
  console.log(` Health check: http://localhost:${env.port}/api/health`);
  console.log(` Database check: http://localhost:${env.port}/api/health/db`);
  console.log(`====================================================`);

  // Ensure official demo accounts and required schema exist upon startup
  (async () => {
    try {
      const conn = await db.testConnection();
      if (conn.ok) {
        // Safe schema migrations for feedback rating and survey due_date
        await db.query(`ALTER TABLE feedback ADD COLUMN IF NOT EXISTS rating INT CHECK (rating BETWEEN 1 AND 5);`);
        await db.query(`ALTER TABLE surveys ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;`);

        const { seedDatabase } = require('./scripts/seed');
        await seedDatabase();
      } else {
        console.warn('[DB WARNING] Database connection ping failed during startup:', conn.error);
      }
    } catch (err) {
      console.warn('[STARTUP WARNING] Startup check error:', err.message);
    }
  })();
});

// Graceful shutdown handling
let isShuttingDown = false;

async function handleShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

  // Close HTTP server to stop accepting new requests
  server.close(async () => {
    console.log('HTTP server closed.');

    try {
      // Drain and close database pool
      await db.closePool();
      console.log('PostgreSQL connection pool closed successfully.');
      process.exit(0);
    } catch (err) {
      console.error('Error while closing database pool:', err.message);
      process.exit(1);
    }
  });

  // Force shutdown after timeout if pending requests hang
  setTimeout(() => {
    console.error('Graceful shutdown timeout exceeded. Forcefully terminating process.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', error);
  process.exit(1);
});
