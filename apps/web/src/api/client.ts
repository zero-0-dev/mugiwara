import type { LibraryFilterOptions, LibraryManga } from "@mugiwara-manga/types";
import { getDeviceId } from "./device";

export interface Source {
  id: string;
  name: string;
  description: string;
}

export interface SearchResult {
  sourceMangaId: string;
  title: string;
  coverImageUrl?: string;
  description?: string;
  author?: string;
  artist?: string;
}

export interface MangaDetails {
  sourceMangaId: string;
  title: string;
  coverImageUrl?: string;
  chapters: Array<{
    sourceChapterId: string;
    chapterId: string;
    title?: string;
    sortOrder: number;
    language?: string;
    scanlationGroup?: string;
  }>;
}

export interface ImportProgressResponse {
  mangaId: string;
  totalChapters: number;
  completedChapters: number;
  erroredChapters: number;
  downloadingChapters: number;
  queuedChapters: number;
  cancelledChapters?: number;
  overallProgress: number;
  isComplete: boolean;
  chapters: Array<{
    chapterId: string;
    title?: string;
    sortOrder: number;
    status: "queued" | "downloading" | "complete" | "error" | "cancelled";
    totalPages?: number;
    completedPages?: number;
    errorMessage?: string;
  }>;
}

export interface AniListManga {
  id: number;
  title: { romaji: string; english: string | null; native: string | null };
  description: string | null;
  coverImage: { large: string; medium: string } | null;
  bannerImage: string | null;
  author: string | null;
  artist: string | null;
  status: string;
  genres: string[];
  mediaType: string;
  tags: { name: string }[];
  startDate: { year: number | null; month: number | null; day: number | null };
  chapters: number | null;
  volumes: number | null;
  averageScore?: number;
  popularity?: number;
  favourites?: number;
}

export interface BrowseResult {
  manga: AniListManga[];
  pageInfo: { hasNextPage: boolean; currentPage: number; totalPages: number };
}

export type MangaWithCount = LibraryManga;

export type FilterOptions = LibraryFilterOptions;

export interface ChapterWithProgress {
  id: string;
  mangaId: string;
  sourceChapterId: string;
  title?: string;
  sortOrder: number;
  language?: string;
  scanlationGroup?: string;
  progress?: { completed: boolean; pageNumber?: number; totalPages?: number };
}

export interface ReadingProgress {
  id: string;
  mangaId: string;
  chapterId: string | null;
  pageNumber: number;
  totalPages: number;
  percentComplete: number;
  isCompleted: boolean;
  lastReadAt: string;
  deviceId?: string;
}

export interface ImportTask {
  id: string;
  mangaId: string;
  mangaTitle: string;
  sourceId: string;
  status: string;
  progress: number;
  error?: string;
  createdAt: string;
}

export interface QueueStats {
  total: number;
  queued: number;
  downloading: number;
  complete: number;
  error: number;
}

export interface StorageBackend {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  isDefault?: boolean;
}

export interface StorageType {
  id: string;
  name: string;
  description: string;
  configSchema: Record<string, unknown>;
}

export interface StorageUsageManga {
  mangaId: string;
  title: string;
  coverImage?: string;
  storageBackendId: string | null;
  downloadedChapterCount: number;
  totalBytes: number;
  lastReadAt: string | null;
  error?: string;
}

export interface StorageUsage {
  summary: {
    totalBytes: number;
    mangaWithDownloads: number;
    downloadedChapters: number;
  };
  manga: StorageUsageManga[];
}

export interface ChapterDeleteResult {
  chapterId: string;
  chapterRecordId: string;
  title: string | null;
  bytesFreed: number;
  success: boolean;
  error?: string;
}

export interface MangaDownloadsDeleteResult {
  mangaId: string;
  deletedCount: number;
  failedCount: number;
  bytesFreed: number;
  results: ChapterDeleteResult[];
}

export interface InstalledPlugin {
  id: string;
  type: string;
  version: string;
  isBuiltin: boolean;
  isEnabled: boolean;
  config?: Record<string, unknown>;
  installedAt?: string;
  updatedAt?: string;
}

export interface AvailablePlugin {
  name: string;
  version: string;
  description?: string;
  author?: string;
  keywords?: string[];
}

export interface AuthDevice {
  id: string;
  label: string;
  isAdmin: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  isCurrent?: boolean;
}

export interface AuthStatus {
  authRequired: boolean;
  paired: boolean;
  firstRun: boolean;
  activeDevices: number;
}

export interface PluginPolicy {
  installEnabled: boolean;
  reason: string | null;
  exposedOnNetwork: boolean;
  allowRemoteInstall: boolean;
  registryUrl: string;
  allowlistMode: "explicit" | "namespace";
  allowedPackages: string[];
}

export class ApiClient {
  private baseUrl: string;
  private authToken: string | null;
  private contentToken: string | null = null;
  private contentTokenExpiresAt = 0;

  constructor(baseUrl: string, authToken: string | null = null) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setAuthToken(token: string | null) {
    this.authToken = token;
    this.contentToken = null;
    this.contentTokenExpiresAt = 0;
  }

  hasAuthToken(): boolean {
    return Boolean(this.authToken);
  }

  setContentToken(token: string | null, expiresInSeconds?: number) {
    this.contentToken = token;
    this.contentTokenExpiresAt = token
      ? Date.now() + Math.max(30, (expiresInSeconds ?? 900) - 60) * 1000
      : 0;
  }

  getAssetUrl(path?: string, cacheBuster?: number): string | undefined {
    if (!path) return undefined;
    let url: string;
    if (/^https?:\/\//i.test(path)) {
      url = path;
    } else if (path.startsWith("file://")) {
      // Local sources report files by absolute path. The browser (including
      // the Electron renderer served over http) cannot load file:// URLs, so
      // route them through the server's local content endpoint.
      let filePath = decodeURIComponent(path.slice("file://".length));
      if (/^\/[A-Za-z]:[\\/]/.test(filePath)) filePath = filePath.slice(1);
      url = `${this.baseUrl}/api/content/local/chapter?path=${encodeURIComponent(filePath)}`;
    } else {
      url = `${this.baseUrl}${path}`;
    }
    const params: string[] = [];
    if (cacheBuster) params.push(`t=${cacheBuster}`);
    // <img> cannot send an Authorization header. The session cookie covers
    // same-origin browser/Electron, while this short-lived scoped token covers
    // Capacitor and any other cross-origin client.
    if (this.contentToken) {
      params.push(`contentToken=${encodeURIComponent(this.contentToken)}`);
    }
    if (params.length === 0) return url;
    return `${url}${url.includes("?") ? "&" : "?"}${params.join("&")}`;
  }

  async refreshContentToken(): Promise<string | null> {
    if (!this.authToken) return null;
    if (this.contentToken && Date.now() < this.contentTokenExpiresAt) {
      return this.contentToken;
    }
    try {
      const issued = await this.request<{ token: string; expiresIn: number }>(
        "/api/auth/content-token",
        { method: "POST" },
      );
      this.setContentToken(issued.token, issued.expiresIn);
      return issued.token;
    } catch {
      return null;
    }
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const headers = new Headers(options?.headers);
    if (options?.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (this.authToken) {
      headers.set("Authorization", `Bearer ${this.authToken}`);
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
        credentials: "same-origin",
      });
    } catch (error) {
      // A failed fetch here means the browser could not reach the server at
      // all. Surface that as an actionable message instead of "Failed to
      // fetch", which gives the user nothing to fix.
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Cannot reach the Mugiwara server. Check that the server is running and that this device is on the same network. (${detail})`,
      );
    }
    if (!response.ok) {
      if (response.status === 401 && this.authToken) {
        window.dispatchEvent(new CustomEvent("mugiwara:unauthorized"));
      }
      const errorData = await response
        .json()
        .catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || response.statusText);
    }
    if (response.status === 204 || response.status === 205) {
      return undefined as T;
    }
    return response.json();
  }

  // Auth / pairing
  getAuthStatus(): Promise<AuthStatus> {
    return this.request<AuthStatus>("/api/auth/status");
  }

  getMe(): Promise<{ device: AuthDevice; isAdmin: boolean; via: string }> {
    return this.request("/api/auth/me");
  }

  getDevices(): Promise<AuthDevice[]> {
    return this.request("/api/auth/devices");
  }

  revokeDevice(id: string): Promise<void> {
    return this.request(`/api/auth/devices/${encodeURIComponent(id)}/revoke`, {
      method: "POST",
    });
  }

  logout(): Promise<void> {
    return this.request("/api/auth/logout", { method: "POST" });
  }

  logoutAll(): Promise<{ revokedDevices: number }> {
    return this.request("/api/auth/logout-all", { method: "POST" });
  }

  rotateToken(): Promise<{ token: string; device: AuthDevice }> {
    return this.request("/api/auth/rotate", { method: "POST" });
  }

  createPairingCode(): Promise<{
    code: string;
    expiresAt: string;
    expiresIn: number;
  }> {
    return this.request("/api/auth/pairing/init", { method: "POST" });
  }

  // Plugin install policy
  getPluginPolicy(): Promise<PluginPolicy> {
    return this.request("/api/plugins/policy");
  }

  // Library
  getLibrary(params?: {
    search?: string;
    status?: string;
    mediaType?: string;
    genre?: string;
    category?: string;
    readingStatus?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<MangaWithCount[]> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.mediaType) searchParams.set("mediaType", params.mediaType);
    if (params?.genre) searchParams.set("genre", params.genre);
    if (params?.category) searchParams.set("category", params.category);
    if (params?.readingStatus)
      searchParams.set("readingStatus", params.readingStatus);
    if (params?.sortBy) searchParams.set("sortBy", params.sortBy);
    if (params?.sortOrder) searchParams.set("sortOrder", params.sortOrder);
    const qs = searchParams.toString();
    return this.request<MangaWithCount[]>(
      `/api/library/filter${qs ? `?${qs}` : ""}`,
    );
  }

  getFilterOptions(): Promise<FilterOptions> {
    return this.request<FilterOptions>("/api/library/filters/options");
  }

  // Manga
  getManga(id: string): Promise<import("@mugiwara-manga/types").Manga> {
    return this.request(`/api/manga/${id}`);
  }

  deleteManga(id: string): Promise<void> {
    return this.request(`/api/manga/${id}`, { method: "DELETE" });
  }

  updateManga(
    id: string,
    body: Partial<import("@mugiwara-manga/types").Manga>,
  ): Promise<void> {
    return this.request(`/api/manga/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  getChapters(
    mangaId: string,
  ): Promise<import("@mugiwara-manga/types").Chapter[]> {
    return this.request(`/api/manga/${mangaId}/chapters`);
  }

  getChapterPages(
    mangaId: string,
    chapterId: string,
  ): Promise<import("@mugiwara-manga/types").PageInfo[]> {
    return this.request(`/api/manga/${mangaId}/chapters/${chapterId}/pages`);
  }

  getAllChapterProgress(mangaId: string): Promise<ReadingProgress[]> {
    return this.request(`/api/manga/${mangaId}/progress/all`);
  }

  getChapterProgress(
    mangaId: string,
    chapterId: string,
  ): Promise<ReadingProgress> {
    return this.request(`/api/manga/${mangaId}/chapters/${chapterId}/progress`);
  }

  updateChapterProgress(
    mangaId: string,
    chapterId: string,
    body: { pageNumber: number; totalPages: number; isCompleted: boolean },
  ): Promise<void> {
    return this.request(
      `/api/manga/${mangaId}/chapters/${chapterId}/progress`,
      {
        method: "POST",
        body: JSON.stringify({ ...body, deviceId: getDeviceId() }),
      },
    );
  }

  markChapterComplete(
    mangaId: string,
    chapterId: string,
    body?: { markPrevious?: boolean },
  ): Promise<void> {
    return this.request(
      `/api/manga/${mangaId}/chapters/${chapterId}/complete`,
      {
        method: "POST",
        body: JSON.stringify({ ...(body || {}), deviceId: getDeviceId() }),
      },
    );
  }

  markChapterIncomplete(
    mangaId: string,
    chapterId: string,
    body?: { markFollowing?: boolean },
  ): Promise<void> {
    return this.request(
      `/api/manga/${mangaId}/chapters/${chapterId}/complete`,
      {
        method: "DELETE",
        body: JSON.stringify({ ...(body || {}), deviceId: getDeviceId() }),
      },
    );
  }

  downloadChapter(mangaId: string, chapterId: string): Promise<void> {
    return this.request(
      `/api/manga/${mangaId}/chapters/${chapterId}/download`,
      { method: "POST" },
    );
  }

  deleteChapterDownload(
    mangaId: string,
    chapterId: string,
  ): Promise<ChapterDeleteResult> {
    return this.request(
      `/api/manga/${mangaId}/chapters/${encodeURIComponent(chapterId)}/download`,
      { method: "DELETE" },
    );
  }

  deleteMangaDownloads(mangaId: string): Promise<MangaDownloadsDeleteResult> {
    return this.request(`/api/manga/${mangaId}/downloads`, {
      method: "DELETE",
    });
  }

  // Metadata
  fetchMetadata(mangaId: string): Promise<void> {
    return this.request(`/api/manga/${mangaId}/metadata/fetch`, {
      method: "POST",
    });
  }

  searchMetadata(mangaId: string, query: string): Promise<AniListManga[]> {
    return this.request(
      `/api/manga/${mangaId}/metadata/search?q=${encodeURIComponent(query)}`,
    );
  }

  applyMetadata(mangaId: string, body: { anilistId: number }): Promise<void> {
    return this.request(`/api/manga/${mangaId}/metadata/apply`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // Categories
  getCategories(): Promise<
    Array<{
      id: string;
      name: string;
      color?: string;
      sortOrder: number;
      createdAt: string;
    }>
  > {
    return this.request("/api/categories");
  }

  getMangaCategories(mangaId: string): Promise<
    Array<{
      id: string;
      name: string;
      color?: string;
      sortOrder: number;
      createdAt: string;
    }>
  > {
    return this.request(`/api/categories/manga/${mangaId}/categories`);
  }

  addMangaToCategory(mangaId: string, categoryId: string): Promise<void> {
    return this.request(`/api/categories/manga/${mangaId}/categories`, {
      method: "POST",
      body: JSON.stringify({ categoryId }),
    });
  }

  removeMangaFromCategory(mangaId: string, categoryId: string): Promise<void> {
    return this.request(
      `/api/categories/manga/${mangaId}/categories/${categoryId}`,
      { method: "DELETE" },
    );
  }

  // Sources
  getSources(): Promise<Source[]> {
    return this.request("/api/library/sources");
  }

  searchSource(sourceId: string, query: string): Promise<SearchResult[]> {
    return this.request(
      `/api/library/sources/${sourceId}/search?q=${encodeURIComponent(query)}`,
    );
  }

  getSourceManga(
    sourceId: string,
    sourceMangaId: string,
  ): Promise<MangaDetails> {
    return this.request(
      `/api/library/sources/${sourceId}/manga/${encodeURIComponent(sourceMangaId)}`,
    );
  }

  // Import
  importManga(body: {
    sourceId: string;
    sourceMangaId: string;
    chapters: MangaDetails["chapters"];
  }): Promise<import("../components/add-manga/types").ImportMangaResult> {
    return this.request("/api/library/import", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  getImportProgress(mangaId: string): Promise<ImportProgressResponse> {
    return this.request(`/api/library/import/${mangaId}/progress`);
  }

  cancelImport(
    mangaId: string,
  ): Promise<import("../components/add-manga/types").CancelImportResult> {
    return this.request(`/api/library/import/${mangaId}/cancel`, {
      method: "POST",
    });
  }

  // Settings
  getSettings(): Promise<Record<string, unknown>> {
    return this.request("/api/settings");
  }

  saveSetting(key: string, value: unknown): Promise<void> {
    return this.request(`/api/settings/${key}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    });
  }

  getReadingMode(mangaId: string): Promise<{ mode: string }> {
    return this.request(`/api/settings/readingMode/manga/${mangaId}`);
  }

  setReadingMode(mangaId: string, mode: string): Promise<void> {
    return this.request(`/api/settings/readingMode.${mangaId}`, {
      method: "PUT",
      body: JSON.stringify({ value: mode }),
    });
  }

  // Discover
  discoverBrowse(params: {
    sort?: string;
    country?: string;
    search?: string;
    genre?: string;
    format?: string;
    status?: string;
    page?: number;
    perPage?: number;
  }): Promise<BrowseResult> {
    const searchParams = new URLSearchParams();
    if (params.sort) searchParams.set("sort", params.sort);
    if (params.country) searchParams.set("country", params.country);
    if (params.search) searchParams.set("search", params.search);
    if (params.genre) searchParams.set("genre", params.genre);
    if (params.format) searchParams.set("format", params.format);
    if (params.status) searchParams.set("status", params.status);
    if (params.page) searchParams.set("page", String(params.page));
    if (params.perPage) searchParams.set("perPage", String(params.perPage));
    return this.request(`/api/discover/browse?${searchParams.toString()}`);
  }

  discoverManga(anilistId: number): Promise<AniListManga> {
    return this.request(`/api/discover/manga/${anilistId}`);
  }

  // Queue
  getQueueTasks(limit = 50, mangaId?: string): Promise<ImportTask[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (mangaId) params.set("mangaId", mangaId);
    return this.request(`/api/queue/tasks?${params.toString()}`);
  }

  getQueueStats(): Promise<QueueStats> {
    return this.request("/api/queue/stats");
  }

  cancelTask(taskId: string): Promise<void> {
    return this.request(`/api/queue/tasks/${taskId}/cancel`, {
      method: "POST",
    });
  }

  retryTask(taskId: string): Promise<void> {
    return this.request(`/api/queue/tasks/${taskId}/retry`, { method: "POST" });
  }

  retryAllFailed(): Promise<void> {
    return this.request("/api/queue/retry-failed", { method: "POST" });
  }

  clearCompleted(): Promise<void> {
    return this.request("/api/queue/clear-complete", { method: "POST" });
  }

  // Storage
  getStorageBackends(): Promise<StorageBackend[]> {
    return this.request("/api/storage/backends");
  }

  getStorageTypes(): Promise<StorageType[]> {
    return this.request("/api/storage/types");
  }

  createStorageBackend(body: {
    type: string;
    name: string;
    config: Record<string, unknown>;
    isDefault?: boolean;
  }): Promise<void> {
    return this.request("/api/storage/backends", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  updateStorageBackend(
    id: string,
    body: { config: Record<string, unknown>; isDefault?: boolean },
  ): Promise<void> {
    return this.request(`/api/storage/backends/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  deleteStorageBackend(id: string): Promise<void> {
    return this.request(`/api/storage/backends/${id}`, { method: "DELETE" });
  }

  scanStorage(body: { backendId?: string }): Promise<void> {
    return this.request("/api/storage/scan", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  getStorageUsage(params?: {
    sort?: "size" | "lastRead";
    order?: "asc" | "desc";
  }): Promise<StorageUsage> {
    const searchParams = new URLSearchParams();
    if (params?.sort) searchParams.set("sort", params.sort);
    if (params?.order) searchParams.set("order", params.order);
    const qs = searchParams.toString();
    return this.request<StorageUsage>(
      `/api/storage/usage${qs ? `?${qs}` : ""}`,
    );
  }

  // Plugins
  getInstalledPlugins(): Promise<InstalledPlugin[]> {
    return this.request("/api/plugins/installed");
  }

  getAvailablePlugins(): Promise<AvailablePlugin[]> {
    return this.request("/api/plugins/available");
  }

  installPlugin(body: {
    packageName: string;
    version?: string;
    confirm: true;
  }): Promise<void> {
    return this.request("/api/plugins/install", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  uninstallPlugin(id: string): Promise<void> {
    return this.request(`/api/plugins/${id}/uninstall`, {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    });
  }

  enablePlugin(id: string): Promise<void> {
    return this.request(`/api/plugins/${id}/enable`, { method: "POST" });
  }

  disablePlugin(id: string): Promise<void> {
    return this.request(`/api/plugins/${id}/disable`, { method: "POST" });
  }

  // Library Updates
  checkMangaUpdates(mangaId: string): Promise<{ newChaptersFound: number }> {
    return this.request(`/api/library/manga/${mangaId}/check-updates`, {
      method: "POST",
    });
  }

  checkLibraryUpdates(): Promise<{
    checked: number;
    updated: number;
    newChaptersTotal: number;
  }> {
    return this.request("/api/library/check-updates", { method: "POST" });
  }

  downloadAllChapters(mangaId: string): Promise<{ chaptersQueued: number }> {
    return this.request(`/api/library/manga/${mangaId}/download-all`, {
      method: "POST",
    });
  }
}
