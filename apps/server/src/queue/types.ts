export type TaskStatus =
  | "pending"
  | "running"
  | "paused"
  | "complete"
  | "error";
export type TaskType = "chapter" | "full_manga";

export interface ImportTask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  priority: number;

  mangaId: string;
  chapterId?: string;
  sortOrder: number;

  sourceId: string;
  sourceChapterId?: string;

  totalPages?: number;
  completedPages: number;
  progressPercent: number;

  errorMessage?: string;
  retryCount: number;

  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CreateTaskInput {
  type: TaskType;
  mangaId: string;
  chapterId?: string;
  sortOrder: number;
  sourceId: string;
  sourceChapterId?: string;
  priority?: number;
}

export interface TaskProgress {
  taskId: string;
  completedPages: number;
  totalPages: number;
  percent: number;
}

export interface QueueStats {
  pending: number;
  running: number;
  paused: number;
  complete: number;
  error: number;
  total: number;
}
