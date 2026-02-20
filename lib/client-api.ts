export class ClientApiError extends Error {
  status: number;
  requestId: string | null;

  constructor(message: string, status: number, requestId: string | null) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  timeoutMs?: number;
  body?: unknown;
};

function stringifyBody(body: unknown): BodyInit | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (typeof body === "string") {
    return body;
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return body;
  }

  if (
    typeof URLSearchParams !== "undefined" &&
    body instanceof URLSearchParams
  ) {
    return body;
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return body;
  }

  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return body as BodyInit;
  }

  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) {
    return body as BodyInit;
  }

  return JSON.stringify(body);
}

function hasContentTypeHeader(headers: HeadersInit | undefined): boolean {
  if (!headers) {
    return false;
  }

  if (headers instanceof Headers) {
    return headers.has("Content-Type") || headers.has("content-type");
  }

  if (Array.isArray(headers)) {
    return headers.some(
      ([name]) => name === "Content-Type" || name === "content-type",
    );
  }

  return (
    "Content-Type" in headers ||
    "content-type" in headers
  );
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  options: RequestOptions = {},
): Promise<{ data: T; requestId: string | null }> {
  const { timeoutMs = 45000, headers, body, signal, ...rest } = options;
  const serializedBody = stringifyBody(body);
  const shouldSetJsonContentType =
    serializedBody !== undefined &&
    typeof serializedBody === "string" &&
    !hasContentTypeHeader(headers);

  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", onExternalAbort);
    }
  }

  try {
    const response = await fetch(input, {
      ...rest,
      headers: {
        ...(shouldSetJsonContentType ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: serializedBody,
      signal: controller.signal,
    });

    const requestId = response.headers.get("x-request-id");
    let payload: unknown = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const errorMessage =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : `Request failed with status ${response.status}`;

      throw new ClientApiError(errorMessage, response.status, requestId);
    }

    return { data: payload as T, requestId };
  } catch (error) {
    if (error instanceof ClientApiError) {
      throw error;
    }

    if (
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      if (!didTimeout && signal?.aborted) {
        throw new ClientApiError("Request cancelled.", 499, null);
      }
      throw new ClientApiError(
        "Request timed out. Please try again.",
        408,
        null,
      );
    }

    if (error instanceof Error) {
      throw new ClientApiError(error.message, 500, null);
    }

    throw new ClientApiError("Unknown request error", 500, null);
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

export async function requestBlob(
  input: RequestInfo | URL,
  options: RequestOptions = {},
): Promise<{ data: Blob; requestId: string | null }> {
  const { timeoutMs = 45000, headers, body, signal, ...rest } = options;
  const serializedBody = stringifyBody(body);

  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", onExternalAbort);
    }
  }

  try {
    const response = await fetch(input, {
      ...rest,
      headers,
      body: serializedBody,
      signal: controller.signal,
    });

    const requestId = response.headers.get("x-request-id");

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;

      try {
        const payload = await response.json();
        if (
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
        ) {
          message = payload.error;
        }
      } catch {
        // ignore JSON parse errors for blob endpoints
      }

      throw new ClientApiError(message, response.status, requestId);
    }

    const data = await response.blob();
    return { data, requestId };
  } catch (error) {
    if (error instanceof ClientApiError) {
      throw error;
    }

    if (
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      if (!didTimeout && signal?.aborted) {
        throw new ClientApiError("Request cancelled.", 499, null);
      }
      throw new ClientApiError(
        "Request timed out. Please try again.",
        408,
        null,
      );
    }

    if (error instanceof Error) {
      throw new ClientApiError(error.message, 500, null);
    }

    throw new ClientApiError("Unknown request error", 500, null);
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}
