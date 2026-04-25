import { useState, useEffect, useCallback } from "react";
import type { ImportProgressResponse, ImportChapterProgress } from "./types";

interface ImportProgressProps {
  apiBaseUrl: string;
  mangaId: string;
  mangaTitle: string;
  onComplete: (progress: ImportProgressResponse) => void;
  onCancel: () => void;
}

export function ImportProgress({
  apiBaseUrl,
  mangaId,
  mangaTitle,
  onComplete,
  onCancel,
}: ImportProgressProps) {
  const [progress, setProgress] = useState<ImportProgressResponse | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(
          `${apiBaseUrl}/api/library/import/${mangaId}/progress`,
        );
        if (!res.ok) return;
        const data: ImportProgressResponse = await res.json();
        if (cancelled) return;
        setProgress(data);

        if (data.isComplete) {
          onComplete(data);
        }
      } catch {
        // Silently retry on next interval
      }
    };

    poll();

    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apiBaseUrl, mangaId, onComplete]);

  const handleCancel = useCallback(async () => {
    setIsCancelling(true);
    try {
      await fetch(`${apiBaseUrl}/api/library/import/${mangaId}/cancel`, {
        method: "POST",
      });
      onCancel();
    } finally {
      setIsCancelling(false);
    }
  }, [apiBaseUrl, mangaId, onCancel]);

  if (!progress) {
    return (
      <div className="import-progress">
        <h4 className="import-progress-title">Importing {mangaTitle}...</h4>
        <div className="import-progress-card">
          <div className="import-progress-bar">
            <div className="import-progress-bar-fill" style={{ width: "0%" }} />
          </div>
          <div className="import-progress-pct">0% complete</div>
          <div className="import-progress-count">0 / 0 chapters imported</div>
        </div>
        <div className="import-progress-footer">
          <button
            className="btn btn-secondary"
            onClick={handleCancel}
            disabled={isCancelling}
          >
            {isCancelling ? "Cancelling..." : "Cancel Remaining"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="import-progress">
      <h4 className="import-progress-title">Importing {mangaTitle}...</h4>

      <div className="import-progress-card">
        <div className="import-progress-bar">
          <div
            className="import-progress-bar-fill"
            style={{ width: `${progress.overallProgress}%` }}
          />
        </div>
        <div className="import-progress-pct">
          {progress.overallProgress}% complete
        </div>
        <div className="import-progress-count">
          {progress.completedChapters} / {progress.totalChapters} chapters
          imported
        </div>
        {progress.erroredChapters > 0 && (
          <div className="import-progress-errors">
            {progress.erroredChapters} error
            {progress.erroredChapters > 1 ? "s" : ""}
          </div>
        )}
      </div>

      <div className="import-progress-chapters">
        {progress.chapters.map((ch: ImportChapterProgress) => (
          <ChapterRow key={ch.chapterId} chapter={ch} />
        ))}
      </div>

      <div className="import-progress-footer">
        <button
          className="btn btn-secondary"
          onClick={handleCancel}
          disabled={isCancelling}
        >
          {isCancelling ? "Cancelling..." : "Cancel Remaining"}
        </button>
      </div>
    </div>
  );
}

function ChapterRow({ chapter }: { chapter: ImportChapterProgress }) {
  let icon: string;
  let iconClass: string;
  let extra: React.ReactNode = null;

  switch (chapter.status) {
    case "complete":
      icon = "\u2713";
      iconClass = "status-complete";
      break;
    case "downloading":
      icon = "\u23F3";
      iconClass = "status-downloading";
      if (chapter.completedPages !== undefined && chapter.totalPages) {
        extra = (
          <span className="import-chapter-pages">
            {chapter.completedPages} / {chapter.totalPages} pages
          </span>
        );
      }
      break;
    case "queued":
      icon = "\u25CB";
      iconClass = "status-queued";
      break;
    default:
      icon = "\u2717";
      iconClass = "status-error";
      extra = chapter.errorMessage ? (
        <span className="import-chapter-error">{chapter.errorMessage}</span>
      ) : null;
      break;
  }

  return (
    <div className={`import-chapter-row ${iconClass}`}>
      <span className="import-chapter-icon">{icon}</span>
      <span className="import-chapter-label">
        Ch. {chapter.chapterId}
        {chapter.title ? ` \u2014 ${chapter.title}` : ""}
      </span>
      {extra}
    </div>
  );
}
