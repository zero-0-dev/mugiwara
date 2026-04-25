import { EventEmitter } from "events";
import { ImportTaskRepository } from "./repository";
import { ImportTask, TaskStatus } from "./types";

interface ImportQueueProcessorOptions {
  repository: ImportTaskRepository;
  concurrency?: number;
  pollInterval?: number;
}

export class ImportQueueProcessor extends EventEmitter {
  private repository: ImportTaskRepository;
  private concurrency: number;
  private pollInterval: number;
  private isRunning = false;
  private abortControllers: Map<string, AbortController> = new Map();
  private processLoopTimeout?: NodeJS.Timeout;

  constructor(options: ImportQueueProcessorOptions) {
    super();
    this.repository = options.repository;
    this.concurrency = options.concurrency || 3;
    this.pollInterval = options.pollInterval || 5000;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log("🚀 Import queue processor started");

    // Start the processing loop
    this.processLoop();
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Cancel all running tasks
    for (const [taskId, controller] of this.abortControllers) {
      controller.abort();
      console.log(`⛔ Cancelled task: ${taskId}`);
    }
    this.abortControllers.clear();

    // Clear timeout
    if (this.processLoopTimeout) {
      clearTimeout(this.processLoopTimeout);
    }

    console.log("🛑 Import queue processor stopped");
  }

  private async processLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Check how many tasks are currently running
        const runningCount = this.abortControllers.size;
        const slotsAvailable = this.concurrency - runningCount;

        if (slotsAvailable > 0) {
          // Dequeue tasks
          const tasks = await this.repository.dequeue(slotsAvailable);

          if (tasks.length > 0) {
            console.log(`📥 Dequeued ${tasks.length} tasks for processing`);

            // Process each task concurrently
            for (const task of tasks) {
              this.processTask(task);
            }
          }
        }

        // Wait before next poll
        await this.sleep(this.pollInterval);
      } catch (error) {
        console.error("Error in process loop:", error);
        await this.sleep(this.pollInterval);
      }
    }
  }

  private async processTask(task: ImportTask): Promise<void> {
    const abortController = new AbortController();
    this.abortControllers.set(task.id, abortController);

    try {
      console.log(
        `▶️ Starting task: ${task.id} (${task.chapterId || "full manga"})`,
      );

      // Emit event that task started
      this.emit("taskStarted", task);

      // Process the chapter import
      await this.importChapter(task, abortController.signal);

      // Mark as complete
      await this.repository.markComplete(task.id);

      // Update chapter status in database
      await this.updateChapterStatus(task, "complete");

      // Emit completion event
      this.emit("taskComplete", task);

      console.log(`✅ Completed task: ${task.id}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      if (abortController.signal.aborted) {
        console.log(`⛔ Task cancelled: ${task.id}`);
        // Task was cancelled, don't mark as error
        return;
      }

      // Mark as error
      await this.repository.markError(task.id, errorMessage);

      // Update chapter status
      await this.updateChapterStatus(task, "error");

      // Emit error event
      this.emit("taskError", task, error);

      console.error(`❌ Task failed: ${task.id} - ${errorMessage}`);
    } finally {
      this.abortControllers.delete(task.id);
    }
  }

  private async importChapter(
    task: ImportTask,
    signal: AbortSignal,
  ): Promise<void> {
    const { mangaRepository, chapterRepository } = await import("../database");

    // Get manga details
    const manga = await mangaRepository.findById(task.mangaId);
    if (!manga) {
      throw new Error(`Manga not found: ${task.mangaId}`);
    }

    // Get chapter details
    const chapters = await chapterRepository.findByMangaId(task.mangaId);
    const chapter = chapters.find((c: any) => c.chapterId === task.chapterId);
    if (!chapter) {
      throw new Error(`Chapter not found: ${task.chapterId}`);
    }

    // Mark chapter as downloading
    await chapterRepository.update(chapter.id, { importStatus: "downloading" });

    // Get the source
    const source = global.pluginManager.getSource(task.sourceId);
    if (!source) {
      throw new Error(`Source not found: ${task.sourceId}`);
    }

    if (!task.sourceChapterId || !task.chapterId) {
      throw new Error("Task missing chapter information");
    }

    // Get the storage backend for this manga
    const storage = await global.storageManager.getBackendForManga(
      task.mangaId,
    );

    // Download chapter pages from source
    let pageCount = 0;
    for await (const pageData of source.downloadChapter(task.sourceChapterId)) {
      if (signal.aborted) {
        throw new Error("Task cancelled");
      }

      pageCount++;

      // Store page in storage backend
      await storage.writeChapterPage(
        task.mangaId,
        task.chapterId,
        pageData.pageNumber,
        pageData.data,
        pageData.contentType,
      );

      // Update progress
      await this.repository.updateProgress(task.id, pageCount, pageCount + 5); // Estimate total

      // Sync progress to chapters table
      const progressPercent = Math.round((pageCount / (pageCount + 5)) * 100);
      await chapterRepository.update(chapter.id, { importProgress: progressPercent });

      // Emit progress event
      this.emit("taskProgress", {
        taskId: task.id,
        completedPages: pageCount,
        totalPages: pageCount + 5,
        percent: Math.round((pageCount / (pageCount + 5)) * 100),
      });
    }

    // Update chapter with actual page count (only if not already set, e.g., for archives)
    await chapterRepository.update(chapter.id, {
      pagesCount: chapter.pagesCount > 0 ? chapter.pagesCount : pageCount,
      importProgress: 100,
      importStatus: "complete",
    });

    // Mark task as complete with final progress
    await this.repository.updateProgress(task.id, pageCount, pageCount);
  }

  private async updateChapterStatus(
    task: ImportTask,
    status: "complete" | "error",
  ): Promise<void> {
    try {
      const { chapterRepository } = await import("../database");
      const chapters = await chapterRepository.findByMangaId(task.mangaId);
      const chapter = chapters.find((c: any) => c.chapterId === task.chapterId);

      if (chapter) {
        await chapterRepository.update(chapter.id, {
          importStatus: status,
        });
      }
    } catch (error) {
      console.error("Failed to update chapter status:", error);
    }
  }

  async cancelTask(taskId: string): Promise<void> {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
    } else {
      // Task is pending, just remove it
      await this.repository.cancel(taskId);
    }
  }

  async pauseTask(taskId: string): Promise<void> {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      // Can't pause running tasks easily, just cancel for now
      controller.abort();
    } else {
      await this.repository.pause(taskId);
    }
  }

  async resumeTask(taskId: string): Promise<void> {
    await this.repository.resume(taskId);
  }

  async retryTask(taskId: string): Promise<void> {
    const task = await this.repository.getById(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== "error") {
      throw new Error(`Can only retry failed tasks`);
    }

    await this.repository.resume(taskId);
  }

  getRunningTasks(): string[] {
    return Array.from(this.abortControllers.keys());
  }

  isTaskRunning(taskId: string): boolean {
    return this.abortControllers.has(taskId);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.processLoopTimeout = setTimeout(resolve, ms);
    });
  }
}
