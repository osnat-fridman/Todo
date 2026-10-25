import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ApiError } from "../shared/types.js";
import { logDatabaseError } from "./db.js";

export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

export function sendError(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  field?: string,
): void {
  const body: ApiError = { error: field ? { code, message, field } : { code, message } };
  sendJson(res, status, body);
}

/** Returns true when the method is allowed; otherwise answers 405. */
export function allowMethods(req: VercelRequest, res: VercelResponse, methods: string[]): boolean {
  if (req.method && methods.includes(req.method)) return true;
  res.setHeader("Allow", methods.join(", "));
  sendError(res, 405, "METHOD_NOT_ALLOWED", "הפעולה אינה נתמכת.");
  return false;
}

/** Answers a failed database operation with a temporary-failure error. */
export function sendDatabaseError(res: VercelResponse, context: string, error: unknown): void {
  logDatabaseError(context, error);
  sendError(res, 503, "DB_UNAVAILABLE", "השרת אינו זמין כרגע. נסה שוב מאוחר יותר.");
}
