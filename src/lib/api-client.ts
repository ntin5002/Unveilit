export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status = 0,
    public readonly code = "REQUEST_FAILED"
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  [key: string]: unknown;
}

async function decodeResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  const text = await response.text();
  if (!text) return { success: response.ok };
  try {
    return JSON.parse(text) as ApiEnvelope<T>;
  } catch {
    if (!response.ok) {
      throw new ApiClientError(`Request failed with HTTP ${response.status}.`, response.status, "INVALID_ERROR_RESPONSE");
    }
    throw new ApiClientError("The server returned an invalid response.", response.status, "INVALID_RESPONSE");
  }
}

export async function apiRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<ApiEnvelope<T> & { data: T }> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed.";
    throw new ApiClientError(message, 0, "NETWORK_ERROR");
  }

  const body = await decodeResponse<T>(response);
  if (!response.ok || body.success === false) {
    throw new ApiClientError(
      body.error || body.message || `Request failed with HTTP ${response.status}.`,
      response.status,
      body.code || "REQUEST_FAILED"
    );
  }
  if (!("data" in body)) {
    return { ...body, data: undefined as T };
  }
  return body as ApiEnvelope<T> & { data: T };
}

export function userErrorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
