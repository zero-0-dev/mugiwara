import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Link2,
  RefreshCw,
  Smartphone,
  Unplug,
} from "lucide-react";

import { useToast } from "../Toast";
import {
  useCompleteTrackerCode,
  useDisconnectTracker,
  useSetTrackerReadOnly,
  useStartTrackerAuth,
  useSyncTracker,
  useTrackerStatus,
} from "../../api/hooks";
import type { TrackerProviderId } from "../../api/client";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { Switch } from "../ui/switch";
import { cn } from "@/lib/utils";

const CONFIG_HINTS: Record<TrackerProviderId, string> = {
  anilist:
    "Set MUGIWARA_ANILIST_CLIENT_ID (and optionally MUGIWARA_ANILIST_CLIENT_SECRET) on the server, then restart it.",
  myanimelist:
    "Set MUGIWARA_MAL_CLIENT_ID (and optionally MUGIWARA_MAL_CLIENT_SECRET) on the server, then restart it.",
};

function formatDate(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function TrackingSection() {
  const toast = useToast();
  const { data: status, isLoading, refetch, isFetching } = useTrackerStatus();
  const startAuth = useStartTrackerAuth();
  const completeCode = useCompleteTrackerCode();
  const disconnect = useDisconnectTracker();
  const setReadOnly = useSetTrackerReadOnly();
  const sync = useSyncTracker();

  const [pending, setPending] = React.useState<{
    provider: TrackerProviderId;
    state: string;
    authorizationUrl: string;
  } | null>(null);
  const [code, setCode] = React.useState("");

  // The OAuth callback runs in a separate tab/window. Refresh periodically so
  // the card flips to "Connected" without a manual reload.
  React.useEffect(() => {
    if (!pending) return undefined;
    const timer = window.setInterval(() => {
      void refetch();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [pending, refetch]);

  React.useEffect(() => {
    if (!pending || !status) return;
    const account = status.accounts.find(
      (item) => item.provider === pending.provider,
    );
    if (account?.connected) {
      setPending(null);
      setCode("");
      toast.success(`${account.label} connected`);
    }
  }, [pending, status, toast]);

  function handleConnect(provider: TrackerProviderId) {
    startAuth.mutate(provider, {
      onSuccess: (started) => {
        setPending({
          provider,
          state: started.state,
          authorizationUrl: started.authorizationUrl,
        });
        setCode("");
        window.open(
          started.authorizationUrl,
          "_blank",
          "noopener,noreferrer,width=560,height=720",
        );
      },
      onError: (error) => toast.error(error.message),
    });
  }

  function handlePasteSubmit() {
    if (!pending) return;
    if (!code.trim()) {
      toast.error("Paste the authorization code from the provider.");
      return;
    }
    completeCode.mutate(
      { provider: pending.provider, code: code.trim(), state: pending.state },
      {
        onSuccess: (result) => {
          setPending(null);
          setCode("");
          toast.success(`${result.account.label} connected`);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="loading-spinner" /> Loading tracker status...
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Tracking</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mirror reading progress to AniList and MyAnimeList. Progress is
            pulled on app start and on a schedule; chapter completion pushes in
            the background.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant="secondary">
          {status?.linkedManga ?? 0} linked manga
        </Badge>
        <Badge variant="secondary">
          Last sync: {formatDate(status?.lastSyncedAt ?? null)}
        </Badge>
        {(status?.conflicts ?? 0) > 0 && (
          <Badge variant="warning">{status?.conflicts} conflict(s)</Badge>
        )}
        {(status?.errored ?? 0) > 0 && (
          <Badge variant="destructive">{status?.errored} sync error(s)</Badge>
        )}
      </div>

      <Separator className="my-5" />

      <div className="space-y-4">
        {status?.providers.map((providerInfo) => {
          const account = status.accounts.find(
            (item) => item.provider === providerInfo.provider,
          );
          const isPending = pending?.provider === providerInfo.provider;
          return (
            <div
              key={providerInfo.provider}
              className="rounded-xl border border-border/70 bg-background/40 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link2 className="size-4 text-muted-foreground" />
                    <p className="font-medium">{providerInfo.label}</p>
                    {account?.connected ? (
                      <Badge variant="success">
                        <CheckCircle2 className="size-3" /> Connected
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Not connected</Badge>
                    )}
                  </div>
                  {account?.connected ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Signed in as{" "}
                      <span className="font-medium text-foreground">
                        {account.username ?? "unknown user"}
                      </span>
                      {" · "}Last sync {formatDate(account.lastSyncAt)}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {providerInfo.configured
                        ? "Connect an account to link manga and sync progress."
                        : "This provider is not configured on the server."}
                    </p>
                  )}
                  {!providerInfo.configured && (
                    <p className="mt-2 text-xs text-warning-text">
                      {CONFIG_HINTS[providerInfo.provider]}
                    </p>
                  )}
                  {account?.lastError && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive-text">
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                      {account.lastError}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {account?.connected ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          sync.mutate(
                            {
                              provider: providerInfo.provider,
                              direction: "pull",
                            },
                            {
                              onSuccess: () =>
                                toast.success(`${providerInfo.label} synced`),
                              onError: (error) => toast.error(error.message),
                            },
                          )
                        }
                        disabled={sync.isPending}
                      >
                        <RefreshCw
                          className={cn(
                            "size-3.5",
                            sync.isPending && "animate-spin",
                          )}
                        />
                        Sync now
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          disconnect.mutate(providerInfo.provider, {
                            onSuccess: () =>
                              toast.success(
                                `${providerInfo.label} disconnected`,
                              ),
                            onError: (error) => toast.error(error.message),
                          })
                        }
                        disabled={disconnect.isPending}
                      >
                        <Unplug className="size-3.5" /> Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="brand"
                      size="sm"
                      onClick={() => handleConnect(providerInfo.provider)}
                      disabled={!providerInfo.configured || startAuth.isPending}
                    >
                      <Link2 className="size-3.5" /> Connect
                    </Button>
                  )}
                </div>
              </div>

              {account?.connected && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                  <div>
                    <p className="text-sm font-medium">Read-only mode</p>
                    <p className="text-xs text-muted-foreground">
                      Pull progress from {providerInfo.label} without writing
                      back.
                    </p>
                  </div>
                  <Switch
                    checked={account.readOnly}
                    onCheckedChange={(checked) =>
                      setReadOnly.mutate(
                        {
                          provider: providerInfo.provider,
                          readOnly: checked,
                        },
                        {
                          onError: (error) => toast.error(error.message),
                        },
                      )
                    }
                    disabled={setReadOnly.isPending}
                    aria-label={`${providerInfo.label} read-only mode`}
                  />
                </div>
              )}

              {isPending && (
                <div className="mt-3 rounded-lg border border-border/70 bg-card p-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Smartphone className="size-4" /> Finished signing in?
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    If the browser tab did not return to Mugiwara, copy the{" "}
                    <code className="rounded bg-secondary px-1">code</code>{" "}
                    parameter from the redirect URL and paste it here.
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Input
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="Authorization code"
                      aria-label={`${providerInfo.label} authorization code`}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <Button
                      onClick={handlePasteSubmit}
                      disabled={completeCode.isPending}
                    >
                      {completeCode.isPending ? "Connecting..." : "Finish"}
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void refetch()}
                      disabled={isFetching}
                    >
                      I already connected
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPending(null);
                        setCode("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {status?.queue?.lastError && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive-text">
          Background sync error: {status.queue.lastError}
        </p>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Self-hosted or LAN install: set{" "}
        <code className="rounded bg-secondary px-1">server.publicUrl</code> to
        the address phones use, so OAuth callbacks return to this server.
      </p>
    </section>
  );
}
