import { Router, Request, Response } from "express";
import { readingQueries } from "../db";
import { asyncHandler, success, error } from "./middleware";

const router = Router();

// GET /api/readings?sensor_id=X&limit=Y&offset=Z
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const sensorId = req.query.sensor_id as string;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!sensorId) {
      return error(res, "sensor_id query parameter is required", 400);
    }

    const readings = await readingQueries.getBySensor(sensorId, limit, offset);
    success(res, readings);
  }),
);

// GET /api/readings/latest/:sensorId
router.get(
  "/latest/:sensorId",
  asyncHandler(async (req: Request, res: Response) => {
    const reading = await readingQueries.getLatestBySensor(req.params.sensorId);
    if (!reading) return error(res, "No readings found for this sensor", 404);
    success(res, reading);
  }),
);

// GET /api/readings/anomalies?limit=X
router.get(
  "/anomalies",
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const anomalies = await readingQueries.getAnomalies(limit);
    success(res, anomalies);
  }),
);

// GET /api/readings/range?start=X&end=Y&sensor_id=Z
router.get(
  "/range",
  asyncHandler(async (req: Request, res: Response) => {
    const start = req.query.start as string;
    const end = req.query.end as string;

    if (!start || !end) {
      return error(
        res,
        "start and end query parameters are required (ISO 8601)",
        400,
      );
    }

    const sensorId = req.query.sensor_id as string | undefined;
    const readings = await readingQueries.getInTimeRange(
      new Date(start),
      new Date(end),
      sensorId,
    );
    success(res, readings);
  }),
);

// POST /api/readings — Submit a single reading
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const {
      sensor_id,
      pm25,
      pm10,
      co2,
      temperature,
      humidity,
      quality_score,
      source,
    } = req.body;

    if (!sensor_id) {
      return error(res, "sensor_id is required", 400);
    }

    const reading = await readingQueries.create({
      sensor_id,
      pm25,
      pm10,
      co2,
      temperature,
      humidity,
      quality_score,
      source,
    });
    success(res, reading, 201);
  }),
);

// POST /api/readings/bulk — Submit multiple readings (used by sync)
router.post(
  "/bulk",
  asyncHandler(async (req: Request, res: Response) => {
    const { readings } = req.body;

    if (!Array.isArray(readings) || readings.length === 0) {
      return error(
        res,
        "readings array is required and must not be empty",
        400,
      );
    }

    const inserted = await readingQueries.bulkCreate(readings);
    success(res, { inserted, total: readings.length }, 201);
  }),
);

// GET /api/readings/count/:sensorId
router.get(
  "/count/:sensorId",
  asyncHandler(async (req: Request, res: Response) => {
    const count = await readingQueries.countBySensor(req.params.sensorId);
    success(res, { sensor_id: req.params.sensorId, count });
  }),
);

export default router;
