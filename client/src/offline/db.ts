// ============================================================
// EdgeSense Client — IndexedDB Offline Storage
// Stores readings, sync queue, and cluster data locally.
// Works fully offline. Syncs when connection resumes.
// ============================================================

import { openDB, DBSchema, IDBPDatabase } from "idb";

interface EdgeSenseDB extends DBSchema {
  readings: {
    key: string;
    value: {
      id: string;
      sensor_id: string;
      timestamp: string;
      pm25: number | null;
      pm10: number | null;
      co2: number | null;
      temperature: number | null;
      humidity: number | null;
      quality_score: number;
      is_anomaly: boolean;
      source: string;
      synced: boolean;
    };
    indexes: {
      "by-sensor": string;
      "by-timestamp": string;
      "by-synced": number;
    };
  };
  syncQueue: {
    key: string;
    value: {
      id: string;
      payload_type: string;
      payload: any;
      priority: string;
      created_at: string;
      attempts: number;
    };
    indexes: {
      "by-priority": string;
    };
  };
  peers: {
    key: string;
    value: {
      peer_id: string;
      sensor_id: string;
      capabilities: string[];
      last_seen: string;
    };
  };
  config: {
    key: string;
    value: {
      key: string;
      value: any;
    };
  };
}

let db: IDBPDatabase<EdgeSenseDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<EdgeSenseDB>> {
  if (db) return db;

  db = await openDB<EdgeSenseDB>("edgesense", 1, {
    upgrade(database) {
      // Readings store
      const readingsStore = database.createObjectStore("readings", {
        keyPath: "id",
      });
      readingsStore.createIndex("by-sensor", "sensor_id");
      readingsStore.createIndex("by-timestamp", "timestamp");
      readingsStore.createIndex("by-synced", "synced");

      // Sync queue
      const syncStore = database.createObjectStore("syncQueue", {
        keyPath: "id",
      });
      syncStore.createIndex("by-priority", "priority");

      // Peers
      database.createObjectStore("peers", { keyPath: "peer_id" });

      // Config
      database.createObjectStore("config", { keyPath: "key" });
    },
  });

  return db;
}

// ─── Reading Operations ────────────────────────────────────

export async function storeReading(
  reading: EdgeSenseDB["readings"]["value"],
): Promise<void> {
  const database = await getDB();
  await database.put("readings", reading);
}

export async function storeReadings(
  readings: EdgeSenseDB["readings"]["value"][],
): Promise<void> {
  const database = await getDB();
  const tx = database.transaction("readings", "readwrite");
  for (const reading of readings) {
    await tx.store.put(reading);
  }
  await tx.done;
}

export async function getUnsyncedReadings(
  limit = 100,
): Promise<EdgeSenseDB["readings"]["value"][]> {
  const database = await getDB();
  const all = await database.getAllFromIndex(
    "readings",
    "by-synced",
    IDBKeyRange.only(0),
  );
  return all.slice(0, limit);
}

export async function markReadingsSynced(ids: string[]): Promise<void> {
  const database = await getDB();
  const tx = database.transaction("readings", "readwrite");
  for (const id of ids) {
    const reading = await tx.store.get(id);
    if (reading) {
      reading.synced = true;
      await tx.store.put(reading);
    }
  }
  await tx.done;
}

export async function getReadingsBySensor(
  sensorId: string,
  limit = 100,
): Promise<EdgeSenseDB["readings"]["value"][]> {
  const database = await getDB();
  const all = await database.getAllFromIndex("readings", "by-sensor", sensorId);
  return all
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
}

export async function getReadingCount(): Promise<number> {
  const database = await getDB();
  return await database.count("readings");
}

export async function getUnsyncedCount(): Promise<number> {
  const database = await getDB();
  return (
    await database.getAllFromIndex("readings", "by-synced", IDBKeyRange.only(0))
  ).length;
}

// ─── Sync Queue Operations ─────────────────────────────────

export async function enqueueForSync(
  item: EdgeSenseDB["syncQueue"]["value"],
): Promise<void> {
  const database = await getDB();
  await database.put("syncQueue", item);
}

export async function dequeueSync(
  limit = 50,
): Promise<EdgeSenseDB["syncQueue"]["value"][]> {
  const database = await getDB();
  const all = await database.getAll("syncQueue");
  // Sort by priority: critical > high > normal > low
  const priorityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
  };
  all.sort(
    (a, b) =>
      (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2),
  );
  return all.slice(0, limit);
}

export async function removeSyncItems(ids: string[]): Promise<void> {
  const database = await getDB();
  const tx = database.transaction("syncQueue", "readwrite");
  for (const id of ids) {
    await tx.store.delete(id);
  }
  await tx.done;
}

export async function getSyncQueueSize(): Promise<number> {
  const database = await getDB();
  return await database.count("syncQueue");
}

// ─── Peer Operations ───────────────────────────────────────

export async function storePeer(
  peer: EdgeSenseDB["peers"]["value"],
): Promise<void> {
  const database = await getDB();
  await database.put("peers", peer);
}

export async function getAllPeers(): Promise<EdgeSenseDB["peers"]["value"][]> {
  const database = await getDB();
  return await database.getAll("peers");
}

export async function removePeer(peerId: string): Promise<void> {
  const database = await getDB();
  await database.delete("peers", peerId);
}

// ─── Config Operations ─────────────────────────────────────

export async function setConfig(key: string, value: any): Promise<void> {
  const database = await getDB();
  await database.put("config", { key, value });
}

export async function getConfig(key: string): Promise<any> {
  const database = await getDB();
  const item = await database.get("config", key);
  return item?.value;
}

// ─── Cleanup ───────────────────────────────────────────────

export async function clearOldReadings(olderThanHours = 168): Promise<number> {
  const database = await getDB();
  const cutoff = new Date(
    Date.now() - olderThanHours * 60 * 60 * 1000,
  ).toISOString();
  const all = await database.getAll("readings");
  let deleted = 0;
  const tx = database.transaction("readings", "readwrite");
  for (const reading of all) {
    if (reading.timestamp < cutoff && reading.synced) {
      await tx.store.delete(reading.id);
      deleted++;
    }
  }
  await tx.done;
  return deleted;
}

export async function getStorageStats(): Promise<{
  readings: number;
  unsynced: number;
  syncQueue: number;
  peers: number;
}> {
  const database = await getDB();
  return {
    readings: await database.count("readings"),
    unsynced: (
      await database.getAllFromIndex(
        "readings",
        "by-synced",
        IDBKeyRange.only(0),
      )
    ).length,
    syncQueue: await database.count("syncQueue"),
    peers: await database.count("peers"),
  };
}
