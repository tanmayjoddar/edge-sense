import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../api/client";
import {
  createSimulator,
  startSimulator,
  stopSimulator,
  generateReading,
  isRunning,
} from "../sensors/simulator";
import {
  storeReading,
  getUnsyncedCount,
  getReadingCount,
  getStorageStats,
} from "../offline/db";
import {
  startSync,
  stopSync,
  getNetworkQuality,
  forceSync,
} from "../offline/sync";
import {
  initP2P,
  broadcastReading,
  getConnectedPeerIds,
  destroyP2P,
  getPeerCount,
} from "../p2p/mesh";
import {
  addReading,
  aggregate,
  getBufferSize,
  resetAggregationWindow,
} from "../p2p/aggregation";
import { v4 as uuidv4 } from "uuid";

// ─── Sensor ID (persisted in localStorage) ──────────────────
function getSensorId(): string {
  let id = localStorage.getItem("edgesense_sensor_id");
  if (!id) {
    id = uuidv4();
    localStorage.setItem("edgesense_sensor_id", id);
  }
  return id;
}

const SENSOR_ID = getSensorId();

export default function App() {
  // State
  const [stats, setStats] = useState<any>(null);
  const [sensors, setSensors] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [recentReadings, setRecentReadings] = useState<any[]>([]);
  const [simulatorActive, setSimulatorActive] = useState(false);
  const [networkQuality, setNetworkQuality] = useState<string>("checking...");
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [localStats, setLocalStats] = useState({
    readings: 0,
    unsynced: 0,
    syncQueue: 0,
    peers: 0,
  });
  const [chartData, setChartData] = useState<number[]>(new Array(60).fill(0));
  const [lastReading, setLastReading] = useState<any>(null);
  const [aggregationResult, setAggregationResult] = useState<any>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "sensors" | "alerts" | "network"
  >("dashboard");

  const chartDataRef = useRef(chartData);
  chartDataRef.current = chartData;

  // ─── Fetch server data ──────────────────────────────────
  const fetchDashboardData = useCallback(async () => {
    try {
      const [statsData, sensorsData, alertsData] = await Promise.all([
        api.stats.system(),
        api.sensors.list(),
        api.alerts.unresolved(),
      ]);
      setStats(statsData);
      setSensors(sensorsData);
      setAlerts(alertsData);
      setError(null);
    } catch (err: any) {
      console.warn("[Dashboard] Failed to fetch data:", err.message);
      setError("Server offline — running in edge-only mode");
    }
  }, []);

  // ─── Initialize ─────────────────────────────────────────
  useEffect(() => {
    // Create sensor simulator
    createSimulator(SENSOR_ID, {
      basePM25: 95,
      baseCO2: 600,
      baseTemp: 28,
      baseHumidity: 55,
      noise: 0.15,
      anomalyChance: 0.05,
    });

    // Start cloud sync
    const apiBase = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "")
      : "";
    startSync({
      serverUrl: apiBase,
      sensorId: SENSOR_ID,
      onSyncComplete: (result) => {
        console.log("[App] Sync complete:", result);
        refreshLocalStats();
      },
      onNetworkChange: (quality) => {
        setNetworkQuality(quality);
      },
    });

    // Init P2P mesh
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const defaultWsUrl =
      window.location.hostname === "localhost"
        ? `${wsProtocol}//${window.location.hostname}:3002`
        : `${wsProtocol}//${window.location.host}`;
    const wsUrl = import.meta.env.VITE_WS_URL || defaultWsUrl;
    initP2P({
      signalingUrl: wsUrl,
      sensorId: SENSOR_ID,
      onReading: (peerId, reading) => {
        console.log(`[P2P] Reading from peer ${peerId}`);
        addReading(reading);
        storeReading({
          ...reading,
          id: uuidv4(),
          source: "p2p_relay",
          synced: false,
          is_anomaly: false,
        });
        refreshLocalStats();
      },
      onPeersChange: (peers) => {
        setConnectedPeers(peers);
      },
    });

    // Fetch initial data
    fetchDashboardData();
    refreshLocalStats();

    // Periodic refresh
    const refreshInterval = setInterval(() => {
      fetchDashboardData();
      refreshLocalStats();
    }, 10000);

    // Online/offline detection
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearInterval(refreshInterval);
      stopSimulator();
      stopSync();
      destroyP2P();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [fetchDashboardData]);

  // ─── Local stats refresh ─────────────────────────────────
  const refreshLocalStats = async () => {
    try {
      const stats = await getStorageStats();
      setLocalStats(stats);
    } catch (err) {
      console.warn("Failed to get local stats");
    }
  };

  // ─── Simulator control ──────────────────────────────────
  const toggleSimulator = () => {
    if (simulatorActive) {
      stopSimulator();
      setSimulatorActive(false);
    } else {
      startSimulator(3000, async (reading) => {
        // Store locally in IndexedDB
        await storeReading({
          ...reading,
          synced: false,
        });

        // Add to aggregation buffer
        addReading({
          sensor_id: reading.sensor_id,
          timestamp: reading.timestamp,
          pm25: reading.pm25,
          pm10: reading.pm10,
          co2: reading.co2,
          temperature: reading.temperature,
          humidity: reading.humidity,
          quality_score: reading.quality_score,
        });

        // Broadcast to P2P peers
        broadcastReading({
          sensor_id: reading.sensor_id,
          timestamp: reading.timestamp,
          pm25: reading.pm25,
          pm10: reading.pm10,
          co2: reading.co2,
          temperature: reading.temperature,
          humidity: reading.humidity,
          quality_score: reading.quality_score,
        });

        // Update chart
        const newChart = [...chartDataRef.current.slice(1), reading.pm25];
        setChartData(newChart);
        setLastReading(reading);
        setRecentReadings((prev) => [reading, ...prev].slice(0, 20));
        refreshLocalStats();
      });
      setSimulatorActive(true);
    }
  };

  // ─── Aggregation ─────────────────────────────────────────
  const runAggregation = () => {
    const result = aggregate();
    setAggregationResult(result);
  };

  // ─── AQI Color Logic ─────────────────────────────────────
  const getAQIColor = (pm25: number): string => {
    if (pm25 <= 50) return "green";
    if (pm25 <= 100) return "yellow";
    return "red";
  };

  const getAQILabel = (pm25: number): string => {
    if (pm25 <= 50) return "Good";
    if (pm25 <= 100) return "Moderate";
    if (pm25 <= 150) return "Unhealthy (SG)";
    if (pm25 <= 200) return "Unhealthy";
    if (pm25 <= 300) return "Very Unhealthy";
    return "Hazardous";
  };

  // ─── Render ──────────────────────────────────────────────
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="header-logo">⬡ EdgeSense</div>
          <div className="header-subtitle">
            P2P Edge Intelligence — Air Quality
          </div>
        </div>
        <div className="header-right">
          <div className="status-badge">
            <span
              className={`status-dot ${isOnline ? "online" : "offline"}`}
            ></span>
            {isOnline ? "Online" : "Offline Mode"}
          </div>
          <div className="status-badge">
            <span
              className={`status-dot ${simulatorActive ? "online" : "offline"}`}
            ></span>
            Net: {networkQuality}
          </div>
          <div className="status-badge">🔗 {connectedPeers.length} peers</div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div
        style={{
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border)",
          padding: "0 24px",
          display: "flex",
          gap: "4px",
        }}
      >
        {(["dashboard", "sensors", "alerts", "network"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "12px 20px",
              background: "transparent",
              border: "none",
              color:
                activeTab === tab ? "var(--accent-blue)" : "var(--text-muted)",
              borderBottom:
                activeTab === tab
                  ? "2px solid var(--accent-blue)"
                  : "2px solid transparent",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: "13px",
              textTransform: "capitalize",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <main className="main">
        {error && (
          <div
            style={{
              background: "rgba(245,158,11,0.1)",
              border: "1px solid var(--accent-yellow)",
              borderRadius: "var(--radius)",
              padding: "12px 16px",
              marginBottom: "16px",
              color: "var(--accent-yellow)",
              fontSize: "13px",
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Simulator Control Panel */}
        <div className="simulator-panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px",
            }}
          >
            <div className="card-title">
              <span className="icon">🎛️</span> Sensor Simulator
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Sensor ID: {SENSOR_ID.substring(0, 8)}...
            </div>
          </div>
          <div className="simulator-controls">
            <button
              className={`btn ${simulatorActive ? "btn-danger" : "btn-primary"}`}
              onClick={toggleSimulator}
            >
              {simulatorActive ? "⏹ Stop Simulator" : "▶ Start Simulator"}
            </button>
            <button className="btn" onClick={runAggregation}>
              📊 Run Edge Aggregation
            </button>
            <button className="btn" onClick={() => forceSync()}>
              ☁️ Force Sync
            </button>
            <div className="simulator-status">
              <span>📦 {localStats.readings} local</span>
              <span>•</span>
              <span>🔄 {localStats.unsynced} unsynced</span>
              <span>•</span>
              <span>📤 {localStats.syncQueue} queued</span>
              <span>•</span>
              <span>📡 {getBufferSize()} in buffer</span>
            </div>
          </div>
        </div>

        {activeTab === "dashboard" && (
          <>
            {/* Stats Grid */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Total Sensors</div>
                <div className="stat-value blue">
                  {stats?.total_sensors ?? sensors.length ?? "—"}
                </div>
                <div className="stat-sub">
                  {stats?.online_sensors ?? "—"} online
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total Readings</div>
                <div className="stat-value green">
                  {stats?.total_readings?.toLocaleString() ?? "—"}
                </div>
                <div className="stat-sub">
                  {stats?.readings_last_hour ?? "—"} last hour
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Active Clusters</div>
                <div className="stat-value purple">
                  {stats?.active_clusters ?? "—"}
                </div>
                <div className="stat-sub">Edge compute groups</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Bandwidth Saved</div>
                <div className="stat-value cyan">
                  {stats?.bandwidth_saved_percent ?? 0}%
                </div>
                <div className="stat-sub">Via edge aggregation</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Active Alerts</div>
                <div className="stat-value red">
                  {stats?.active_alerts ?? alerts.length ?? "—"}
                </div>
                <div className="stat-sub">Unresolved</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">P2P Peers</div>
                <div className="stat-value green">{connectedPeers.length}</div>
                <div className="stat-sub">Connected nearby</div>
              </div>
            </div>

            {/* Live Chart + Last Reading */}
            <div className="cards-grid">
              <div className="card">
                <div className="card-title">
                  <span className="icon">📈</span> Live PM2.5 (µg/m³)
                </div>
                <div className="chart-container">
                  {chartData.map((val, i) => (
                    <div
                      key={i}
                      className={`chart-bar ${getAQIColor(val)}`}
                      style={{ height: `${Math.min(100, (val / 300) * 100)}%` }}
                    />
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: "var(--text-muted)",
                  }}
                >
                  <span>3 min ago</span>
                  <span>Now</span>
                </div>
              </div>

              <div className="card">
                <div className="card-title">
                  <span className="icon">🌡️</span> Latest Reading
                </div>
                {lastReading ? (
                  <div>
                    <div className="metric-bar">
                      <div className="metric-bar-header">
                        <span className="metric-bar-label">PM2.5</span>
                        <span
                          className="metric-bar-value"
                          style={{
                            color: `var(--accent-${getAQIColor(lastReading.pm25)})`,
                          }}
                        >
                          {lastReading.pm25.toFixed(1)} µg/m³ —{" "}
                          {getAQILabel(lastReading.pm25)}
                        </span>
                      </div>
                      <div className="metric-bar-track">
                        <div
                          className={`metric-bar-fill ${getAQIColor(lastReading.pm25)}`}
                          style={{
                            width: `${Math.min(100, (lastReading.pm25 / 300) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="metric-bar">
                      <div className="metric-bar-header">
                        <span className="metric-bar-label">PM10</span>
                        <span className="metric-bar-value">
                          {lastReading.pm10.toFixed(1)} µg/m³
                        </span>
                      </div>
                      <div className="metric-bar-track">
                        <div
                          className={`metric-bar-fill ${getAQIColor(lastReading.pm10 / 2)}`}
                          style={{
                            width: `${Math.min(100, (lastReading.pm10 / 500) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="metric-bar">
                      <div className="metric-bar-header">
                        <span className="metric-bar-label">CO₂</span>
                        <span className="metric-bar-value">
                          {lastReading.co2.toFixed(0)} ppm
                        </span>
                      </div>
                      <div className="metric-bar-track">
                        <div
                          className={`metric-bar-fill ${lastReading.co2 > 1000 ? "red" : lastReading.co2 > 700 ? "yellow" : "green"}`}
                          style={{
                            width: `${Math.min(100, (lastReading.co2 / 1500) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "16px",
                        marginTop: "12px",
                        fontSize: "13px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span>🌡 {lastReading.temperature.toFixed(1)}°C</span>
                      <span>💧 {lastReading.humidity.toFixed(1)}%</span>
                      <span>📊 Q: {lastReading.quality_score.toFixed(2)}</span>
                      {lastReading.is_anomaly && (
                        <span style={{ color: "var(--accent-red)" }}>
                          ⚠️ ANOMALY
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                    Start the simulator to see live readings
                  </div>
                )}
              </div>
            </div>

            {/* Aggregation Result */}
            {aggregationResult && (
              <div className="section" style={{ marginTop: "16px" }}>
                <div className="card">
                  <div className="card-title">
                    <span className="icon">🧠</span> Edge Aggregation Result
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: "12px",
                      fontSize: "13px",
                    }}
                  >
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>
                        Sensors:
                      </span>{" "}
                      {aggregationResult.sensor_count}
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>
                        Readings:
                      </span>{" "}
                      {aggregationResult.reading_count}
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>
                        Confidence:
                      </span>{" "}
                      {(aggregationResult.confidence * 100).toFixed(1)}%
                    </div>
                    {aggregationResult.pm25 && (
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>
                          PM2.5 Mean:
                        </span>{" "}
                        <strong>{aggregationResult.pm25.mean}</strong> µg/m³
                      </div>
                    )}
                    {aggregationResult.co2 && (
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>
                          CO₂ Mean:
                        </span>{" "}
                        <strong>{aggregationResult.co2.mean}</strong> ppm
                      </div>
                    )}
                    {aggregationResult.has_spike && (
                      <div
                        style={{ color: "var(--accent-red)", fontWeight: 700 }}
                      >
                        🚨 SPIKE DETECTED: {aggregationResult.spike_metric}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Recent Readings Table */}
            {recentReadings.length > 0 && (
              <div className="section" style={{ marginTop: "16px" }}>
                <div className="section-header">
                  <h2 className="section-title">Recent Readings</h2>
                </div>
                <div className="card" style={{ overflowX: "auto" }}>
                  <table className="readings-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>PM2.5</th>
                        <th>PM10</th>
                        <th>CO₂</th>
                        <th>Temp</th>
                        <th>Humidity</th>
                        <th>Quality</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentReadings.map((r, i) => (
                        <tr key={i}>
                          <td>{new Date(r.timestamp).toLocaleTimeString()}</td>
                          <td className={`value-${getAQIColor(r.pm25)}`}>
                            {r.pm25.toFixed(1)}
                          </td>
                          <td>{r.pm10.toFixed(1)}</td>
                          <td className={r.co2 > 1000 ? "value-high" : ""}>
                            {r.co2.toFixed(0)}
                          </td>
                          <td>{r.temperature.toFixed(1)}°C</td>
                          <td>{r.humidity.toFixed(1)}%</td>
                          <td>{r.quality_score.toFixed(2)}</td>
                          <td className={r.is_anomaly ? "anomaly" : ""}>
                            {r.is_anomaly ? "⚠️ Anomaly" : "✓ Normal"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === "sensors" && (
          <div className="section">
            <div className="section-header">
              <h2 className="section-title">
                Registered Sensors ({sensors.length})
              </h2>
            </div>
            <div className="cards-grid">
              {sensors.map((sensor) => (
                <div className="card" key={sensor.id}>
                  <div className="card-title">
                    <span className="icon">📡</span>
                    {sensor.name}
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "var(--text-secondary)",
                      lineHeight: "1.8",
                    }}
                  >
                    <div>
                      <strong>Status:</strong>{" "}
                      <span
                        style={{
                          color:
                            sensor.status === "online"
                              ? "var(--accent-green)"
                              : "var(--accent-red)",
                        }}
                      >
                        {sensor.status}
                      </span>
                    </div>
                    <div>
                      <strong>Location:</strong> {sensor.latitude.toFixed(4)},{" "}
                      {sensor.longitude.toFixed(4)}
                    </div>
                    <div>
                      <strong>Firmware:</strong> {sensor.firmware_version}
                    </div>
                    <div>
                      <strong>Capabilities:</strong>{" "}
                      {sensor.capabilities?.join(", ")}
                    </div>
                    <div>
                      <strong>Last Seen:</strong>{" "}
                      {new Date(sensor.last_seen_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
              {sensors.length === 0 && (
                <div
                  style={{
                    color: "var(--text-muted)",
                    padding: "40px",
                    textAlign: "center",
                  }}
                >
                  No sensors registered. Start the simulator or connect a
                  device.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "alerts" && (
          <div className="section">
            <div className="section-header">
              <h2 className="section-title">Active Alerts ({alerts.length})</h2>
            </div>
            {alerts.map((alert) => (
              <div className="alert-item" key={alert.id}>
                <div className={`alert-icon ${alert.severity}`}>
                  {alert.severity === "critical"
                    ? "🔴"
                    : alert.severity === "warning"
                      ? "🟡"
                      : "ℹ️"}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="alert-title">{alert.title}</div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      marginBottom: "4px",
                    }}
                  >
                    {alert.description}
                  </div>
                  <div className="alert-time">
                    {new Date(alert.triggered_at).toLocaleString()} •{" "}
                    {alert.metric_name}:{" "}
                    {alert.metric_value?.toFixed?.(1) ?? alert.metric_value}
                  </div>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={async () => {
                    await api.alerts.resolve(alert.id);
                    fetchDashboardData();
                  }}
                >
                  Resolve
                </button>
              </div>
            ))}
            {alerts.length === 0 && (
              <div
                style={{
                  color: "var(--text-muted)",
                  padding: "40px",
                  textAlign: "center",
                }}
              >
                ✅ No active alerts. All clear!
              </div>
            )}
          </div>
        )}

        {activeTab === "network" && (
          <div className="section">
            <div className="section-header">
              <h2 className="section-title">P2P Network Status</h2>
            </div>
            <div className="cards-grid">
              <div className="card">
                <div className="card-title">
                  <span className="icon">🌐</span> Connection Info
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    lineHeight: "2",
                  }}
                >
                  <div>
                    <strong>Network Quality:</strong>{" "}
                    <span
                      style={{
                        color:
                          networkQuality === "offline"
                            ? "var(--accent-red)"
                            : "var(--accent-green)",
                      }}
                    >
                      {networkQuality}
                    </span>
                  </div>
                  <div>
                    <strong>Online Status:</strong>{" "}
                    {isOnline ? "✅ Connected" : "❌ Offline"}
                  </div>
                  <div>
                    <strong>Sensor ID:</strong> {SENSOR_ID.substring(0, 12)}...
                  </div>
                  <div>
                    <strong>Connected Peers:</strong> {connectedPeers.length}
                  </div>
                  <div>
                    <strong>Local Readings:</strong> {localStats.readings}
                  </div>
                  <div>
                    <strong>Unsynced:</strong> {localStats.unsynced}
                  </div>
                  <div>
                    <strong>Sync Queue:</strong> {localStats.syncQueue}
                  </div>
                </div>
              </div>
              <div className="card">
                <div className="card-title">
                  <span className="icon">🔗</span> Peer Mesh
                </div>
                <div className="peer-grid">
                  <div className="peer-node self">You</div>
                  {connectedPeers.map((peer) => (
                    <div className="peer-node connected" key={peer}>
                      {peer.substring(0, 4)}
                    </div>
                  ))}
                </div>
                {connectedPeers.length === 0 && (
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "13px",
                      marginTop: "12px",
                    }}
                  >
                    No peers connected. Open this app in another browser tab to
                    simulate P2P.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: "16px 24px",
          borderTop: "1px solid var(--border)",
          textAlign: "center",
          fontSize: "12px",
          color: "var(--text-muted)",
        }}
      >
        EdgeSense v1.0.0 — Offline-First P2P Edge Intelligence for Air-Quality
        Monitoring
      </footer>
    </div>
  );
}
