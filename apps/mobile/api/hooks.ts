import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import {
  Manga,
  Chapter,
  Category,
  ImportTask,
  QueueStats,
  PageInfo,
  ReadingMode,
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

// Reading Progress
export function useProgress(mangaId: string) {
  return useQuery({
    queryKey: ["progress", mangaId],
    queryFn: () => apiClient.getProgress(mangaId),
  });
}

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

export function useImportManga() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sourceId,
      sourceMangaId,
    }: {
      sourceId: string;
      sourceMangaId: string;
    }) => apiClient.importManga(sourceId, sourceMangaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
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
  return useQuery({
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
