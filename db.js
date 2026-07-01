const mysql = require('mysql2/promise');

const RETRIABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
  'EPIPE',
]);

function isRetriableDbError(error) {
  if (!error) return false;
  if (RETRIABLE_ERROR_CODES.has(error.code)) return true;
  return /ECONNRESET|socket hang up|Connection lost|Connection terminated/i.test(error.message || '');
}

async function withDbRetry(operation, operationName = 'database operation') {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === 2 || !isRetriableDbError(error)) {
        throw error;
      }

      console.warn(`⚠️ ${operationName} hit a transient DB error (${error.code || error.message}). Retrying...`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw lastError;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: 3306,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

pool.queryWithRetry = function queryWithRetry(query, params) {
  return withDbRetry(() => pool.query(query, params), 'Query');
};

pool.executeWithRetry = function executeWithRetry(query, params) {
  return withDbRetry(() => pool.execute(query, params), 'Execute');
};

module.exports = pool;
module.exports.withDbRetry = withDbRetry;
module.exports.isRetriableDbError = isRetriableDbError;