import { afterEach, describe, expect, it, vi } from "vitest";
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
