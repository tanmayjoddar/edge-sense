import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import type { ApiResponse } from "../types";

/** Wrap async route handlers to catch errors */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Standard JSON success response */
export function success<T>(res: Response, data: T, status = 200): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    error: null,
    timestamp: new Date().toISOString(),
    request_id: uuidv4(),
  };
  res.status(status).json(response);
}

/** Standard JSON error response */
export function error(res: Response, message: string, status = 500): void {
  const response: ApiResponse<null> = {
    success: false,
    data: null,
    error: message,
    timestamp: new Date().toISOString(),
    request_id: uuidv4(),
  };
  res.status(status).json(response);
}

/** Global error handler middleware */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error("[API] Error:", err.message);
  if (process.env.NODE_ENV === "development") {
    console.error(err.stack);
  }
  error(res, err.message, 500);
}

/** Request logger with timing */
export function requestTimer(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[API] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`,
    );
  });
  next();
}
