import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Circle, Loader, X } from "lucide-react";
import { useImportProgress, useCancelImport } from "../../api/hooks";
import type {
  CancelImportResult,
  ImportChapterProgress,
  ImportProgressResponse,
} from "./types";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Alert, AlertDescription } from "../ui/alert";
import { cn } from "@/lib/utils";

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
      <div className="space-y-3">
        <h4 className="font-semibold">Importing {mangaTitle}...</h4>
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            Progress could not be loaded:{" "}
            {progressError instanceof Error
              ? progressError.message
              : "unknown error"}
            . The server may be offline. The import may still finish; close this
            dialog and check the library.
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={cancelImport.isPending}
        >
          {cancelImport.isPending ? "Cancelling..." : "Cancel remaining"}
        </Button>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="space-y-3">
        <h4 className="font-semibold">Importing {mangaTitle}...</h4>
        <div className="rounded-xl border border-border/70 bg-background/40 p-4">
          <Progress value={0} />
          <div className="mt-2 text-sm font-medium">Starting…</div>
          <div className="text-xs text-muted-foreground">
            Waiting for the server queue
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={cancelImport.isPending}
        >
          {cancelImport.isPending ? "Cancelling..." : "Cancel remaining"}
        </Button>
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
    <div className="space-y-3">
      <h4 className="font-semibold">
        {statusLabel}: {mangaTitle}
      </h4>
      <div className="rounded-xl border border-border/70 bg-background/40 p-4">
        <Progress value={progress.overallProgress} />
        <div className="mt-2 text-sm font-medium">
          {progress.overallProgress}% complete
        </div>
        <div className="text-xs text-muted-foreground">
          {progress.completedChapters} / {progress.totalChapters} chapters
          imported
        </div>
        {progress.downloadingChapters > 0 && (
          <div className="text-xs text-muted-foreground">
            {progress.downloadingChapters} downloading ·{" "}
            {progress.queuedChapters} queued
          </div>
        )}
        {progress.erroredChapters > 0 && (
          <div className="mt-1 flex items-center gap-1 text-xs text-destructive-text">
            <AlertCircle className="size-3.5" /> {progress.erroredChapters}{" "}
            error
            {progress.erroredChapters > 1 ? "s" : ""}
          </div>
        )}
        {(progress.cancelledChapters ?? 0) > 0 && (
          <div className="mt-1 text-xs text-warning-text">
            {progress.cancelledChapters} chapter
            {(progress.cancelledChapters ?? 0) > 1 ? "s" : ""} cancelled
          </div>
        )}
      </div>
      <div className="max-h-[38dvh] space-y-1 overflow-y-auto rounded-xl border border-border/60 bg-background/30 p-2 scrollbar-thin">
        {progress.chapters.map((ch: ImportChapterProgress) => (
          <ChapterRow key={ch.chapterId} chapter={ch} />
        ))}
      </div>
      {cancelError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{cancelError}</AlertDescription>
        </Alert>
      )}
      <div>
        {finished ? (
          <p className="text-sm text-muted-foreground">
            The queue has settled. Close this dialog or return to the library.
          </p>
        ) : (
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={cancelImport.isPending}
          >
            {cancelImport.isPending ? "Cancelling..." : "Cancel remaining"}
          </Button>
        )}
      </div>
    </div>
  );
}

function ChapterRow({ chapter }: { chapter: ImportChapterProgress }) {
  let icon: React.ReactNode;
  let tone: string;
  let extra: React.ReactNode = null;

  switch (chapter.status) {
    case "complete":
      icon = <Check className="size-3.5" />;
      tone = "text-success-text";
      break;
    case "downloading":
      icon = <Loader className="size-3.5 animate-spin" />;
      tone = "text-brand-text";
      if (chapter.completedPages !== undefined && chapter.totalPages) {
        extra = (
          <span className="text-xs text-muted-foreground">
            {chapter.completedPages} / {chapter.totalPages} pages
          </span>
        );
      }
      break;
    case "queued":
      icon = <Circle className="size-3.5" />;
      tone = "text-muted-foreground";
      break;
    case "cancelled":
      icon = <X className="size-3.5" />;
      tone = "text-warning-text";
      extra = <span className="text-xs text-warning-text">Cancelled</span>;
      break;
    default:
      icon = <X className="size-3.5" />;
      tone = "text-destructive-text";
      extra = chapter.errorMessage ? (
        <span className="text-xs text-destructive-text">
          {chapter.errorMessage}
        </span>
      ) : null;
      break;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
        tone,
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate">
        Ch. {chapter.chapterId}
        {chapter.title ? ` — ${chapter.title}` : ""}
      </span>
      {extra}
    </div>
  );
}
