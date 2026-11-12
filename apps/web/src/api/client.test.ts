import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./client";

function stubFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chapter request paths", () => {
  it("encodes chapter ids that would otherwise act as URL fragments", async () => {
    const fetchMock = stubFetch();
    const api = new ApiClient("http://server", "token");

    // Local libraries can use ids like "# 1"; an unencoded `#` truncates the
    // URL and the server answers with a generic "Not found".
    await api.downloadChapter("manga-1", "# 1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "http://server/api/manga/manga-1/chapters/%23%201/download",
    );
    expect(init.method).toBe("POST");
  });

  it("encodes slashes in chapter ids so they stay in one path segment", async () => {
    const fetchMock = stubFetch();
    const api = new ApiClient("http://server", "token");

    await api.getChapterPages("manga-1", "bonus/extra");

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      "http://server/api/manga/manga-1/chapters/bonus%2Fextra/pages",
    );
  });
});

const TTL_SECONDS = 900;

function tokenResponse(token: string): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ token, expiresIn: TTL_SECONDS }),
  } as Response);
}

describe("ApiClient content token renewal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renews before the server-side expiry instead of after it", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => tokenResponse("token-1"))
      .mockImplementationOnce(() => tokenResponse("token-2"));
    vi.stubGlobal("fetch", fetchMock);

    const api = new ApiClient("", "auth-token");

    await expect(api.refreshContentToken()).resolves.toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Still comfortably inside the lifetime: reuse the token.
    vi.setSystemTime(
      new Date(
        Date.parse("2026-01-01T00:00:00.000Z") + (TTL_SECONDS - 120) * 1000,
      ),
    );
    await expect(api.refreshContentToken()).resolves.toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Inside the refresh margin but before the real expiry: renew now so a
    // later image request can never present an expired token.
    vi.setSystemTime(
      new Date(
        Date.parse("2026-01-01T00:00:00.000Z") + (TTL_SECONDS - 30) * 1000,
      ),
    );
    await expect(api.refreshContentToken()).resolves.toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports how long until the token needs renewal", () => {
    const api = new ApiClient("", "auth-token");
    expect(api.contentTokenRefreshDelayMs()).toBe(0);

    api.setContentToken("token-1", TTL_SECONDS);
    // TTL minus the one-minute safety margin.
    expect(api.contentTokenRefreshDelayMs()).toBe((TTL_SECONDS - 60) * 1000);

    expect(new ApiClient("").contentTokenRefreshDelayMs()).toBeNull();
  });

  it("shares a single request between concurrent renewals", async () => {
    let resolveFetch: (value: Response) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const api = new ApiClient("", "auth-token");
    const first = api.refreshContentToken(true);
    const second = api.refreshContentToken(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({ token: "token-1", expiresIn: TTL_SECONDS }),
    } as Response);

    await expect(first).resolves.toBe("token-1");
    await expect(second).resolves.toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("always renews when forced, even while the current token is valid", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => tokenResponse("token-1"))
      .mockImplementationOnce(() => tokenResponse("token-2"));
    vi.stubGlobal("fetch", fetchMock);

    const api = new ApiClient("", "auth-token");
    await api.refreshContentToken();
    await expect(api.refreshContentToken(true)).resolves.toBe("token-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not renew without a bearer token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const api = new ApiClient("", null);
    await expect(api.refreshContentToken(true)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
