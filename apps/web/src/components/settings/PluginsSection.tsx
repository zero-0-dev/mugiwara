import React, { useState } from "react";
import { Download, Package, Search, ShieldOff, Trash2 } from "lucide-react";
import {
  useInstalledPlugins,
  useAvailablePlugins,
  useInstallPlugin,
  useUninstallPlugin,
  useTogglePlugin,
  usePluginPolicy,
} from "../../api/hooks";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { cn } from "@/lib/utils";

export function PluginsSection() {
  const { data: installed = [], isLoading } = useInstalledPlugins();
  const { data: available = [] } = useAvailablePlugins();
  const installPlugin = useInstallPlugin();
  const uninstallPlugin = useUninstallPlugin();
  const togglePlugin = useTogglePlugin();
  const { data: policy } = usePluginPolicy();

  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredAvailable = (Array.isArray(available) ? available : []).filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !(Array.isArray(installed) ? installed : []).find((i) => i.id === p.name),
  );

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-secondary" />
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-secondary" />
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Plugins</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage manga sources and storage backends. Install new plugins from
          NPM.
        </p>
      </div>

      {policy && !policy.installEnabled && (
        <Alert variant="warning" className="mt-4">
          <ShieldOff />
          <AlertTitle>Plugin installation is disabled</AlertTitle>
          <AlertDescription>{policy.reason}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mt-4">
          <ShieldOff />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Package className="size-4 text-brand-text" />
          Installed Plugins
        </h3>
        {(Array.isArray(installed) ? installed : []).length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No plugins installed.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {(Array.isArray(installed) ? installed : []).map((plugin) => (
              <div
                key={plugin.id}
                className={cn(
                  "rounded-xl border bg-background/40 p-4 transition-opacity",
                  plugin.isEnabled
                    ? "border-border/70"
                    : "border-border/50 opacity-70",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate font-medium">{plugin.id}</h4>
                    {plugin.isBuiltin && (
                      <Badge variant="secondary">Built-in</Badge>
                    )}
                  </div>
                  <Badge variant={plugin.isEnabled ? "success" : "outline"}>
                    {plugin.isEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="capitalize">{plugin.type}</span>
                  <span>v{plugin.version}</span>
                </div>
                {!plugin.isBuiltin && (
                  <div className="mt-3 flex items-center gap-3">
                    <Switch
                      checked={plugin.isEnabled}
                      onCheckedChange={(checked) =>
                        togglePlugin.mutate(
                          { id: plugin.id, enable: checked },
                          { onError: (err) => setError(err.message) },
                        )
                      }
                      aria-label={`Toggle ${plugin.id}`}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!window.confirm(`Uninstall ${plugin.id}?`)) return;
                        uninstallPlugin.mutate(plugin.id, {
                          onError: (err) => setError(err.message),
                        });
                      }}
                      className="border-destructive/40 text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                    >
                      <Trash2 className="size-3.5" /> Uninstall
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h3 className="text-base font-semibold">Available Plugins</h3>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search plugins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            aria-label="Search plugins"
          />
        </div>
        <div className="mt-3 space-y-2">
          {filteredAvailable.slice(0, 10).map((plugin) => (
            <div
              key={plugin.name}
              className="rounded-xl border border-border/70 bg-background/40 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="truncate font-medium">{plugin.name}</h4>
                <Badge variant="outline">v{plugin.version}</Badge>
              </div>
              {plugin.description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {plugin.description}
                </p>
              )}
              <Button
                size="sm"
                className="mt-3"
                onClick={() => {
                  if (
                    !window.confirm(
                      `Install ${plugin.name}?\n\nThe package is installed with npm lifecycle scripts disabled and must match the approved plugin allowlist.`,
                    )
                  )
                    return;
                  installPlugin.mutate(
                    { packageName: plugin.name, confirm: true },
                    { onError: (err) => setError(err.message) },
                  );
                }}
                disabled={
                  installPlugin.isPending || policy?.installEnabled === false
                }
              >
                <Download className="size-3.5" />
                {installPlugin.isPending ? "Installing..." : "Install"}
              </Button>
            </div>
          ))}
          {filteredAvailable.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No available plugins match that search.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
