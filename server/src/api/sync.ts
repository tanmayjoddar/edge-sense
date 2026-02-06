import { Router, Request, Response } from "express";
import { syncQueries, bandwidthQueries } from "../db";
import { asyncHandler, success, error } from "./middleware";

const router = Router();

// POST /api/sync/upload — Receive a batch of data from edge node
router.post(
  "/upload",
  asyncHandler(async (req: Request, res: Response) => {
    const {
      sensor_id,
      readings,
      aggregations,
      alerts: alertPayloads,
      sync_type,
      compressed,
      raw_bytes,
    } = req.body;

    if (!sensor_id) {
      return error(res, "sensor_id is required", 400);
    }

    const totalRecords =
      (readings?.length || 0) +
      (aggregations?.length || 0) +
      (alertPayloads?.length || 0);
    const payloadBytes = Buffer.byteLength(JSON.stringify(req.body), "utf-8");

    // Create sync event
    const syncEvent = await syncQueries.createEvent({
      sensor_id,
      sync_type: sync_type || "incremental",
      records_sent: totalRecords,
      bytes_transferred: payloadBytes,
    });

    try {
      let accepted = 0;
      let rejected = 0;

      // Queue each item for processing
      if (readings && Array.isArray(readings)) {
        for (const reading of readings) {
          try {
            await syncQueries.enqueue({
              sensor_id,
              payload_type: "reading",
              payload: reading,
              priority: reading.is_anomaly ? "high" : "normal",
            });
            accepted++;
          } catch {
            rejected++;
          }
        }
      }

      if (aggregations && Array.isArray(aggregations)) {
        for (const agg of aggregations) {
          try {
            await syncQueries.enqueue({
              sensor_id,
              payload_type: "aggregation",
              payload: agg,
              priority: "normal",
            });
            accepted++;
          } catch {
            rejected++;
          }
        }
      }

      if (alertPayloads && Array.isArray(alertPayloads)) {
        for (const alert of alertPayloads) {
          try {
            await syncQueries.enqueue({
              sensor_id,
              payload_type: "alert",
              payload: alert,
              priority: "critical",
            });
            accepted++;
          } catch {
            rejected++;
          }
        }
      }

      // Complete sync event
      await syncQueries.completeEvent(syncEvent.id, accepted, rejected);

      // Log bandwidth
      await bandwidthQueries.log(
        sensor_id,
        "upload",
        payloadBytes,
        totalRecords,
        compressed || false,
        raw_bytes || payloadBytes * 3,
        "good",
      );

      success(
        res,
        {
          sync_id: syncEvent.id,
          accepted,
          rejected,
          bytes_received: payloadBytes,
        },
        201,
      );
    } catch (err: any) {
      await syncQueries.failEvent(syncEvent.id, err.message);
      return error(res, `Sync failed: ${err.message}`, 500);
    }
  }),
);

// GET /api/sync/queue/size — Check pending queue size
router.get(
  "/queue/size",
  asyncHandler(async (_req: Request, res: Response) => {
    const size = await syncQueries.getQueueSize();
    success(res, { queue_size: size });
  }),
);

// GET /api/sync/events/:sensorId — Get sync history for sensor
router.get(
  "/events/:sensorId",
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 20;
    const events = await syncQueries.getRecentBySensor(
      req.params.sensorId,
      limit,
    );
    success(res, events);
  }),
);

// GET /api/sync/bandwidth — Get bandwidth savings stats
router.get(
  "/bandwidth",
  asyncHandler(async (_req: Request, res: Response) => {
    const savings = await bandwidthQueries.getSavings();
    success(res, savings);
  }),
);

// GET /api/sync/bandwidth/hourly?hours=X
router.get(
  "/bandwidth/hourly",
  asyncHandler(async (req: Request, res: Response) => {
    const hours = parseInt(req.query.hours as string) || 24;
    const stats = await bandwidthQueries.getHourlyStats(hours);
    success(res, stats);
  }),
);

export default router;
