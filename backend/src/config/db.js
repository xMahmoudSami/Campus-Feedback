const { Pool } = require('pg');
const env = require('./env');

const poolConfig = env.db.connectionString
  ? {
      connectionString: env.db.connectionString,
      ssl: env.db.ssl,
      min: env.db.poolMin,
      max: env.db.poolMax,
      connectionTimeoutMillis: env.db.timeoutMs,
    }
  : {
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
      database: env.db.database,
      ssl: env.db.ssl,
      min: env.db.poolMin,
      max: env.db.poolMax,
      connectionTimeoutMillis: env.db.timeoutMs,
    };

const pool = new Pool(poolConfig);

// Handle idle client errors without crashing the entire process
pool.on('error', (err) => {
  console.error('[DB Pool Error] Unexpected error on idle client:', err.message);
});

/**
 * Executes a parameterized SQL query using the connection pool.
 * @param {string} text - SQL query string with parameter placeholders ($1, $2, etc.)
 * @param {Array} [params] - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    if (!env.isProduction) {
      console.error('[DB Query Error]', { text, error: error.message });
    }
    throw error;
  }
}

/**
 * Executes a callback within a managed database transaction.
 * Automatically handles BEGIN, COMMIT, ROLLBACK, and releases the client.
 * @param {function(import('pg').PoolClient): Promise<any>} callback
 * @returns {Promise<any>}
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Checks database connectivity with a lightweight ping.
 * @returns {Promise<{ ok: boolean, latencyMs?: number, error?: string }>}
 */
async function testConnection() {
  const start = Date.now();
  try {
    await pool.query('SELECT 1 AS ping');
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Acquires a client directly from the pool. Caller MUST release it.
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  return await pool.connect();
}

/**
 * Closes all clients in the pool gracefully.
 * @returns {Promise<void>}
 */
async function closePool() {
  await pool.end();
}

module.exports = {
  pool,
  query,
  withTransaction,
  getClient,
  testConnection,
  closePool,
};
