import { AlertTriangle, Check, XCircle } from "lucide-react";
import { useApiClient } from "../../api/context";
import type {
  CancelImportResult,
  MangaDetails,
  ImportProgressResponse,
} from "./types";
import { Button } from "../ui/button";

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
    progress.totalChapters -
    progress.completedChapters -
    progress.erroredChapters;
  const wasCancelled =
    cancelled ||
    cancelledChapters > 0 ||
    (!progress.isComplete && remaining > 0);

  return (
    <div className="flex flex-col items-center py-4 text-center">
      <div
        className={`flex size-20 items-center justify-center rounded-full ${
          wasCancelled
            ? "bg-amber-500/15 text-warning-text"
            : hasErrors
              ? "bg-amber-500/15 text-warning-text"
              : "bg-emerald-500/15 text-success-text"
        }`}
      >
        {wasCancelled ? (
          <XCircle className="size-10" />
        ) : hasErrors ? (
          <AlertTriangle className="size-10" />
        ) : (
          <Check className="size-10" />
        )}
      </div>
      <h4 className="mt-4 text-xl font-semibold">
        {wasCancelled
          ? "Import Cancelled"
          : hasErrors
            ? "Import Finished with Errors"
            : "Import Complete!"}
      </h4>

      <div className="mt-4 flex w-full max-w-md items-center gap-3 rounded-xl border border-border/70 bg-background/40 p-3 text-left">
        {mangaDetails.coverImageUrl && (
          <img
            src={api.getAssetUrl(mangaDetails.coverImageUrl)}
            alt={mangaDetails.title}
            className="h-24 w-16 shrink-0 rounded-md object-cover"
          />
        )}
        <div className="min-w-0">
          <p className="font-medium">
            {mangaDetails.title} is in your library.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {progress.completedChapters} of {progress.totalChapters} chapters
            downloaded
          </p>
          {hasErrors && (
            <p className="mt-1 text-xs text-warning-text">
              {progress.erroredChapters} chapter
              {progress.erroredChapters > 1 ? "s" : ""} failed. You can retry
              them from the manga page.
            </p>
          )}
          {wasCancelled && (
            <p className="mt-1 text-xs text-warning-text">
              {cancelResult?.message ||
                `${cancelledChapters || Math.max(remaining, 0)} pending chapter${
                  (cancelledChapters || Math.max(remaining, 0)) === 1 ? "" : "s"
                } cancelled. You can restart the download from the library later.`}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
        <Button variant="brand" onClick={() => onViewInLibrary(mangaId)}>
          View in Library
        </Button>
        <Button variant="outline" onClick={onAddAnother}>
          Add Another
        </Button>
      </div>
    </div>
  );
}
