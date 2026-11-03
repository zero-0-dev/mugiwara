import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "./context";

// ─── Library ───────────────────────────────────────────────────────────────

export function useLibrary(filters?: { search?: string; status?: string; mediaType?: string; genre?: string; category?: string; readingStatus?: string; sortBy?: string; sortOrder?: string }) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["library", filters],
    queryFn: () => api.getLibrary(filters),
  });
}

export function useFilterOptions() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["filterOptions"],
    queryFn: () => api.getFilterOptions(),
  });
}

// ─── Manga ─────────────────────────────────────────────────────────────────

export function useManga(id: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["manga", id],
    queryFn: () => api.getManga(id),
    enabled: !!id,
  });
}

export function useChapters(mangaId: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["chapters", mangaId],
    queryFn: () => api.getChapters(mangaId),
    enabled: !!mangaId,
  });
}

export function useChapterPages(mangaId: string, chapterId: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["pages", mangaId, chapterId],
    queryFn: () => api.getChapterPages(mangaId, chapterId),
    enabled: !!mangaId && !!chapterId,
  });
}

export function useAllChapterProgress(mangaId: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["chapterProgress", "all", mangaId],
    queryFn: () => api.getAllChapterProgress(mangaId),
    enabled: !!mangaId,
  });
}

export function useChapterProgress(mangaId: string, chapterId: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["chapterProgress", mangaId, chapterId],
    queryFn: () => api.getChapterProgress(mangaId, chapterId),
    enabled: !!mangaId && !!chapterId,
  });
}

// ─── Categories ────────────────────────────────────────────────────────────

export function useCategories() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => api.getCategories(),
  });
}

export function useMangaCategories(mangaId: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["mangaCategories", mangaId],
    queryFn: () => api.getMangaCategories(mangaId),
    enabled: !!mangaId,
  });
}

// ─── Sources ───────────────────────────────────────────────────────────────

export function useSources() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["sources"],
    queryFn: () => api.getSources(),
  });
}

export function useSearchSource(sourceId: string | null, query: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["search", sourceId, query],
    queryFn: () => api.searchSource(sourceId!, query),
    enabled: !!sourceId && query.length >= 2,
  });
}

export function useSourceManga(sourceId: string | null, sourceMangaId: string | null) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["sourceManga", sourceId, sourceMangaId],
    queryFn: () => api.getSourceManga(sourceId!, sourceMangaId!),
    enabled: !!sourceId && !!sourceMangaId,
  });
}

// ─── Import ────────────────────────────────────────────────────────────────

export function useImportProgress(mangaId: string | null) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["importProgress", mangaId],
    queryFn: () => api.getImportProgress(mangaId!),
    enabled: !!mangaId,
    refetchInterval: 2000,
  });
}

// ─── Settings ──────────────────────────────────────────────────────────────

export function useSettings() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings(),
  });
}

export function useReadingMode(mangaId: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["readingMode", mangaId],
    queryFn: () => api.getReadingMode(mangaId),
    enabled: !!mangaId,
  });
}

// ─── Discover ──────────────────────────────────────────────────────────────

export function useDiscoverBrowse(filters: { sort?: string; country?: string; search?: string; genre?: string; format?: string; status?: string; perPage?: number }) {
  const api = useApiClient();
  return useInfiniteQuery({
    queryKey: ["discover", "browse", filters],
    queryFn: ({ pageParam = 1 }) => api.discoverBrowse({ ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pageInfo.hasNextPage) {
        return lastPage.pageInfo.currentPage + 1;
      }
      return undefined;
    },
  });
}

export function useDiscoverManga(anilistId: number) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["discover", "manga", anilistId],
    queryFn: () => api.discoverManga(anilistId),
    enabled: !!anilistId,
  });
}

// ─── Queue ─────────────────────────────────────────────────────────────────

export function useQueueTasks(limit = 50) {
  const api = useApiClient();
  return useQuery({
    queryKey: ["queueTasks"],
    queryFn: () => api.getQueueTasks(limit),
    refetchInterval: 3000,
  });
}

export function useQueueStats() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["queueStats"],
    queryFn: () => api.getQueueStats(),
    refetchInterval: 3000,
  });
}

// ─── Storage ───────────────────────────────────────────────────────────────

export function useStorageBackends() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["storageBackends"],
    queryFn: () => api.getStorageBackends(),
  });
}

export function useStorageTypes() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["storageTypes"],
    queryFn: () => api.getStorageTypes(),
  });
}

// ─── Plugins ───────────────────────────────────────────────────────────────

export function useInstalledPlugins() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["pluginsInstalled"],
    queryFn: () => api.getInstalledPlugins(),
  });
}

export function useAvailablePlugins() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["pluginsAvailable"],
    queryFn: () => api.getAvailablePlugins(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Manga Mutations ──────────────────────────────────────────────────────

export function useDeleteManga() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mangaId: string) => api.deleteManga(mangaId),
    onSuccess: (_data, mangaId) => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.removeQueries({ queryKey: ["manga", mangaId] });
      queryClient.removeQueries({ queryKey: ["chapters", mangaId] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}

export function useUpdateMangaTitle(mangaId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => api.updateManga(mangaId, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manga", mangaId] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
    },
  });
}

export function useMarkChapterComplete(mangaId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chapterId, markPrevious }: { chapterId: string; markPrevious?: boolean }) =>
      api.markChapterComplete(mangaId, chapterId, { markPrevious }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["chapterProgress", "all", mangaId] });
    },
  });
}

export function useMarkChapterIncomplete(mangaId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chapterId, markFollowing }: { chapterId: string; markFollowing?: boolean }) =>
      api.markChapterIncomplete(mangaId, chapterId, { markFollowing }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["chapterProgress", "all", mangaId] });
    },
  });
}

export function useDownloadChapter(mangaId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chapterId: string) => api.downloadChapter(mangaId, chapterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}

// ─── Progress Mutation ─────────────────────────────────────────────────────

export function useUpdateChapterProgress(mangaId: string, chapterId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { pageNumber: number; totalPages: number; isCompleted: boolean }) =>
      api.updateChapterProgress(mangaId, chapterId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapterProgress", "all", mangaId] });
    },
  });
}

// ─── Metadata Mutations ────────────────────────────────────────────────────

export function useFetchMetadata(mangaId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.fetchMetadata(mangaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manga", mangaId] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
    },
  });
}

export function useApplyMetadata(mangaId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { anilistId: number }) => api.applyMetadata(mangaId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manga", mangaId] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
    },
  });
}

// ─── Category Mutations ────────────────────────────────────────────────────

export function useAddMangaToCategory(mangaId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => api.addMangaToCategory(mangaId, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mangaCategories", mangaId] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
    },
  });
}

export function useRemoveMangaFromCategory(mangaId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => api.removeMangaFromCategory(mangaId, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mangaCategories", mangaId] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
    },
  });
}

// ─── Import Mutation ───────────────────────────────────────────────────────

export function useImportManga() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { sourceId: string; sourceMangaId: string; chapters: Array<{ sourceChapterId: string; chapterId: string; title?: string; sortOrder: number; language?: string; scanlationGroup?: string }> }) =>
      api.importManga(body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["filterOptions"] });
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
      if (data?.mangaId) {
        queryClient.invalidateQueries({ queryKey: ["manga", data.mangaId] });
        queryClient.invalidateQueries({ queryKey: ["chapters", data.mangaId] });
        queryClient.invalidateQueries({ queryKey: ["importProgress", data.mangaId] });
      }
    },
  });
}

export function useCancelImport() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mangaId: string) => api.cancelImport(mangaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}

// ─── Settings Mutations ────────────────────────────────────────────────────

export function useSaveSetting() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => api.saveSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

export function useSetReadingMode(mangaId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: string) => api.setReadingMode(mangaId, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["readingMode", mangaId] });
    },
  });
}

// ─── Queue Mutations ───────────────────────────────────────────────────────

export function useCancelTask() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.cancelTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}

export function useRetryTask() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.retryTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}

export function useRetryAllFailed() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.retryAllFailed(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}

export function useClearCompleted() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearCompleted(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}

// ─── Storage Mutations ─────────────────────────────────────────────────────

export function useCreateStorageBackend() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: string; name: string; config: Record<string, unknown> }) => api.createStorageBackend(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storageBackends"] });
    },
  });
}

export function useUpdateStorageBackend() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: Record<string, unknown> }) => api.updateStorageBackend(id, { config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storageBackends"] });
    },
  });
}

export function useDeleteStorageBackend() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteStorageBackend(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storageBackends"] });
    },
  });
}

export function useScanStorage() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { backendId?: string }) => api.scanStorage(body || {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}

// ─── Plugin Mutations ──────────────────────────────────────────────────────

export function useInstallPlugin() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { packageName: string }) => api.installPlugin(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pluginsInstalled"] });
      queryClient.invalidateQueries({ queryKey: ["pluginsAvailable"] });
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
  });
}

export function useUninstallPlugin() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.uninstallPlugin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pluginsInstalled"] });
      queryClient.invalidateQueries({ queryKey: ["pluginsAvailable"] });
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
  });
}

export function useTogglePlugin() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enable }: { id: string; enable: boolean }) =>
      enable ? api.enablePlugin(id) : api.disablePlugin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pluginsInstalled"] });
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
  });
}

// Library Updates
export function useCheckMangaUpdates(mangaId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.checkMangaUpdates(mangaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapters", mangaId] });
      queryClient.invalidateQueries({ queryKey: ["manga", mangaId] });
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}

export function useCheckLibraryUpdates() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.checkLibraryUpdates(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}

export function useDownloadAllChapters(mangaId: string) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.downloadAllChapters(mangaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapters", mangaId] });
      queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
      queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    },
  });
}
