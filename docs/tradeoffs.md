# EdgeSense — Trade-offs & Design Rationale

## 1. Eventual Consistency vs Strong Consistency

**Chosen: Eventual Consistency**

- Edge nodes may see stale data for seconds to minutes
- Sync queue processes in priority order, not real-time
- Deduplication via `sensor_id + timestamp` upsert resolves conflicts

**Why:** Strong consistency would require always-online, defeating the offline-first purpose. Air quality readings have natural tolerance for slight delay — a PM2.5 reading arriving 30 seconds late is still actionable.

## 2. Full Mesh vs Star Topology for P2P

**Chosen: Full Mesh (up to ~10 peers)**

- Every peer connects to every other peer
- O(n²) connections, but n is small (browser tabs in same area)

**Trade-off:** Full mesh doesn't scale past ~20 peers due to connection overhead. For a city-wide deployment, we'd need a gossip protocol or super-node hierarchy. For the demo scope (3-10 nodes), full mesh provides simplest implementation with guaranteed delivery.

## 3. IndexedDB vs Cache API for Offline Storage

**Chosen: IndexedDB**

- Structured data with indexes
- Query by sensor, time range, sync status
- Cache API better for HTTP response caching (handled by workbox)

**Trade-off:** IndexedDB has a complex async API and browser-specific quirks. The `idb` wrapper library abstracts this while keeping performance.

## 4. Batch Sync vs Real-time Streaming

**Chosen: Adaptive Batch Sync**

- Batch size adjusts: 50 (excellent) → 5 (poor) → 0 (offline)
- Interval adjusts: 10s (excellent) → 120s (poor)
- Only aggregated summaries upload, not raw readings

**Trade-off:** Real-time streaming would give the server immediate data but wastes bandwidth when 100 raw readings can be summarized into 1 aggregation. The 80:1 compression ratio is worth the slight delay.

## 5. Server-side Aggregation vs Edge-only

**Chosen: Both**

- Edge: Browser aggregates local + P2P readings (fast, offline-capable)
- Server: SQL aggregation across all clusters (complete, authoritative)

**Trade-off:** Duplicated logic, but each serves a different purpose. Edge aggregation gives instant local insight. Server aggregation provides the global truth.

## 6. Pure SQL vs ORM

**Chosen: Pure SQL with parameterized queries**

Pros:
- Exact control over `ON CONFLICT`, window functions, `FOR UPDATE SKIP LOCKED`
- No ORM overhead or N+1 query risks
- High-performance execution with zero abstraction penalty
- Easier to reason about performance

Cons:
- No auto-migration (manual schema management)
- More boilerplate for CRUD
- Must handle type mapping manually

**Verdict:** For performance-critical edge and time-series sensor ingestion, parameterized raw SQL provides maximum query optimization and transaction isolation guarantees.

## 7. WebSocket Signaling vs HTTP Polling

**Chosen: WebSocket**

- Persistent connection for instant offer/answer relay
- Heartbeat-based peer health monitoring
- Peer list broadcast on join/leave

**Trade-off:** WebSocket requires a persistent server process. For serverless deployment, we'd need to swap to an external signaling service (e.g., PeerJS Cloud, Firebase). Current design is optimized for VPS/container deployment.

## 8. Simulated Sensors vs Real Hardware

**Chosen: Simulated with realistic patterns**

- Diurnal cycle (rush hour spikes at 8-9 AM, 6-7 PM)
- Seasonal variation (sine wave with configurable amplitude)
- Random anomalies (3% chance per reading)
- Noise layer (configurable sigma)

**Trade-off:** No real sensor integration. But the simulation produces data indistinguishable from real Delhi air quality patterns at the API level. The system is designed so swapping in real MQTT/HTTP sensor feeds requires changing only the data source, not the pipeline.

## 9. Single PostgreSQL vs Time-Series DB (TimescaleDB)

**Chosen: Plain PostgreSQL**

- BRIN indexes on `recorded_at` provide adequate time-series performance
- Composite indexes cover the common query patterns
- No additional infrastructure dependency

**Trade-off:** TimescaleDB would give automatic partitioning, compression, and continuous aggregates. For the demo scale (<1M readings), plain PostgreSQL with proper indexing is sufficient. The schema is designed to be TimescaleDB-compatible — adding `SELECT create_hypertable('readings', 'recorded_at')` is a one-line upgrade.

## 10. Monorepo vs Separate Repos

**Chosen: Monorepo with `server/` and `client/` directories**

- Single `git clone` to get everything
- Shared types could be extracted to a `shared/` package
- Root `package.json` orchestrates both via `concurrently`

**Trade-off:** Monorepo architecture simplifies unified development, continuous integration, and streamlined multi-service deployment.
