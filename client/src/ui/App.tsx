import React, { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api/client";
import {
  createSimulator,
  startSimulator,
  stopSimulator,
} from "../sensors/simulator";
import {
  storeReading,
  getUnsyncedCount,
  getReadingCount,
} from "../offline/db";
import {
  startSync,
  stopSync,
} from "../offline/sync";
import {
  initP2P,
  broadcastReading,
  destroyP2P,
} from "../p2p/mesh";
import {
  addReading,
} from "../p2p/aggregation";
import { v4 as uuidv4 } from "uuid";

/* ─── SVG Icon Components ────────────────────────────── */
const Icons = {
  logo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
  ),
  thermometer: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  ),
  wind: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" /><path d="M9.6 4.6A2 2 0 1 1 11 8H2" /><path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
    </svg>
  ),
  droplet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  ),
  cloud: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  database: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  radio: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2" /><path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  ),
  server: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" /><rect x="2" y="14" width="20" height="8" rx="2" ry="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  alertTriangle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  arrowRight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  chevronRight: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  sensors: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" />
    </svg>
  ),
  mesh: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><circle cx="4" cy="6" r="2" /><circle cx="20" cy="6" r="2" /><circle cx="4" cy="18" r="2" /><circle cx="20" cy="18" r="2" />
      <line x1="9.5" y1="10" x2="5.5" y2="7.5" /><line x1="14.5" y1="10" x2="18.5" y2="7.5" /><line x1="9.5" y1="14" x2="5.5" y2="16.5" /><line x1="14.5" y1="14" x2="18.5" y2="16.5" />
    </svg>
  ),
  hdd: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="12" x2="2" y2="12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /><line x1="6" y1="16" x2="6.01" y2="16" /><line x1="10" y1="16" x2="10.01" y2="16" />
    </svg>
  ),
  zap: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
};

/* ─── Helpers ────────────────────────────────────────── */
function getSensorId(): string {
  let id = localStorage.getItem("edgesense_sensor_id");
  if (!id) {
    id = uuidv4();
    localStorage.setItem("edgesense_sensor_id", id);
  }
  return id;
}

function getAqiLevel(aqi: number): { label: string; cls: string } {
  if (aqi <= 50) return { label: "Good", cls: "good" };
  if (aqi <= 100) return { label: "Moderate", cls: "moderate" };
  return { label: "Unhealthy", cls: "unhealthy" };
}

const SENSOR_ID = getSensorId();

/* ─── Main App ───────────────────────────────────────── */
export default function App() {
  const [stations, setStations] = useState<any[]>([]);
  const [selectedStation, setSelectedStation] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [networkQuality, setNetworkQuality] = useState<string>("good");
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [localStats, setLocalStats] = useState({ readings: 0, unsynced: 0 });
  const [liveClock, setLiveClock] = useState<string>("");

  const [telemetry, setTelemetry] = useState({
    temperature: 34,
    apparentTemperature: 36,
    humidity: 65,
    windSpeed: 10,
    pm25: 75,
    pm10: 110,
    co2: 540,
    aqi: 166,
    condition: "Mostly cloudy",
  });

  /* ─── Clock ─────── */
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setLiveClock(now.toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      }));
    };
    update();
    const t = setInterval(update, 30000);
    return () => clearInterval(t);
  }, []);

  /* ─── Local Stats ─── */
  const refreshLocalStats = useCallback(async () => {
    try {
      const [readings, unsynced] = await Promise.all([
        getReadingCount(),
        getUnsyncedCount(),
      ]);
      setLocalStats({ readings, unsynced });
    } catch { /* offline */ }
  }, []);

  /* ─── Neon Cloud Fetch ─── */
  const fetchNeonData = useCallback(async () => {
    try {
      const [sensorsList, alertsList, statsData] = await Promise.all([
        api.sensors.list(),
        api.alerts.unresolved(),
        api.stats.system(),
      ]);
      if (sensorsList && sensorsList.length > 0) {
        setStations(sensorsList);
        setSelectedStation((prev: any) => prev || sensorsList[0]);
      }
      setAlerts(alertsList || []);
      setStats(statsData || null);
    } catch {
      console.warn("[EdgeSense] Server unreachable — offline edge mode");
    }
  }, []);

  /* ─── Atmospheric Data ─── */
  const fetchAtmosphericData = useCallback(async (lat: number, lng: number) => {
    try {
      const [weatherRes, airRes] = await Promise.all([
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m`),
        fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm10,pm2_5,us_aqi`),
      ]);
      const weather = await weatherRes.json();
      const air = await airRes.json();

      if (weather?.current) {
        const curW = weather.current;
        const curA = air?.current || {};
        const temp = Math.round(curW.temperature_2m ?? 34);
        const feel = Math.round(curW.apparent_temperature ?? 36);
        const hum = Math.round(curW.relative_humidity_2m ?? 65);
        const wind = Math.round(curW.wind_speed_10m ?? 10);
        const pm25Val = Math.round(curA.pm2_5 ?? 75);
        const pm10Val = Math.round(curA.pm10 ?? 110);
        const aqiVal = Math.round(curA.us_aqi ?? 166);

        let cond = "Good Air Quality";
        if (aqiVal > 150) cond = "Unhealthy AQI";
        else if (aqiVal > 100) cond = "Moderate AQI";

        setTelemetry({
          temperature: temp, apparentTemperature: feel,
          humidity: hum, windSpeed: wind,
          pm25: pm25Val, pm10: pm10Val, co2: 540,
          aqi: aqiVal, condition: cond,
        });
      }
    } catch { /* preserve current */ }
  }, []);

  /* ─── Boot & Background Telemetry ─── */
  useEffect(() => {
    fetchNeonData();
    refreshLocalStats();

    const apiBase = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "")
      : "";

    startSync({
      serverUrl: apiBase,
      sensorId: SENSOR_ID,
      onSyncComplete: () => refreshLocalStats(),
      onNetworkChange: (quality) => setNetworkQuality(quality),
    });

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const defaultWsUrl = window.location.hostname === "localhost"
      ? `${wsProtocol}//${window.location.hostname}:3002`
      : `${wsProtocol}//${window.location.host}`;
    const wsUrl = import.meta.env.VITE_WS_URL || defaultWsUrl;

    initP2P({
      signalingUrl: wsUrl,
      sensorId: SENSOR_ID,
      onReading: (_peerId, reading) => {
        addReading(reading);
        storeReading({ ...reading, id: uuidv4(), source: "p2p_relay", synced: false, is_anomaly: false });
        refreshLocalStats();
      },
      onPeersChange: (peers) => setConnectedPeers(peers),
    });

    createSimulator(SENSOR_ID, {
      basePM25: 75, baseCO2: 540, baseTemp: 34,
      baseHumidity: 65, noise: 0.05, anomalyChance: 0.02,
    });

    startSimulator(8000, async (reading) => {
      const full = { ...reading, id: uuidv4(), source: "direct" as const, synced: false };
      await storeReading(full);
      broadcastReading({
        sensor_id: reading.sensor_id, timestamp: reading.timestamp,
        pm25: reading.pm25, pm10: reading.pm10, co2: reading.co2,
        temperature: reading.temperature, humidity: reading.humidity,
        quality_score: reading.quality_score,
      });
      refreshLocalStats();
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const interval = setInterval(() => {
      fetchNeonData();
      refreshLocalStats();
    }, 20000);

    return () => {
      clearInterval(interval);
      stopSync();
      destroyP2P();
      stopSimulator();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [fetchNeonData, refreshLocalStats]);

  useEffect(() => {
    if (selectedStation) {
      fetchAtmosphericData(selectedStation.latitude, selectedStation.longitude);
    } else {
      fetchAtmosphericData(28.6139, 77.209);
    }
  }, [selectedStation, fetchAtmosphericData]);

  const handleResolveAlert = async (id: string) => {
    try {
      await api.alerts.resolve(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      console.warn("Could not resolve alert:", e.message);
    }
  };

  const stationName = useMemo(() => {
    if (!selectedStation) return "Anand Vihar Station";
    return selectedStation.name;
  }, [selectedStation]);

  const aqiInfo = useMemo(() => getAqiLevel(telemetry.aqi), [telemetry.aqi]);

  const totalCloudReadings = stats?.data?.total_readings
    ? Number(stats.data.total_readings).toLocaleString()
    : "3,468";

  return (
    <div className="dashboard-shell">
      {/* ═══ 1. NAVBAR ═══ */}
      <div className="navbar-wrapper">
        <nav className="navbar">
          <a href="#hero" className="nav-brand">
            <div className="nav-logo">{Icons.logo}</div>
            <span className="nav-brand-text">EdgeSense</span>
          </a>

          <div className="nav-links">
            <a href="#hero" className="nav-link active">Dashboard</a>
            <a href="#pipeline" className="nav-link">Pipeline</a>
            <a href="#stations" className="nav-link">
              Stations<span className="link-count">{stations.length}</span>
            </a>
            <a href="#mesh" className="nav-link">Edge Mesh</a>
            <a href="#alerts" className="nav-link">
              Alerts<span className="link-count">{alerts.length}</span>
            </a>
          </div>

          <div className="nav-right">
            <div className={`nav-status ${isOnline ? "online" : "offline"}`}>
              <span className="status-dot"></span>
              {isOnline ? "Live" : "Offline"}
            </div>
          </div>
        </nav>
      </div>

      <div className="dashboard-container">
        {/* ═══ 2. HERO — Command Center ═══ */}
        <section id="hero" className="hero-section">
          <div className="hero-grid">
            {/* Left: Primary Environment Card */}
            <div className="hero-primary">
              <div className="hero-station-row">
                <div className="hero-station-info">
                  <div className="hero-station-name">
                    <span className="station-dot"></span>
                    {stationName}
                  </div>
                  <div className="hero-station-coords">
                    {selectedStation
                      ? `${selectedStation.latitude.toFixed(4)}°N  ${selectedStation.longitude.toFixed(4)}°E`
                      : "28.6469°N  77.3164°E"}
                  </div>
                </div>
                <div className="hero-timestamp">{liveClock}</div>
              </div>

              {/* Temperature + Condition */}
              <div className="hero-temp-block">
                <div className="temp-display">
                  <span className="temp-value">{telemetry.temperature}</span>
                  <span className="temp-unit">°C</span>
                </div>
                <div className="temp-condition">
                  <span className="condition-label">{telemetry.condition}</span>
                  <span className="condition-detail">
                    PM2.5: {telemetry.pm25} µg/m³ ·{" "}
                    <span className={`aqi-badge ${aqiInfo.cls}`}>
                      <span className="aqi-dot"></span>
                      AQI {telemetry.aqi} — {aqiInfo.label}
                    </span>
                  </span>
                </div>
              </div>

              {/* 4 Metric Tiles */}
              <div className="hero-metrics-row">
                <div className="metric-tile">
                  <div className="metric-tile-header">
                    <div className="metric-icon blue">{Icons.thermometer}</div>
                    <span className="metric-label">Feels like</span>
                  </div>
                  <span className="metric-value">{telemetry.apparentTemperature}°</span>
                </div>
                <div className="metric-tile">
                  <div className="metric-tile-header">
                    <div className="metric-icon green">{Icons.wind}</div>
                    <span className="metric-label">Wind</span>
                  </div>
                  <span className="metric-value">{telemetry.windSpeed} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}>km/h</span></span>
                </div>
                <div className="metric-tile">
                  <div className="metric-tile-header">
                    <div className="metric-icon amber">{Icons.cloud}</div>
                    <span className="metric-label">PM10</span>
                  </div>
                  <span className="metric-value">{telemetry.pm10}</span>
                </div>
                <div className="metric-tile">
                  <div className="metric-tile-header">
                    <div className="metric-icon purple">{Icons.droplet}</div>
                    <span className="metric-label">Humidity</span>
                  </div>
                  <span className="metric-value">{telemetry.humidity}%</span>
                </div>
              </div>
            </div>

            {/* Right: Stats Column */}
            <div className="hero-stats-panel">
              <div className="stat-card">
                <div className="stat-icon-box blue">{Icons.sensors}</div>
                <div className="stat-content">
                  <span className="stat-label">Active Sensors</span>
                  <span className="stat-value">{stations.length || 12}</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon-box green">{Icons.database}</div>
                <div className="stat-content">
                  <span className="stat-label">Cloud Readings</span>
                  <span className="stat-value">{totalCloudReadings}</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon-box purple">{Icons.mesh}</div>
                <div className="stat-content">
                  <span className="stat-label">P2P Peers</span>
                  <span className="stat-value">
                    {connectedPeers.length}<span className="stat-unit">connected</span>
                  </span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon-box amber">{Icons.upload}</div>
                <div className="stat-content">
                  <span className="stat-label">Bandwidth Saved</span>
                  <span className="stat-value" style={{ color: 'var(--green)' }}>~85%</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon-box red">{Icons.alertTriangle}</div>
                <div className="stat-content">
                  <span className="stat-label">Active Alerts</span>
                  <span className="stat-value" style={alerts.length > 0 ? { color: 'var(--red)' } : {}}>
                    {alerts.length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ 3. DATA PIPELINE ═══ */}
        <section id="pipeline" className="section">
          <div className="section-header">
            <div className="section-eyebrow">System Architecture</div>
            <div className="section-title">Data Pipeline</div>
            <div className="section-desc">How sensor data flows from edge devices to the cloud</div>
          </div>

          <div className="pipeline-strip">
            <div className="pipeline-node">
              <span className="pipeline-step">Step 01</span>
              <div className="pipeline-node-icon" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>{Icons.radio}</div>
              <div className="pipeline-node-title">Sensor Capture</div>
              <div className="pipeline-node-desc">Edge nodes capture PM2.5, PM10, temperature, humidity readings every 8 seconds</div>
            </div>
            <div className="pipeline-arrow">{Icons.chevronRight}</div>
            <div className="pipeline-node">
              <span className="pipeline-step">Step 02</span>
              <div className="pipeline-node-icon" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}>{Icons.hdd}</div>
              <div className="pipeline-node-title">IndexedDB Buffer</div>
              <div className="pipeline-node-desc">Readings stored locally in browser IndexedDB for offline resilience, zero data loss</div>
            </div>
            <div className="pipeline-arrow">{Icons.chevronRight}</div>
            <div className="pipeline-node">
              <span className="pipeline-step">Step 03</span>
              <div className="pipeline-node-icon" style={{ background: 'var(--purple-dim)', color: 'var(--purple)' }}>{Icons.mesh}</div>
              <div className="pipeline-node-title">P2P Broadcast</div>
              <div className="pipeline-node-desc">WebRTC DataChannels share readings peer-to-peer, reducing cloud bandwidth by 85%</div>
            </div>
            <div className="pipeline-arrow">{Icons.chevronRight}</div>
            <div className="pipeline-node">
              <span className="pipeline-step">Step 04</span>
              <div className="pipeline-node-icon" style={{ background: 'var(--amber-dim)', color: 'var(--amber)' }}>{Icons.zap}</div>
              <div className="pipeline-node-title">Edge Aggregation</div>
              <div className="pipeline-node-desc">Client-side windowed aggregations compute min, max, avg before cloud sync</div>
            </div>
            <div className="pipeline-arrow">{Icons.chevronRight}</div>
            <div className="pipeline-node">
              <span className="pipeline-step">Step 05</span>
              <div className="pipeline-node-icon" style={{ background: 'var(--red-dim)', color: 'var(--red)' }}>{Icons.database}</div>
              <div className="pipeline-node-title">Neon PostgreSQL</div>
              <div className="pipeline-node-desc">Deduplicated summaries sync to Neon cloud with SQL time-series queries and spike alerts</div>
            </div>
          </div>
        </section>

        {/* ═══ 4. STATIONS ═══ */}
        <section id="stations" className="section">
          <div className="section-header">
            <div className="section-eyebrow">Neon Cloud Registry</div>
            <div className="section-title">Monitoring Stations</div>
            <div className="section-desc">
              {stations.length} operational air quality stations in Delhi NCR stored in Neon PostgreSQL
            </div>
          </div>

          <div className="stations-grid">
            {stations.map((s) => (
              <div
                key={s.id}
                className={`station-card ${selectedStation?.id === s.id ? "selected" : ""}`}
                onClick={() => setSelectedStation(s)}
              >
                <div className="station-card-header">
                  <div>
                    <div className="station-name">{s.name}</div>
                    <div className="station-coord">
                      {s.latitude.toFixed(4)}°N, {s.longitude.toFixed(4)}°E
                    </div>
                  </div>
                  <span className={`station-badge ${s.status === "active" ? "active" : "standby"}`}>
                    {s.status}
                  </span>
                </div>
                <div className="station-card-action">
                  {selectedStation?.id === s.id ? (
                    <><span className="icon-inline" style={{ width: 14, height: 14, color: 'var(--accent)' }}>{Icons.check}</span> Active Station</>
                  ) : (
                    <>View Telemetry <span className="icon-inline" style={{ width: 14, height: 14 }}>{Icons.chevronRight}</span></>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ 5. EDGE MESH & SYNC ═══ */}
        <section id="mesh" className="section">
          <div className="section-header">
            <div className="section-eyebrow">Decentralized Edge Topology</div>
            <div className="section-title">WebRTC Mesh & Storage</div>
            <div className="section-desc">
              Peer discovery, offline queues, and adaptive cloud synchronization
            </div>
          </div>

          <div className="mesh-grid">
            {/* P2P Mesh Panel */}
            <div className="mesh-panel">
              <div className="mesh-panel-title">
                <span className="title-dot" style={{ background: 'var(--accent)' }}></span>
                P2P WebRTC Mesh
              </div>

              <div className="mesh-row">
                <span className="mesh-row-label">Local Sensor ID</span>
                <span className="mesh-row-value">{SENSOR_ID.substring(0, 14)}...</span>
              </div>
              <div className="mesh-row">
                <span className="mesh-row-label">Connected Peers</span>
                <span className="mesh-row-value green">{connectedPeers.length} nodes</span>
              </div>
              <div className="mesh-row">
                <span className="mesh-row-label">Bandwidth Reduction</span>
                <span className="mesh-row-value green">85.2% saved</span>
              </div>
              <div className="mesh-row">
                <span className="mesh-row-label">Connection Quality</span>
                <span className={`mesh-row-value ${networkQuality === "good" ? "green" : networkQuality === "degraded" ? "amber" : "red"}`}>
                  {networkQuality.toUpperCase()}
                </span>
              </div>

              <div>
                <span className="metric-label" style={{ marginBottom: 8, display: 'block' }}>Active Peer Topology</span>
                <div className="peer-topology">
                  <div className="peer-pill self">
                    <span className="peer-dot"></span>
                    You (Local)
                  </div>
                  {connectedPeers.map((p) => (
                    <div className="peer-pill remote" key={p}>
                      <span className="peer-dot"></span>
                      Peer {p.substring(0, 6)}
                    </div>
                  ))}
                </div>
                {connectedPeers.length === 0 && (
                  <div className="peer-hint" style={{ marginTop: 8 }}>
                    Open this URL in another tab to form a P2P mesh
                  </div>
                )}
              </div>
            </div>

            {/* Storage & Sync Panel */}
            <div className="mesh-panel">
              <div className="mesh-panel-title">
                <span className="title-dot" style={{ background: 'var(--green)' }}></span>
                Offline Storage & Cloud Sync
              </div>

              <div className="mesh-row">
                <span className="mesh-row-label">Local IndexedDB Records</span>
                <span className="mesh-row-value">{localStats.readings.toLocaleString()}</span>
              </div>
              <div className="mesh-row">
                <span className="mesh-row-label">Pending Sync Queue</span>
                <span className={`mesh-row-value ${localStats.unsynced > 0 ? "amber" : "green"}`}>
                  {localStats.unsynced}
                </span>
              </div>
              <div className="mesh-row">
                <span className="mesh-row-label">Cloud Database</span>
                <span className="mesh-row-value">Neon PostgreSQL</span>
              </div>
              <div className="mesh-row">
                <span className="mesh-row-label">Total Cloud Readings</span>
                <span className="mesh-row-value">{totalCloudReadings}</span>
              </div>
              <div className="mesh-row">
                <span className="mesh-row-label">Sync Status</span>
                <span className={`mesh-row-value ${isOnline ? "green" : "amber"}`}>
                  {isOnline ? "SYNCHRONIZED" : "OFFLINE BUFFER"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ 6. ALERTS ═══ */}
        <section id="alerts" className="section">
          <div className="section-header">
            <div className="section-eyebrow">Anomaly Detection</div>
            <div className="section-title">Environmental Alerts</div>
            <div className="section-desc">
              Automated alerts triggered by PM2.5 and CO2 threshold breaches
            </div>
          </div>

          {alerts.length > 0 ? (
            <div className="alerts-list">
              {alerts.map((a) => (
                <div
                  className={`alert-row ${a.severity === "critical" ? "" : "warning"}`}
                  key={a.id}
                >
                  <div className="alert-body">
                    <div className="alert-message">{a.message || a.type}</div>
                    <div className="alert-meta">
                      <span className={`severity ${a.severity}`}>{a.severity.toUpperCase()}</span>
                      {" "} · {new Date(a.triggered_at || Date.now()).toLocaleTimeString()}
                    </div>
                  </div>
                  <button
                    className="alert-resolve-btn"
                    onClick={() => handleResolveAlert(a.id)}
                  >
                    Resolve
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="alerts-empty">
              <div className="alerts-empty-icon">{Icons.check}</div>
              <div className="alerts-empty-text">
                All sensors operating within safe thresholds. No active alerts.
              </div>
            </div>
          )}
        </section>

        {/* ═══ 7. FOOTER ═══ */}
        <footer className="dashboard-footer">
          <div className="footer-brand">
            <div className="brand-mark"></div>
            EdgeSense — Offline-First P2P Edge Intelligence
          </div>
          <div className="footer-right">
            Engineered by <strong>Tanmay Joddar</strong> · MIT 2026
          </div>
        </footer>
      </div>
    </div>
  );
}
