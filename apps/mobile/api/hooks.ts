import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiClient } from "./client";
import {
  Manga,
  Chapter,
  Category,
  ImportTask,
  QueueStats,
  PageInfo,
  ReadingMode,
  ReadingProgress,
  SourceMangaChapter,
  SourceMangaDetails,
  ImportProgressResponse,
  DiscoverFilters,
  DiscoverManga,
  DiscoverBrowseResult,
} from "../types";

// Library
export function useLibrary(
  search?: string,
  status?: string,
  mediaType?: string,
  genre?: string,
  category?: string,
  readingStatus?: string,
  sortBy?: string,
  sortOrder?: "asc" | "desc",
) {
  return useQuery({
    queryKey: [
      "library",
      {
        search,
        status,
        mediaType,
        genre,
        category,
        readingStatus,
        sortBy,
        sortOrder,
      },
    ],
    queryFn: () =>
      apiClient.getLibrary(
        search,
        status,
        mediaType,
        genre,
        category,
        readingStatus,
        sortBy,
        sortOrder,
      ),
  });
}

export function useFilterOptions() {
  return useQuery({
    queryKey: ["filterOptions"],
    queryFn: () => apiClient.getFilterOptions(),
  });
}

// Manga
export function useManga(id: string) {
  return useQuery({
    queryKey: ["manga", id],
    queryFn: () => apiClient.getManga(id),
  });
}

export function useDeleteManga() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteManga(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
    },
  });
}

// Chapters
export function useChapters(mangaId: string) {
  return useQuery({
    queryKey: ["chapters", mangaId],
    queryFn: () => apiClient.getChapters(mangaId),
  });
}

export function useChapterPages(mangaId: string, chapterId: string) {
  return useQuery({
    queryKey: ["pages", mangaId, chapterId],
    queryFn: () => apiClient.getChapterPages(mangaId, chapterId),
  });
}

// Reading Progress - Legacy (DEPRECATED)
/** @deprecated Use useAllChapterProgress for per-chapter tracking */
export function useProgress(mangaId: string) {
  return useQuery({
    queryKey: ["progress", mangaId],
    queryFn: () => apiClient.getProgress(mangaId),
  });
}

/** @deprecated Use useUpdateChapterProgress for per-chapter tracking */
export function useUpdateProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      mangaId,
      chapterId,
      pageNumber,
      totalPages,
      isCompleted,
    }: {
      mangaId: string;
      chapterId?: string;
      pageNumber: number;
      totalPages: number;
      isCompleted?: boolean;
    }) =>
      apiClient.updateProgress(
        mangaId,
        chapterId,
        pageNumber,
        totalPages,
        isCompleted,
      ),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["progress", variables.mangaId],
      });
      queryClient.invalidateQueries({ queryKey: ["library"] });
    },
  });
}

// Reading Progress - New Per-Chapter APIs

// Get all chapter progress for a manga
export function useAllChapterProgress(mangaId: string) {
  return useQuery<ReadingProgress[]>({
    queryKey: ["chapterProgress", "all", mangaId],
    queryFn: () => apiClient.getAllChapterProgress(mangaId),
    enabled: !!mangaId,
  });
}

// Get progress for a specific chapter
export function useChapterProgress(mangaId: string, chapterId: string) {
  return useQuery<ReadingProgress | null>({
    queryKey: ["chapterProgress", mangaId, chapterId],
    queryFn: () => apiClient.getChapterProgress(mangaId, chapterId),
    enabled: !!mangaId && !!chapterId,
  });
}

// Update chapter progress (for reader)
export function useUpdateChapterProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      mangaId,
      chapterId,
      pageNumber,
      totalPages,
      isCompleted,
    }: {
      mangaId: string;
      chapterId: string;
      pageNumber: number;
      totalPages: number;
      isCompleted?: boolean;
    }) =>
      apiClient.updateChapterProgress(
        mangaId,
        chapterId,
        pageNumber,
        totalPages,
        isCompleted,
      ),
    onSuccess: (_, variables) => {
      // Invalidate all chapter progress for this manga
      queryClient.invalidateQueries({
        queryKey: ["chapterProgress", "all", variables.mangaId],
      });
      // Invalidate specific chapter progress
      queryClient.invalidateQueries({
        queryKey: ["chapterProgress", variables.mangaId, variables.chapterId],
      });
      // Keep legacy progress invalidation for backward compatibility
      queryClient.invalidateQueries({
        queryKey: ["progress", variables.mangaId],
      });
      queryClient.invalidateQueries({ queryKey: ["library"] });
    },
  });
}

// Mark chapter as complete (read)
export function useMarkChapterComplete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      mangaId,
      chapterId,
      markPrevious,
    }: {
      mangaId: string;
      chapterId: string;
      markPrevious?: boolean;
    }) => apiClient.markChapterComplete(mangaId, chapterId, markPrevious),
    onSuccess: async (_, variables) => {
      // Invalidate and refetch all chapter progress queries for this manga
      await queryClient.invalidateQueries({
        queryKey: ["chapterProgress", "all", variables.mangaId],
        refetchType: "all",
      });
      // Also invalidate specific chapter and legacy progress
      await queryClient.invalidateQueries({
        queryKey: ["chapterProgress", variables.mangaId, variables.chapterId],
        refetchType: "all",
      });
      await queryClient.invalidateQueries({
        queryKey: ["progress", variables.mangaId],
        refetchType: "all",
      });
      await queryClient.invalidateQueries({
        queryKey: ["library"],
        refetchType: "all",
      });
    },
  });
}

// Mark chapter as incomplete (unread)
export function useMarkChapterIncomplete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      mangaId,
      chapterId,
      markFollowing,
    }: {
      mangaId: string;
      chapterId: string;
      markFollowing?: boolean;
    }) => apiClient.markChapterIncomplete(mangaId, chapterId, markFollowing),
    onSuccess: async (_, variables) => {
      // Invalidate and refetch all chapter progress queries for this manga
      await queryClient.invalidateQueries({
        queryKey: ["chapterProgress", "all", variables.mangaId],
        refetchType: "all",
      });
      // Also invalidate specific chapter and legacy progress
      await queryClient.invalidateQueries({
        queryKey: ["chapterProgress", variables.mangaId, variables.chapterId],
        refetchType: "all",
      });
      await queryClient.invalidateQueries({
        queryKey: ["progress", variables.mangaId],
        refetchType: "all",
      });
      await queryClient.invalidateQueries({
        queryKey: ["library"],
        refetchType: "all",
      });
    },
  });
}

// Categories
export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => apiClient.getCategories(),
  });
}

export function useMangaCategories(mangaId: string) {
  return useQuery({
    queryKey: ["mangaCategories", mangaId],
    queryFn: () => apiClient.getMangaCategories(mangaId),
    enabled: !!mangaId,
  });
}

export function useAddMangaToCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      mangaId,
      categoryId,
    }: {
      mangaId: string;
      categoryId: string;
    }) => apiClient.addMangaToCategory(mangaId, categoryId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["mangaCategories", variables.mangaId],
      });
    },
  });
}

export function useRemoveMangaFromCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      mangaId,
      categoryId,
    }: {
      mangaId: string;
      categoryId: string;
    }) => apiClient.removeMangaFromCategory(mangaId, categoryId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["mangaCategories", variables.mangaId],
      });
    },
  });
}

// Sources
export function useSources() {
  return useQuery({
    queryKey: ["sources"],
    queryFn: () => apiClient.getSources(),
  });
}

export function useSearchSource(sourceId: string, query: string) {
  return useQuery({
    queryKey: ["search", sourceId, query],
    queryFn: () => apiClient.searchSource(sourceId, query),
    enabled: !!sourceId && !!query && query.length >= 2,
  });
}

export function useSourceManga(sourceId: string, sourceMangaId: string) {
  return useQuery<SourceMangaDetails>({
    queryKey: ["sourceManga", sourceId, sourceMangaId],
    queryFn: () => apiClient.getSourceManga(sourceId, sourceMangaId),
    enabled: !!sourceId && !!sourceMangaId,
  });
}

export function useImportManga() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sourceId,
      sourceMangaId,
      chapters,
    }: {
      sourceId: string;
      sourceMangaId: string;
      chapters?: SourceMangaChapter[];
    }) => apiClient.importManga(sourceId, sourceMangaId, chapters),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
  });
}

export function useImportProgress(mangaId: string) {
  return useQuery<ImportProgressResponse>({
    queryKey: ["importProgress", mangaId],
    queryFn: () => apiClient.getImportProgress(mangaId),
    refetchInterval: 2000,
    enabled: !!mangaId,
  });
}

export function useCancelImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mangaId: string) => apiClient.cancelImport(mangaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}

// Queue
export function useQueueTasks() {
  return useQuery({
    queryKey: ["queueTasks"],
    queryFn: () => apiClient.getQueueTasks(),
    refetchInterval: 3000,
  });
}

export function useQueueStats() {
  return useQuery({
    queryKey: ["queueStats"],
    queryFn: () => apiClient.getQueueStats(),
    refetchInterval: 3000,
  });
}

export function useCancelTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => apiClient.cancelTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}

export function useRetryTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => apiClient.retryTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}

// Settings
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => apiClient.getSettings(),
  });
}

export function useReadingMode(mangaId: string) {
  return useQuery<ReadingMode>({
    queryKey: ["readingMode", mangaId],
    queryFn: () => apiClient.getReadingMode(mangaId),
    enabled: !!mangaId,
  });
}

export function useSetReadingMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mangaId, mode }: { mangaId: string; mode: ReadingMode }) =>
      apiClient.setReadingMode(mangaId, mode),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["readingMode", variables.mangaId],
      });
    },
  });
}

// Settings mutations
export function useUpdateSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiClient.updateSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useBulkUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Record<string, string>) =>
      apiClient.updateSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useResetSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => apiClient.resetSetting(key),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

// Storage
export function useStorageTypes() {
  return useQuery({
    queryKey: ["storageTypes"],
    queryFn: () => apiClient.getStorageTypes(),
  });
}

export function useStorageBackends() {
  return useQuery({
    queryKey: ["storageBackends"],
    queryFn: () => apiClient.getStorageBackends(),
  });
}

export function useCreateStorageBackend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      type: string;
      config?: Record<string, unknown>;
      isDefault?: boolean;
    }) => apiClient.createStorageBackend(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storageBackends"] });
    },
  });
}

export function useUpdateStorageBackend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; config?: Record<string, unknown>; isDefault?: boolean };
    }) => apiClient.updateStorageBackend(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storageBackends"] });
    },
  });
}

export function useDeleteStorageBackend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteStorageBackend(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storageBackends"] });
    },
  });
}

export function useScanStorage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.scanStorage(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
    },
  });
}

// Plugins
export function useInstalledPlugins() {
  return useQuery({
    queryKey: ["installedPlugins"],
    queryFn: () => apiClient.getInstalledPlugins(),
  });
}

export function useAvailablePlugins(query?: string, type?: string) {
  return useQuery({
    queryKey: ["availablePlugins", query, type],
    queryFn: () => apiClient.getAvailablePlugins(query, type),
  });
}

export function useInstallPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ packageName, version }: { packageName: string; version?: string }) =>
      apiClient.installPlugin(packageName, version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installedPlugins"] });
      queryClient.invalidateQueries({ queryKey: ["availablePlugins"] });
    },
  });
}

export function useUninstallPlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.uninstallPlugin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installedPlugins"] });
      queryClient.invalidateQueries({ queryKey: ["availablePlugins"] });
    },
  });
}

export function useEnablePlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.enablePlugin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installedPlugins"] });
    },
  });
}

export function useDisablePlugin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.disablePlugin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installedPlugins"] });
    },
  });
}

// Queue bulk actions
export function useRetryAllFailed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.retryAllFailed(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}

export function useClearCompleted() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.clearCompleted(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}

// Discover
export function useDiscoverBrowse(filters: Omit<DiscoverFilters, 'page'>) {
  return useInfiniteQuery<DiscoverBrowseResult>({
    queryKey: ["discover", "browse", filters],
    queryFn: ({ pageParam, signal }) =>
      apiClient.browseDiscover({ ...filters, page: pageParam as number }, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasNextPage
        ? lastPage.pageInfo.currentPage + 1
        : undefined,
  });
}

export function useDiscoverManga(anilistId: number | null) {
  return useQuery<DiscoverManga>({
    queryKey: ["discover", "manga", anilistId],
    queryFn: ({ signal }) => apiClient.getDiscoverManga(anilistId!, signal),
    enabled: !!anilistId,
  });
}
