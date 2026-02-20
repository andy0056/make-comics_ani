import { randomUUID } from "crypto";
import { type NextRequest, NextResponse } from "next/server";

type ApiErrorOptions = {
  status: number;
  error: string;
  requestId: string;
  errorType?: string;
  details?: unknown;
};

export function getRequestId(request: NextRequest): string {
  const existingId = request.headers.get("x-request-id")?.trim();
  return existingId && existingId.length > 0 ? existingId : randomUUID();
}

export function apiJson<T>(
  data: T,
  { status = 200, requestId }: { status?: number; requestId?: string } = {},
) {
  return NextResponse.json(data, {
    status,
    headers: requestId ? { "x-request-id": requestId } : undefined,
  });
}

export function apiError({
  status,
  error,
  requestId,
  errorType,
  details,
}: ApiErrorOptions) {
  return apiJson(
    {
      error,
      requestId,
      ...(errorType ? { errorType } : {}),
      ...(details !== undefined ? { details } : {}),
    },
    { status, requestId },
  );
}

export function logApiError(
  routeName: string,
  requestId: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  console.error(
    `[${routeName}] requestId=${requestId}`,
    context ? { context, error } : error,
  );
}

export function apiInternalError({
  routeName,
  requestId,
  error,
  message = "Internal server error",
}: {
  routeName: string;
  requestId: string;
  error: unknown;
  message?: string;
}) {
  logApiError(routeName, requestId, error);
  return apiError({ status: 500, error: message, requestId });
}
