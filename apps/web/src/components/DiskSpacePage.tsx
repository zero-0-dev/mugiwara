import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  HardDrive,
  Loader,
  Trash2,
} from "lucide-react";
import { useApiClient } from "../api/context";
import { useDeleteMangaDownloads, useStorageUsage } from "../api/hooks";
import type {
  MangaDownloadsDeleteResult,
  StorageUsageManga,
} from "../api/client";
import { useToast } from "./Toast";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select } from "./Select";
import { cn } from "@/lib/utils";

interface DiskSpacePageProps {
  onBack: () => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

function formatDate(value: string | null): string {
  if (!value) return "Never read";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never read";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function DiskSpacePage({ onBack }: DiskSpacePageProps) {
  const api = useApiClient();
  const toast = useToast();
  const [sort, setSort] = useState<"size" | "lastRead">("size");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [deleteTarget, setDeleteTarget] = useState<StorageUsageManga | null>(
    null,
  );
  const [lastResult, setLastResult] = useState<{
    title: string;
    result: MangaDownloadsDeleteResult;
  } | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useStorageUsage({
    sort,
    order,
  });
  const deleteDownloads = useDeleteMangaDownloads();

  const rows = data?.manga ?? [];
  const summary = data?.summary;
  const failedRows = rows.filter((row) => row.error);
  const rowsWithDownloads = rows.filter(
    (row) => row.downloadedChapterCount > 0,
  );
  const hasDownloads = (summary?.downloadedChapters ?? 0) > 0;

  const failedChapterNames = useMemo(() => {
    if (!lastResult) return [];
    return lastResult.result.results
      .filter((result) => !result.success)
      .map((result) => result.title || `Chapter ${result.chapterId}`);
  }, [lastResult]);

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;

    deleteDownloads.mutate(target.mangaId, {
      onSuccess: (result) => {
        setDeleteTarget(null);
        setLastResult({ title: target.title, result });
        if (result.failedCount > 0) {
          toast.error(
            `Deleted ${result.deletedCount} of ${result.results.length} chapters for ${target.title}. ${result.failedCount} failed.`,
          );
        } else {
          toast.success(
            `Freed ${formatBytes(result.bytesFreed)} from ${target.title}.`,
          );
        }
      },
      onError: (mutationError) => {
        setDeleteTarget(null);
        toast.error(
          mutationError instanceof Error
            ? mutationError.message
            : "Failed to delete downloads",
        );
      },
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={onBack}
            aria-label="Back"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Disk Space
            </h1>
            <p className="text-sm text-muted-foreground">
              See what your downloaded library uses and reclaim space without
              losing reading progress.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <HardDrive className={cn("size-4", isFetching && "animate-pulse")} />
          {isFetching ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {/* Summary header */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Total library size"
          value={formatBytes(summary?.totalBytes ?? 0)}
          icon={<HardDrive className="size-4" />}
        />
        <SummaryCard
          label="Manga with downloads"
          value={String(summary?.mangaWithDownloads ?? 0)}
        />
        <SummaryCard
          label="Downloaded chapters"
          value={String(summary?.downloadedChapters ?? 0)}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Sort by</span>
          <Select
            value={sort}
            onChange={(value) => setSort(value as "size" | "lastRead")}
            aria-label="Sort disk usage by"
            className="w-40"
            options={[
              { value: "size", label: "Total size" },
              { value: "lastRead", label: "Last read" },
            ]}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
            aria-label={`Sort ${order === "asc" ? "ascending" : "descending"}. Click to reverse.`}
            title={order === "asc" ? "Ascending" : "Descending"}
          >
            {order === "asc" ? (
              <ArrowUp className="size-4" />
            ) : (
              <ArrowDown className="size-4" />
            )}
            {order === "asc" ? "Ascending" : "Descending"}
          </Button>
        </div>
        {rowsWithDownloads.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {rowsWithDownloads.length} title
            {rowsWithDownloads.length > 1 ? "s" : ""} with downloaded chapters
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle />
          <AlertTitle>Could not load disk usage</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : "Unknown error"}
          </AlertDescription>
        </Alert>
      )}

      {failedRows.length > 0 && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle />
          <AlertTitle>Some storage backends are unreachable</AlertTitle>
          <AlertDescription>
            <p>
              Sizes for these titles may be incomplete:{" "}
              {failedRows.map((row) => row.title).join(", ")}
            </p>
            <ul className="mt-1 list-inside list-disc">
              {failedRows.slice(0, 5).map((row) => (
                <li key={row.mangaId} className="text-xs">
                  {row.title}: {row.error}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {lastResult && failedChapterNames.length > 0 && (
        <Alert variant="warning" className="mt-4">
          <AlertCircle />
          <AlertTitle>
            {lastResult.result.failedCount} chapter
            {lastResult.result.failedCount > 1 ? "s" : ""} could not be deleted
            from {lastResult.title}
          </AlertTitle>
          <AlertDescription>
            <p>
              Their downloaded files may still exist, so they were left marked
              as downloaded.
            </p>
            <ul className="mt-1 list-inside list-disc">
              {failedChapterNames.slice(0, 8).map((name) => (
                <li key={name} className="text-xs">
                  {name}
                </li>
              ))}
              {failedChapterNames.length > 8 && (
                <li className="text-xs">
                  ...and {failedChapterNames.length - 8} more
                </li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {lastResult && failedChapterNames.length === 0 && (
        <Alert variant="success" className="mt-4">
          <Check />
          <AlertTitle>Downloads deleted</AlertTitle>
          <AlertDescription>
            Freed {formatBytes(lastResult.result.bytesFreed)} from{" "}
            {lastResult.title}. Reading progress was kept.
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-border/80 bg-card py-16 text-muted-foreground">
          <div className="loading-spinner" />
          <p className="text-sm">Calculating disk usage...</p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Your library is empty"
          description="Add manga to your library to see how much space it uses."
        />
      ) : !hasDownloads && failedRows.length === 0 ? (
        <EmptyState
          title="Nothing downloaded yet"
          description="Chapters you download will appear here so you can manage disk space."
        />
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
          {rows.map((row, index) => {
            const isDeleting =
              deleteDownloads.isPending &&
              deleteTarget?.mangaId === row.mangaId;
            const canDelete =
              row.downloadedChapterCount > 0 && !row.error && !isDeleting;

            return (
              <div
                key={row.mangaId}
                className={cn(
                  "flex flex-col gap-3 p-3 transition-colors sm:flex-row sm:items-center sm:gap-4 sm:p-4",
                  index > 0 && "border-t border-border/60",
                  row.error && "bg-destructive/5",
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="h-16 w-11 shrink-0 overflow-hidden rounded-lg border border-border/70 bg-secondary">
                    {row.coverImage ? (
                      <img
                        src={api.getAssetUrl(row.coverImage)}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-sm font-semibold text-muted-foreground">
                        {row.title.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {row.downloadedChapterCount} downloaded chapter
                        {row.downloadedChapterCount === 1 ? "" : "s"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <HardDrive className="size-3" />
                        {formatBytes(row.totalBytes)}
                      </span>
                      <span title={row.lastReadAt ?? undefined}>
                        Last read {formatDate(row.lastReadAt)}
                      </span>
                    </div>
                    {row.error && (
                      <p className="mt-1 text-xs text-destructive-text">
                        {row.error}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                  {row.downloadedChapterCount > 0 ? (
                    <Badge variant="secondary" className="sm:hidden">
                      {formatBytes(row.totalBytes)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="sm:hidden">
                      No downloads
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteTarget(row)}
                    disabled={!canDelete}
                    className="border-destructive/40 text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                    aria-label={`Delete all downloads for ${row.title}`}
                  >
                    {isDeleting ? (
                      <Loader className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    {isDeleting ? "Deleting..." : "Delete all downloads"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteDownloads.isPending) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader className="max-sm:px-4 max-sm:pt-4">
            <DialogTitle>Delete all downloads?</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-3 text-sm max-sm:px-4">
              <p>
                This removes every downloaded chapter for{" "}
                <span className="font-medium">{deleteTarget.title}</span> and
                frees{" "}
                <span className="font-medium">
                  {formatBytes(deleteTarget.totalBytes)}
                </span>
                .
              </p>
              <p className="text-muted-foreground">
                Reading progress, read/unread state and the manga itself are
                kept. Deleted chapters can be downloaded again later.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleteDownloads.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmDelete}
                  disabled={deleteDownloads.isPending}
                >
                  {deleteDownloads.isPending ? (
                    <>
                      <Loader className="size-4 animate-spin" /> Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="size-4" /> Delete downloads
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
      <HardDrive className="size-10 text-muted-foreground/60" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
