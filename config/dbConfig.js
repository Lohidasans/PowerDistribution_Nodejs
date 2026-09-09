require('dotenv').config();
const { Pool } = require("pg");
const { Sequelize } = require("sequelize");

// A Pool (not a single Client) backs the raw-SQL queries used across the app
// (devEnrollService, commonfun, etc). A lone Client held one long-lived
// connection with no 'error' listener: when Postgres dropped that idle
// connection (idle timeout / keepalive gap / managed-DB reaping it), the
// client emitted 'error' with no listener, so Node threw
// "Unhandled 'error' event -> Connection terminated unexpectedly" and killed
// the whole process. A Pool transparently discards dead connections and opens
// fresh ones on the next query, and pool.query() is API-compatible with
// client.query(), so callers are unchanged.
const pgClient = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: process.env.DB_PORT,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // The raw client only serves a handful of device-enrollment / notification
  // queries, so it needs very few connections. Keeping this small also limits
  // total load on the remote server (Sequelize already opens up to its own
  // pool.max), which matters when that server has a modest max_connections.
  max: Number(process.env.PG_POOL_MAX) || 5,
  idleTimeoutMillis: Number(process.env.PG_POOL_IDLE_MS) || 30000,
  // The DB is remote (see DB_HOST), and at boot this probe competes with
  // Sequelize's authenticate+sync burst for a connection. 10s was too tight and
  // surfaced "Connection terminated due to connection timeout"; give it room
  // while still failing eventually if the server is genuinely unreachable.
  connectionTimeoutMillis: Number(process.env.PG_POOL_CONN_TIMEOUT_MS) || 30000,
  // keepAlive stops idle sockets from being silently reaped by the OS/network,
  // matching the Sequelize dialectOptions below.
  keepAlive: true,
  statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS) || 120000,
});

// CRITICAL: without this listener an error on an idle pooled client is emitted
// as an unhandled 'error' event and crashes the process. Log and let the pool
// recover on the next query instead of tearing the app down.
pgClient.on("error", (err) => {
  console.error("[dbConfig] Unexpected error on idle PostgreSQL client:", err.message);
});

// Startup connectivity probe. Purely informational: the pool connects lazily on
// the first real query, so failure here is non-fatal. We retry a few times
// because at boot this otherwise races with Sequelize's sync for a connection.
(async function verifyDbConnectivity(attempts = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await pgClient.query("SELECT 1");
      console.log("[dbConfig] PostgreSQL pool connected successfully");
      return;
    } catch (err) {
      if (attempt === attempts) {
        console.warn(
          `[dbConfig] Startup connectivity check failed after ${attempts} attempts ` +
          `(${err.message}). Non-fatal; the pool will connect on the first query.`
        );
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
})();

// Pool + timeouts are set explicitly. Sequelize's defaults (pool.max 5,
// pool.acquire 60s, no statement_timeout) meant one slow report could hold a
// connection indefinitely; a few concurrent reports drained all 5 connections
// and every OTHER request in the app then failed with
// SequelizeConnectionAcquireTimeoutError, which the UI shows as a generic error.
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  dialect: process.env.DB_DIALECT,
  logging: false,
  pool: {
    max: Number(process.env.DB_POOL_MAX) || 20,
    min: Number(process.env.DB_POOL_MIN) || 0,
    acquire: Number(process.env.DB_POOL_ACQUIRE_MS) || 60000,
    idle: Number(process.env.DB_POOL_IDLE_MS) || 10000,
  },
  dialectOptions: {
    keepAlive: true,
    // Server-side ceiling: a runaway query is killed by Postgres instead of
    // occupying a pooled connection forever. Bound the blast radius to the one
    // slow request rather than the whole API.
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS) || 120000,
    idle_in_transaction_session_timeout:
      Number(process.env.DB_IDLE_TXN_TIMEOUT_MS) || 60000,
  },
});

module.exports = {
  pgClient,
  sequelize,
};
