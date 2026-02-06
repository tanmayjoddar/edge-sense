import { Router, Request, Response } from "express";
import { clusterQueries, aggregationQueries } from "../db";
import { asyncHandler, success, error } from "./middleware";

const router = Router();

// GET /api/clusters — List all clusters
router.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const clusters = await clusterQueries.getAll();
    success(res, clusters);
  }),
);

// GET /api/clusters/active — List active clusters only
router.get(
  "/active",
  asyncHandler(async (_req: Request, res: Response) => {
    const clusters = await clusterQueries.getActive();
    success(res, clusters);
  }),
);

// GET /api/clusters/:id
router.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const cluster = await clusterQueries.getById(req.params.id);
    if (!cluster) return error(res, "Cluster not found", 404);
    success(res, cluster);
  }),
);

// POST /api/clusters — Create a new edge cluster
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const {
      name,
      sensor_ids,
      center_latitude,
      center_longitude,
      radius_meters,
    } = req.body;

    if (
      !name ||
      center_latitude === undefined ||
      center_longitude === undefined
    ) {
      return error(
        res,
        "name, center_latitude, and center_longitude are required",
        400,
      );
    }

    const cluster = await clusterQueries.create({
      name,
      sensor_ids,
      center_latitude,
      center_longitude,
      radius_meters,
    });
    success(res, cluster, 201);
  }),
);

// PATCH /api/clusters/:id/sensors — Update cluster's sensor list
router.patch(
  "/:id/sensors",
  asyncHandler(async (req: Request, res: Response) => {
    const { sensor_ids } = req.body;
    if (!Array.isArray(sensor_ids)) {
      return error(res, "sensor_ids array is required", 400);
    }
    const cluster = await clusterQueries.updateSensors(
      req.params.id,
      sensor_ids,
    );
    if (!cluster) return error(res, "Cluster not found", 404);
    success(res, cluster);
  }),
);

// GET /api/clusters/:id/metrics?limit=X — Get aggregated metrics for cluster
router.get(
  "/:id/metrics",
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 24;
    const metrics = await aggregationQueries.getByCluster(req.params.id, limit);
    success(res, metrics);
  }),
);

// POST /api/clusters/:id/aggregate — Trigger aggregation for a time window
router.post(
  "/:id/aggregate",
  asyncHandler(async (req: Request, res: Response) => {
    const { window_start, window_end } = req.body;

    if (!window_start || !window_end) {
      return error(
        res,
        "window_start and window_end are required (ISO 8601)",
        400,
      );
    }

    const metric = await aggregationQueries.computeFromReadings(
      req.params.id,
      new Date(window_start),
      new Date(window_end),
    );

    if (!metric) {
      return error(
        res,
        "No readings found for this cluster in the given time window",
        404,
      );
    }

    success(res, metric, 201);
  }),
);

export default router;
