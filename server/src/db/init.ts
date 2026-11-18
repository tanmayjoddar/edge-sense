// ============================================================
// EdgeSense — Database Initialization (runs schema.sql)
// ============================================================

import fs from "fs";
import path from "path";
import { getPool } from "./pool";
import { config } from "../config";

async function initDatabase(): Promise<void> {
  console.log("[DB:Init] Starting database initialization...");

  const schemaPath = path.resolve(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");

  // Use unpooled direct connection for migrations as per Neon best practice
  const connectionUrl =
    config.db.unpooledConnectionString || config.db.connectionString;
  const pool = getPool(connectionUrl);

  try {
    // Create the database tables
    await pool.query(schema);
    console.log("[DB:Init] Schema applied successfully.");

    // Verify tables exist
    const tableCheck = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log("[DB:Init] Tables created:");
    tableCheck.rows.forEach((row) => {
      console.log(`  ✓ ${row.table_name}`);
    });

    console.log("[DB:Init] Database initialization complete.");
  } catch (err: any) {
    console.error("[DB:Init] Failed to initialize database:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDatabase();
