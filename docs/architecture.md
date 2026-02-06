# EdgeSense — Architecture Document

## System Overview

EdgeSense is a 3-tier architecture: **Edge Nodes** (browser PWAs), **Signaling Layer** (WebSocket), and **Cloud Backend** (REST API + PostgreSQL).

## Data Flow

### 1. Reading Generation

```
Sensor Simulator → Local IndexedDB → P2P Broadcast → Aggregation Buffer
```

### 2. P2P Discovery

```
Browser A → WebSocket Signaling Server ← Browser B
     ↓                                        ↓
  Send Offer ──────────────────────→ Receive Offer
  ←──────────────────────────────── Send Answer
     ↓                                        ↓
  ICE Candidates ←──────────────→ ICE Candidates
     ↓                                        ↓
  RTCDataChannel ◄════════════════► RTCDataChannel
```

### 3. Edge Aggregation

```
Local Readings ─┐
P2P Readings ───┤→ Deduplication → Statistical Aggregation → Spike Detection
                │→ 100 raw readings → 1 aggregated summary
```

### 4. Cloud Sync

```
Aggregated Summary ──→ Sync Queue (priority ordered) ──→ Batch Upload
                                                            ↓
                                                      POST /api/sync/upload
                                                            ↓
                                                      Server Sync Engine
                                                            ↓
                                                      PostgreSQL
```

## Key Design Decisions

### Why WebRTC over WebSocket for P2P?

- **Direct browser-to-browser** — no server relay for data
- **Lower latency** — no server hop
- **Bandwidth efficient** — data stays local when possible
- **Scales horizontally** — mesh network, not star topology

### Why IndexedDB over localStorage?

- **Structured data** with indexes
- **Async API** — doesn't block main thread
- **Larger storage** — typically 50% of disk space
- **Transaction support** — ACID guarantees in-browser

### Why Pure SQL over Prisma/Sequelize?

- **Full control** over query optimization
- **Batch operations** with exact SQL
- **Upsert logic** with ON CONFLICT
- **Interview signal** — demonstrates real SQL knowledge
- **No abstraction leaks** — what you write is what runs

### Why PostgreSQL over MongoDB?

- **Time-series indexing** — BRIN indexes, composite B-tree
- **ACID transactions** — critical for sync conflict resolution
- **Spatial queries** — Haversine in SQL, PostGIS-ready
- **Standard SQL** — portable, well-understood

## Component Responsibilities

| Component          | Responsibility                       | Runs On |
| ------------------ | ------------------------------------ | ------- |
| Sensor Simulator   | Generate realistic air quality data  | Browser |
| P2P Mesh Manager   | WebRTC connection lifecycle          | Browser |
| Edge Aggregator    | Statistical fusion + spike detection | Browser |
| IndexedDB Store    | Offline persistence + sync tracking  | Browser |
| Cloud Sync Manager | Adaptive upload + retry logic        | Browser |
| REST API           | CRUD operations for all entities     | Server  |
| Sync Engine        | Process sync queue + deduplication   | Server  |
| Aggregation Engine | Periodic SQL-based aggregation       | Server  |
| Signaling Server   | WebRTC peer discovery + relay        | Server  |

## Failure Modes

| Failure          | Handling                                     |
| ---------------- | -------------------------------------------- |
| Server down      | Edge nodes continue locally, P2P still works |
| Internet outage  | Full offline operation via IndexedDB         |
| Peer disconnects | Mesh self-heals, other peers unaffected      |
| Database failure | API returns errors, edge nodes buffer data   |
| Sync failure     | Exponential backoff retry with max attempts  |
| Anomalous data   | Quality score reduction, flagged as anomaly  |
