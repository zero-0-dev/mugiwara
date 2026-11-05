import React, { useState } from "react";
import { KeyRound, LogOut, Shield, Smartphone, Trash2 } from "lucide-react";
import {
  useAuthDevices,
  useCreatePairingCode,
  useLogoutAllDevices,
  useRevokeDevice,
} from "../../api/hooks";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription } from "../ui/alert";
import { cn } from "@/lib/utils";

export function SecuritySection() {
  const { data: devices = [], isLoading } = useAuthDevices();
  const revokeDevice = useRevokeDevice();
  const logoutAll = useLogoutAllDevices();
  const createPairingCode = useCreatePairingCode();
  const [error, setError] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-secondary" />
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-secondary" />
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Shield className="size-5 text-brand-text" />
          Devices &amp; security
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every app instance has its own token. Only token hashes are stored on
          the server. Revoke a device here, or log out every device at once.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <Shield />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            setError(null);
            createPairingCode.mutate(undefined, {
              onSuccess: (data) => setPairingCode(data.code),
              onError: (err) => setError(err.message),
            });
          }}
          disabled={createPairingCode.isPending}
        >
          <KeyRound className="size-4" />
          {createPairingCode.isPending ? "Creating..." : "Pair a new device"}
        </Button>
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
          onClick={() => {
            if (
              !window.confirm(
                "Log out all devices? Every paired app will need to pair again.",
              )
            )
              return;
            setError(null);
            logoutAll.mutate(undefined, {
              onError: (err) => setError(err.message),
            });
          }}
          disabled={logoutAll.isPending}
        >
          <LogOut className="size-4" />
          {logoutAll.isPending ? "Logging out..." : "Log out all devices"}
        </Button>
      </div>

      {pairingCode && (
        <div className="mt-5 rounded-xl border border-primary/30 bg-primary/10 p-4">
          <p className="text-sm text-muted-foreground">
            Enter this one-time code in the other app:
          </p>
          <code className="mt-2 block rounded-lg border border-border bg-background px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em] text-brand-text">
            {pairingCode}
          </code>
          <p className="mt-2 text-xs text-muted-foreground">
            It expires in 10 minutes and works once.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-2">
        {(Array.isArray(devices) ? devices : []).map((device) => (
          <div
            key={device.id}
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-xl border bg-background/40 p-3",
              device.isCurrent
                ? "border-primary/40 bg-primary/5"
                : "border-border/70",
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
              <Smartphone className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {device.label}
                </span>
                {device.isCurrent && <Badge>This device</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Paired {new Date(device.createdAt).toLocaleString()}
                {device.lastUsedAt
                  ? ` · Last used ${new Date(device.lastUsedAt).toLocaleString()}`
                  : " · Not used yet"}
                {device.revokedAt ? " · Revoked" : ""}
              </p>
            </div>
            {!device.revokedAt && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!window.confirm(`Revoke ${device.label}?`)) return;
                  setError(null);
                  revokeDevice.mutate(device.id, {
                    onError: (err) => setError(err.message),
                  });
                }}
                disabled={revokeDevice.isPending}
                className="border-destructive/40 text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
              >
                <Trash2 className="size-3.5" /> Revoke
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
