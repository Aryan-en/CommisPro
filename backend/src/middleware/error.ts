import type { NextFunction, Request, Response } from 'express';

export class ApiError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, 'Route not found'));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details ?? null,
    });
    return;
  }

  if (err instanceof Error) {
    res.status(500).json({
      error: 'Internal server error',
      details: err.message,
    });
    return;
  }

  res.status(500).json({
    error: 'Internal server error',
    details: null,
  });
}
