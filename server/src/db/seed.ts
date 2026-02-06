// ============================================================
// EdgeSense — Seed realistic sensor data for development
// ============================================================

import { v4 as uuidv4 } from "uuid";
import { getPool, closePool, transaction } from "./pool";

// Realistic locations — Delhi NCR air quality monitoring stations
const SEED_SENSORS = [
  { name: "Anand Vihar Station", lat: 28.6469, lng: 77.3164 },
  { name: "ITO Junction", lat: 28.6289, lng: 77.2414 },
  { name: "Dwarka Sector 8", lat: 28.5825, lng: 77.056 },
  { name: "Rohini Zone", lat: 28.7322, lng: 77.1167 },
  { name: "Punjabi Bagh West", lat: 28.6688, lng: 77.1163 },
  { name: "RK Puram Station", lat: 28.5649, lng: 77.1734 },
  { name: "Okhla Phase II", lat: 28.5308, lng: 77.2711 },
  { name: "Nehru Nagar", lat: 28.6534, lng: 77.2567 },
  { name: "Shadipur Depot", lat: 28.6515, lng: 77.158 },
  { name: "Narela Industrial", lat: 28.8526, lng: 77.0927 },
  { name: "Mundka Area", lat: 28.6827, lng: 77.0234 },
  { name: "Patparganj Industrial", lat: 28.6236, lng: 77.2872 },
];

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function generateReading(sensorId: string, timestamp: Date) {
  // Realistic Delhi air quality ranges
  const hour = timestamp.getHours();
  const isRushHour = (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20);
  const multiplier = isRushHour ? 1.5 : 1.0;

  const pm25 = randomBetween(30, 200) * multiplier;
  const isSpike = pm25 > 150;

  return {
    id: uuidv4(),
    sensor_id: sensorId,
    timestamp: timestamp.toISOString(),
    pm25: Math.round(pm25 * 100) / 100,
    pm10: Math.round(randomBetween(50, 350) * multiplier * 100) / 100,
    co2: Math.round(randomBetween(400, 1200) * multiplier * 100) / 100,
    temperature: Math.round(randomBetween(15, 42) * 100) / 100,
    humidity: Math.round(randomBetween(20, 85) * 100) / 100,
    quality_score: Math.round(randomBetween(0.7, 1.0) * 100) / 100,
    is_anomaly: isSpike,
    source: "direct" as const,
  };
}

async function seed(): Promise<void> {
  console.log("[Seed] Starting database seeding...");

  await transaction(async (client) => {
    // Clear existing data
    await client.query("DELETE FROM bandwidth_log");
    await client.query("DELETE FROM alerts");
    await client.query("DELETE FROM sync_queue");
    await client.query("DELETE FROM sync_events");
    await client.query("DELETE FROM aggregated_metrics");
    await client.query("DELETE FROM edge_clusters");
    await client.query("DELETE FROM readings");
    await client.query("DELETE FROM sensors");
    console.log("[Seed] Cleared existing data.");

    // Insert sensors
    const sensorIds: string[] = [];
    for (const s of SEED_SENSORS) {
      const id = uuidv4();
      sensorIds.push(id);
      await client.query(
        `INSERT INTO sensors (id, name, latitude, longitude, status, capabilities, firmware_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          s.name,
          s.lat,
          s.lng,
          "online",
          ["pm25", "pm10", "co2", "temperature", "humidity"],
          "1.2.0",
        ],
      );
    }
    console.log(`[Seed] Inserted ${sensorIds.length} sensors.`);

    // Insert readings — last 24 hours, every 5 minutes per sensor
    const now = new Date();
    let totalReadings = 0;

    for (const sensorId of sensorIds) {
      const readings = [];
      for (let minutesAgo = 24 * 60; minutesAgo >= 0; minutesAgo -= 5) {
        const ts = new Date(now.getTime() - minutesAgo * 60000);
        readings.push(generateReading(sensorId, ts));
      }

      // Batch insert for performance
      const values: any[] = [];
      const placeholders: string[] = [];
      readings.forEach((r, idx) => {
        const offset = idx * 11;
        placeholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11})`,
        );
        values.push(
          r.id,
          r.sensor_id,
          r.timestamp,
          r.pm25,
          r.pm10,
          r.co2,
          r.temperature,
          r.humidity,
          r.quality_score,
          r.is_anomaly,
          r.source,
        );
      });

      await client.query(
        `INSERT INTO readings (id, sensor_id, timestamp, pm25, pm10, co2, temperature, humidity, quality_score, is_anomaly, source)
         VALUES ${placeholders.join(", ")}`,
        values,
      );

      totalReadings += readings.length;
    }
    console.log(`[Seed] Inserted ${totalReadings} readings.`);

    // Create edge clusters — group nearby sensors
    const cluster1Id = uuidv4();
    const cluster2Id = uuidv4();
    const cluster3Id = uuidv4();

    await client.query(
      `INSERT INTO edge_clusters (id, name, sensor_ids, center_latitude, center_longitude, radius_meters, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        cluster1Id,
        "Central Delhi Cluster",
        sensorIds.slice(0, 4),
        28.64,
        77.24,
        3000,
        "active",
      ],
    );
    await client.query(
      `INSERT INTO edge_clusters (id, name, sensor_ids, center_latitude, center_longitude, radius_meters, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        cluster2Id,
        "West Delhi Cluster",
        sensorIds.slice(4, 8),
        28.66,
        77.12,
        4000,
        "active",
      ],
    );
    await client.query(
      `INSERT INTO edge_clusters (id, name, sensor_ids, center_latitude, center_longitude, radius_meters, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        cluster3Id,
        "Outer Delhi Cluster",
        sensorIds.slice(8),
        28.75,
        77.06,
        5000,
        "active",
      ],
    );
    console.log("[Seed] Created 3 edge clusters.");

    // Create some aggregated metrics for the clusters
    let totalAgg = 0;
    for (const clusterId of [cluster1Id, cluster2Id, cluster3Id]) {
      for (let minutesAgo = 24 * 60; minutesAgo >= 60; minutesAgo -= 60) {
        const windowStart = new Date(now.getTime() - minutesAgo * 60000);
        const windowEnd = new Date(windowStart.getTime() + 60 * 60000);
        const hour = windowStart.getHours();
        const isRushHour =
          (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20);
        const mult = isRushHour ? 1.4 : 1.0;

        await client.query(
          `INSERT INTO aggregated_metrics
           (id, cluster_id, window_start, window_end, sensor_count,
            pm25_mean, pm25_min, pm25_max, pm25_stddev,
            pm10_mean, pm10_min, pm10_max, pm10_stddev,
            co2_mean, co2_min, co2_max, co2_stddev,
            temperature_mean, humidity_mean, confidence, reading_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
          [
            uuidv4(),
            clusterId,
            windowStart.toISOString(),
            windowEnd.toISOString(),
            4,
            Math.round(randomBetween(60, 160) * mult * 100) / 100,
            Math.round(randomBetween(30, 80) * 100) / 100,
            Math.round(randomBetween(150, 300) * mult * 100) / 100,
            Math.round(randomBetween(10, 40) * 100) / 100,
            Math.round(randomBetween(80, 250) * mult * 100) / 100,
            Math.round(randomBetween(50, 100) * 100) / 100,
            Math.round(randomBetween(200, 400) * mult * 100) / 100,
            Math.round(randomBetween(15, 50) * 100) / 100,
            Math.round(randomBetween(500, 900) * mult * 100) / 100,
            Math.round(randomBetween(400, 500) * 100) / 100,
            Math.round(randomBetween(800, 1200) * mult * 100) / 100,
            Math.round(randomBetween(30, 80) * 100) / 100,
            Math.round(randomBetween(20, 38) * 100) / 100,
            Math.round(randomBetween(30, 70) * 100) / 100,
            Math.round(randomBetween(0.8, 0.99) * 100) / 100,
            Math.floor(randomBetween(40, 60)),
          ],
        );
        totalAgg++;
      }
    }
    console.log(`[Seed] Inserted ${totalAgg} aggregated metric windows.`);

    // Create some sample alerts
    const alertCount = 8;
    for (let i = 0; i < alertCount; i++) {
      const triggeredAt = new Date(
        now.getTime() - Math.floor(randomBetween(0, 12 * 60)) * 60000,
      );
      const pmVal = Math.round(randomBetween(155, 350) * 100) / 100;
      await client.query(
        `INSERT INTO alerts (id, sensor_id, alert_type, severity, title, description, metric_name, metric_value, threshold_value, triggered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          uuidv4(),
          sensorIds[Math.floor(Math.random() * sensorIds.length)],
          "spike",
          pmVal > 250 ? "critical" : "warning",
          `PM2.5 Spike: ${pmVal} µg/m³`,
          `Sensor detected PM2.5 level of ${pmVal} µg/m³, exceeding threshold of 150 µg/m³`,
          "pm25",
          pmVal,
          150,
          triggeredAt.toISOString(),
        ],
      );
    }
    console.log(`[Seed] Inserted ${alertCount} alerts.`);

    console.log("[Seed] ✅ Database seeding complete!");
  });

  await closePool();
}

seed().catch((err) => {
  console.error("[Seed] Fatal error:", err);
  process.exit(1);
});
