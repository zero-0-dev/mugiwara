import axios from "axios";

import { TrackerHttpError } from "./types";

export interface TrackerHttpRequest {
  method: "GET" | "POST" | "PATCH";
  url: string;
  headers?: Record<string, string>;
  params?: Record<string, string | number | undefined>;
  data?: unknown;
}

export interface TrackerHttpResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

export interface TrackerHttp {
  request(request: TrackerHttpRequest): Promise<TrackerHttpResponse>;
}

function headerValue(
  headers: Record<string, unknown>,
  name: string,
): string | null {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

/**
 * Thin axios adapter that classifies failures into the tracker error kinds the
 * sync queue understands. Tests inject their own TrackerHttp, so no real
 * network call is required by the test suite.
 */
export const axiosTrackerHttp: TrackerHttp = {
  async request(request) {
    try {
      const response = await axios.request({
        method: request.method,
        url: request.url,
        headers: request.headers,
        params: request.params,
        data: request.data,
        timeout: 15000,
        validateStatus: () => true,
      });
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(response.headers ?? {})) {
        if (typeof value === "string") headers[key.toLowerCase()] = value;
      }

      if (response.status >= 400) {
        const retryAfterMs = parseRetryAfter(
          headerValue(response.headers ?? {}, "retry-after"),
        );
        const kind =
          response.status === 401 || response.status === 403
            ? "auth"
            : response.status === 429
              ? "rate_limit"
              : response.status >= 500
                ? "server"
                : "invalid";
        throw new TrackerHttpError(
          `Tracker request failed with HTTP ${response.status}`,
          { kind, status: response.status, retryAfterMs },
        );
      }

      return {
        status: response.status,
        data: response.data,
        headers,
      };
    } catch (error) {
      if (error instanceof TrackerHttpError) throw error;
      const message =
        error instanceof Error ? error.message : "Unknown tracker network error";
      throw new TrackerHttpError(`Tracker network error: ${message}`, {
        kind: "network",
        cause: error,
      });
    }
  },
};
