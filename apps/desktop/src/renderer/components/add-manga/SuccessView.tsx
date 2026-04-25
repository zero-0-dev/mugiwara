import type { MangaDetails, ImportProgressResponse } from "./types";

interface SuccessViewProps {
  mangaDetails: MangaDetails;
  mangaId: string;
  progress: ImportProgressResponse;
  onViewInLibrary: (mangaId: string) => void;
  onAddAnother: () => void;
}

export function SuccessView({
  mangaDetails,
  mangaId,
  progress,
  onViewInLibrary,
  onAddAnother,
}: SuccessViewProps) {
  const hasErrors = progress.erroredChapters > 0;
  const isCancelled =
    !progress.isComplete &&
    progress.completedChapters + progress.erroredChapters <
      progress.totalChapters;

  return (
    <div className="success-view">
      <div className="success-view-icon">{"\u2713"}</div>
      <h4 className="success-view-title">
        {isCancelled ? "Import Cancelled" : "Import Complete!"}
      </h4>

      <div className="success-view-body">
        {mangaDetails.coverImageUrl && (
          <img
            src={mangaDetails.coverImageUrl}
            alt={mangaDetails.title}
            className="success-view-cover"
          />
        )}
        <div className="success-view-info">
          <p className="success-view-desc">
            {mangaDetails.title} has been added to your library.
          </p>
          <p className="success-view-count">
            {progress.completedChapters} chapters imported successfully
          </p>
          {hasErrors && (
            <p className="success-view-errors">
              {progress.erroredChapters} error
              {progress.erroredChapters > 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      <div className="success-view-footer">
        <button
          className="btn btn-primary"
          onClick={() => onViewInLibrary(mangaId)}
        >
          View in Library
        </button>
        <button className="btn btn-secondary" onClick={onAddAnother}>
          Add Another
        </button>
      </div>
    </div>
  );
}
