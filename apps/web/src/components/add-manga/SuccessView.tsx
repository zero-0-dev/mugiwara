import { AlertTriangle, Check, XCircle } from "lucide-react";
import { useApiClient } from "../../api/context";
import type {
  CancelImportResult,
  MangaDetails,
  ImportProgressResponse,
} from "./types";

interface SuccessViewProps {
  mangaDetails: MangaDetails;
  mangaId: string;
  progress: ImportProgressResponse;
  cancelled?: boolean;
  cancelResult?: CancelImportResult | null;
  onViewInLibrary: (mangaId: string) => void;
  onAddAnother: () => void;
}

export function SuccessView({
  mangaDetails,
  mangaId,
  progress,
  cancelled = false,
  cancelResult,
  onViewInLibrary,
  onAddAnother,
}: SuccessViewProps) {
  const api = useApiClient();
  const hasErrors = progress.erroredChapters > 0;
  const cancelledChapters = progress.cancelledChapters ?? 0;
  const remaining =
    progress.totalChapters - progress.completedChapters - progress.erroredChapters;
  const wasCancelled = cancelled || cancelledChapters > 0 || (!progress.isComplete && remaining > 0);

  return (
    <div className="success-view">
      <div className={`success-view-icon${wasCancelled ? " cancelled" : ""}`}>
        {wasCancelled ? <XCircle size={48} /> : hasErrors ? <AlertTriangle size={48} /> : <Check size={48} />}
      </div>
      <h4 className="success-view-title">
        {wasCancelled ? "Import Cancelled" : hasErrors ? "Import Finished with Errors" : "Import Complete!"}
      </h4>

      <div className="success-view-body">
        {mangaDetails.coverImageUrl && (
          <img
            src={api.getAssetUrl(mangaDetails.coverImageUrl)}
            alt={mangaDetails.title}
            className="success-view-cover"
          />
        )}
        <div className="success-view-info">
          <p className="success-view-desc">
            {mangaDetails.title} is in your library.
          </p>
          <p className="success-view-count">
            {progress.completedChapters} of {progress.totalChapters} chapters downloaded
          </p>
          {hasErrors && (
            <p className="success-view-errors">
              {progress.erroredChapters} chapter
              {progress.erroredChapters > 1 ? "s" : ""} failed. You can retry them from the manga page.
            </p>
          )}
          {wasCancelled && (
            <p className="success-view-errors">
              {cancelResult?.message ||
                `${cancelledChapters || Math.max(remaining, 0)} pending chapter${
                  (cancelledChapters || Math.max(remaining, 0)) === 1 ? "" : "s"
                } cancelled. You can restart the download from the library later.`}
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
