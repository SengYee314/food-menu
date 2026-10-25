export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return json(
      { error: error.message, code: error.code, ...(error.details ?? {}) },
      error.status,
    );
  }
  const message = fullErrorMessage(error);
  if (message.includes("no such table") || message.includes("D1 binding")) {
    return json(
      { error: "Ordering is being set up. Please try again shortly.", code: "SITE_NOT_READY" },
      503,
    );
  }
  console.error("Ordering API error", error);
  return json({ error: "Something went wrong. Please try again.", code: "SERVER_ERROR" }, 500);
}

export function fullErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? error.cause.message : String(error.cause ?? "");
  return `${error.message} ${cause}`;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  if (raw.length > 8192) throw new ApiError("INVALID_REQUEST", "Order details are too long.", 400);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError("INVALID_REQUEST", "Please send valid order details.", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError("INVALID_REQUEST", "Please send valid order details.", 400);
  }
  return parsed as Record<string, unknown>;
}
