// ============================================================
// EdgeSense — Server Entry Point
// Express REST API + WebSocket Signaling + Background Engines
// ============================================================

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { config } from "./config";
import apiRoutes from "./api";
import { errorHandler, requestTimer } from "./api/middleware";
import { getPool, closePool } from "./db";
import { startSyncEngine, stopSyncEngine } from "./sync/engine";
import {
  startAggregationEngine,
  stopAggregationEngine,
} from "./aggregation/engine";
import {
  createSignalingServer,
  stopSignalingServer,
} from "./network/signaling";

const app = express();

// ─── Middleware ────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use(requestTimer);

// ─── API Routes ───────────────────────────────────────────
app.use("/api", apiRoutes);

// ─── Root ─────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    name: "EdgeSense API",
    version: "1.0.0",
    description:
      "Offline-First P2P Edge Intelligence for Air-Quality Monitoring",
    endpoints: {
      health: "/api/health",
      sensors: "/api/sensors",
      readings: "/api/readings",
      clusters: "/api/clusters",
      sync: "/api/sync",
      alerts: "/api/alerts",
      stats: "/api/stats",
    },
  });
});

// ─── Error Handler (must be last) ─────────────────────────
app.use(errorHandler);

// ─── Startup ──────────────────────────────────────────────
async function start(): Promise<void> {
  try {
    // Test database connection
    const pool = getPool();
    const { rows } = await pool.query("SELECT NOW() as time");
    console.log(`[Server] Database connected at ${rows[0].time}`);

    // Start Express
    const server = app.listen(config.port, () => {
      console.log(
        `[Server] REST API running on http://localhost:${config.port}`,
      );
      console.log(`[Server] Environment: ${config.env}`);
    });

    // Start WebSocket signaling server
    if (process.env.WS_PORT && process.env.WS_PORT !== String(config.port)) {
      createSignalingServer(config.wsPort);
    } else {
      createSignalingServer(server);
    }

    // Start background engines
    startSyncEngine();
    startAggregationEngine();

    console.log("[Server] ✅ EdgeSense is fully operational");
    console.log("─".repeat(50));

    // ─── Graceful Shutdown ────────────────────────────────
    const shutdown = async (signal: string) => {
      console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
      stopSyncEngine();
      stopAggregationEngine();
      stopSignalingServer();
      server.close();
      await closePool();
      console.log("[Server] Goodbye.");
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err: any) {
    console.error("[Server] Failed to start:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

start();

export default app;
