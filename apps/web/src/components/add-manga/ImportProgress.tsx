import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Circle, Loader, X } from "lucide-react";
import { useImportProgress, useCancelImport } from "../../api/hooks";
import type {
  CancelImportResult,
  ImportChapterProgress,
  ImportProgressResponse,
} from "./types";

interface ImportProgressProps {
  mangaId: string;
  mangaTitle: string;
  onComplete: (progress: ImportProgressResponse) => void;
  onCancelled: (
    progress: ImportProgressResponse | null,
    result: CancelImportResult,
  ) => void;
}

export function ImportProgress({
  mangaId,
  mangaTitle,
  onComplete,
  onCancelled,
}: ImportProgressProps) {
  const { data: progress, error: progressError } = useImportProgress(mangaId);
  const cancelImport = useCancelImport();
  const [cancelError, setCancelError] = useState<string | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!progress?.isComplete || completedRef.current) return;
    completedRef.current = true;
    onComplete(progress);
  }, [progress, onComplete]);

  async function handleCancel() {
    if (cancelImport.isPending) return;
    setCancelError(null);
    try {
      const result = await cancelImport.mutateAsync(mangaId);
      onCancelled(progress ?? null, result);
    } catch (err) {
      setCancelError(
        err instanceof Error ? err.message : "Failed to cancel the import.",
      );
    }
  }

  if (progressError) {
    return (
      <div className="import-progress">
        <h4 className="import-progress-title">Importing {mangaTitle}...</h4>
        <div className="add-manga-error" role="alert">
          Progress could not be loaded:{" "}
          {progressError instanceof Error ? progressError.message : "unknown error"}.
          The server may be offline. The import may still finish; close this
          dialog and check the library.
        </div>
        <div className="import-progress-footer">
          <button className="btn btn-secondary" onClick={handleCancel} disabled={cancelImport.isPending}>
            {cancelImport.isPending ? "Cancelling..." : "Cancel remaining"}
          </button>
        </div>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="import-progress">
        <h4 className="import-progress-title">Importing {mangaTitle}...</h4>
        <div className="import-progress-card">
          <div className="import-progress-bar">
            <div className="import-progress-bar-fill" style={{ width: "0%" }} />
          </div>
          <div className="import-progress-pct">Starting…</div>
          <div className="import-progress-count">Waiting for the server queue</div>
        </div>
        <div className="import-progress-footer">
          <button className="btn btn-secondary" onClick={handleCancel} disabled={cancelImport.isPending}>
            {cancelImport.isPending ? "Cancelling..." : "Cancel remaining"}
          </button>
        </div>
      </div>
    );
  }

  const finished = progress.isComplete;
  const statusLabel = finished
    ? progress.erroredChapters > 0 || (progress.cancelledChapters ?? 0) > 0
      ? "Import finished with issues"
      : "Import complete"
    : progress.downloadingChapters > 0
      ? "Downloading"
      : "Queued";

  return (
    <div className="import-progress">
      <h4 className="import-progress-title">{statusLabel}: {mangaTitle}</h4>
      <div className="import-progress-card">
        <div className="import-progress-bar">
          <div className="import-progress-bar-fill" style={{ width: `${progress.overallProgress}%` }} />
        </div>
        <div className="import-progress-pct">{progress.overallProgress}% complete</div>
        <div className="import-progress-count">
          {progress.completedChapters} / {progress.totalChapters} chapters imported
        </div>
        {progress.downloadingChapters > 0 && (
          <div className="import-progress-count">
            {progress.downloadingChapters} downloading · {progress.queuedChapters} queued
          </div>
        )}
        {progress.erroredChapters > 0 && (
          <div className="import-progress-errors">
            <AlertCircle size={14} /> {progress.erroredChapters} error
            {progress.erroredChapters > 1 ? "s" : ""}
          </div>
        )}
        {(progress.cancelledChapters ?? 0) > 0 && (
          <div className="import-progress-cancelled">
            {progress.cancelledChapters} chapter
            {(progress.cancelledChapters ?? 0) > 1 ? "s" : ""} cancelled
          </div>
        )}
      </div>
      <div className="import-progress-chapters">
        {progress.chapters.map((ch: ImportChapterProgress) => (
          <ChapterRow key={ch.chapterId} chapter={ch} />
        ))}
      </div>
      {cancelError && (
        <p className="add-manga-error" role="alert">{cancelError}</p>
      )}
      <div className="import-progress-footer">
        {finished ? (
          <p className="import-progress-settled">
            The queue has settled. Close this dialog or return to the library.
          </p>
        ) : (
          <button className="btn btn-secondary" onClick={handleCancel} disabled={cancelImport.isPending}>
            {cancelImport.isPending ? "Cancelling..." : "Cancel remaining"}
          </button>
        )}
      </div>
    </div>
  );
}

function ChapterRow({ chapter }: { chapter: ImportChapterProgress }) {
  let icon: React.ReactNode;
  let iconClass: string;
  let extra: React.ReactNode = null;

  switch (chapter.status) {
    case "complete":
      icon = <Check size={14} />;
      iconClass = "status-complete";
      break;
    case "downloading":
      icon = <Loader size={14} />;
      iconClass = "status-downloading";
      if (chapter.completedPages !== undefined && chapter.totalPages) {
        extra = <span className="import-chapter-pages">{chapter.completedPages} / {chapter.totalPages} pages</span>;
      }
      break;
    case "queued":
      icon = <Circle size={14} />;
      iconClass = "status-queued";
      break;
    case "cancelled":
      icon = <X size={14} />;
      iconClass = "status-cancelled";
      extra = <span className="import-chapter-cancelled">Cancelled</span>;
      break;
    default:
      icon = <X size={14} />;
      iconClass = "status-error";
      extra = chapter.errorMessage ? <span className="import-chapter-error">{chapter.errorMessage}</span> : null;
      break;
  }

  return (
    <div className={`import-chapter-row ${iconClass}`}>
      <span className="import-chapter-icon">{icon}</span>
      <span className="import-chapter-label">Ch. {chapter.chapterId}{chapter.title ? ` — ${chapter.title}` : ""}</span>
      {extra}
    </div>
  );
}
