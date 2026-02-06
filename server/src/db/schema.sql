-- ============================================================
-- EdgeSense — PostgreSQL Schema (Pure SQL, no ORM)
-- Designed for time-series sensor data, P2P edge clusters,
-- aggregated metrics, sync events, and alerting.
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── SENSORS ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sensors (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    latitude        DOUBLE PRECISION NOT NULL,
    longitude       DOUBLE PRECISION NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'offline'
                        CHECK (status IN ('online', 'offline', 'degraded', 'maintenance')),
    capabilities    TEXT[] NOT NULL DEFAULT '{}',
    firmware_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_sensors_status ON sensors(status);
CREATE INDEX idx_sensors_location ON sensors(latitude, longitude);
CREATE INDEX idx_sensors_last_seen ON sensors(last_seen_at DESC);

-- ─── READINGS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS readings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sensor_id       UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    pm25            DOUBLE PRECISION,
    pm10            DOUBLE PRECISION,
    co2             DOUBLE PRECISION,
    temperature     DOUBLE PRECISION,
    humidity        DOUBLE PRECISION,
    quality_score   DOUBLE PRECISION NOT NULL DEFAULT 1.0
                        CHECK (quality_score >= 0.0 AND quality_score <= 1.0),
    is_anomaly      BOOLEAN NOT NULL DEFAULT FALSE,
    source          VARCHAR(20) NOT NULL DEFAULT 'direct'
                        CHECK (source IN ('direct', 'p2p_relay', 'edge_aggregated')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Critical index: time-series queries by sensor
CREATE INDEX idx_readings_sensor_time ON readings(sensor_id, timestamp DESC);
CREATE INDEX idx_readings_timestamp ON readings(timestamp DESC);
CREATE INDEX idx_readings_anomaly ON readings(is_anomaly) WHERE is_anomaly = TRUE;
CREATE INDEX idx_readings_source ON readings(source);

-- ─── EDGE CLUSTERS ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS edge_clusters (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    sensor_ids      UUID[] NOT NULL DEFAULT '{}',
    center_latitude DOUBLE PRECISION NOT NULL,
    center_longitude DOUBLE PRECISION NOT NULL,
    radius_meters   DOUBLE PRECISION NOT NULL DEFAULT 500,
    formed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'inactive', 'merging', 'splitting'))
);

CREATE INDEX idx_clusters_status ON edge_clusters(status);
CREATE INDEX idx_clusters_activity ON edge_clusters(last_activity_at DESC);

-- ─── AGGREGATED METRICS ────────────────────────────────────

CREATE TABLE IF NOT EXISTS aggregated_metrics (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cluster_id      UUID NOT NULL REFERENCES edge_clusters(id) ON DELETE CASCADE,
    window_start    TIMESTAMPTZ NOT NULL,
    window_end      TIMESTAMPTZ NOT NULL,
    sensor_count    INTEGER NOT NULL DEFAULT 0,
    pm25_mean       DOUBLE PRECISION,
    pm25_min        DOUBLE PRECISION,
    pm25_max        DOUBLE PRECISION,
    pm25_stddev     DOUBLE PRECISION,
    pm10_mean       DOUBLE PRECISION,
    pm10_min        DOUBLE PRECISION,
    pm10_max        DOUBLE PRECISION,
    pm10_stddev     DOUBLE PRECISION,
    co2_mean        DOUBLE PRECISION,
    co2_min         DOUBLE PRECISION,
    co2_max         DOUBLE PRECISION,
    co2_stddev      DOUBLE PRECISION,
    temperature_mean DOUBLE PRECISION,
    humidity_mean   DOUBLE PRECISION,
    confidence      DOUBLE PRECISION NOT NULL DEFAULT 1.0
                        CHECK (confidence >= 0.0 AND confidence <= 1.0),
    reading_count   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agg_cluster_window ON aggregated_metrics(cluster_id, window_start DESC);
CREATE INDEX idx_agg_window ON aggregated_metrics(window_start DESC);

-- Prevent duplicate windows per cluster
CREATE UNIQUE INDEX idx_agg_unique_window ON aggregated_metrics(cluster_id, window_start, window_end);

-- ─── SYNC EVENTS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sensor_id       UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    sync_type       VARCHAR(20) NOT NULL DEFAULT 'incremental'
                        CHECK (sync_type IN ('full', 'incremental', 'emergency', 'checkpoint')),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'partial')),
    records_sent    INTEGER NOT NULL DEFAULT 0,
    records_accepted INTEGER NOT NULL DEFAULT 0,
    records_rejected INTEGER NOT NULL DEFAULT 0,
    bytes_transferred BIGINT NOT NULL DEFAULT 0,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    error_message   TEXT,
    retry_count     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_sync_sensor ON sync_events(sensor_id, started_at DESC);
CREATE INDEX idx_sync_status ON sync_events(status);
CREATE INDEX idx_sync_type ON sync_events(sync_type);

-- ─── SYNC QUEUE ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_queue (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sensor_id       UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    payload_type    VARCHAR(20) NOT NULL
                        CHECK (payload_type IN ('reading', 'aggregation', 'alert')),
    payload         JSONB NOT NULL,
    priority        VARCHAR(10) NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 5,
    next_retry_at   TIMESTAMPTZ
);

CREATE INDEX idx_queue_priority ON sync_queue(priority DESC, created_at ASC);
CREATE INDEX idx_queue_sensor ON sync_queue(sensor_id);
CREATE INDEX idx_queue_retry ON sync_queue(next_retry_at) WHERE next_retry_at IS NOT NULL;

-- ─── ALERTS ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sensor_id       UUID REFERENCES sensors(id) ON DELETE SET NULL,
    cluster_id      UUID REFERENCES edge_clusters(id) ON DELETE SET NULL,
    alert_type      VARCHAR(20) NOT NULL
                        CHECK (alert_type IN ('spike', 'threshold_breach', 'sensor_offline', 'data_gap', 'anomaly')),
    severity        VARCHAR(15) NOT NULL DEFAULT 'warning'
                        CHECK (severity IN ('info', 'warning', 'critical', 'emergency')),
    title           VARCHAR(500) NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    metric_name     VARCHAR(50) NOT NULL,
    metric_value    DOUBLE PRECISION NOT NULL,
    threshold_value DOUBLE PRECISION NOT NULL,
    triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_type ON alerts(alert_type);
CREATE INDEX idx_alerts_triggered ON alerts(triggered_at DESC);
CREATE INDEX idx_alerts_unresolved ON alerts(resolved_at) WHERE resolved_at IS NULL;

-- ─── BANDWIDTH TRACKING ───────────────────────────────────

CREATE TABLE IF NOT EXISTS bandwidth_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sensor_id       UUID REFERENCES sensors(id) ON DELETE SET NULL,
    direction       VARCHAR(10) NOT NULL CHECK (direction IN ('upload', 'download')),
    bytes           BIGINT NOT NULL,
    records         INTEGER NOT NULL DEFAULT 0,
    was_compressed  BOOLEAN NOT NULL DEFAULT FALSE,
    raw_bytes       BIGINT NOT NULL DEFAULT 0,
    network_quality VARCHAR(15) NOT NULL DEFAULT 'good',
    logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bandwidth_sensor ON bandwidth_log(sensor_id, logged_at DESC);
CREATE INDEX idx_bandwidth_time ON bandwidth_log(logged_at DESC);
