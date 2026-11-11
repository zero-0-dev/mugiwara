import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ListOrdered,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  useQueueTasks,
  useQueueStats,
  useCancelTask,
  useRetryTask,
  useRetryAllFailed,
  useClearCompleted,
} from "../../api/hooks";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { Alert, AlertDescription } from "../ui/alert";
import { cn } from "@/lib/utils";

export function QueueSection() {
  const { data: tasks = [], isLoading } = useQueueTasks();
  const { data: stats } = useQueueStats();
  const cancelTask = useCancelTask();
  const retryTask = useRetryTask();
  const retryAll = useRetryAllFailed();
  const clearComplete = useClearCompleted();
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-secondary" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-secondary"
            />
          ))}
        </div>
      </div>
    );
  }

  const queueStats = (stats ?? {}) as {
    pending?: number;
    running?: number;
    complete?: number;
    error?: number;
  };

  const cards = [
    {
      key: "pending",
      label: "Pending",
      value: queueStats.pending ?? 0,
      icon: Clock,
      tone: "text-warning-text bg-amber-500/10",
    },
    {
      key: "running",
      label: "Running",
      value: queueStats.running ?? 0,
      icon: ListOrdered,
      tone: "text-brand-text bg-primary/10",
    },
    {
      key: "complete",
      label: "Complete",
      value: queueStats.complete ?? 0,
      icon: CheckCircle2,
      tone: "text-success-text bg-emerald-500/10",
    },
    {
      key: "error",
      label: "Error",
      value: queueStats.error ?? 0,
      icon: XCircle,
      tone: "text-destructive-text bg-red-500/10",
    },
  ];

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Import Queue</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitor and manage background manga imports.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className="rounded-xl border border-border/70 bg-background/40 p-3 sm:p-4"
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg",
                  card.tone,
                )}
              >
                <Icon className="size-4" />
              </span>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {card.value}
              </p>
              <p className="text-xs text-muted-foreground">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(queueStats.error ?? 0) > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              retryAll.mutate(undefined, {
                onError: (err) => setError(err.message),
              })
            }
          >
            <RotateCcw className="size-3.5" /> Retry All Failed
          </Button>
        )}
        {(queueStats.complete ?? 0) > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              clearComplete.mutate(undefined, {
                onError: (err) => setError(err.message),
              })
            }
          >
            <Trash2 className="size-3.5" /> Clear Completed
          </Button>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-base font-semibold">Recent Tasks</h3>
        {(Array.isArray(tasks) ? tasks : []).length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No import tasks.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {(Array.isArray(tasks) ? tasks : []).map(
              (task: {
                id: string;
                mangaId: string;
                chapterId?: string;
                status: string;
                progressPercent?: number;
                errorMessage?: string;
              }) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-border/70 bg-background/40 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {task.mangaId.substring(0, 8)}...
                    </span>
                    {task.chapterId && (
                      <Badge variant="outline">Ch. {task.chapterId}</Badge>
                    )}
                    <Badge
                      variant={
                        task.status === "complete"
                          ? "success"
                          : task.status === "error"
                            ? "destructive"
                            : task.status === "running"
                              ? "default"
                              : "secondary"
                      }
                      className="ml-auto capitalize"
                    >
                      {task.status}
                    </Badge>
                  </div>
                  {(task.status === "running" || task.status === "pending") && (
                    <div className="mt-2 flex items-center gap-2">
                      <Progress
                        value={task.progressPercent || 0}
                        className="h-1.5 flex-1"
                      />
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                        {task.progressPercent || 0}%
                      </span>
                    </div>
                  )}
                  {task.errorMessage && (
                    <p className="mt-2 text-xs text-destructive-text">
                      {task.errorMessage}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    {(task.status === "running" ||
                      task.status === "pending") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          cancelTask.mutate(task.id, {
                            onError: (err) => setError(err.message),
                          })
                        }
                        className="border-destructive/40 text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                      >
                        Cancel
                      </Button>
                    )}
                    {task.status === "error" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          retryTask.mutate(task.id, {
                            onError: (err) => setError(err.message),
                          })
                        }
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}
