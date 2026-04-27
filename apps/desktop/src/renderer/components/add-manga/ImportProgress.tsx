import { useImportProgress, useCancelImport } from "../../api/hooks";
import type { ImportChapterProgress } from "./types";

interface ImportProgressProps {
  mangaId: string;
  mangaTitle: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function ImportProgress({ mangaId, mangaTitle, onComplete, onCancel: _onCancel }: ImportProgressProps) {
  const { data: progress } = useImportProgress(mangaId);
  const cancelImport = useCancelImport();

  const handleCancel = () => {
    cancelImport.mutate(mangaId);
    _onCancel();
  };

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
          <button className="btn btn-secondary" onClick={handleCancel} disabled={cancelImport.isPending}>
            {cancelImport.isPending ? "Cancelling..." : "Cancel Remaining"}
          </button>
        </div>
      </div>
    );
  }

  if (progress.isComplete) {
    onComplete();
    return null;
  }

  return (
    <div className="import-progress">
      <h4 className="import-progress-title">Importing {mangaTitle}...</h4>
      <div className="import-progress-card">
        <div className="import-progress-bar">
          <div className="import-progress-bar-fill" style={{ width: `${progress.overallProgress}%` }} />
        </div>
        <div className="import-progress-pct">{progress.overallProgress}% complete</div>
        <div className="import-progress-count">{progress.completedChapters} / {progress.totalChapters} chapters imported</div>
        {progress.erroredChapters > 0 && (
          <div className="import-progress-errors">{progress.erroredChapters} error{progress.erroredChapters > 1 ? "s" : ""}</div>
        )}
      </div>
      <div className="import-progress-chapters">
        {progress.chapters.map((ch: ImportChapterProgress) => (
          <ChapterRow key={ch.chapterId} chapter={ch} />
        ))}
      </div>
      <div className="import-progress-footer">
        <button className="btn btn-secondary" onClick={handleCancel} disabled={cancelImport.isPending}>
          {cancelImport.isPending ? "Cancelling..." : "Cancel Remaining"}
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
        extra = <span className="import-chapter-pages">{chapter.completedPages} / {chapter.totalPages} pages</span>;
      }
      break;
    case "queued":
      icon = "\u25CB";
      iconClass = "status-queued";
      break;
    default:
      icon = "\u2717";
      iconClass = "status-error";
      extra = chapter.errorMessage ? <span className="import-chapter-error">{chapter.errorMessage}</span> : null;
      break;
  }

  return (
    <div className={`import-chapter-row ${iconClass}`}>
      <span className="import-chapter-icon">{icon}</span>
      <span className="import-chapter-label">Ch. {chapter.chapterId}{chapter.title ? ` \u2014 ${chapter.title}` : ""}</span>
      {extra}
    </div>
  );
}
