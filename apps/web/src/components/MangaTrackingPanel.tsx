import React from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Link2,
  Loader,
  RefreshCw,
  Search,
  Unlink,
} from "lucide-react";

import type { TrackerProviderId } from "../api/client";
import {
  useDisconnectTracker,
  useLinkMangaTracker,
  useMangaTracking,
  useResolveTrackerConflict,
  useSyncMangaTracker,
  useTrackerCandidates,
  useTrackerStatus,
  useUnlinkMangaTracker,
  useUpdateMangaTracking,
} from "../api/hooks";
import { useDebounce } from "../hooks/useDebounce";
import { useToast } from "./Toast";
import { Select } from "./Select";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { cn } from "@/lib/utils";

interface MangaTrackingPanelProps {
  mangaId: string;
  onOpenSettings?: () => void;
}

const STATUS_OPTIONS = [
  { value: "reading", label: "Reading" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On hold" },
  { value: "dropped", label: "Dropped" },
  { value: "plan_to_read", label: "Plan to read" },
];

function syncBadge(link: {
  syncState: string;
  syncError: string | null;
}): React.ReactNode {
  switch (link.syncState) {
    case "conflict":
      return <Badge variant="warning">Conflict</Badge>;
    case "error":
      return <Badge variant="destructive">Sync error</Badge>;
    case "pending":
      return <Badge variant="secondary">Sync pending</Badge>;
    case "synced":
      return (
        <Badge variant="success">
          <CheckCircle2 className="size-3" /> Synced
        </Badge>
      );
    default:
      return <Badge variant="secondary">{link.syncState}</Badge>;
  }
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function LinkDialog({
  mangaId,
  provider,
  providerLabel,
  scoreMax,
  open,
  onOpenChange,
  onLinked,
}: {
  mangaId: string;
  provider: TrackerProviderId;
  providerLabel: string;
  scoreMax: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}) {
  const toast = useToast();
  const [query, setQuery] = React.useState("");
  const [manualId, setManualId] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(null);
  const debouncedQuery = useDebounce(query, 300);
  const { data: candidates = [], isLoading } = useTrackerCandidates(
    mangaId,
    open ? provider : null,
    debouncedQuery,
  );
  const link = useLinkMangaTracker(mangaId);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setManualId("");
      setSelected(null);
    }
  }, [open]);

  const targetId = manualId.trim() || selected;

  function handleLink() {
    if (!targetId) {
      toast.error("Choose a result or enter a tracker id.");
      return;
    }
    link.mutate(
      { provider, trackerMangaId: targetId },
      {
        onSuccess: () => {
          toast.success(`Linked to ${providerLabel}`);
          onLinked();
          onOpenChange(false);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-sm:p-5">
        <DialogHeader className="pr-8">
          <DialogTitle>Link to {providerLabel}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Pick the matching {providerLabel} entry. Auto-suggestions use the
          local title and alternate titles; confirm before linking.
        </p>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${providerLabel}...`}
            className="pl-9"
            aria-label={`Search ${providerLabel}`}
          />
        </div>

        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader className="size-4 animate-spin" /> Searching...
            </div>
          ) : candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No matches. Enter the {providerLabel} id manually below.
            </p>
          ) : (
            candidates.map((candidate) => {
              const checked = selected === candidate.trackerMangaId;
              return (
                <button
                  key={candidate.trackerMangaId}
                  type="button"
                  onClick={() => {
                    setSelected(candidate.trackerMangaId);
                    setManualId("");
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition-colors",
                    checked
                      ? "border-primary bg-primary/10"
                      : "border-border/70 bg-background/40 hover:bg-accent",
                  )}
                >
                  {candidate.coverImage ? (
                    <img
                      src={candidate.coverImage}
                      alt=""
                      loading="lazy"
                      className="h-16 w-11 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-11 shrink-0 items-center justify-center rounded-md bg-secondary text-xs text-muted-foreground">
                      {providerLabel.slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">
                      {candidate.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      #{candidate.trackerMangaId}
                      {candidate.year ? ` · ${candidate.year}` : ""}
                      {candidate.chapters ? ` · ${candidate.chapters} ch` : ""}
                      {candidate.confidence != null
                        ? ` · ${Math.round(candidate.confidence * 100)}% match`
                        : ""}
                    </p>
                  </div>
                  {checked && (
                    <CheckCircle2 className="mt-1 size-4 shrink-0 text-primary" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div>
          <label
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            htmlFor="tracker-manual-id"
          >
            {providerLabel} id
          </label>
          <Input
            id="tracker-manual-id"
            value={manualId}
            onChange={(event) => {
              setManualId(event.target.value);
              setSelected(null);
            }}
            placeholder="e.g. 12345"
            inputMode="numeric"
            className="mt-1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Scores use a 0–{scoreMax} {providerLabel} scale.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleLink} disabled={!targetId || link.isPending}>
            {link.isPending ? "Linking..." : "Link manga"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MangaTrackingPanel({
  mangaId,
  onOpenSettings,
}: MangaTrackingPanelProps) {
  const toast = useToast();
  const { data: tracking, isLoading } = useMangaTracking(mangaId);
  const { data: status } = useTrackerStatus();
  const sync = useSyncMangaTracker(mangaId);
  const unlink = useUnlinkMangaTracker(mangaId);
  const update = useUpdateMangaTracking(mangaId);
  const resolve = useResolveTrackerConflict(mangaId);
  const disconnect = useDisconnectTracker();

  const [linkProvider, setLinkProvider] = React.useState<TrackerProviderId | null>(
    null,
  );
  const [conflictProvider, setConflictProvider] =
    React.useState<TrackerProviderId | null>(null);
  const [scoreDrafts, setScoreDrafts] = React.useState<Record<string, string>>(
    {},
  );
  const [expanded, setExpanded] = React.useState(false);

  const connected = (status?.accounts ?? []).filter(
    (account) => account.connected,
  );
  const providers = status?.providers ?? [
    { provider: "anilist" as const, label: "AniList", configured: false },
    {
      provider: "myanimelist" as const,
      label: "MyAnimeList",
      configured: false,
    },
  ];

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border/80 bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader className="size-4 animate-spin" /> Loading tracking...
        </div>
      </section>
    );
  }

  const conflictLink = tracking?.links.find(
    (item) => item.provider === conflictProvider,
  );
  const linkProviderInfo = providers.find(
    (item) => item.provider === linkProvider,
  );
  const linkScoreMax =
    tracking?.links.find((item) => item.provider === linkProvider)?.scoreMax ??
    (linkProvider === "anilist" ? 100 : 10);
  const conflictCount =
    tracking?.links.filter((item) => item.syncState === "conflict").length ?? 0;
  const errorCount =
    tracking?.links.filter((item) => item.syncState === "error").length ?? 0;

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            <Link2 className="size-4 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
              aria-controls="manga-tracking-details"
              className="inline-flex items-center gap-1 rounded-md outline-none transition-colors hover:text-brand-text focus-visible:ring-2 focus-visible:ring-ring"
            >
              Tracking
              {expanded ? (
                <ChevronUp className="size-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-4 text-muted-foreground" />
              )}
            </button>
            {conflictCount > 0 && (
              <Badge variant="warning">
                {conflictCount} conflict{conflictCount === 1 ? "" : "s"}
              </Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="destructive">
                {errorCount} sync error{errorCount === 1 ? "" : "s"}
              </Badge>
            )}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {tracking
              ? `${tracking.localChaptersRead} of ${tracking.totalChapters} chapters completed locally`
              : "Sync reading progress with AniList and MyAnimeList."}
          </p>
        </div>
        {connected.length === 0 && onOpenSettings && (
          <Button variant="outline" size="sm" onClick={onOpenSettings}>
            Connect a tracker
          </Button>
        )}
      </div>

      {expanded && (
        <div id="manga-tracking-details">
          <div className="mt-3 space-y-3">
        {providers.map((providerInfo) => {
          const account = connected.find(
            (item) => item.provider === providerInfo.provider,
          );
          const link = tracking?.links.find(
            (item) => item.provider === providerInfo.provider,
          );

          if (!link) {
            return (
              <div
                key={providerInfo.provider}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border/70 p-3"
              >
                <div>
                  <p className="text-sm font-medium">{providerInfo.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {account
                      ? "Not linked"
                      : providerInfo.configured
                        ? "Connect this tracker in Settings → Tracking"
                        : "Not configured on the server"}
                  </p>
                </div>
                {account ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLinkProvider(providerInfo.provider)}
                  >
                    <Link2 className="size-3.5" /> Link
                  </Button>
                ) : (
                  onOpenSettings && (
                    <Button variant="ghost" size="sm" onClick={onOpenSettings}>
                      Settings
                    </Button>
                  )
                )}
              </div>
            );
          }

          const scoreValue =
            scoreDrafts[link.provider] ??
            (link.score == null ? "" : String(link.score));

          return (
            <div
              key={providerInfo.provider}
              className="rounded-xl border border-border/70 bg-background/40 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{link.label}</p>
                    {syncBadge(link)}
                    <span className="text-xs text-muted-foreground">
                      #{link.trackerMangaId}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {link.chaptersRead}/{tracking?.totalChapters ?? "?"}{" "}
                    chapters · last synced {formatDate(link.lastSyncedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    title="Pull remote progress"
                    onClick={() =>
                      sync.mutate(
                        { provider: link.provider, direction: "pull" },
                        {
                          onSuccess: (result) => {
                            if (result.state === "conflict") {
                              setConflictProvider(link.provider);
                              toast.error(
                                "Local and remote progress changed. Resolve the conflict.",
                              );
                            } else {
                              toast.success("Pulled tracker progress");
                            }
                          },
                          onError: (error) => toast.error(error.message),
                        },
                      )
                    }
                    disabled={sync.isPending}
                  >
                    <ArrowDownToLine className="size-3.5" /> Pull
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    title="Push local progress"
                    onClick={() =>
                      sync.mutate(
                        { provider: link.provider, direction: "push" },
                        {
                          onSuccess: (result) => {
                            if (result.state === "conflict") {
                              setConflictProvider(link.provider);
                            } else {
                              toast.success("Pushed local progress");
                            }
                          },
                          onError: (error) => toast.error(error.message),
                        },
                      )
                    }
                    disabled={sync.isPending || account?.readOnly}
                  >
                    <ArrowUpFromLine className="size-3.5" /> Push
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Unlink this manga"
                    onClick={() =>
                      unlink.mutate(link.provider, {
                        onSuccess: () => toast.success("Tracker link removed"),
                        onError: (error) => toast.error(error.message),
                      })
                    }
                    disabled={unlink.isPending}
                  >
                    <Unlink className="size-3.5" />
                  </Button>
                </div>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Status
                  </label>
                  <Select
                    value={link.status}
                    onChange={(value) =>
                      update.mutate(
                        { provider: link.provider, status: value },
                        {
                          onSuccess: () =>
                            toast.success("Status saved and queued for push"),
                          onError: (error) => toast.error(error.message),
                        },
                      )
                    }
                    options={STATUS_OPTIONS}
                    aria-label={`${link.label} status`}
                    className="mt-1 w-full"
                    disabled={update.isPending || account?.readOnly}
                  />
                </div>
                <div>
                  <label
                    className="text-xs font-medium text-muted-foreground"
                    htmlFor={`score-${link.provider}`}
                  >
                    Score (0–{link.scoreMax})
                  </label>
                  <div className="mt-1 flex gap-1.5">
                    <Input
                      id={`score-${link.provider}`}
                      type="number"
                      min={0}
                      max={link.scoreMax}
                      value={scoreValue}
                      onChange={(event) =>
                        setScoreDrafts((current) => ({
                          ...current,
                          [link.provider]: event.target.value,
                        }))
                      }
                      disabled={account?.readOnly}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const raw = scoreDrafts[link.provider];
                        const score =
                          raw === "" || raw == null ? null : Number(raw);
                        if (
                          score != null &&
                          (!Number.isFinite(score) ||
                            score < 0 ||
                            score > link.scoreMax)
                        ) {
                          toast.error(
                            `Score must be between 0 and ${link.scoreMax}.`,
                          );
                          return;
                        }
                        update.mutate(
                          { provider: link.provider, score },
                          {
                            onSuccess: () => {
                              setScoreDrafts((current) => {
                                const next = { ...current };
                                delete next[link.provider];
                                return next;
                              });
                              toast.success("Score saved and queued for push");
                            },
                            onError: (error) => toast.error(error.message),
                          },
                        );
                      }}
                      disabled={update.isPending || account?.readOnly}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>

              {account?.readOnly && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Read-only mode: changes stay local and are not pushed.
                </p>
              )}

              {(link.syncState === "error" || link.syncError) &&
                link.syncState !== "conflict" && (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive-text">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    {link.syncError ?? "Last sync failed."}
                  </p>
                )}

              {link.syncState === "conflict" && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
                  <p className="text-xs text-warning-text">
                    Local and remote progress diverged. Choose which side to
                    keep before the next sync.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConflictProvider(link.provider)}
                  >
                    Resolve
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {linkProvider && linkProviderInfo && (
        <LinkDialog
          mangaId={mangaId}
          provider={linkProvider}
          providerLabel={linkProviderInfo.label}
          scoreMax={linkScoreMax}
          open
          onOpenChange={(open) => {
            if (!open) setLinkProvider(null);
          }}
          onLinked={() => setLinkProvider(null)}
        />
      )}

      <Dialog
        open={Boolean(conflictProvider)}
        onOpenChange={(open) => {
          if (!open) setConflictProvider(null);
        }}
      >
        <DialogContent className="max-sm:p-5">
          <DialogHeader className="pr-8">
            <DialogTitle>Resolve tracker conflict</DialogTitle>
          </DialogHeader>
          {conflictLink?.conflict ? (
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl border border-border/70 p-3">
                <p className="font-medium">Local (Mugiwara)</p>
                <p className="mt-1 text-muted-foreground">
                  {conflictLink.conflict.local.chaptersRead} chapters ·{" "}
                  {conflictLink.conflict.local.status.replace(/_/g, " ")}
                </p>
                <p className="text-muted-foreground">
                  Score: {conflictLink.conflict.local.score ?? "none"}
                </p>
                <Button
                  className="mt-3 w-full"
                  variant="brand"
                  size="sm"
                  onClick={() =>
                    conflictProvider &&
                    resolve.mutate(
                      { provider: conflictProvider, resolution: "local" },
                      {
                        onSuccess: () => {
                          setConflictProvider(null);
                          toast.success("Kept local progress");
                        },
                        onError: (error) => toast.error(error.message),
                      },
                    )
                  }
                  disabled={resolve.isPending}
                >
                  Keep local
                </Button>
              </div>
              <div className="rounded-xl border border-border/70 p-3">
                <p className="font-medium">
                  Remote ({conflictLink.label})
                </p>
                <p className="mt-1 text-muted-foreground">
                  {conflictLink.conflict.remote.chaptersRead} chapters ·{" "}
                  {conflictLink.conflict.remote.status.replace(/_/g, " ")}
                </p>
                <p className="text-muted-foreground">
                  Score: {conflictLink.conflict.remote.score ?? "none"}
                </p>
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    conflictProvider &&
                    resolve.mutate(
                      { provider: conflictProvider, resolution: "remote" },
                      {
                        onSuccess: () => {
                          setConflictProvider(null);
                          toast.success("Applied remote progress");
                        },
                        onError: (error) => toast.error(error.message),
                      },
                    )
                  }
                  disabled={resolve.isPending}
                >
                  Use remote
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This conflict is no longer available. Refresh and try again.
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConflictProvider(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {connected.length > 0 && (
        <>
          <Separator className="my-4" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Connected: {connected.map((account) => account.username).join(", ")}
            </p>
            <div className="flex gap-2">
              {connected.map((account) => (
                <Button
                  key={account.provider}
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    disconnect.mutate(account.provider, {
                      onSuccess: () =>
                        toast.success(`${account.label} disconnected`),
                      onError: (error) => toast.error(error.message),
                    })
                  }
                  disabled={disconnect.isPending}
                >
                  <RefreshCw className="size-3.5" /> Disconnect {account.label}
                </Button>
              ))}
            </div>
          </div>
        </>
      )}
        </div>
      )}
    </section>
  );
}
