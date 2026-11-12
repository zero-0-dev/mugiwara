import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ApiClient } from "../src/api/client";
import { ApiClientProvider } from "../src/api/context";
import { Reader } from "../src/components/Reader";

vi.mock("../src/api/hooks", () => ({
  useChapterPages: () => ({
    data: [
      { index: 0, url: "/page-0.jpg", width: 800, height: 1200 },
      { index: 1, url: "/page-1.jpg", width: 800, height: 1200 },
    ],
    isLoading: false,
  }),
  useChapterProgress: () => ({ data: null, isLoading: false }),
  useManga: () => ({ data: { id: "m1", title: "One Piece" } }),
  useChapters: () => ({
    data: [
      { id: "c1", chapterId: "1", title: "Chapter 1" },
      { id: "c2", chapterId: "2", title: "Chapter 2" },
    ],
  }),
  useReadingMode: () => ({ data: { mode: "vertical" } }),
  useSettings: () => ({ data: {} }),
  useUpdateChapterProgress: () => ({ mutate: vi.fn() }),
  useSetReadingMode: () => ({ mutate: vi.fn() }),
}));

function renderReader() {
  render(
    <ApiClientProvider
      baseUrl=""
      authToken="auth-token"
      contentToken="old-token"
    >
      <Reader
        mangaId="m1"
        chapterId="c1"
        onBack={vi.fn()}
        onNextChapter={vi.fn()}
        onPrevChapter={vi.fn()}
      />
    </ApiClientProvider>,
  );
}

describe("Reader page asset recovery", () => {
  beforeEach(() => {
    // jsdom does not implement scrolling.
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollBy = vi.fn();
  });

  it("renews the content token and retries a page once", async () => {
    const refresh = vi
      .spyOn(ApiClient.prototype, "refreshContentToken")
      .mockImplementation(function (this: ApiClient) {
        this.setContentToken("new-token", 900);
        return Promise.resolve("new-token");
      });

    renderReader();

    const image = await screen.findByLabelText("Page 1");
    expect(image.getAttribute("src")).toContain("contentToken=old-token");

    fireEvent.error(image);

    await waitFor(() => {
      expect(screen.getByLabelText("Page 1").getAttribute("src")).toContain(
        "contentToken=new-token",
      );
    });
    expect(refresh).toHaveBeenCalledWith(true);
    expect(screen.getByLabelText("Page 1").getAttribute("src")).toContain(
      "t=1",
    );
    expect(screen.queryByText("Page 1 failed to load")).toBeNull();

    // A second failure for the same page is not retried forever.
    fireEvent.error(screen.getByLabelText("Page 1"));
    expect(await screen.findByText("Page 1 failed to load")).toBeTruthy();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the error immediately when the token cannot be renewed", async () => {
    vi.spyOn(ApiClient.prototype, "refreshContentToken").mockResolvedValue(null);

    renderReader();

    fireEvent.error(await screen.findByLabelText("Page 1"));

    expect(await screen.findByText("Page 1 failed to load")).toBeTruthy();
  });
});
