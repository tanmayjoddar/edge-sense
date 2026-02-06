import { Router } from "express";
import sensorRoutes from "./sensors";
import readingRoutes from "./readings";
import clusterRoutes from "./clusters";
import syncRoutes from "./sync";
import alertRoutes from "./alerts";
import statsRoutes from "./stats";

const router = Router();

router.use("/sensors", sensorRoutes);
router.use("/readings", readingRoutes);
router.use("/clusters", clusterRoutes);
router.use("/sync", syncRoutes);
router.use("/alerts", alertRoutes);
router.use("/stats", statsRoutes);

// Health check
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "edgesense",
    timestamp: new Date().toISOString(),
  });
});

export default router;
