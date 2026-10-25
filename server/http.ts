import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ApiError } from "../shared/types.js";
import { logDatabaseError } from "./db.js";

export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(body);
}

export function sendNoContent(res: VercelResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.status(204).end();
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

const MAX_BODY_BYTES = 16 * 1024;

/**
 * Returns the parsed JSON object body, or answers 400 and returns null when the request
 * is not JSON, is larger than the limit, or is not a JSON object.
 */
export function readJsonBody(
  req: VercelRequest,
  res: VercelResponse,
  maxBytes: number = MAX_BODY_BYTES,
): Record<string, unknown> | null {
  const contentType = String(req.headers?.["content-type"] ?? "");
  if (!contentType.toLowerCase().startsWith("application/json")) {
    sendError(res, 400, "INVALID_REQUEST", "הבקשה חייבת להיות בפורמט JSON.");
    return null;
  }

  const declaredLength = Number(req.headers?.["content-length"] ?? 0);
  let body: unknown;
  try {
    body = req.body;
  } catch {
    // @vercel/node parses lazily and throws on malformed JSON.
    body = undefined;
  }
  const actualLength = body === undefined ? 0 : Buffer.byteLength(JSON.stringify(body));
  if (declaredLength > maxBytes || actualLength > maxBytes) {
    sendError(res, 400, "INVALID_REQUEST", "הבקשה גדולה מדי.");
    return null;
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    sendError(res, 400, "INVALID_REQUEST", "הבקשה אינה תקינה.");
    return null;
  }
  return body as Record<string, unknown>;
}

/** Answers 404 for a task that does not exist (never did, or another visitor deleted it). */
export function sendNotFound(res: VercelResponse): void {
  sendError(res, 404, "TASK_NOT_FOUND", "המשימה כבר לא קיימת. ייתכן שנמחקה על ידי מבקר אחר.");
}

/** Answers a failed database operation with a temporary-failure error. */
export function sendDatabaseError(res: VercelResponse, context: string, error: unknown): void {
  logDatabaseError(context, error);
  sendError(res, 503, "DB_UNAVAILABLE", "השרת אינו זמין כרגע. נסה שוב מאוחר יותר.");
}
