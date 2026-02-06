// ============================================================
// EdgeSense Client — Edge Aggregation (runs in-browser)
// Performs spatial data fusion, deduplication, and spike
// detection on readings from local + P2P sources.
// ============================================================

import type { P2PReading } from "./mesh";

export interface AggregatedResult {
  window_start: string;
  window_end: string;
  sensor_count: number;
  reading_count: number;
  pm25: { mean: number; min: number; max: number; stddev: number } | null;
  pm10: { mean: number; min: number; max: number; stddev: number } | null;
  co2: { mean: number; min: number; max: number; stddev: number } | null;
  temperature_mean: number | null;
  humidity_mean: number | null;
  confidence: number;
  has_spike: boolean;
  spike_metric: string | null;
}

const SPIKE_THRESHOLDS = {
  pm25: 150,
  pm10: 250,
  co2: 1000,
};

/** Buffer to collect readings for the current aggregation window */
let readingBuffer: Map<string, P2PReading[]> = new Map();
let windowStart: Date = new Date();

export function resetAggregationWindow(): void {
  readingBuffer = new Map();
  windowStart = new Date();
}

/** Add a reading to the current aggregation buffer */
export function addReading(reading: P2PReading): void {
  const sensorId = reading.sensor_id;
  if (!readingBuffer.has(sensorId)) {
    readingBuffer.set(sensorId, []);
  }
  readingBuffer.get(sensorId)!.push(reading);
}

/** Deduplicate readings: remove entries with same sensor + close timestamps */
function deduplicateReadings(readings: P2PReading[]): P2PReading[] {
  const seen = new Map<string, P2PReading>();
  for (const r of readings) {
    // Key: sensor_id + rounded timestamp (to nearest 5s)
    const ts = Math.round(new Date(r.timestamp).getTime() / 5000) * 5000;
    const key = `${r.sensor_id}:${ts}`;
    const existing = seen.get(key);
    if (!existing || r.quality_score > existing.quality_score) {
      seen.set(key, r);
    }
  }
  return Array.from(seen.values());
}

function computeStats(
  values: number[],
): { mean: number; min: number; max: number; stddev: number } | null {
  const filtered = values.filter(
    (v) => v !== null && v !== undefined && !isNaN(v),
  );
  if (filtered.length === 0) return null;

  const mean = filtered.reduce((a, b) => a + b, 0) / filtered.length;
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  const variance =
    filtered.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    filtered.length;
  const stddev = Math.sqrt(variance);

  return {
    mean: Math.round(mean * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    stddev: Math.round(stddev * 100) / 100,
  };
}

/** Run aggregation on the current buffer and return results */
export function aggregate(): AggregatedResult {
  const windowEnd = new Date();
  const allReadings: P2PReading[] = [];

  readingBuffer.forEach((readings) => {
    allReadings.push(...readings);
  });

  const deduplicated = deduplicateReadings(allReadings);
  const sensorCount = readingBuffer.size;

  const pm25Values = deduplicated
    .map((r) => r.pm25)
    .filter((v): v is number => v !== null);
  const pm10Values = deduplicated
    .map((r) => r.pm10)
    .filter((v): v is number => v !== null);
  const co2Values = deduplicated
    .map((r) => r.co2)
    .filter((v): v is number => v !== null);
  const tempValues = deduplicated
    .map((r) => r.temperature)
    .filter((v): v is number => v !== null);
  const humValues = deduplicated
    .map((r) => r.humidity)
    .filter((v): v is number => v !== null);

  const pm25Stats = computeStats(pm25Values);
  const pm10Stats = computeStats(pm10Values);
  const co2Stats = computeStats(co2Values);

  // Spike detection
  let hasSpike = false;
  let spikeMetric: string | null = null;

  if (pm25Stats && pm25Stats.mean > SPIKE_THRESHOLDS.pm25) {
    hasSpike = true;
    spikeMetric = "pm25";
  }
  if (co2Stats && co2Stats.mean > SPIKE_THRESHOLDS.co2) {
    hasSpike = true;
    spikeMetric = spikeMetric ? `${spikeMetric},co2` : "co2";
  }

  // Confidence based on sensor count and reading count
  const confidence = Math.min(
    1.0,
    Math.max(
      0.3,
      (sensorCount / 5) * 0.5 +
        (Math.min(deduplicated.length, 50) / 50) * 0.3 +
        (deduplicated.reduce((s, r) => s + r.quality_score, 0) /
          Math.max(1, deduplicated.length)) *
          0.2,
    ),
  );

  const result: AggregatedResult = {
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    sensor_count: sensorCount,
    reading_count: deduplicated.length,
    pm25: pm25Stats,
    pm10: pm10Stats,
    co2: co2Stats,
    temperature_mean:
      tempValues.length > 0
        ? Math.round(
            (tempValues.reduce((a, b) => a + b, 0) / tempValues.length) * 100,
          ) / 100
        : null,
    humidity_mean:
      humValues.length > 0
        ? Math.round(
            (humValues.reduce((a, b) => a + b, 0) / humValues.length) * 100,
          ) / 100
        : null,
    confidence: Math.round(confidence * 100) / 100,
    has_spike: hasSpike,
    spike_metric: spikeMetric,
  };

  // Reset buffer for next window
  resetAggregationWindow();

  return result;
}

export function getBufferSize(): number {
  let count = 0;
  readingBuffer.forEach((readings) => {
    count += readings.length;
  });
  return count;
}

export function getSensorCount(): number {
  return readingBuffer.size;
}
