/**
 * The library list is URL-addressable: search, filters, sort and order live in
 * query parameters so a browser back/forward or a shared link restores the same
 * list. Transient UI state (the filter panel, an in-flight search draft) stays
 * local to the component.
 */
export interface LibraryQuery {
  search: string;
  status: string;
  mediaType: string;
  genre: string;
  category: string;
  readingStatus: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

export const DEFAULT_LIBRARY_QUERY: LibraryQuery = {
  search: "",
  status: "",
  mediaType: "",
  genre: "",
  category: "",
  readingStatus: "all",
  sortBy: "lastRead",
  sortOrder: "desc",
};

const PARAM_KEYS = {
  search: "q",
  status: "status",
  mediaType: "type",
  genre: "genre",
  category: "category",
  readingStatus: "reading",
  sortBy: "sort",
  sortOrder: "order",
} as const;

export function parseLibraryQuery(params: URLSearchParams): LibraryQuery {
  const order = params.get(PARAM_KEYS.sortOrder);
  return {
    search: params.get(PARAM_KEYS.search) ?? DEFAULT_LIBRARY_QUERY.search,
    status: params.get(PARAM_KEYS.status) ?? DEFAULT_LIBRARY_QUERY.status,
    mediaType:
      params.get(PARAM_KEYS.mediaType) ?? DEFAULT_LIBRARY_QUERY.mediaType,
    genre: params.get(PARAM_KEYS.genre) ?? DEFAULT_LIBRARY_QUERY.genre,
    category:
      params.get(PARAM_KEYS.category) ?? DEFAULT_LIBRARY_QUERY.category,
    readingStatus:
      params.get(PARAM_KEYS.readingStatus) ??
      DEFAULT_LIBRARY_QUERY.readingStatus,
    sortBy: params.get(PARAM_KEYS.sortBy) ?? DEFAULT_LIBRARY_QUERY.sortBy,
    sortOrder: order === "asc" ? "asc" : "desc",
  };
}

/** Serialize only values that differ from the defaults, keeping URLs short. */
export function serializeLibraryQuery(query: LibraryQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of Object.keys(PARAM_KEYS) as Array<keyof LibraryQuery>) {
    const value = query[key];
    if (value === DEFAULT_LIBRARY_QUERY[key] || !value) continue;
    params.set(PARAM_KEYS[key], value);
  }
  return params;
}

export function updateLibraryQuery(
  current: URLSearchParams,
  patch: Partial<LibraryQuery>,
): URLSearchParams {
  return serializeLibraryQuery({
    ...parseLibraryQuery(current),
    ...patch,
  });
}

export function libraryFiltersFromQuery(query: LibraryQuery) {
  return {
    search: query.search || undefined,
    status: query.status || undefined,
    mediaType: query.mediaType || undefined,
    genre: query.genre || undefined,
    category: query.category || undefined,
    readingStatus:
      query.readingStatus !== "all" ? query.readingStatus : undefined,
    sortBy: query.sortBy,
    // The server has no meaningful "title descending" mode; keep the previous
    // UI behaviour of sorting titles A-Z.
    sortOrder:
      query.sortBy === "title" && query.sortOrder === "desc"
        ? "asc"
        : query.sortOrder,
  };
}

const LAST_LIBRARY_PATH_KEY = "mugiwara.lastLibraryPath";

/** Remember the filtered library so tab navigation can return to it. */
export function saveLastLibraryPath(path: string): void {
  try {
    window.sessionStorage.setItem(LAST_LIBRARY_PATH_KEY, path);
  } catch {
    // Private mode: the current URL still works, only tab return is lost.
  }
}

export function getLastLibraryPath(): string {
  try {
    return window.sessionStorage.getItem(LAST_LIBRARY_PATH_KEY) ?? "/";
  } catch {
    return "/";
  }
}
