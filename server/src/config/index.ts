import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  env: optionalEnv("NODE_ENV", "development"),
  port: parseInt(optionalEnv("PORT", "3001"), 10),
  wsPort: parseInt(optionalEnv("WS_PORT", "3002"), 10),

  db: {
    connectionString: requiredEnv("DATABASE_URL"),
    host: optionalEnv("DB_HOST", "localhost"),
    port: parseInt(optionalEnv("DB_PORT", "5432"), 10),
    name: optionalEnv("DB_NAME", "edgesense"),
    user: optionalEnv("DB_USER", "postgres"),
    password: optionalEnv("DB_PASSWORD", "postgres"),
    maxConnections: 20,
    idleTimeoutMs: 30000,
    connectionTimeoutMs: 5000,
  },

  sync: {
    batchSize: parseInt(optionalEnv("SYNC_BATCH_SIZE", "100"), 10),
    intervalMs: parseInt(optionalEnv("SYNC_INTERVAL_MS", "30000"), 10),
    maxOfflineHours: parseInt(optionalEnv("MAX_OFFLINE_HOURS", "168"), 10),
    maxRetries: 5,
    retryBackoffMs: 1000,
  },

  aggregation: {
    windowMs: parseInt(optionalEnv("AGGREGATION_WINDOW_MS", "60000"), 10),
    spikeThresholds: {
      pm25: parseInt(optionalEnv("SPIKE_THRESHOLD_PM25", "150"), 10),
      pm10: 250,
      co2: parseInt(optionalEnv("SPIKE_THRESHOLD_CO2", "1000"), 10),
      temperature: 50,
    },
    minReadingsForAggregation: 3,
    confidenceDecayFactor: 0.95,
  },

  network: {
    strategies: {
      excellent: {
        mode: "realtime" as const,
        batch_size: 1,
        interval_ms: 5000,
        compress: false,
      },
      good: {
        mode: "batched" as const,
        batch_size: 10,
        interval_ms: 15000,
        compress: false,
      },
      fair: {
        mode: "batched" as const,
        batch_size: 50,
        interval_ms: 30000,
        compress: true,
      },
      poor: {
        mode: "aggressive_batch" as const,
        batch_size: 100,
        interval_ms: 60000,
        compress: true,
      },
      offline: {
        mode: "emergency_only" as const,
        batch_size: 200,
        interval_ms: 0,
        compress: true,
      },
    },
  },
} as const;

export type Config = typeof config;
