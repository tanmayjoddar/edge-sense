// ============================================================
// EdgeSense — Sync Engine
// Processes the sync queue: deduplicates, validates, and
// persists data from edge nodes into PostgreSQL.
// ============================================================

import {
  syncQueries,
  readingQueries,
  aggregationQueries,
  alertQueries,
  bandwidthQueries,
} from "../db";
import { config } from "../config";
import type { SyncQueueItem } from "../types";

let syncInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

export function startSyncEngine(): void {
  console.log(
    `[Sync] Engine started — processing every ${config.sync.intervalMs}ms, batch size ${config.sync.batchSize}`,
  );

  syncInterval = setInterval(async () => {
    if (isProcessing) {
      console.log("[Sync] Previous batch still processing, skipping...");
      return;
    }
    await processSyncQueue();
  }, config.sync.intervalMs);

  // Also process immediately on start
  processSyncQueue();
}

export function stopSyncEngine(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log("[Sync] Engine stopped.");
  }
}

async function processSyncQueue(): Promise<void> {
  isProcessing = true;
  const startTime = Date.now();

  try {
    const items = await syncQueries.dequeue(config.sync.batchSize);
    if (items.length === 0) {
      isProcessing = false;
      return;
    }

    console.log(`[Sync] Processing ${items.length} queued items...`);

    let processed = 0;
    let failed = 0;

    for (const item of items) {
      try {
        await processQueueItem(item);
        processed++;
      } catch (err: any) {
        console.error(`[Sync] Failed to process item ${item.id}:`, err.message);
        await syncQueries.requeueFailed(item.id);
        failed++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `[Sync] Batch complete: ${processed} processed, ${failed} failed (${duration}ms)`,
    );
  } catch (err: any) {
    console.error("[Sync] Queue processing error:", err.message);
  } finally {
    isProcessing = false;
  }
}

async function processQueueItem(item: SyncQueueItem): Promise<void> {
  const payload =
    typeof item.payload === "string"
      ? JSON.parse(item.payload as any)
      : item.payload;

  switch (item.payload_type) {
    case "reading":
      await processReading(item.sensor_id, payload);
      break;
    case "aggregation":
      await processAggregation(payload);
      break;
    case "alert":
      await processAlert(item.sensor_id, payload);
      break;
    default:
      console.warn(`[Sync] Unknown payload type: ${item.payload_type}`);
  }
}

async function processReading(sensorId: string, payload: any): Promise<void> {
  // Deduplicate: check if we already have a reading for this sensor at this exact timestamp
  if (payload.timestamp) {
    const existing = await readingQueries.getInTimeRange(
      new Date(new Date(payload.timestamp).getTime() - 1000),
      new Date(new Date(payload.timestamp).getTime() + 1000),
      sensorId,
    );
    if (existing.length > 0) {
      console.log(
        `[Sync] Duplicate reading detected for sensor ${sensorId}, skipping`,
      );
      return;
    }
  }

  // Validate ranges
  if (payload.pm25 !== null && payload.pm25 !== undefined) {
    if (payload.pm25 < 0 || payload.pm25 > 1000) {
      console.warn(
        `[Sync] PM2.5 out of range (${payload.pm25}) for sensor ${sensorId}`,
      );
      payload.quality_score = Math.max(0, (payload.quality_score || 1) - 0.3);
    }
  }

  await readingQueries.create({
    sensor_id: sensorId,
    timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
    pm25: payload.pm25,
    pm10: payload.pm10,
    co2: payload.co2,
    temperature: payload.temperature,
    humidity: payload.humidity,
    quality_score: payload.quality_score ?? 0.8,
    is_anomaly: payload.is_anomaly ?? false,
    source: payload.source || "p2p_relay",
  });
}

async function processAggregation(payload: any): Promise<void> {
  await aggregationQueries.create({
    cluster_id: payload.cluster_id,
    window_start: new Date(payload.window_start),
    window_end: new Date(payload.window_end),
    sensor_count: payload.sensor_count,
    pm25_mean: payload.pm25_mean,
    pm25_min: payload.pm25_min,
    pm25_max: payload.pm25_max,
    pm25_stddev: payload.pm25_stddev,
    pm10_mean: payload.pm10_mean,
    pm10_min: payload.pm10_min,
    pm10_max: payload.pm10_max,
    pm10_stddev: payload.pm10_stddev,
    co2_mean: payload.co2_mean,
    co2_min: payload.co2_min,
    co2_max: payload.co2_max,
    co2_stddev: payload.co2_stddev,
    temperature_mean: payload.temperature_mean,
    humidity_mean: payload.humidity_mean,
    confidence: payload.confidence ?? 0.8,
    reading_count: payload.reading_count,
  });
}

async function processAlert(sensorId: string, payload: any): Promise<void> {
  await alertQueries.create({
    sensor_id: sensorId,
    cluster_id: payload.cluster_id,
    alert_type: payload.alert_type || "spike",
    severity: payload.severity || "warning",
    title: payload.title,
    description: payload.description,
    metric_name: payload.metric_name,
    metric_value: payload.metric_value,
    threshold_value: payload.threshold_value,
    metadata: payload.metadata,
  });
}

/** Force-process the queue (for API triggers) */
export async function forceProcessQueue(): Promise<{ processed: number }> {
  if (isProcessing) {
    return { processed: 0 };
  }
  await processSyncQueue();
  return { processed: 1 };
}
