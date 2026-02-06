// ============================================================
// EdgeSense — PostgreSQL Connection Pool (Pure pg, no ORM)
// ============================================================

import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { config } from "../config";

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.db.connectionString,
      max: config.db.maxConnections,
      idleTimeoutMillis: config.db.idleTimeoutMs,
      connectionTimeoutMillis: config.db.connectionTimeoutMs,
    });

    pool.on("error", (err) => {
      console.error("[DB] Unexpected pool error:", err.message);
    });

    pool.on("connect", () => {
      console.log("[DB] New client connected to pool");
    });
  }
  return pool;
}

/** Execute a single query */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[],
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await getPool().query<T>(text, params);
  const duration = Date.now() - start;
  if (config.env === "development") {
    console.log("[DB] Query executed", {
      text: text.substring(0, 80),
      duration: `${duration}ms`,
      rows: result.rowCount,
    });
  }
  return result;
}

/** Get a client from the pool for transactions */
export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

/** Execute multiple statements inside a transaction */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getClient();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Graceful shutdown */
export async function closePool(): Promise<void> {
  if (pool) {
    console.log("[DB] Closing connection pool...");
    await pool.end();
    console.log("[DB] Pool closed.");
  }
}
