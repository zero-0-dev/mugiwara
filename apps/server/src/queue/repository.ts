import { eq, inArray, desc, asc } from "drizzle-orm";
import { ImportTask, CreateTaskInput, TaskStatus } from "./types";
import * as schema from "../database/schema";

export class ImportTaskRepository {
  constructor(private db: any) {}

  async create(input: CreateTaskInput): Promise<ImportTask> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const task = {
      id,
      type: input.type,
      status: "pending" as TaskStatus,
      priority: input.priority || 0,
      mangaId: input.mangaId,
      chapterId: input.chapterId,
      sortOrder: input.sortOrder,
      sourceId: input.sourceId,
      sourceChapterId: input.sourceChapterId,
      completedPages: 0,
      progressPercent: 0,
      retryCount: 0,
      createdAt: now,
    };

    await this.db.insert(schema.importTasks).values(task);

    return task as ImportTask;
  }

  async dequeue(limit: number): Promise<ImportTask[]> {
    return this.db.transaction(async (tx: any) => {
      // Find pending tasks ordered by priority and sort order
      const tasks = await tx
        .select()
        .from(schema.importTasks)
        .where(eq(schema.importTasks.status, "pending"))
        .orderBy(
          desc(schema.importTasks.priority),
          asc(schema.importTasks.sortOrder),
          asc(schema.importTasks.createdAt),
        )
        .limit(limit);

      if (tasks.length === 0) return [];

      // Mark as running
      const taskIds = tasks.map((t: ImportTask) => t.id);
      await tx
        .update(schema.importTasks)
        .set({
          status: "running",
          startedAt: new Date().toISOString(),
        })
        .where(inArray(schema.importTasks.id, taskIds));

      return tasks as ImportTask[];
    });
  }

  async updateProgress(
    taskId: string,
    completedPages: number,
    totalPages: number,
  ): Promise<void> {
    const percent =
      totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;

    await this.db
      .update(schema.importTasks)
      .set({
        completedPages,
        totalPages,
        progressPercent: percent,
      })
      .where(eq(schema.importTasks.id, taskId));
  }

  async markComplete(taskId: string): Promise<void> {
    await this.db
      .update(schema.importTasks)
      .set({
        status: "complete",
        completedAt: new Date().toISOString(),
        progressPercent: 100,
      })
      .where(eq(schema.importTasks.id, taskId));
  }

  async markError(taskId: string, errorMessage: string): Promise<void> {
    const task = await this.getById(taskId);
    if (!task) return;

    const retryCount = task.retryCount + 1;
    const status: TaskStatus = retryCount >= 3 ? "error" : "pending";

    await this.db
      .update(schema.importTasks)
      .set({
        status,
        errorMessage,
        retryCount,
      })
      .where(eq(schema.importTasks.id, taskId));
  }

  async pause(taskId: string): Promise<void> {
    await this.db
      .update(schema.importTasks)
      .set({ status: "paused" })
      .where(eq(schema.importTasks.id, taskId));
  }

  async resume(taskId: string): Promise<void> {
    await this.db
      .update(schema.importTasks)
      .set({ status: "pending" })
      .where(eq(schema.importTasks.id, taskId));
  }

  async cancel(taskId: string): Promise<void> {
    await this.db
      .delete(schema.importTasks)
      .where(eq(schema.importTasks.id, taskId));
  }

  async getById(taskId: string): Promise<ImportTask | undefined> {
    const result = await this.db.query.importTasks.findFirst({
      where: eq(schema.importTasks.id, taskId),
    });
    return result as ImportTask | undefined;
  }

  async getByManga(mangaId: string): Promise<ImportTask[]> {
    const results = await this.db.query.importTasks.findMany({
      where: eq(schema.importTasks.mangaId, mangaId),
      orderBy: [asc(schema.importTasks.sortOrder)],
    });
    return results as ImportTask[];
  }

  async getByChapter(
    mangaId: string,
    chapterId: string,
  ): Promise<ImportTask | undefined> {
    const result = await this.db.query.importTasks.findFirst({
      where: [
        eq(schema.importTasks.mangaId, mangaId),
        eq(schema.importTasks.chapterId, chapterId),
      ],
    });
    return result as ImportTask | undefined;
  }

  async list(options?: {
    status?: TaskStatus;
    mangaId?: string;
    limit?: number;
    offset?: number;
  }): Promise<ImportTask[]> {
    let query = this.db.select().from(schema.importTasks);

    if (options?.status) {
      query = query.where(eq(schema.importTasks.status, options.status));
    }

    if (options?.mangaId) {
      query = query.where(eq(schema.importTasks.mangaId, options.mangaId));
    }

    query = query.orderBy(
      desc(schema.importTasks.priority),
      asc(schema.importTasks.sortOrder),
    );

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.offset(options.offset);
    }

    const results = await query;
    return results as ImportTask[];
  }

  async getStats(): Promise<{
    pending: number;
    running: number;
    paused: number;
    complete: number;
    error: number;
    total: number;
  }> {
    const all = await this.db.select().from(schema.importTasks);

    return {
      pending: all.filter((t: ImportTask) => t.status === "pending").length,
      running: all.filter((t: ImportTask) => t.status === "running").length,
      paused: all.filter((t: ImportTask) => t.status === "paused").length,
      complete: all.filter((t: ImportTask) => t.status === "complete").length,
      error: all.filter((t: ImportTask) => t.status === "error").length,
      total: all.length,
    };
  }

  async retryFailed(mangaId?: string): Promise<number> {
    const conditions = [eq(schema.importTasks.status, "error")];
    if (mangaId) {
      conditions.push(eq(schema.importTasks.mangaId, mangaId));
    }

    const result = await this.db
      .update(schema.importTasks)
      .set({
        status: "pending",
        errorMessage: undefined,
        retryCount: 0,
      })
      .where(conditions);

    return result.changes || 0;
  }

  async clearComplete(mangaId?: string): Promise<number> {
    const conditions = [eq(schema.importTasks.status, "complete")];
    if (mangaId) {
      conditions.push(eq(schema.importTasks.mangaId, mangaId));
    }

    const result = await this.db.delete(schema.importTasks).where(conditions);

    return result.changes || 0;
  }
}
