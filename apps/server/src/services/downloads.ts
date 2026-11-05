import { db } from "../database";
import {
  deleteChapterDownload,
  deleteMangaDownloads,
  getStorageUsage as buildStorageUsage,
  type StorageUsageDeps,
  type StorageUsageOptions,
} from "./storage-usage";

const ACTIVE_TASK_STATUSES = new Set(["pending", "running"]);

/**
 * Cancels every pending/running task for a chapter and waits for in-flight
 * writes to stop. The task rows are removed afterwards so a cancelled download
 * cannot be retried or show up as "running" forever.
 */
async function cancelChapterTasks(
  mangaId: string,
  chapterId: string,
): Promise<void> {
  const repository = global.taskRepository;
  if (!repository) return;

  // Two passes cover the small race where a pending task is dequeued between
  // the lookup and the cancellation.
  for (let attempt = 0; attempt < 2; attempt++) {
    const tasks = (await repository.getByManga(mangaId)).filter(
      (task) =>
        task.chapterId === chapterId &&
        ACTIVE_TASK_STATUSES.has(task.status ?? ""),
    );

    if (tasks.length === 0) return;

    for (const task of tasks) {
      if (global.queueProcessor) {
        await global.queueProcessor.cancelTaskAndWait(task.id);
      }
      await repository.cancel(task.id).catch(() => undefined);
    }
  }
}

function storageDeps(): StorageUsageDeps {
  return {
    db,
    getBackendForManga: (mangaId: string) =>
      global.storageManager.getBackendForManga(mangaId),
    cancelChapterTasks,
  };
}

export function getStorageUsage(options?: StorageUsageOptions) {
  return buildStorageUsage(storageDeps(), options);
}

export function removeMangaDownloads(mangaId: string) {
  return deleteMangaDownloads(storageDeps(), mangaId);
}

export function removeChapterDownload(mangaId: string, chapterId: string) {
  return deleteChapterDownload(storageDeps(), mangaId, chapterId);
}
