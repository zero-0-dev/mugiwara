import React, { useState, useEffect } from "react";

interface ImportTask {
  id: string;
  status: "pending" | "running" | "paused" | "complete" | "error";
  mangaId: string;
  chapterId?: string;
  progressPercent: number;
  errorMessage?: string;
}

interface QueueStats {
  pending: number;
  running: number;
  paused: number;
  complete: number;
  error: number;
  total: number;
}

interface QueueSectionProps {
  apiBaseUrl: string;
}

export function QueueSection({ apiBaseUrl }: QueueSectionProps) {
  const [tasks, setTasks] = useState<ImportTask[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadQueueData();
    const interval = setInterval(loadQueueData, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, []);

  async function loadQueueData() {
    try {
      const [tasksRes, statsRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/queue/tasks?limit=50`),
        fetch(`${apiBaseUrl}/api/queue/stats`),
      ]);

      if (!tasksRes.ok || !statsRes.ok)
        throw new Error("Failed to load queue data");

      setTasks(await tasksRes.json());
      setStats(await statsRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(taskId: string) {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/queue/tasks/${taskId}/cancel`,
        {
          method: "POST",
        },
      );
      if (!response.ok) throw new Error("Failed to cancel task");
      await loadQueueData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel task");
    }
  }

  async function handleRetry(taskId: string) {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/queue/tasks/${taskId}/retry`,
        {
          method: "POST",
        },
      );
      if (!response.ok) throw new Error("Failed to retry task");
      await loadQueueData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry task");
    }
  }

  async function handleRetryAll() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/queue/retry-failed`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to retry failed tasks");
      await loadQueueData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry tasks");
    }
  }

  async function handleClearComplete() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/queue/clear-complete`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to clear completed tasks");
      await loadQueueData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear tasks");
    }
  }

  if (loading) return <div className="loading">Loading import queue...</div>;

  return (
    <div className="queue-section">
      <h3>Import Queue</h3>
      <p className="section-description">
        Monitor and manage background manga imports.
      </p>

      {error && <div className="error-message">{error}</div>}

      {/* Stats */}
      {stats && (
        <div className="queue-stats">
          <div className="stat-card">
            <span className="stat-value">{stats.pending}</span>
            <span className="stat-label">Pending</span>
          </div>
          <div className="stat-card running">
            <span className="stat-value">{stats.running}</span>
            <span className="stat-label">Running</span>
          </div>
          <div className="stat-card complete">
            <span className="stat-value">{stats.complete}</span>
            <span className="stat-label">Complete</span>
          </div>
          <div className="stat-card error">
            <span className="stat-value">{stats.error}</span>
            <span className="stat-label">Error</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="queue-actions">
        {stats && stats.error > 0 && (
          <button onClick={handleRetryAll} className="btn btn-secondary">
            Retry All Failed
          </button>
        )}
        {stats && stats.complete > 0 && (
          <button onClick={handleClearComplete} className="btn btn-secondary">
            Clear Completed
          </button>
        )}
        <button onClick={loadQueueData} className="btn btn-secondary">
          Refresh
        </button>
      </div>

      {/* Tasks List */}
      <div className="tasks-list">
        <h4>Recent Tasks</h4>
        {tasks.length === 0 ? (
          <p>No import tasks.</p>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className={`task-card ${task.status}`}>
              <div className="task-info">
                <div className="task-header">
                  <span className="task-manga">
                    {task.mangaId.substring(0, 8)}...
                  </span>
                  {task.chapterId && (
                    <span className="task-chapter">Ch. {task.chapterId}</span>
                  )}
                  <span className={`task-status ${task.status}`}>
                    {task.status}
                  </span>
                </div>

                {(task.status === "running" || task.status === "pending") && (
                  <div className="progress-bar-container">
                    <div
                      className="progress-bar"
                      style={{ width: `${task.progressPercent}%` }}
                    />
                    <span className="progress-text">
                      {task.progressPercent}%
                    </span>
                  </div>
                )}

                {task.errorMessage && (
                  <div className="error-message">{task.errorMessage}</div>
                )}
              </div>

              <div className="task-actions">
                {(task.status === "running" || task.status === "pending") && (
                  <button
                    onClick={() => handleCancel(task.id)}
                    className="btn btn-danger btn-small"
                  >
                    Cancel
                  </button>
                )}
                {task.status === "error" && (
                  <button
                    onClick={() => handleRetry(task.id)}
                    className="btn btn-primary btn-small"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
