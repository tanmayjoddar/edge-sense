// ============================================================
// EdgeSense Client — REST API Client
// ============================================================

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const json = await response.json();

  if (!json.success) {
    throw new Error(json.error || "API request failed");
  }

  return json.data;
}

export const api = {
  // Health
  health: () => request<any>("/health"),

  // Sensors
  sensors: {
    list: () => request<any[]>("/sensors"),
    get: (id: string) => request<any>(`/sensors/${id}`),
    online: () => request<any[]>("/sensors/online"),
    nearby: (lat: number, lng: number, radius = 5) =>
      request<any[]>(`/sensors/nearby?lat=${lat}&lng=${lng}&radius=${radius}`),
    create: (data: any) =>
      request<any>("/sensors", { method: "POST", body: JSON.stringify(data) }),
    heartbeat: (id: string) =>
      request<any>(`/sensors/${id}/heartbeat`, { method: "POST" }),
  },

  // Readings
  readings: {
    bySensor: (sensorId: string, limit = 100) =>
      request<any[]>(`/readings?sensor_id=${sensorId}&limit=${limit}`),
    latest: (sensorId: string) => request<any>(`/readings/latest/${sensorId}`),
    anomalies: (limit = 50) =>
      request<any[]>(`/readings/anomalies?limit=${limit}`),
    submit: (data: any) =>
      request<any>("/readings", { method: "POST", body: JSON.stringify(data) }),
    bulkSubmit: (readings: any[]) =>
      request<any>("/readings/bulk", {
        method: "POST",
        body: JSON.stringify({ readings }),
      }),
  },

  // Clusters
  clusters: {
    list: () => request<any[]>("/clusters"),
    active: () => request<any[]>("/clusters/active"),
    get: (id: string) => request<any>(`/clusters/${id}`),
    metrics: (id: string, limit = 24) =>
      request<any[]>(`/clusters/${id}/metrics?limit=${limit}`),
    aggregate: (id: string, windowStart: string, windowEnd: string) =>
      request<any>(`/clusters/${id}/aggregate`, {
        method: "POST",
        body: JSON.stringify({
          window_start: windowStart,
          window_end: windowEnd,
        }),
      }),
  },

  // Sync
  sync: {
    upload: (data: any) =>
      request<any>("/sync/upload", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    queueSize: () => request<any>("/sync/queue/size"),
    events: (sensorId: string, limit = 20) =>
      request<any[]>(`/sync/events/${sensorId}?limit=${limit}`),
    bandwidth: () => request<any>("/sync/bandwidth"),
    bandwidthHourly: (hours = 24) =>
      request<any[]>(`/sync/bandwidth/hourly?hours=${hours}`),
  },

  // Alerts
  alerts: {
    list: (limit = 50) => request<any[]>(`/alerts?limit=${limit}`),
    unresolved: () => request<any[]>("/alerts/unresolved"),
    acknowledge: (id: string) =>
      request<any>(`/alerts/${id}/acknowledge`, { method: "PATCH" }),
    resolve: (id: string) =>
      request<any>(`/alerts/${id}/resolve`, { method: "PATCH" }),
  },

  // Stats
  stats: {
    system: () => request<any>("/stats"),
    aggregations: (limit = 50) =>
      request<any[]>(`/stats/aggregations?limit=${limit}`),
  },
};
