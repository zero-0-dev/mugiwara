import React, { useState } from "react";
import { useQueueTasks, useQueueStats, useCancelTask, useRetryTask, useRetryAllFailed, useClearCompleted } from "../../api/hooks";

export function QueueSection() {
  const { data: tasks = [], isLoading } = useQueueTasks();
  const { data: stats } = useQueueStats();
  const cancelTask = useCancelTask();
  const retryTask = useRetryTask();
  const retryAll = useRetryAllFailed();
  const clearComplete = useClearCompleted();
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <div className="loading">Loading import queue...</div>;

  return (
    <div className="queue-section">
      <h3>Import Queue</h3>
      <p className="section-description">Monitor and manage background manga imports.</p>

      {error && <div className="error-message">{error}</div>}

      {stats && (
        <div className="queue-stats">
          <div className="stat-card">
            <span className="stat-value">{(stats as { pending?: number }).pending ?? 0}</span>
            <span className="stat-label">Pending</span>
          </div>
          <div className="stat-card running">
            <span className="stat-value">{(stats as { running?: number }).running ?? 0}</span>
            <span className="stat-label">Running</span>
          </div>
          <div className="stat-card complete">
            <span className="stat-value">{(stats as { complete?: number }).complete ?? 0}</span>
            <span className="stat-label">Complete</span>
          </div>
          <div className="stat-card error">
            <span className="stat-value">{(stats as { error?: number }).error ?? 0}</span>
            <span className="stat-label">Error</span>
          </div>
        </div>
      )}

      <div className="queue-actions">
        {(stats as { error?: number } | undefined)?.error !== undefined &&
          ((stats as { error?: number }).error ?? 0) > 0 && (
          <button onClick={() => retryAll.mutate(undefined, { onError: (err) => setError(err.message) })} className="btn btn-secondary">Retry All Failed</button>
        )}
        {(stats as { complete?: number } | undefined)?.complete !== undefined &&
          ((stats as { complete?: number }).complete ?? 0) > 0 && (
          <button onClick={() => clearComplete.mutate(undefined, { onError: (err) => setError(err.message) })} className="btn btn-secondary">Clear Completed</button>
        )}
      </div>

      <div className="tasks-list">
        <h4>Recent Tasks</h4>
        {(Array.isArray(tasks) ? tasks : []).length === 0 ? (
          <p>No import tasks.</p>
        ) : (
          (Array.isArray(tasks) ? tasks : []).map((task: { id: string; mangaId: string; chapterId?: string; status: string; progressPercent?: number; errorMessage?: string }) => (
            <div key={task.id} className={`task-card ${task.status}`}>
              <div className="task-info">
                <div className="task-header">
                  <span className="task-manga">{task.mangaId.substring(0, 8)}...</span>
                  {task.chapterId && <span className="task-chapter">Ch. {task.chapterId}</span>}
                  <span className={`task-status ${task.status}`}>{task.status}</span>
                </div>
                {(task.status === "running" || task.status === "pending") && (
                  <div className="progress-bar-container">
                    <div className="progress-bar" style={{ width: `${task.progressPercent || 0}%` }} />
                    <span className="progress-text">{task.progressPercent || 0}%</span>
                  </div>
                )}
                {task.errorMessage && <div className="error-message">{task.errorMessage}</div>}
              </div>
              <div className="task-actions">
                {(task.status === "running" || task.status === "pending") && (
                  <button onClick={() => cancelTask.mutate(task.id, { onError: (err) => setError(err.message) })} className="btn btn-danger btn-small">Cancel</button>
                )}
                {task.status === "error" && (
                  <button onClick={() => retryTask.mutate(task.id, { onError: (err) => setError(err.message) })} className="btn btn-primary btn-small">Retry</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
