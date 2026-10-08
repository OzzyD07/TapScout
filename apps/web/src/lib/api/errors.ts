import type { ApiError } from "@tapscout/shared";
import type { ZodError } from "zod";

export type ApiErrorCode = ApiError["error"]["code"];

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Custom SQLSTATEs raised by the RPCs (supabase/migrations/*_rpc.sql). */
const SQLSTATE: Record<string, { status: number; code: ApiErrorCode }> = {
  AQ001: { status: 409, code: "lease_lost" },
  AQ002: { status: 409, code: "cancelled" },
  AQ003: { status: 409, code: "conflict" },
  AQ004: { status: 400, code: "invalid_request" },
  AQ005: { status: 429, code: "budget_exhausted" },
};

export interface PostgrestLikeError {
  code?: string;
  message: string;
}

export function fromDbError(error: PostgrestLikeError): HttpError {
  const mapped = error.code ? SQLSTATE[error.code] : undefined;
  if (mapped) return new HttpError(mapped.status, mapped.code, error.message);
  return new HttpError(500, "internal", "database error");
}

export function fromZodError(error: ZodError): HttpError {
  const first = error.issues[0];
  const where = first?.path.length ? ` at ${first.path.join(".")}` : "";
  return new HttpError(400, "invalid_request", `${first?.message ?? "invalid request"}${where}`);
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json(
      { error: { code: error.code, message: error.message } } satisfies ApiError,
      {
        status: error.status,
      },
    );
  }
  console.error("unhandled API error", error);
  return Response.json(
    { error: { code: "internal", message: "internal error" } } satisfies ApiError,
    { status: 500 },
  );
}

export function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match?.[1]) throw new HttpError(401, "unauthorized", "missing bearer token");
  return match[1];
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "invalid_request", "body must be JSON");
  }
}
