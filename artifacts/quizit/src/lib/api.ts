import { API_BASE_URL } from "./config";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  contentType?: string;
  signal?: AbortSignal;
}

/**
 * Centralised REST client for the existing FastAPI backend.
 * Auth is cookie based (HTTP-only `access_token`), so every request must send
 * credentials. No token is ever read or stored by JavaScript.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, contentType, signal } = options;

  const isFormBody = contentType === "application/x-www-form-urlencoded" || body instanceof URLSearchParams;
  const init: RequestInit = {
    method,
    credentials: "include",
    body: isFormBody ? serializeFormBody(body) : body ? JSON.stringify(body) : null,
  };

  if (body && isFormBody) {
    init.headers = { "Content-Type": contentType ?? "application/x-www-form-urlencoded" };
  } else if (body) {
    init.headers = { "Content-Type": contentType ?? "application/json" };
  }

  if (signal) init.signal = signal;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, init);
  } catch {
    throw new ApiError(0, "Unable to connect to quiz1v1. Check your connection and try again.");
  }

  if (response.status === 401) {
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(data) ?? `Request failed (${response.status})`);
  }

  return data as T;
}

function serializeFormBody(body: unknown): string {
  if (body instanceof URLSearchParams) return body.toString();
  if (body && typeof body === "object") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      params.append(key, String(value));
    }
    return params.toString();
  }
  return String(body ?? "");
}

function extractMessage(data: unknown): string | null {
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    const detail = (data as Record<string, unknown>)["detail"];
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length) {
      const first = detail[0] as Record<string, unknown>;
      if (typeof first?.["msg"] === "string") return first["msg"] as string;
    }
    const message = (data as Record<string, unknown>)["message"];
    if (typeof message === "string") return message;
  }
  return null;
}
