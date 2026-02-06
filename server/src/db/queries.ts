// ============================================================
// EdgeSense — Pure SQL Queries (No ORM. Just SQL.)
// Every query is hand-written, parameterized, and indexed.
// ============================================================

import { query, transaction } from "./pool";
import { v4 as uuidv4 } from "uuid";
import type {
  Sensor,
  SensorReading,
  EdgeCluster,
  AggregatedMetric,
  SyncEvent,
  SyncQueueItem,
  Alert,
  SensorStatus,
  SystemStats,
} from "../types";

// ─── SENSOR QUERIES ────────────────────────────────────────

export const sensorQueries = {
  async getAll(): Promise<Sensor[]> {
    const { rows } = await query(
      `SELECT * FROM sensors ORDER BY registered_at DESC`,
    );
    return rows;
  },

  async getById(id: string): Promise<Sensor | null> {
    const { rows } = await query(`SELECT * FROM sensors WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  async getOnline(): Promise<Sensor[]> {
    const { rows } = await query(
      `SELECT * FROM sensors WHERE status = 'online' ORDER BY last_seen_at DESC`,
    );
    return rows;
  },

  async create(sensor: Partial<Sensor>): Promise<Sensor> {
    const id = sensor.id || uuidv4();
    const { rows } = await query(
      `INSERT INTO sensors (id, name, latitude, longitude, status, capabilities, firmware_version, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        sensor.name,
        sensor.latitude,
        sensor.longitude,
        sensor.status || "online",
        sensor.capabilities || [
          "pm25",
          "pm10",
          "co2",
          "temperature",
          "humidity",
        ],
        sensor.firmware_version || "1.0.0",
        JSON.stringify(sensor.metadata || {}),
      ],
    );
    return rows[0];
  },

  async updateStatus(id: string, status: SensorStatus): Promise<Sensor | null> {
    const { rows } = await query(
      `UPDATE sensors SET status = $1, last_seen_at = NOW() WHERE id = $2 RETURNING *`,
      [status, id],
    );
    return rows[0] || null;
  },

  async heartbeat(id: string): Promise<void> {
    await query(
      `UPDATE sensors SET last_seen_at = NOW(), status = 'online' WHERE id = $1`,
      [id],
    );
  },

  async getNearby(
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<Sensor[]> {
    // Haversine distance in pure SQL — no PostGIS needed
    const { rows } = await query(
      `SELECT *,
        (6371 * acos(
          cos(radians($1)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(latitude))
        )) AS distance_km
       FROM sensors
       WHERE status = 'online'
       HAVING (6371 * acos(
          cos(radians($1)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(latitude))
       )) < $3
       ORDER BY distance_km ASC`,
      [lat, lng, radiusKm],
    );
    return rows;
  },

  async delete(id: string): Promise<boolean> {
    const result = await query(`DELETE FROM sensors WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  },
};

// ─── READING QUERIES ───────────────────────────────────────

export const readingQueries = {
  async getBySensor(
    sensorId: string,
    limit = 100,
    offset = 0,
  ): Promise<SensorReading[]> {
    const { rows } = await query(
      `SELECT * FROM readings WHERE sensor_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3`,
      [sensorId, limit, offset],
    );
    return rows;
  },

  async getLatestBySensor(sensorId: string): Promise<SensorReading | null> {
    const { rows } = await query(
      `SELECT * FROM readings WHERE sensor_id = $1 ORDER BY timestamp DESC LIMIT 1`,
      [sensorId],
    );
    return rows[0] || null;
  },

  async getInTimeRange(
    start: Date,
    end: Date,
    sensorId?: string,
  ): Promise<SensorReading[]> {
    if (sensorId) {
      const { rows } = await query(
        `SELECT * FROM readings WHERE sensor_id = $1 AND timestamp BETWEEN $2 AND $3 ORDER BY timestamp DESC`,
        [sensorId, start.toISOString(), end.toISOString()],
      );
      return rows;
    }
    const { rows } = await query(
      `SELECT * FROM readings WHERE timestamp BETWEEN $1 AND $2 ORDER BY timestamp DESC`,
      [start.toISOString(), end.toISOString()],
    );
    return rows;
  },

  async create(reading: Partial<SensorReading>): Promise<SensorReading> {
    const id = reading.id || uuidv4();
    const { rows } = await query(
      `INSERT INTO readings (id, sensor_id, timestamp, pm25, pm10, co2, temperature, humidity, quality_score, is_anomaly, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        id,
        reading.sensor_id,
        reading.timestamp || new Date().toISOString(),
        reading.pm25,
        reading.pm10,
        reading.co2,
        reading.temperature,
        reading.humidity,
        reading.quality_score ?? 1.0,
        reading.is_anomaly ?? false,
        reading.source || "direct",
      ],
    );
    return rows[0];
  },

  async bulkCreate(readings: Partial<SensorReading>[]): Promise<number> {
    if (readings.length === 0) return 0;

    return await transaction(async (client) => {
      let inserted = 0;
      // Batch insert in chunks of 50 to avoid parameter limit
      const chunkSize = 50;
      for (let i = 0; i < readings.length; i += chunkSize) {
        const chunk = readings.slice(i, i + chunkSize);
        const values: any[] = [];
        const placeholders: string[] = [];

        chunk.forEach((r, idx) => {
          const offset = idx * 11;
          placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`,
          );
          values.push(
            r.id || uuidv4(),
            r.sensor_id,
            (r.timestamp || new Date()).toISOString(),
            r.pm25 ?? null,
            r.pm10 ?? null,
            r.co2 ?? null,
            r.temperature ?? null,
            r.humidity ?? null,
            r.quality_score ?? 1.0,
            r.is_anomaly ?? false,
            r.source || "direct",
          );
        });

        const result = await client.query(
          `INSERT INTO readings (id, sensor_id, timestamp, pm25, pm10, co2, temperature, humidity, quality_score, is_anomaly, source)
           VALUES ${placeholders.join(", ")}
           ON CONFLICT DO NOTHING`,
          values,
        );
        inserted += result.rowCount ?? 0;
      }
      return inserted;
    });
  },

  async getAnomalies(limit = 50): Promise<SensorReading[]> {
    const { rows } = await query(
      `SELECT r.*, s.name as sensor_name
       FROM readings r JOIN sensors s ON r.sensor_id = s.id
       WHERE r.is_anomaly = TRUE
       ORDER BY r.timestamp DESC LIMIT $1`,
      [limit],
    );
    return rows;
  },

  async countBySensor(sensorId: string): Promise<number> {
    const { rows } = await query(
      `SELECT COUNT(*)::int as count FROM readings WHERE sensor_id = $1`,
      [sensorId],
    );
    return rows[0].count;
  },

  async countSinceTime(since: Date): Promise<number> {
    const { rows } = await query(
      `SELECT COUNT(*)::int as count FROM readings WHERE timestamp >= $1`,
      [since.toISOString()],
    );
    return rows[0].count;
  },
};

// ─── CLUSTER QUERIES ───────────────────────────────────────

export const clusterQueries = {
  async getAll(): Promise<EdgeCluster[]> {
    const { rows } = await query(
      `SELECT * FROM edge_clusters ORDER BY formed_at DESC`,
    );
    return rows;
  },

  async getActive(): Promise<EdgeCluster[]> {
    const { rows } = await query(
      `SELECT * FROM edge_clusters WHERE status = 'active' ORDER BY last_activity_at DESC`,
    );
    return rows;
  },

  async getById(id: string): Promise<EdgeCluster | null> {
    const { rows } = await query(`SELECT * FROM edge_clusters WHERE id = $1`, [
      id,
    ]);
    return rows[0] || null;
  },

  async create(cluster: Partial<EdgeCluster>): Promise<EdgeCluster> {
    const id = cluster.id || uuidv4();
    const { rows } = await query(
      `INSERT INTO edge_clusters (id, name, sensor_ids, center_latitude, center_longitude, radius_meters, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        id,
        cluster.name,
        cluster.sensor_ids || [],
        cluster.center_latitude,
        cluster.center_longitude,
        cluster.radius_meters || 500,
        cluster.status || "active",
      ],
    );
    return rows[0];
  },

  async updateSensors(
    clusterId: string,
    sensorIds: string[],
  ): Promise<EdgeCluster | null> {
    const { rows } = await query(
      `UPDATE edge_clusters SET sensor_ids = $1, last_activity_at = NOW() WHERE id = $2 RETURNING *`,
      [sensorIds, clusterId],
    );
    return rows[0] || null;
  },

  async findClusterForSensor(sensorId: string): Promise<EdgeCluster | null> {
    const { rows } = await query(
      `SELECT * FROM edge_clusters WHERE $1 = ANY(sensor_ids) AND status = 'active' LIMIT 1`,
      [sensorId],
    );
    return rows[0] || null;
  },
};

// ─── AGGREGATION QUERIES ───────────────────────────────────

export const aggregationQueries = {
  async getByCluster(
    clusterId: string,
    limit = 24,
  ): Promise<AggregatedMetric[]> {
    const { rows } = await query(
      `SELECT * FROM aggregated_metrics WHERE cluster_id = $1 ORDER BY window_start DESC LIMIT $2`,
      [clusterId, limit],
    );
    return rows;
  },

  async getLatest(limit = 50): Promise<AggregatedMetric[]> {
    const { rows } = await query(
      `SELECT am.*, ec.name as cluster_name
       FROM aggregated_metrics am JOIN edge_clusters ec ON am.cluster_id = ec.id
       ORDER BY am.window_start DESC LIMIT $1`,
      [limit],
    );
    return rows;
  },

  async create(metric: Partial<AggregatedMetric>): Promise<AggregatedMetric> {
    const id = metric.id || uuidv4();
    const { rows } = await query(
      `INSERT INTO aggregated_metrics
       (id, cluster_id, window_start, window_end, sensor_count,
        pm25_mean, pm25_min, pm25_max, pm25_stddev,
        pm10_mean, pm10_min, pm10_max, pm10_stddev,
        co2_mean, co2_min, co2_max, co2_stddev,
        temperature_mean, humidity_mean, confidence, reading_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (cluster_id, window_start, window_end) DO UPDATE SET
         sensor_count = EXCLUDED.sensor_count,
         pm25_mean = EXCLUDED.pm25_mean, pm25_min = EXCLUDED.pm25_min,
         pm25_max = EXCLUDED.pm25_max, pm25_stddev = EXCLUDED.pm25_stddev,
         pm10_mean = EXCLUDED.pm10_mean, pm10_min = EXCLUDED.pm10_min,
         pm10_max = EXCLUDED.pm10_max, pm10_stddev = EXCLUDED.pm10_stddev,
         co2_mean = EXCLUDED.co2_mean, co2_min = EXCLUDED.co2_min,
         co2_max = EXCLUDED.co2_max, co2_stddev = EXCLUDED.co2_stddev,
         temperature_mean = EXCLUDED.temperature_mean,
         humidity_mean = EXCLUDED.humidity_mean,
         confidence = EXCLUDED.confidence, reading_count = EXCLUDED.reading_count
       RETURNING *`,
      [
        id,
        metric.cluster_id,
        metric.window_start?.toISOString(),
        metric.window_end?.toISOString(),
        metric.sensor_count ?? 0,
        metric.pm25_mean,
        metric.pm25_min,
        metric.pm25_max,
        metric.pm25_stddev,
        metric.pm10_mean,
        metric.pm10_min,
        metric.pm10_max,
        metric.pm10_stddev,
        metric.co2_mean,
        metric.co2_min,
        metric.co2_max,
        metric.co2_stddev,
        metric.temperature_mean,
        metric.humidity_mean,
        metric.confidence ?? 1.0,
        metric.reading_count ?? 0,
      ],
    );
    return rows[0];
  },

  /** Compute aggregation directly from raw readings via SQL */
  async computeFromReadings(
    clusterId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<AggregatedMetric | null> {
    // Get sensor IDs in this cluster
    const cluster = await clusterQueries.getById(clusterId);
    if (!cluster || cluster.sensor_ids.length === 0) return null;

    const { rows } = await query(
      `SELECT
         COUNT(DISTINCT sensor_id)::int AS sensor_count,
         COUNT(*)::int AS reading_count,
         AVG(pm25) AS pm25_mean, MIN(pm25) AS pm25_min, MAX(pm25) AS pm25_max, STDDEV(pm25) AS pm25_stddev,
         AVG(pm10) AS pm10_mean, MIN(pm10) AS pm10_min, MAX(pm10) AS pm10_max, STDDEV(pm10) AS pm10_stddev,
         AVG(co2) AS co2_mean, MIN(co2) AS co2_min, MAX(co2) AS co2_max, STDDEV(co2) AS co2_stddev,
         AVG(temperature) AS temperature_mean,
         AVG(humidity) AS humidity_mean,
         AVG(quality_score) AS confidence
       FROM readings
       WHERE sensor_id = ANY($1)
         AND timestamp >= $2
         AND timestamp < $3`,
      [cluster.sensor_ids, windowStart.toISOString(), windowEnd.toISOString()],
    );

    if (!rows[0] || rows[0].reading_count === 0) return null;

    const computed = rows[0];
    return aggregationQueries.create({
      cluster_id: clusterId,
      window_start: windowStart,
      window_end: windowEnd,
      sensor_count: computed.sensor_count,
      pm25_mean: computed.pm25_mean,
      pm25_min: computed.pm25_min,
      pm25_max: computed.pm25_max,
      pm25_stddev: computed.pm25_stddev,
      pm10_mean: computed.pm10_mean,
      pm10_min: computed.pm10_min,
      pm10_max: computed.pm10_max,
      pm10_stddev: computed.pm10_stddev,
      co2_mean: computed.co2_mean,
      co2_min: computed.co2_min,
      co2_max: computed.co2_max,
      co2_stddev: computed.co2_stddev,
      temperature_mean: computed.temperature_mean,
      humidity_mean: computed.humidity_mean,
      confidence: computed.confidence,
      reading_count: computed.reading_count,
    });
  },
};

// ─── SYNC QUERIES ──────────────────────────────────────────

export const syncQueries = {
  async createEvent(event: Partial<SyncEvent>): Promise<SyncEvent> {
    const id = event.id || uuidv4();
    const { rows } = await query(
      `INSERT INTO sync_events (id, sensor_id, sync_type, status, records_sent, bytes_transferred)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        id,
        event.sensor_id,
        event.sync_type || "incremental",
        "in_progress",
        event.records_sent ?? 0,
        event.bytes_transferred ?? 0,
      ],
    );
    return rows[0];
  },

  async completeEvent(
    id: string,
    accepted: number,
    rejected: number,
  ): Promise<SyncEvent | null> {
    const { rows } = await query(
      `UPDATE sync_events
       SET status = 'completed', records_accepted = $1, records_rejected = $2, completed_at = NOW()
       WHERE id = $3 RETURNING *`,
      [accepted, rejected, id],
    );
    return rows[0] || null;
  },

  async failEvent(id: string, error: string): Promise<SyncEvent | null> {
    const { rows } = await query(
      `UPDATE sync_events
       SET status = 'failed', error_message = $1, completed_at = NOW(), retry_count = retry_count + 1
       WHERE id = $2 RETURNING *`,
      [error, id],
    );
    return rows[0] || null;
  },

  async getRecentBySensor(sensorId: string, limit = 20): Promise<SyncEvent[]> {
    const { rows } = await query(
      `SELECT * FROM sync_events WHERE sensor_id = $1 ORDER BY started_at DESC LIMIT $2`,
      [sensorId, limit],
    );
    return rows;
  },

  async enqueue(item: Partial<SyncQueueItem>): Promise<SyncQueueItem> {
    const id = item.id || uuidv4();
    const { rows } = await query(
      `INSERT INTO sync_queue (id, sensor_id, payload_type, payload, priority, max_attempts)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        id,
        item.sensor_id,
        item.payload_type,
        JSON.stringify(item.payload),
        item.priority || "normal",
        item.max_attempts ?? 5,
      ],
    );
    return rows[0];
  },

  async dequeue(batchSize: number): Promise<SyncQueueItem[]> {
    const { rows } = await query(
      `DELETE FROM sync_queue
       WHERE id IN (
         SELECT id FROM sync_queue
         WHERE (next_retry_at IS NULL OR next_retry_at <= NOW())
           AND attempts < max_attempts
         ORDER BY
           CASE priority
             WHEN 'critical' THEN 0
             WHEN 'high' THEN 1
             WHEN 'normal' THEN 2
             WHEN 'low' THEN 3
           END,
           created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [batchSize],
    );
    return rows;
  },

  async requeueFailed(id: string): Promise<void> {
    await query(
      `UPDATE sync_queue
       SET attempts = attempts + 1, next_retry_at = NOW() + INTERVAL '1 second' * POWER(2, attempts)
       WHERE id = $1`,
      [id],
    );
  },

  async getQueueSize(): Promise<number> {
    const { rows } = await query(
      `SELECT COUNT(*)::int as count FROM sync_queue`,
    );
    return rows[0].count;
  },
};

// ─── ALERT QUERIES ─────────────────────────────────────────

export const alertQueries = {
  async getAll(limit = 50): Promise<Alert[]> {
    const { rows } = await query(
      `SELECT a.*, s.name as sensor_name
       FROM alerts a LEFT JOIN sensors s ON a.sensor_id = s.id
       ORDER BY a.triggered_at DESC LIMIT $1`,
      [limit],
    );
    return rows;
  },

  async getUnresolved(): Promise<Alert[]> {
    const { rows } = await query(
      `SELECT a.*, s.name as sensor_name
       FROM alerts a LEFT JOIN sensors s ON a.sensor_id = s.id
       WHERE a.resolved_at IS NULL
       ORDER BY
         CASE a.severity
           WHEN 'emergency' THEN 0
           WHEN 'critical' THEN 1
           WHEN 'warning' THEN 2
           WHEN 'info' THEN 3
         END,
         a.triggered_at DESC`,
    );
    return rows;
  },

  async create(alert: Partial<Alert>): Promise<Alert> {
    const id = alert.id || uuidv4();
    const { rows } = await query(
      `INSERT INTO alerts (id, sensor_id, cluster_id, alert_type, severity, title, description, metric_name, metric_value, threshold_value, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        id,
        alert.sensor_id,
        alert.cluster_id,
        alert.alert_type || "spike",
        alert.severity || "warning",
        alert.title,
        alert.description || "",
        alert.metric_name,
        alert.metric_value,
        alert.threshold_value,
        JSON.stringify(alert.metadata || {}),
      ],
    );
    return rows[0];
  },

  async acknowledge(id: string): Promise<Alert | null> {
    const { rows } = await query(
      `UPDATE alerts SET acknowledged_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    return rows[0] || null;
  },

  async resolve(id: string): Promise<Alert | null> {
    const { rows } = await query(
      `UPDATE alerts SET resolved_at = NOW() WHERE id = $1 RETURNING *`,
      [id],
    );
    return rows[0] || null;
  },
};

// ─── BANDWIDTH TRACKING ───────────────────────────────────

export const bandwidthQueries = {
  async log(
    sensorId: string | null,
    direction: "upload" | "download",
    bytes: number,
    records: number,
    compressed: boolean,
    rawBytes: number,
    quality: string,
  ): Promise<void> {
    await query(
      `INSERT INTO bandwidth_log (sensor_id, direction, bytes, records, was_compressed, raw_bytes, network_quality)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sensorId, direction, bytes, records, compressed, rawBytes, quality],
    );
  },

  async getSavings(): Promise<{
    total_raw: number;
    total_sent: number;
    savings_percent: number;
  }> {
    const { rows } = await query(
      `SELECT
         COALESCE(SUM(raw_bytes), 0)::bigint AS total_raw,
         COALESCE(SUM(bytes), 0)::bigint AS total_sent,
         CASE
           WHEN SUM(raw_bytes) > 0
           THEN ROUND((1.0 - SUM(bytes)::numeric / SUM(raw_bytes)::numeric) * 100, 2)
           ELSE 0
         END AS savings_percent
       FROM bandwidth_log
       WHERE direction = 'upload'`,
    );
    return rows[0];
  },

  async getHourlyStats(hours = 24): Promise<any[]> {
    const { rows } = await query(
      `SELECT
         date_trunc('hour', logged_at) AS hour,
         SUM(bytes)::bigint AS total_bytes,
         SUM(records)::int AS total_records,
         AVG(CASE WHEN raw_bytes > 0 THEN (1.0 - bytes::numeric / raw_bytes::numeric) * 100 ELSE 0 END) AS avg_savings_percent
       FROM bandwidth_log
       WHERE logged_at >= NOW() - INTERVAL '1 hour' * $1
       GROUP BY date_trunc('hour', logged_at)
       ORDER BY hour DESC`,
      [hours],
    );
    return rows;
  },
};

// ─── SYSTEM STATS (DASHBOARD) ──────────────────────────────

export const statsQueries = {
  async getSystemStats(): Promise<SystemStats> {
    const [
      sensors,
      online,
      totalReadings,
      recentReadings,
      syncs,
      pendingSyncs,
      clusters,
      alerts,
      bandwidth,
    ] = await Promise.all([
      query(`SELECT COUNT(*)::int as c FROM sensors`),
      query(`SELECT COUNT(*)::int as c FROM sensors WHERE status = 'online'`),
      query(`SELECT COUNT(*)::int as c FROM readings`),
      query(
        `SELECT COUNT(*)::int as c FROM readings WHERE timestamp >= NOW() - INTERVAL '1 hour'`,
      ),
      query(`SELECT COUNT(*)::int as c FROM sync_events`),
      query(`SELECT COUNT(*)::int as c FROM sync_queue`),
      query(
        `SELECT COUNT(*)::int as c FROM edge_clusters WHERE status = 'active'`,
      ),
      query(`SELECT COUNT(*)::int as c FROM alerts WHERE resolved_at IS NULL`),
      bandwidthQueries.getSavings(),
    ]);

    return {
      total_sensors: sensors.rows[0].c,
      online_sensors: online.rows[0].c,
      total_readings: totalReadings.rows[0].c,
      readings_last_hour: recentReadings.rows[0].c,
      total_syncs: syncs.rows[0].c,
      pending_syncs: pendingSyncs.rows[0].c,
      active_clusters: clusters.rows[0].c,
      active_alerts: alerts.rows[0].c,
      bandwidth_saved_percent: parseFloat(
        bandwidth.savings_percent?.toString() || "0",
      ),
      avg_edge_latency_ms: 0, // computed at runtime
      uptime_hours: 0, // computed at runtime
    };
  },
};
