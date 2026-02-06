import { Router, Request, Response } from "express";
import { sensorQueries } from "../db";
import { asyncHandler, success, error } from "./middleware";

const router = Router();

// GET /api/sensors — List all sensors
router.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const sensors = await sensorQueries.getAll();
    success(res, sensors);
  }),
);

// GET /api/sensors/online — List online sensors
router.get(
  "/online",
  asyncHandler(async (_req: Request, res: Response) => {
    const sensors = await sensorQueries.getOnline();
    success(res, sensors);
  }),
);

// GET /api/sensors/nearby?lat=X&lng=Y&radius=Z — Find nearby sensors
router.get(
  "/nearby",
  asyncHandler(async (req: Request, res: Response) => {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const radius = parseFloat(req.query.radius as string) || 5;

    if (isNaN(lat) || isNaN(lng)) {
      return error(res, "lat and lng query parameters are required", 400);
    }

    const sensors = await sensorQueries.getNearby(lat, lng, radius);
    success(res, sensors);
  }),
);

// GET /api/sensors/:id — Get sensor by ID
router.get(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const sensor = await sensorQueries.getById(req.params.id);
    if (!sensor) return error(res, "Sensor not found", 404);
    success(res, sensor);
  }),
);

// POST /api/sensors — Register new sensor
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const {
      name,
      latitude,
      longitude,
      capabilities,
      firmware_version,
      metadata,
    } = req.body;

    if (!name || latitude === undefined || longitude === undefined) {
      return error(res, "name, latitude, and longitude are required", 400);
    }

    const sensor = await sensorQueries.create({
      name,
      latitude,
      longitude,
      capabilities,
      firmware_version,
      metadata,
    });
    success(res, sensor, 201);
  }),
);

// PATCH /api/sensors/:id/status — Update sensor status
router.patch(
  "/:id/status",
  asyncHandler(async (req: Request, res: Response) => {
    const { status } = req.body;
    if (!["online", "offline", "degraded", "maintenance"].includes(status)) {
      return error(res, "Invalid status value", 400);
    }
    const sensor = await sensorQueries.updateStatus(req.params.id, status);
    if (!sensor) return error(res, "Sensor not found", 404);
    success(res, sensor);
  }),
);

// POST /api/sensors/:id/heartbeat — Update last_seen_at
router.post(
  "/:id/heartbeat",
  asyncHandler(async (req: Request, res: Response) => {
    await sensorQueries.heartbeat(req.params.id);
    success(res, { acknowledged: true });
  }),
);

// DELETE /api/sensors/:id — Remove sensor
router.delete(
  "/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = await sensorQueries.delete(req.params.id);
    if (!deleted) return error(res, "Sensor not found", 404);
    success(res, { deleted: true });
  }),
);

export default router;
