import { ZodError } from "zod";
import { logger } from "@/lib/config/logger";

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required") =>
  new ApiError(401, "UNAUTHORIZED", message);
export const notFound = (message = "Resource not found") => new ApiError(404, "NOT_FOUND", message);
export const conflict = (message: string) => new ApiError(409, "CONFLICT", message);

const baseHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: baseHeaders });
}

export function fail(error: unknown): Response {
  if (error instanceof ApiError) {
    const body: ApiErrorBody = { error: { code: error.code, message: error.message, details: error.details } };
    return new Response(JSON.stringify(body), { status: error.status, headers: baseHeaders });
  }
  if (error instanceof ZodError) {
    const body: ApiErrorBody = {
      error: {
        code: "VALIDATION_FAILED",
        message: error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "),
        details: error.issues,
      },
    };
    return new Response(JSON.stringify(body), { status: 400, headers: baseHeaders });
  }
  // Direct marketplace failures are user-fixable business-rule errors, not 500s.
  if (error instanceof Error && error.name === "KeychainRejectedError") {
    const body: ApiErrorBody = { error: { code: "KEYCHAIN_REJECTED", message: error.message } };
    return new Response(JSON.stringify(body), { status: 400, headers: baseHeaders });
  }
  if (error instanceof Error && error.name === "MarketplaceError") {
    const body: ApiErrorBody = { error: { code: "MARKETPLACE_REJECTED", message: error.message } };
    return new Response(JSON.stringify(body), { status: 409, headers: baseHeaders });
  }
  const message = error instanceof Error ? error.message : "Unexpected server error";
  logger.error("API", "Unhandled error", error);
  return new Response(JSON.stringify({ error: { code: "INTERNAL", message } } satisfies ApiErrorBody), {
    status: 500,
    headers: baseHeaders,
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
}
