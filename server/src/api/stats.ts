import { Router, Request, Response } from "express";
import { statsQueries, aggregationQueries } from "../db";
import { asyncHandler, success } from "./middleware";

const router = Router();

// GET /api/stats — System-wide dashboard stats
router.get(
  "/",
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = await statsQueries.getSystemStats();
    success(res, stats);
  }),
);

// GET /api/stats/aggregations?limit=X
router.get(
  "/aggregations",
  asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const aggregations = await aggregationQueries.getLatest(limit);
    success(res, aggregations);
  }),
);

export default router;
