import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown) {
  return (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "Nicht gefunden." });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: "Bitte Eingaben prüfen.", details: error.issues });
    return;
  }
  const sqliteError = error as { code?: string; message?: string };
  if (sqliteError.code?.startsWith("SQLITE_CONSTRAINT")) {
    res.status(409).json({ error: "Dieser Eintrag existiert bereits oder wird noch verwendet." });
    return;
  }
  console.error(error);
  res.status(500).json({ error: "Interner Serverfehler." });
}
