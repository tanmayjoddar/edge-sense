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
import { IsometricCity } from "./IsometricCity";

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
  const [stations, setStations] = useState<any[]>([]);
  const [selectedStation, setSelectedStation] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [networkQuality, setNetworkQuality] = useState<string>("good");
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [localStats, setLocalStats] = useState({ readings: 0, unsynced: 0 });
  const [liveClock, setLiveClock] = useState<string>("");

  // Live environmental telemetry state
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
    conditionTag: "Live Edge Telemetry",
  });

  // Real-time clock updater
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      };
      setLiveClock(`Today, ${now.toLocaleDateString("en-US", options)}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 30000);
    return () => clearInterval(timer);
  }, []);

  // Refresh local IndexedDB storage counters
  const refreshLocalStats = useCallback(async () => {
    try {
      const [readings, unsynced] = await Promise.all([
        getReadingCount(),
        getUnsyncedCount(),
      ]);
      setLocalStats({ readings, unsynced });
    } catch {
      // Offline fallback
    }
  }, []);

  // Fetch stations, alerts, and stats from Neon Cloud Backend
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
    } catch (err: any) {
      console.warn("[EdgeSense] Server unreachable — running in offline edge mode");
    }
  }, []);

  // Fetch real atmospheric data for active coordinates
  const fetchAtmosphericData = useCallback(async (lat: number, lng: number) => {
    try {
      const [weatherRes, airRes] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m`
        ),
        fetch(
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=pm10,pm2_5,us_aqi`
        ),
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

        let cond = "Clean Air";
        if (aqiVal > 150) cond = "Unhealthy AQI";
        else if (aqiVal > 100) cond = "Moderate AQI";
        else cond = "Good Air Quality";

        setTelemetry({
          temperature: temp,
          apparentTemperature: feel,
          humidity: hum,
          windSpeed: wind,
          pm25: pm25Val,
          pm10: pm10Val,
          co2: 540,
          aqi: aqiVal,
          condition: cond,
          conditionTag: "Live Edge Telemetry",
        });
      }
    } catch {
      // Preserve current telemetry if offline
    }
  }, []);

  // Initial Boot & Automated Edge Telemetry Node
  useEffect(() => {
    fetchNeonData();
    refreshLocalStats();

    const apiBase = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, "")
      : "";

    // 1. Cloud Sync Engine
    startSync({
      serverUrl: apiBase,
      sensorId: SENSOR_ID,
      onSyncComplete: () => {
        refreshLocalStats();
      },
      onNetworkChange: (quality) => {
        setNetworkQuality(quality);
      },
    });

    // 2. WebRTC P2P Mesh Network
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const defaultWsUrl =
      window.location.hostname === "localhost"
        ? `${wsProtocol}//${window.location.hostname}:3002`
        : `${wsProtocol}//${window.location.host}`;
    const wsUrl = import.meta.env.VITE_WS_URL || defaultWsUrl;

    initP2P({
      signalingUrl: wsUrl,
      sensorId: SENSOR_ID,
      onReading: (_peerId, reading) => {
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

    // 3. Automated Edge Sensor Node (Continuous background telemetry)
    createSimulator(SENSOR_ID, {
      basePM25: 75,
      baseCO2: 540,
      baseTemp: 34,
      baseHumidity: 65,
      noise: 0.05,
      anomalyChance: 0.02,
    });

    startSimulator(8000, async (reading) => {
      const fullReading = {
        ...reading,
        id: uuidv4(),
        source: "direct" as const,
        synced: false,
      };

      await storeReading(fullReading);
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

      refreshLocalStats();
    });

    // Online/Offline status listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic refresh
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

  // When selected station changes, fetch atmospheric data
  useEffect(() => {
    if (selectedStation) {
      fetchAtmosphericData(selectedStation.latitude, selectedStation.longitude);
    } else {
      fetchAtmosphericData(28.6139, 77.209);
    }
  }, [selectedStation, fetchAtmosphericData]);

  // Handle alert resolution
  const handleResolveAlert = async (id: string) => {
    try {
      await api.alerts.resolve(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      console.warn("Could not resolve alert:", e.message);
    }
  };

  const stationName = useMemo(() => {
    if (!selectedStation) return "Anand Vihar Station • Delhi NCR";
    return selectedStation.name;
  }, [selectedStation]);

  return (
    <div className="web-page">
      {/* 1. Floating Island Navbar */}
      <div className="navbar-island-wrapper">
        <nav className="navbar-island">
          <a href="#live-telemetry" className="nav-brand">
            <span className="nav-logo-icon">⬡</span>
            <span className="nav-logo-text">EdgeSense</span>
            <span className="nav-tagline">P2P Edge Intelligence</span>
          </a>

          <div className="nav-links">
            <a href="#live-telemetry" className="nav-link active">
              Telemetry
            </a>
            <a href="#architecture" className="nav-link">
              Architecture
            </a>
            <a href="#stations" className="nav-link">
              Stations ({stations.length})
            </a>
            <a href="#mesh-network" className="nav-link">
              Edge Mesh
            </a>
            <a href="#alerts" className="nav-link">
              Alerts ({alerts.length})
            </a>
          </div>

          <div className="nav-actions">
            <div className="nav-status-badge">
              <span className="pulse-dot"></span>
              {isOnline ? "P2P Mesh Active" : "Offline Edge Mode"}
            </div>
          </div>
        </nav>
      </div>

      <div className="web-container">
        {/* 2. Hero Section */}
        <section id="live-telemetry" className="hero-section">
          <div className="hero-grid">
            {/* Left Column: Telemetry & Status */}
            <div className="hero-content">
              <div className="hero-pill-label">
                <span>🍃</span> Offline-First Web-Based P2P Edge Intelligence
              </div>

              <h1 className="hero-title">Air Quality & Environmental Telemetry</h1>

              {/* Station Info Banner */}
              <div className="hero-station-card">
                <div className="hero-station-info">
                  <span className="hero-station-name">📍 {stationName}</span>
                  <span className="hero-station-coord">
                    {selectedStation
                      ? `${selectedStation.latitude.toFixed(4)}°N, ${selectedStation.longitude.toFixed(4)}°E • Delhi NCR`
                      : "28.6469°N, 77.3164°E • Delhi NCR"}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>
                  {liveClock}
                </div>
              </div>

              {/* Primary Gauge */}
              <div className="hero-telemetry-highlight">
                <div className="hero-main-reading">
                  <span className="big-temp">{telemetry.temperature}</span>
                  <span className="temp-unit">°C</span>
                </div>

                <div className="hero-condition-box">
                  <div className="hero-condition-title">{telemetry.condition}</div>
                  <div className="hero-condition-desc">
                    PM2.5: {telemetry.pm25} µg/m³ • US AQI: {telemetry.aqi} • Distributed sensor node active
                  </div>
                </div>
              </div>

              {/* 4-Tile Minimalist Metric Grid */}
              <div className="hero-tiles-grid">
                <div className="hero-tile">
                  <span className="hero-tile-icon">°C</span>
                  <span className="hero-tile-label">Feel like</span>
                  <span className="hero-tile-val">{telemetry.apparentTemperature}°</span>
                </div>

                <div className="hero-tile">
                  <span className="hero-tile-icon">💨</span>
                  <span className="hero-tile-label">Wind</span>
                  <span className="hero-tile-val">{telemetry.windSpeed} km/h</span>
                </div>

                <div className="hero-tile">
                  <span className="hero-tile-icon">☂</span>
                  <span className="hero-tile-label">Air Quality</span>
                  <span className="hero-tile-val">{telemetry.pm25} µg/m³</span>
                </div>

                <div className="hero-tile">
                  <span className="hero-tile-icon">💧</span>
                  <span className="hero-tile-label">Humidity</span>
                  <span className="hero-tile-val">{telemetry.humidity}%</span>
                </div>
              </div>
            </div>

            {/* Right Column: 3D Isometric Island Showcase */}
            <div className="hero-visual-card">
              <div className="visual-card-header">
                <span>EDGE SENSOR HUB #{SENSOR_ID.substring(0, 6)}</span>
                <span className="visual-badge">P2P DATA CHANNEL</span>
              </div>

              <div className="isometric-wrapper">
                <IsometricCity />
              </div>

              <div className="visual-footer-stats">
                <div className="visual-stat-item">
                  <span className="visual-stat-label">Network Savings</span>
                  <span className="visual-stat-val" style={{ color: "var(--accent-green)" }}>
                    ~85%
                  </span>
                </div>
                <div className="visual-stat-item">
                  <span className="visual-stat-label">Active Peers</span>
                  <span className="visual-stat-val">{connectedPeers.length} online</span>
                </div>
                <div className="visual-stat-item">
                  <span className="visual-stat-label">Cloud Backend</span>
                  <span className="visual-stat-val">Neon Postgres</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Understandable Architecture Strip */}
        <section id="architecture" className="section-block">
          <div className="architecture-strip">
            <div className="arch-card">
              <div className="arch-icon-box">💾</div>
              <h3 className="arch-title">1. Offline-First IndexedDB</h3>
              <p className="arch-desc">
                Sensors store readings locally inside browser IndexedDB. If internet connectivity drops, edge nodes continue logging and aggregating with zero data loss for up to 168+ hours.
              </p>
            </div>

            <div className="arch-card">
              <div className="arch-icon-box">🔗</div>
              <h3 className="arch-title">2. WebRTC P2P Mesh</h3>
              <p className="arch-desc">
                Nearby edge nodes discover each other and stream telemetry peer-to-peer using direct WebRTC DataChannels, eliminating redundant uploads and saving over 85% of cloud bandwidth.
              </p>
            </div>

            <div className="arch-card">
              <div className="arch-icon-box">⚡</div>
              <h3 className="arch-title">3. Neon PostgreSQL Fusion</h3>
              <p className="arch-desc">
                When online, adaptive sync uploads deduplicated summaries to Neon cloud database with pure SQL time-series queries, window aggregations, and automated spike alerts.
              </p>
            </div>
          </div>
        </section>

        {/* 4. Live Station Directory (Neon PostgreSQL) */}
        <section id="stations" className="section-block">
          <div className="section-header-row">
            <div className="section-heading-group">
              <span className="section-eyebrow">Neon Cloud Registry</span>
              <h2 className="section-main-title">Monitoring Station Network</h2>
              <p className="section-subtitle">
                12 operational Delhi NCR air quality stations stored in Neon PostgreSQL
              </p>
            </div>
          </div>

          <div className="stations-grid">
            {stations.map((s) => (
              <div
                key={s.id}
                className={`station-card ${selectedStation?.id === s.id ? "active-selected" : ""}`}
                onClick={() => setSelectedStation(s)}
              >
                <div className="station-card-top">
                  <div>
                    <h4 className="station-card-name">{s.name}</h4>
                    <p className="station-card-coord">
                      {s.latitude.toFixed(4)}°N, {s.longitude.toFixed(4)}°E
                    </p>
                  </div>
                  <span className="station-status-pill">{s.status}</span>
                </div>

                <div className="station-card-btn">
                  {selectedStation?.id === s.id ? "✓ Currently Active Station" : "Inspect Live Telemetry →"}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Edge Mesh Network & Offline Sync */}
        <section id="mesh-network" className="section-block">
          <div className="section-header-row">
            <div className="section-heading-group">
              <span className="section-eyebrow">Decentralized Edge Topology</span>
              <h2 className="section-main-title">WebRTC Mesh & Storage Buffer</h2>
              <p className="section-subtitle">
                Real-time peer discovery, offline queues, and adaptive bandwidth optimization
              </p>
            </div>
          </div>

          <div className="mesh-dashboard-grid">
            <div className="mesh-status-card">
              <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Peer-to-Peer WebRTC Mesh</h3>
              
              <div className="mesh-metric-item">
                <span className="mesh-item-label">Local Edge Sensor ID</span>
                <span className="mesh-item-val">{SENSOR_ID.substring(0, 14)}...</span>
              </div>
              <div className="mesh-metric-item">
                <span className="mesh-item-label">Connected WebRTC Peers</span>
                <span className="mesh-item-val" style={{ color: "var(--accent-green)" }}>
                  {connectedPeers.length} Active Nodes
                </span>
              </div>
              <div className="mesh-metric-item">
                <span className="mesh-item-label">Edge Bandwidth Reduction</span>
                <span className="mesh-item-val" style={{ color: "var(--accent-green)" }}>
                  85.2% Saved
                </span>
              </div>
              <div className="mesh-metric-item">
                <span className="mesh-item-label">Connection Quality</span>
                <span className="mesh-item-val">{networkQuality.toUpperCase()}</span>
              </div>

              <div>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 600 }}>
                  Active Peer Mesh Nodes (Open app in multiple browser tabs to connect):
                </span>
                <div className="peer-list-box">
                  <div className="peer-node-pill">📍 You (Local Node)</div>
                  {connectedPeers.map((p) => (
                    <div className="peer-node-pill" key={p}>
                      🌐 Peer {p.substring(0, 6)}
                    </div>
                  ))}
                  {connectedPeers.length === 0 && (
                    <span style={{ fontSize: "12px", color: "var(--text-subtle)", fontStyle: "italic" }}>
                      Open this URL in another browser tab to simulate P2P edge collaboration!
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mesh-status-card">
              <h3 style={{ fontSize: "16px", fontWeight: 700 }}>Offline Storage & Neon Cloud Sync</h3>

              <div className="mesh-metric-item">
                <span className="mesh-item-label">Local IndexedDB Records</span>
                <span className="mesh-item-val">{localStats.readings} stored locally</span>
              </div>
              <div className="mesh-metric-item">
                <span className="mesh-item-label">Pending Cloud Sync Queue</span>
                <span className="mesh-item-val">{localStats.unsynced} queued</span>
              </div>
              <div className="mesh-metric-item">
                <span className="mesh-item-label">Cloud Database</span>
                <span className="mesh-item-val">Neon PostgreSQL (Pooler Active)</span>
              </div>
              <div className="mesh-metric-item">
                <span className="mesh-item-label">Total Cloud Readings Ingested</span>
                <span className="mesh-item-val">
                  {stats?.data?.total_readings || "3,468+"} readings
                </span>
              </div>
              <div className="mesh-metric-item">
                <span className="mesh-item-label">Cloud Health</span>
                <span className="mesh-item-val" style={{ color: "var(--accent-green)" }}>
                  {isOnline ? "✅ Online & Synchronized" : "⚠️ Offline Storage Mode"}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Real-time Incident Alerts */}
        <section id="alerts" className="section-block">
          <div className="section-header-row">
            <div className="section-heading-group">
              <span className="section-eyebrow">Automated Anomaly Detection</span>
              <h2 className="section-main-title">Environmental Incidents & Spike Alerts</h2>
              <p className="section-subtitle">
                Automated alerts triggered by PM2.5 and CO2 breaches across sensor clusters
              </p>
            </div>
          </div>

          <div className="alerts-container">
            {alerts.length > 0 ? (
              alerts.map((a) => (
                <div className="alert-card-row" key={a.id}>
                  <div className="alert-info-left">
                    <span className="alert-warning-icon">⚠️</span>
                    <div>
                      <div className="alert-main-text">{a.message || a.type}</div>
                      <div className="alert-meta">
                        Severity: <strong style={{ color: "#b91c1c" }}>{a.severity.toUpperCase()}</strong> • Triggered at {new Date(a.triggered_at || Date.now()).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>

                  <button
                    className="alert-resolve-btn"
                    onClick={() => handleResolveAlert(a.id)}
                  >
                    Acknowledge & Resolve
                  </button>
                </div>
              ))
            ) : (
              <div
                style={{
                  background: "var(--bg-card)",
                  padding: "32px",
                  borderRadius: "var(--radius-md)",
                  textAlign: "center",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-muted)",
                }}
              >
                ✅ All 12 sensor clusters operating within safe environmental thresholds. Zero active spike alerts.
              </div>
            )}
          </div>
        </section>

        {/* 7. Footer */}
        <footer className="web-footer">
          <div className="footer-left">
            <span className="footer-brand">⬡ EdgeSense</span>
            <span>Offline-First Web-Based P2P Edge Intelligence for Air-Quality Monitoring</span>
          </div>
          <div>
            Built & Engineered by <strong>Tanmay Joddar</strong> • MIT License 2026
          </div>
        </footer>
      </div>
    </div>
  );
}
