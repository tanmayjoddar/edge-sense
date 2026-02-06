import { Router, Request, Response } from "express";
import { alertQueries } from "../db";
import { asyncHandler, success, error } from "./middleware";

const router = Router();

// GET /api/alerts?limit=X
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const alerts = await alertQueries.getAll(limit);
    success(res, alerts);
  }),
);

// GET /api/alerts/unresolved
router.get(
  "/unresolved",
  asyncHandler(async (_req: Request, res: Response) => {
    const alerts = await alertQueries.getUnresolved();
    success(res, alerts);
  }),
);

// POST /api/alerts — Create new alert
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const {
      sensor_id,
      cluster_id,
      alert_type,
      severity,
      title,
      description,
      metric_name,
      metric_value,
      threshold_value,
    } = req.body;

    if (
      !title ||
      !metric_name ||
      metric_value === undefined ||
      threshold_value === undefined
    ) {
      return error(
        res,
        "title, metric_name, metric_value, and threshold_value are required",
        400,
      );
    }

    const alert = await alertQueries.create({
      sensor_id,
      cluster_id,
      alert_type,
      severity,
      title,
      description,
      metric_name,
      metric_value,
      threshold_value,
    });
    success(res, alert, 201);
  }),
);

// PATCH /api/alerts/:id/acknowledge
router.patch(
  "/:id/acknowledge",
  asyncHandler(async (req: Request, res: Response) => {
    const alert = await alertQueries.acknowledge(req.params.id);
    if (!alert) return error(res, "Alert not found", 404);
    success(res, alert);
  }),
);

// PATCH /api/alerts/:id/resolve
router.patch(
  "/:id/resolve",
  asyncHandler(async (req: Request, res: Response) => {
    const alert = await alertQueries.resolve(req.params.id);
    if (!alert) return error(res, "Alert not found", 404);
    success(res, alert);
  }),
);

export default router;
