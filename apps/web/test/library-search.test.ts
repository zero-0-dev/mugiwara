import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LIBRARY_QUERY,
  getLastLibraryPath,
  parseLibraryQuery,
  saveLastLibraryPath,
  serializeLibraryQuery,
  updateLibraryQuery,
} from "../src/routing/librarySearch";

afterEach(() => {
  window.sessionStorage.clear();
});

describe("librarySearch", () => {
  it("parses an empty query as the defaults", () => {
    expect(parseLibraryQuery(new URLSearchParams())).toEqual(
      DEFAULT_LIBRARY_QUERY,
    );
  });

  it("round-trips non-default values and omits defaults", () => {
    const query = {
      ...DEFAULT_LIBRARY_QUERY,
      search: "one piece",
      status: "ongoing",
      sortBy: "title",
      sortOrder: "asc" as const,
    };
    const params = serializeLibraryQuery(query);

    expect(params.toString()).toBe("q=one+piece&status=ongoing&sort=title&order=asc");
    expect(parseLibraryQuery(params)).toEqual(query);
  });

  it("updates one field without dropping the others", () => {
    const current = new URLSearchParams("q=dragon&status=ongoing&sort=title");
    const next = updateLibraryQuery(current, { status: "completed" });

    expect(parseLibraryQuery(next)).toMatchObject({
      search: "dragon",
      status: "completed",
      sortBy: "title",
    });
  });

  it("remembers the last filtered library path for tab navigation", () => {
    expect(getLastLibraryPath()).toBe("/");
    saveLastLibraryPath("/?q=dragon&sort=title");
    expect(getLastLibraryPath()).toBe("/?q=dragon&sort=title");
  });
});
