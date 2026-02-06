// ============================================================
// EdgeSense — Aggregation Engine
// Runs periodically to compute aggregated metrics per cluster
// from raw sensor readings. Pure SQL aggregation.
// ============================================================

import { clusterQueries, aggregationQueries, alertQueries } from "../db";
import { config } from "../config";

let aggInterval: NodeJS.Timeout | null = null;
let isAggregating = false;

export function startAggregationEngine(): void {
  const windowMs = config.aggregation.windowMs;
  console.log(`[Aggregation] Engine started — window size ${windowMs}ms`);

  aggInterval = setInterval(async () => {
    if (isAggregating) return;
    await runAggregation();
  }, windowMs);

  // Run once at startup
  setTimeout(() => runAggregation(), 5000);
}

export function stopAggregationEngine(): void {
  if (aggInterval) {
    clearInterval(aggInterval);
    aggInterval = null;
    console.log("[Aggregation] Engine stopped.");
  }
}

async function runAggregation(): Promise<void> {
  isAggregating = true;
  const startTime = Date.now();

  try {
    const clusters = await clusterQueries.getActive();
    if (clusters.length === 0) {
      isAggregating = false;
      return;
    }

    const windowEnd = new Date();
    const windowStart = new Date(
      windowEnd.getTime() - config.aggregation.windowMs,
    );

    let aggregated = 0;
    let alertsGenerated = 0;

    for (const cluster of clusters) {
      try {
        const metric = await aggregationQueries.computeFromReadings(
          cluster.id,
          windowStart,
          windowEnd,
        );

        if (metric) {
          aggregated++;

          // Check for spikes and generate alerts
          const newAlerts = await checkForSpikes(metric, cluster.id);
          alertsGenerated += newAlerts;
        }
      } catch (err: any) {
        console.error(
          `[Aggregation] Failed for cluster ${cluster.name}:`,
          err.message,
        );
      }
    }

    const duration = Date.now() - startTime;
    if (aggregated > 0) {
      console.log(
        `[Aggregation] Completed: ${aggregated} clusters aggregated, ${alertsGenerated} alerts generated (${duration}ms)`,
      );
    }
  } catch (err: any) {
    console.error("[Aggregation] Engine error:", err.message);
  } finally {
    isAggregating = false;
  }
}

async function checkForSpikes(metric: any, clusterId: string): Promise<number> {
  let alertCount = 0;
  const thresholds = config.aggregation.spikeThresholds;

  // PM2.5 spike check
  if (metric.pm25_mean && metric.pm25_mean > thresholds.pm25) {
    await alertQueries.create({
      cluster_id: clusterId,
      alert_type: "spike",
      severity: metric.pm25_mean > thresholds.pm25 * 2 ? "critical" : "warning",
      title: `PM2.5 Spike: ${metric.pm25_mean.toFixed(1)} µg/m³`,
      description: `Cluster average PM2.5 of ${metric.pm25_mean.toFixed(1)} µg/m³ exceeds threshold of ${thresholds.pm25} µg/m³`,
      metric_name: "pm25",
      metric_value: metric.pm25_mean,
      threshold_value: thresholds.pm25,
    });
    alertCount++;
  }

  // CO2 spike check
  if (metric.co2_mean && metric.co2_mean > thresholds.co2) {
    await alertQueries.create({
      cluster_id: clusterId,
      alert_type: "spike",
      severity: metric.co2_mean > thresholds.co2 * 1.5 ? "critical" : "warning",
      title: `CO₂ Spike: ${metric.co2_mean.toFixed(0)} ppm`,
      description: `Cluster average CO₂ of ${metric.co2_mean.toFixed(0)} ppm exceeds threshold of ${thresholds.co2} ppm`,
      metric_name: "co2",
      metric_value: metric.co2_mean,
      threshold_value: thresholds.co2,
    });
    alertCount++;
  }

  // Temperature spike check
  if (
    metric.temperature_mean &&
    metric.temperature_mean > thresholds.temperature
  ) {
    await alertQueries.create({
      cluster_id: clusterId,
      alert_type: "threshold_breach",
      severity: "warning",
      title: `High Temperature: ${metric.temperature_mean.toFixed(1)}°C`,
      description: `Cluster average temperature of ${metric.temperature_mean.toFixed(1)}°C exceeds ${thresholds.temperature}°C`,
      metric_name: "temperature",
      metric_value: metric.temperature_mean,
      threshold_value: thresholds.temperature,
    });
    alertCount++;
  }

  return alertCount;
}

/** Force run aggregation (for API triggers) */
export async function forceAggregation(): Promise<void> {
  if (!isAggregating) {
    await runAggregation();
  }
}
