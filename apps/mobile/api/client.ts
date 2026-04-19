import axios, { AxiosInstance } from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Manga,
  Chapter,
  ReadingProgress,
  Category,
  Source,
  SearchResult,
  ImportTask,
  QueueStats,
  PageInfo,
  ReadingMode,
} from "../types";

const SERVER_URL_KEY = "@mugiwara/server_url";

class ApiClient {
  private client: AxiosInstance | null = null;
  private serverUrl: string = "";

  async initialize(): Promise<boolean> {
    const url = await AsyncStorage.getItem(SERVER_URL_KEY);
    if (url) {
      this.setServerUrl(url);
      return true;
    }
    return false;
  }

  setServerUrl(url: string): void {
    // Remove trailing slash
    this.serverUrl = url.replace(/\/$/, "");
    this.client = axios.create({
      baseURL: `${this.serverUrl}/api`,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  async saveServerUrl(url: string): Promise<void> {
    await AsyncStorage.setItem(SERVER_URL_KEY, url);
    this.setServerUrl(url);
  }

  getServerUrl(): string {
    return this.serverUrl;
  }

  async testConnection(url?: string): Promise<boolean> {
    const testUrl = url || this.serverUrl;
    if (!testUrl) return false;

    try {
      const response = await axios.get(
        `${testUrl.replace(/\/$/, "")}/api/health`,
        {
          timeout: 5000,
        },
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }

  private getClient(): AxiosInstance {
    if (!this.client) {
      throw new Error("API client not initialized. Call setServerUrl() first.");
    }
    return this.client;
  }

  // Library
  async getLibrary(
    search?: string,
    status?: string,
    mediaType?: string,
    genre?: string,
    category?: string,
    readingStatus?: string,
    sortBy?: string,
    sortOrder?: "asc" | "desc",
  ): Promise<Manga[]> {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status) params.append("status", status);
    if (mediaType) params.append("mediaType", mediaType);
    if (genre) params.append("genre", genre);
    if (category) params.append("category", category);
    if (readingStatus) params.append("readingStatus", readingStatus);
    if (sortBy) params.append("sortBy", sortBy);
    if (sortOrder) params.append("sortOrder", sortOrder);

    const response = await this.getClient().get(
      `/library/filter?${params.toString()}`,
    );
    return response.data;
  }

  async getFilterOptions(): Promise<{
    categories: Category[];
    statuses: { status: string; count: number }[];
    mediaTypes: { mediaType: string; count: number }[];
  }> {
    const response = await this.getClient().get("/library/filters/options");
    return response.data;
  }

  // Manga
  async getManga(id: string): Promise<Manga> {
    const response = await this.getClient().get(`/manga/${id}`);
    return response.data;
  }

  async deleteManga(id: string): Promise<void> {
    await this.getClient().delete(`/manga/${id}`);
  }

  // Chapters
  async getChapters(mangaId: string): Promise<Chapter[]> {
    const response = await this.getClient().get(`/manga/${mangaId}/chapters`);
    return response.data;
  }

  async getChapterPages(
    mangaId: string,
    chapterId: string,
  ): Promise<PageInfo[]> {
    const response = await this.getClient().get(
      `/manga/${mangaId}/chapters/${chapterId}/pages`,
    );
    return response.data;
  }

  getPageUrl(mangaId: string, chapterId: string, pageNumber: number): string {
    return `${this.serverUrl}/api/manga/${mangaId}/chapters/${chapterId}/pages/${pageNumber}`;
  }

  getCoverUrl(coverPath?: string): string | undefined {
    if (!coverPath) return undefined;
    if (coverPath.startsWith("http")) return coverPath;
    return `${this.serverUrl}${coverPath}`;
  }

  // Reading Progress - Legacy (DEPRECATED)
  /** @deprecated Use getAllChapterProgress for per-chapter tracking */
  async getProgress(mangaId: string): Promise<ReadingProgress | null> {
    try {
      const response = await this.getClient().get(`/manga/${mangaId}/progress`);
      return response.data;
    } catch {
      return null;
    }
  }

  /** @deprecated Use updateChapterProgress for per-chapter tracking */
  async updateProgress(
    mangaId: string,
    chapterId: string | undefined,
    pageNumber: number,
    totalPages: number,
    isCompleted?: boolean,
  ): Promise<void> {
    await this.getClient().post(`/manga/${mangaId}/progress`, {
      chapterId,
      pageNumber,
      totalPages,
      isCompleted,
    });
  }

  // Reading Progress - New Per-Chapter APIs

  // Get all chapter progress for a manga
  async getAllChapterProgress(mangaId: string): Promise<ReadingProgress[]> {
    try {
      const response = await this.getClient().get(
        `/manga/${mangaId}/progress/all`,
      );
      return response.data || [];
    } catch {
      return [];
    }
  }

  // Update chapter progress (for reader)
  async updateChapterProgress(
    mangaId: string,
    chapterId: string,
    pageNumber: number,
    totalPages: number,
    isCompleted?: boolean,
  ): Promise<ReadingProgress> {
    const response = await this.getClient().post(
      `/manga/${mangaId}/chapters/${chapterId}/progress`,
      {
        pageNumber,
        totalPages,
        isCompleted,
      },
    );
    return response.data;
  }

  // Get progress for a specific chapter
  async getChapterProgress(
    mangaId: string,
    chapterId: string,
  ): Promise<ReadingProgress | null> {
    try {
      const response = await this.getClient().get(
        `/manga/${mangaId}/chapters/${chapterId}/progress`,
      );
      return response.data;
    } catch {
      return null;
    }
  }

  // Mark chapter as complete (read)
  // markPrevious: If true, also marks all previous chapters as read
  async markChapterComplete(
    mangaId: string,
    chapterId: string,
    markPrevious?: boolean,
  ): Promise<{ success: boolean; message: string; markedCount: number }> {
    const response = await this.getClient().post(
      `/manga/${mangaId}/chapters/${chapterId}/complete`,
      {
        markPrevious: markPrevious || false,
      },
    );
    return response.data;
  }

  // Mark chapter as incomplete (unread)
  // markFollowing: If true, also marks all following chapters as unread
  async markChapterIncomplete(
    mangaId: string,
    chapterId: string,
    markFollowing?: boolean,
  ): Promise<{ success: boolean; message: string; markedCount: number }> {
    const response = await this.getClient().delete(
      `/manga/${mangaId}/chapters/${chapterId}/complete`,
      {
        data: {
          markFollowing: markFollowing || false,
        },
      },
    );
    return response.data;
  }

  // Categories
  async getCategories(): Promise<Category[]> {
    const response = await this.getClient().get("/categories");
    return response.data;
  }

  async getMangaCategories(mangaId: string): Promise<Category[]> {
    const response = await this.getClient().get(`/manga/${mangaId}/categories`);
    return response.data;
  }

  async addMangaToCategory(mangaId: string, categoryId: string): Promise<void> {
    await this.getClient().post(`/manga/${mangaId}/categories`, { categoryId });
  }

  async removeMangaFromCategory(
    mangaId: string,
    categoryId: string,
  ): Promise<void> {
    await this.getClient().delete(`/manga/${mangaId}/categories/${categoryId}`);
  }

  // Sources
  async getSources(): Promise<Source[]> {
    const response = await this.getClient().get("/library/sources");
    return response.data;
  }

  async searchSource(sourceId: string, query: string): Promise<SearchResult[]> {
    const response = await this.getClient().get(
      `/library/sources/${sourceId}/search?q=${encodeURIComponent(query)}`,
    );
    return response.data;
  }

  async importManga(sourceId: string, sourceMangaId: string): Promise<void> {
    await this.getClient().post("/library/import", {
      sourceId,
      sourceMangaId,
    });
  }

  // Queue
  async getQueueTasks(): Promise<ImportTask[]> {
    const response = await this.getClient().get("/queue/tasks");
    return response.data;
  }

  async getQueueStats(): Promise<QueueStats> {
    const response = await this.getClient().get("/queue/stats");
    return response.data;
  }

  async cancelTask(taskId: string): Promise<void> {
    await this.getClient().post(`/queue/tasks/${taskId}/cancel`);
  }

  async retryTask(taskId: string): Promise<void> {
    await this.getClient().post(`/queue/tasks/${taskId}/retry`);
  }

  // Settings
  async getSettings(): Promise<Record<string, string>> {
    const response = await this.getClient().get("/settings");
    return response.data;
  }

  async getReadingMode(mangaId: string): Promise<ReadingMode> {
    const response = await this.getClient().get(
      `/settings/readingMode/manga/${mangaId}`,
    );
    return response.data.mode;
  }

  async setReadingMode(mangaId: string, mode: ReadingMode): Promise<void> {
    await this.getClient().put(`/settings/readingMode.${mangaId}`, {
      value: mode,
    });
  }
}

export const apiClient = new ApiClient();
