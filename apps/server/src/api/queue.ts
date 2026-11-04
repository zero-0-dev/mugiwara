import { Router, Request, Response } from "express";
import { ImportTaskRepository } from "../queue/repository";
import { ImportQueueProcessor } from "../queue/processor";
import { recordAudit } from "../services/audit";

const router: Router = Router();

// Middleware to inject services
router.use((req: any, _res, next) => {
  req.taskRepository = (global as any).taskRepository;
  req.queueProcessor = (global as any).queueProcessor;
  next();
});

// GET /api/queue/tasks - List import tasks
router.get("/tasks", async (req: any, res: Response) => {
  try {
    const repository: ImportTaskRepository = req.taskRepository;
    const { status, mangaId, limit, offset } = req.query;

    const tasks = await repository.list({
      status,
      mangaId,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });

    res.json(tasks);
  } catch (error) {
    console.error("Error listing tasks:", error);
    res.status(500).json({ error: "Failed to list tasks" });
  }
});

// GET /api/queue/tasks/:id - Get task details
router.get("/tasks/:id", async (req: any, res: Response) => {
  try {
    const repository: ImportTaskRepository = req.taskRepository;
    const { id } = req.params;

    const task = await repository.getById(id);

    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    res.json(task);
  } catch (error) {
    console.error("Error getting task:", error);
    res.status(500).json({ error: "Failed to get task" });
  }
});

// POST /api/queue/tasks/:id/cancel - Cancel a task
router.post("/tasks/:id/cancel", async (req: any, res: Response) => {
  try {
    const processor: ImportQueueProcessor = req.queueProcessor;
    const { id } = req.params;

    await processor.cancelTask(id);
    res.json({ message: "Task cancelled" });
  } catch (error) {
    console.error("Error cancelling task:", error);
    res.status(500).json({ error: "Failed to cancel task" });
  }
});

// POST /api/queue/tasks/:id/retry - Retry a failed task
router.post("/tasks/:id/retry", async (req: any, res: Response) => {
  try {
    const processor: ImportQueueProcessor = req.queueProcessor;
    const { id } = req.params;

    await processor.retryTask(id);
    res.json({ message: "Task queued for retry" });
  } catch (error) {
    console.error("Error retrying task:", error);
    res.status(500).json({ error: "Failed to retry task" });
  }
});

// GET /api/queue/stats - Get queue statistics
router.get("/stats", async (req: any, res: Response) => {
  try {
    const repository: ImportTaskRepository = req.taskRepository;
    const stats = await repository.getStats();
    res.json(stats);
  } catch (error) {
    console.error("Error getting queue stats:", error);
    res.status(500).json({ error: "Failed to get queue stats" });
  }
});

// POST /api/queue/retry-failed - Retry all failed tasks
router.post("/retry-failed", async (req: any, res: Response) => {
  try {
    const repository: ImportTaskRepository = req.taskRepository;
    const { mangaId } = req.body;

    const count = await repository.retryFailed(mangaId);
    res.json({ message: `Retried ${count} failed tasks` });
  } catch (error) {
    console.error("Error retrying failed tasks:", error);
    res.status(500).json({ error: "Failed to retry failed tasks" });
  }
});

// POST /api/queue/clear-complete - Clear completed tasks
router.post("/clear-complete", async (req: any, res: Response) => {
  try {
    const repository: ImportTaskRepository = req.taskRepository;
    const { mangaId } = req.body;

    const count = await repository.clearComplete(mangaId);
    recordAudit({
      event: "queue.clear_complete",
      actor: req.auth?.id ?? null,
      ip: req.ip ?? req.socket.remoteAddress ?? null,
      details: { cleared: count, mangaId: mangaId ?? null },
    });
    res.json({ message: `Cleared ${count} completed tasks` });
  } catch (error) {
    console.error("Error clearing completed tasks:", error);
    res.status(500).json({ error: "Failed to clear completed tasks" });
  }
});

export default router;
