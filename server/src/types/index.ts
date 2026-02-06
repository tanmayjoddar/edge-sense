// ============================================================
// EdgeSense — Core Type Definitions
// Pure TypeScript types. No ORM. No magic. Just engineering.
// ============================================================

// ─── Sensor Types ──────────────────────────────────────────

export interface Sensor {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  status: SensorStatus;
  capabilities: SensorCapability[];
  firmware_version: string;
  registered_at: Date;
  last_seen_at: Date;
  metadata: Record<string, unknown>;
}

export type SensorStatus = "online" | "offline" | "degraded" | "maintenance";

export type SensorCapability =
  | "pm25"
  | "pm10"
  | "co2"
  | "temperature"
  | "humidity";

export interface SensorReading {
  id: string;
  sensor_id: string;
  timestamp: Date;
  pm25: number | null;
  pm10: number | null;
  co2: number | null;
  temperature: number | null;
  humidity: number | null;
  quality_score: number; // 0.0–1.0 confidence in reading accuracy
  is_anomaly: boolean;
  source: ReadingSource;
  created_at: Date;
}

export type ReadingSource = "direct" | "p2p_relay" | "edge_aggregated";

// ─── Edge Cluster Types ────────────────────────────────────

export interface EdgeCluster {
  id: string;
  name: string;
  sensor_ids: string[];
  center_latitude: number;
  center_longitude: number;
  radius_meters: number;
  formed_at: Date;
  last_activity_at: Date;
  status: ClusterStatus;
}

export type ClusterStatus = "active" | "inactive" | "merging" | "splitting";

// ─── Aggregated Metrics ────────────────────────────────────

export interface AggregatedMetric {
  id: string;
  cluster_id: string;
  window_start: Date;
  window_end: Date;
  sensor_count: number;
  pm25_mean: number | null;
  pm25_min: number | null;
  pm25_max: number | null;
  pm25_stddev: number | null;
  pm10_mean: number | null;
  pm10_min: number | null;
  pm10_max: number | null;
  pm10_stddev: number | null;
  co2_mean: number | null;
  co2_min: number | null;
  co2_max: number | null;
  co2_stddev: number | null;
  temperature_mean: number | null;
  humidity_mean: number | null;
  confidence: number; // 0.0–1.0 overall aggregation confidence
  reading_count: number;
  created_at: Date;
}

// ─── Sync Types ────────────────────────────────────────────

export interface SyncEvent {
  id: string;
  sensor_id: string;
  sync_type: SyncType;
  status: SyncStatus;
  records_sent: number;
  records_accepted: number;
  records_rejected: number;
  bytes_transferred: number;
  started_at: Date;
  completed_at: Date | null;
  error_message: string | null;
  retry_count: number;
}

export type SyncType = "full" | "incremental" | "emergency" | "checkpoint";
export type SyncStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "partial";

export interface SyncQueueItem {
  id: string;
  sensor_id: string;
  payload_type: "reading" | "aggregation" | "alert";
  payload: Record<string, unknown>;
  priority: SyncPriority;
  created_at: Date;
  attempts: number;
  max_attempts: number;
  next_retry_at: Date | null;
}

export type SyncPriority = "low" | "normal" | "high" | "critical";

// ─── Alert Types ───────────────────────────────────────────

export interface Alert {
  id: string;
  sensor_id: string | null;
  cluster_id: string | null;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  metric_name: string;
  metric_value: number;
  threshold_value: number;
  triggered_at: Date;
  acknowledged_at: Date | null;
  resolved_at: Date | null;
  metadata: Record<string, unknown>;
}

export type AlertType =
  | "spike"
  | "threshold_breach"
  | "sensor_offline"
  | "data_gap"
  | "anomaly";
export type AlertSeverity = "info" | "warning" | "critical" | "emergency";

// ─── P2P / WebRTC Signaling ────────────────────────────────

export interface PeerInfo {
  peer_id: string;
  sensor_id: string;
  ip_hint: string;
  capabilities: SensorCapability[];
  cluster_id: string | null;
  connected_at: Date;
  last_heartbeat: Date;
}

export interface SignalMessage {
  type:
    | "offer"
    | "answer"
    | "ice-candidate"
    | "discovery"
    | "heartbeat"
    | "leave";
  from: string;
  to: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

// ─── Network / Bandwidth ──────────────────────────────────

export interface NetworkCondition {
  quality: "excellent" | "good" | "fair" | "poor" | "offline";
  rtt_ms: number;
  bandwidth_kbps: number;
  packet_loss_percent: number;
  measured_at: Date;
}

export interface UploadStrategy {
  mode: "realtime" | "batched" | "aggressive_batch" | "emergency_only";
  batch_size: number;
  interval_ms: number;
  compress: boolean;
}

// ─── API Response Types ────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  timestamp: string;
  request_id: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// ─── Dashboard / Stats ────────────────────────────────────

export interface SystemStats {
  total_sensors: number;
  online_sensors: number;
  total_readings: number;
  readings_last_hour: number;
  total_syncs: number;
  pending_syncs: number;
  active_clusters: number;
  active_alerts: number;
  bandwidth_saved_percent: number;
  avg_edge_latency_ms: number;
  uptime_hours: number;
}
