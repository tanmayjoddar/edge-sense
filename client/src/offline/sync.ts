// ============================================================
// EdgeSense Client — Cloud Sync Manager
// Detects network conditions and uploads batched data from
// IndexedDB to the server using adaptive bandwidth strategy.
// ============================================================

import { v4 as uuidv4 } from "uuid";
import * as offlineDB from "./db";

type NetworkQuality = "excellent" | "good" | "fair" | "poor" | "offline";

interface SyncConfig {
  serverUrl: string;
  sensorId: string;
  onSyncComplete?: (result: SyncResult) => void;
  onNetworkChange?: (quality: NetworkQuality) => void;
}

interface SyncResult {
  success: boolean;
  accepted: number;
  rejected: number;
  bytesSent: number;
  duration: number;
}

const STRATEGY: Record<
  NetworkQuality,
  { batchSize: number; intervalMs: number; compress: boolean }
> = {
  excellent: { batchSize: 10, intervalMs: 5000, compress: false },
  good: { batchSize: 25, intervalMs: 15000, compress: false },
  fair: { batchSize: 50, intervalMs: 30000, compress: true },
  poor: { batchSize: 100, intervalMs: 60000, compress: true },
  offline: { batchSize: 0, intervalMs: 0, compress: true },
};

let syncInterval: number | null = null;
let currentQuality: NetworkQuality = "good";
let syncConfig: SyncConfig | null = null;
let isSyncing = false;

export function startSync(config: SyncConfig): void {
  syncConfig = config;
  detectNetworkQuality();

  // Listen for online/offline events
  window.addEventListener("online", () => {
    console.log("[Sync] Network came online");
    detectNetworkQuality();
    scheduleSync();
  });

  window.addEventListener("offline", () => {
    console.log("[Sync] Network went offline");
    currentQuality = "offline";
    config.onNetworkChange?.("offline");
    stopSyncInterval();
  });

  scheduleSync();
  console.log("[Sync] Sync manager started");
}

export function stopSync(): void {
  stopSyncInterval();
  syncConfig = null;
  console.log("[Sync] Sync manager stopped");
}

function stopSyncInterval(): void {
  if (syncInterval !== null) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

function scheduleSync(): void {
  stopSyncInterval();
  const strategy = STRATEGY[currentQuality];
  if (strategy.intervalMs === 0 || currentQuality === "offline") return;

  syncInterval = window.setInterval(async () => {
    if (!isSyncing) await performSync();
  }, strategy.intervalMs);

  // Also sync immediately
  if (!isSyncing) performSync();
}

async function detectNetworkQuality(): Promise<void> {
  if (!navigator.onLine) {
    currentQuality = "offline";
    syncConfig?.onNetworkChange?.("offline");
    return;
  }

  try {
    const start = Date.now();
    const response = await fetch(`${syncConfig?.serverUrl || ""}/api/health`, {
      method: "GET",
      cache: "no-store",
    });
    const rtt = Date.now() - start;

    if (!response.ok) {
      currentQuality = "poor";
    } else if (rtt < 100) {
      currentQuality = "excellent";
    } else if (rtt < 300) {
      currentQuality = "good";
    } else if (rtt < 1000) {
      currentQuality = "fair";
    } else {
      currentQuality = "poor";
    }
  } catch {
    currentQuality = navigator.onLine ? "poor" : "offline";
  }

  syncConfig?.onNetworkChange?.(currentQuality);
}

async function performSync(): Promise<void> {
  if (!syncConfig || currentQuality === "offline") return;

  isSyncing = true;
  const startTime = Date.now();
  const strategy = STRATEGY[currentQuality];

  try {
    // Get unsynced readings from IndexedDB
    const readings = await offlineDB.getUnsyncedReadings(strategy.batchSize);
    if (readings.length === 0) {
      isSyncing = false;
      return;
    }

    const payload = {
      sensor_id: syncConfig.sensorId,
      readings: readings.map((r) => ({
        sensor_id: r.sensor_id,
        timestamp: r.timestamp,
        pm25: r.pm25,
        pm10: r.pm10,
        co2: r.co2,
        temperature: r.temperature,
        humidity: r.humidity,
        quality_score: r.quality_score,
        is_anomaly: r.is_anomaly,
        source: r.source,
      })),
      sync_type: "incremental",
      compressed: strategy.compress,
      raw_bytes: JSON.stringify(readings).length * 3,
    };

    const body = JSON.stringify(payload);
    const response = await fetch(`${syncConfig.serverUrl}/api/sync/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const result = await response.json();
    const duration = Date.now() - startTime;

    if (result.success) {
      // Mark readings as synced in IndexedDB
      await offlineDB.markReadingsSynced(readings.map((r) => r.id));

      const syncResult: SyncResult = {
        success: true,
        accepted: result.data.accepted,
        rejected: result.data.rejected,
        bytesSent: body.length,
        duration,
      };

      console.log(
        `[Sync] Uploaded ${readings.length} readings (${body.length} bytes, ${duration}ms)`,
      );
      syncConfig.onSyncComplete?.(syncResult);
    } else {
      console.warn("[Sync] Upload failed:", result.error);
      syncConfig.onSyncComplete?.({
        success: false,
        accepted: 0,
        rejected: readings.length,
        bytesSent: body.length,
        duration,
      });
    }
  } catch (err: any) {
    console.error("[Sync] Sync error:", err.message);
    // Might have gone offline
    detectNetworkQuality();
  } finally {
    isSyncing = false;
  }
}

/** Force an immediate sync regardless of schedule */
export async function forceSync(): Promise<SyncResult | null> {
  if (isSyncing || currentQuality === "offline") return null;
  await performSync();
  return null;
}

export function getNetworkQuality(): NetworkQuality {
  return currentQuality;
}

export function getSyncStrategy() {
  return STRATEGY[currentQuality];
}
