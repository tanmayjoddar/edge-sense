// ============================================================
// EdgeSense Client — Realistic Sensor Simulator
// Generates PM2.5, PM10, CO2, Temperature, and Humidity
// readings with diurnal patterns, rush-hour spikes,
// random anomalies, and configurable noise.
// ============================================================

import { v4 as uuidv4 } from "uuid";

export interface SimulatedReading {
  id: string;
  sensor_id: string;
  timestamp: string;
  pm25: number;
  pm10: number;
  co2: number;
  temperature: number;
  humidity: number;
  quality_score: number;
  is_anomaly: boolean;
  source: "direct";
}

interface SimulatorConfig {
  sensorId: string;
  /** Base PM2.5 level (µg/m³) — Delhi averages ~100 */
  basePM25: number;
  /** Base CO2 level (ppm) */
  baseCO2: number;
  /** Base temperature (°C) */
  baseTemp: number;
  /** Base humidity (%) */
  baseHumidity: number;
  /** Noise level: 0.0–1.0 */
  noise: number;
  /** Anomaly probability: 0.0–1.0 */
  anomalyChance: number;
}

const DEFAULT_CONFIG: Omit<SimulatorConfig, "sensorId"> = {
  basePM25: 95,
  baseCO2: 600,
  baseTemp: 28,
  baseHumidity: 55,
  noise: 0.15,
  anomalyChance: 0.05,
};

let intervalId: number | null = null;
let config: SimulatorConfig;

export function createSimulator(
  sensorId: string,
  overrides?: Partial<SimulatorConfig>,
): SimulatorConfig {
  config = {
    ...DEFAULT_CONFIG,
    sensorId,
    ...overrides,
  };
  return config;
}

export function generateReading(cfg?: SimulatorConfig): SimulatedReading {
  const c = cfg || config;
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // ─── Diurnal Pattern ─────────────────────────────────
  // Rush hours: 7-10 AM and 5-8 PM have higher pollution
  const isRushHour = (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20);
  const isNight = hour >= 23 || hour <= 5;
  const diurnalMultiplier = isRushHour ? 1.5 : isNight ? 0.7 : 1.0;

  // ─── Seasonal variation (simple sine wave) ───────────
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000,
  );
  const seasonalMultiplier =
    1.0 + 0.3 * Math.sin((dayOfYear / 365) * 2 * Math.PI - Math.PI / 2);

  // ─── Random noise ────────────────────────────────────
  const noise = () => (Math.random() - 0.5) * 2 * c.noise;
  const positiveNoise = () => Math.random() * c.noise;

  // ─── Anomaly check ──────────────────────────────────
  const isAnomaly = Math.random() < c.anomalyChance;
  const anomalyMultiplier = isAnomaly ? 2.0 + Math.random() * 1.5 : 1.0;

  // ─── Generate values ─────────────────────────────────
  const pm25 = Math.max(
    0,
    c.basePM25 *
      diurnalMultiplier *
      seasonalMultiplier *
      anomalyMultiplier *
      (1 + noise()),
  );
  const pm10 = Math.max(0, pm25 * (1.5 + positiveNoise()) + 20 * (1 + noise()));
  const co2 = Math.max(
    350,
    c.baseCO2 * diurnalMultiplier * (1 + noise()) * (isAnomaly ? 1.3 : 1.0),
  );
  const temperature = c.baseTemp + (isNight ? -5 : 3) * (1 + noise() * 0.3);
  const humidity = Math.max(
    10,
    Math.min(100, c.baseHumidity + (isNight ? 10 : -5) * (1 + noise())),
  );

  // Quality score: lower if anomaly, or during poor conditions
  const qualityScore = Math.max(
    0.3,
    Math.min(1.0, 0.9 - (isAnomaly ? 0.2 : 0) + noise() * 0.1),
  );

  return {
    id: uuidv4(),
    sensor_id: c.sensorId,
    timestamp: now.toISOString(),
    pm25: Math.round(pm25 * 100) / 100,
    pm10: Math.round(pm10 * 100) / 100,
    co2: Math.round(co2 * 100) / 100,
    temperature: Math.round(temperature * 100) / 100,
    humidity: Math.round(humidity * 100) / 100,
    quality_score: Math.round(qualityScore * 100) / 100,
    is_anomaly: isAnomaly,
    source: "direct",
  };
}

export function startSimulator(
  intervalMs: number,
  onReading: (reading: SimulatedReading) => void,
): void {
  if (intervalId !== null) stopSimulator();

  console.log(
    `[Simulator] Started — generating readings every ${intervalMs}ms`,
  );
  intervalId = window.setInterval(() => {
    const reading = generateReading();
    onReading(reading);
  }, intervalMs);

  // Generate first reading immediately
  onReading(generateReading());
}

export function stopSimulator(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[Simulator] Stopped");
  }
}

export function isRunning(): boolean {
  return intervalId !== null;
}
