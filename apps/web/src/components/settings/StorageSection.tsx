import React, { useState } from "react";
import { HardDrive, Plus, RefreshCw } from "lucide-react";
import { useToast } from "../Toast";
import {
  useStorageBackends,
  useStorageTypes,
  useCreateStorageBackend,
  useUpdateStorageBackend,
  useDeleteStorageBackend,
  useScanStorage,
} from "../../api/hooks";
import { Select } from "../Select";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Badge } from "../ui/badge";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { cn } from "@/lib/utils";

const DEFAULT_CONFIGS: Record<string, Record<string, unknown>> = {
  local: { basePath: "./data/manga" },
};

const BACKEND_TYPE_NAMES: Record<string, string> = {
  local: "Local Filesystem",
  s3: "Amazon S3",
  ftp: "FTP Server",
  webdav: "WebDAV",
};

interface Backend {
  id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  isDefault: boolean;
}

export function StorageSection({
  onOpenDiskSpace,
}: {
  onOpenDiskSpace?: () => void;
}) {
  const toast = useToast();
  const { data: backends = [], isLoading: loading } = useStorageBackends();
  const { data: availableTypes = [] } = useStorageTypes();
  const createBackend = useCreateStorageBackend();
  const updateBackend = useUpdateStorageBackend();
  const deleteBackend = useDeleteStorageBackend();
  const scanStorage = useScanStorage();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingBackend, setEditingBackend] = useState<Backend | null>(null);
  const [configJson, setConfigJson] = useState("");
  const [configError, setConfigError] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<{
    added: number;
    updated: number;
    errors: string[];
  } | null>(null);
  const [newBackend, setNewBackend] = useState({
    name: "",
    type: "",
    config: {} as Record<string, unknown>,
    isDefault: false,
  });
  const [editIsDefault, setEditIsDefault] = useState(false);

  React.useEffect(() => {
    if (editingBackend) {
      setConfigJson(JSON.stringify(editingBackend.config, null, 2));
    } else if (newBackend.type) {
      const defaultConfig = DEFAULT_CONFIGS[newBackend.type] || {};
      setNewBackend((prev) => ({ ...prev, config: defaultConfig }));
      setConfigJson(JSON.stringify(defaultConfig, null, 2));
    }
    setConfigError(null);
  }, [newBackend.type, editingBackend]);

  function validateConfig(json: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(json);
      if (typeof parsed !== "object" || parsed === null) {
        setConfigError("Config must be a valid JSON object");
        return null;
      }
      setConfigError(null);
      return parsed;
    } catch {
      setConfigError("Invalid JSON");
      return null;
    }
  }

  async function handleAddBackend(e: React.FormEvent) {
    e.preventDefault();
    const config = validateConfig(configJson);
    if (!config) return;
    createBackend.mutate(
      { ...newBackend, config } as {
        type: string;
        name: string;
        config: Record<string, unknown>;
      },
      {
        onSuccess: () => resetForm(),
        onError: (err) => toast.error(err.message),
      },
    );
  }

  async function handleUpdateBackend(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBackend) return;
    const config = validateConfig(configJson);
    if (!config) return;
    updateBackend.mutate(
      { id: editingBackend.id, config, isDefault: editIsDefault },
      {
        onSuccess: () => resetForm(),
        onError: (err) => toast.error(err.message),
      },
    );
  }

  async function handleDeleteBackend(id: string) {
    if (!window.confirm("Delete this storage backend?")) return;
    deleteBackend.mutate(id, {
      onError: (err) => toast.error(err.message),
    });
  }

  async function handleScan() {
    setScanResults(null);
    scanStorage.mutate(undefined, {
      onSuccess: (data) =>
        setScanResults(
          data as unknown as {
            added: number;
            updated: number;
            errors: string[];
          },
        ),
      onError: (err) => toast.error(err.message),
    });
  }

  function startEdit(backend: Backend) {
    setEditingBackend(backend);
    setEditIsDefault(backend.isDefault);
    setConfigJson(JSON.stringify(backend.config, null, 2));
    setConfigError(null);
  }

  function resetForm() {
    setShowAddForm(false);
    setEditingBackend(null);
    setEditIsDefault(false);
    const initialType =
      Array.isArray(availableTypes) && availableTypes.length > 0
        ? availableTypes[0]
        : "";
    const initialTypeStr =
      typeof initialType === "string" ? initialType : initialType?.id || "";
    setNewBackend({
      name: "",
      type: initialTypeStr,
      config: DEFAULT_CONFIGS[initialTypeStr] || {},
      isDefault: false,
    });
    setConfigJson("");
    setConfigError(null);
  }

  function formatConfigPreview(config: Record<string, unknown>): string {
    const keys = Object.keys(config);
    if (keys.length === 0) return "No configuration";
    return (
      keys.slice(0, 3).join(", ") +
      (keys.length > 3 ? ` +${keys.length - 3} more` : "")
    );
  }

  function getTypeName(type: string): string {
    return BACKEND_TYPE_NAMES[type] || type;
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card p-6">
        <div className="h-6 w-40 animate-pulse rounded bg-secondary" />
        <div className="mt-4 space-y-3">
          <div className="h-28 animate-pulse rounded-xl bg-secondary" />
          <div className="h-28 animate-pulse rounded-xl bg-secondary" />
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Storage Backends
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure where your manga files are stored.
        </p>
      </div>

      {onOpenDiskSpace && (
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border/70 bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">Disk space manager</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              See how much each downloaded manga uses, sort by size or last
              read, and reclaim space without losing reading progress.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenDiskSpace}
            className="shrink-0"
          >
            <HardDrive className="size-4" /> Manage disk space
          </Button>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {backends.map((backend) => (
          <div
            key={backend.id}
            className={cn(
              "rounded-xl border bg-background/40 p-4 transition-colors",
              backend.isDefault
                ? "border-primary/40 bg-primary/5"
                : "border-border/70",
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{backend.name}</h3>
                {backend.isDefault && <Badge>Default</Badge>}
              </div>
              <Badge variant="secondary" className="uppercase">
                {getTypeName(backend.type)}
              </Badge>
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <div className="flex gap-2">
                <span className="min-w-14 text-muted-foreground">ID</span>
                <code className="truncate font-mono text-xs text-muted-foreground">
                  {backend.id}
                </code>
              </div>
              <div className="flex gap-2">
                <span className="min-w-14 text-muted-foreground">Config</span>
                <span className="truncate text-muted-foreground">
                  {formatConfigPreview(
                    backend.config as Record<string, unknown>,
                  )}
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {backend.type === "local" && window.electronAPI?.openFolder && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.electronAPI?.openFolder(
                      (backend.config as Record<string, unknown>)
                        .basePath as string,
                    )
                  }
                >
                  Open Folder
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => startEdit(backend as Backend)}
              >
                Edit
              </Button>
              {!backend.isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDeleteBackend(backend.id)}
                  className="border-destructive/40 text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {backends.length === 0 && (
        <div className="mt-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center text-muted-foreground">
          <HardDrive className="size-10 opacity-50" />
          <p className="mt-3 text-sm">No storage backends configured</p>
        </div>
      )}

      {!showAddForm &&
        !editingBackend &&
        Array.isArray(availableTypes) &&
        availableTypes.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="brand" onClick={() => setShowAddForm(true)}>
              <Plus className="size-4" /> Add Storage Backend
            </Button>
            <Button
              variant="outline"
              onClick={handleScan}
              disabled={scanStorage.isPending || backends.length === 0}
            >
              <RefreshCw
                className={cn(
                  "size-4",
                  scanStorage.isPending && "animate-spin",
                )}
              />
              {scanStorage.isPending ? "Scanning..." : "Scan Storage"}
            </Button>
          </div>
        )}

      {scanResults && (
        <Alert variant="success" className="mt-5">
          <HardDrive />
          <AlertTitle>Scan Complete</AlertTitle>
          <AlertDescription>
            <p>Added: {scanResults.added} manga</p>
            <p>Updated: {scanResults.updated} chapters</p>
            {scanResults.errors.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-destructive-text">
                {scanResults.errors.slice(0, 5).map((err, i) => (
                  <li key={i} className="text-xs">
                    {err}
                  </li>
                ))}
                {scanResults.errors.length > 5 && (
                  <li className="text-xs">
                    ...and {scanResults.errors.length - 5} more
                  </li>
                )}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {(!Array.isArray(availableTypes) || availableTypes.length === 0) && (
        <Alert variant="warning" className="mt-5">
          <HardDrive />
          <AlertTitle>No storage plugins available</AlertTitle>
          <AlertDescription>
            Install storage plugins from the Plugins section to add storage
            backends.
          </AlertDescription>
        </Alert>
      )}

      <Dialog
        open={showAddForm}
        onOpenChange={(open) => (open ? setShowAddForm(true) : resetForm())}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Storage Backend</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddBackend} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="backend-name">Name *</Label>
              <Input
                id="backend-name"
                type="text"
                value={newBackend.name}
                onChange={(e) =>
                  setNewBackend({ ...newBackend, name: e.target.value })
                }
                placeholder="My Storage"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select
                value={newBackend.type}
                onChange={(v) =>
                  setNewBackend({
                    ...newBackend,
                    type: v,
                    config: DEFAULT_CONFIGS[v] || {},
                  })
                }
                aria-label="Storage backend type"
                options={(Array.isArray(availableTypes)
                  ? availableTypes
                  : []
                ).map((type) => {
                  const typeId = typeof type === "string" ? type : type.id;
                  return { value: typeId, label: getTypeName(typeId) };
                })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="backend-config">Configuration (JSON) *</Label>
              <Textarea
                id="backend-config"
                value={configJson}
                onChange={(e) => {
                  setConfigJson(e.target.value);
                  validateConfig(e.target.value);
                }}
                rows={8}
                required
                className={cn(
                  "font-mono text-xs",
                  configError &&
                    "border-destructive focus-visible:ring-destructive/30",
                )}
              />
              {configError ? (
                <span className="text-xs text-destructive-text">
                  {configError}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Configuration as JSON object
                </span>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newBackend.isDefault}
                onChange={(e) =>
                  setNewBackend({
                    ...newBackend,
                    isDefault: e.target.checked,
                  })
                }
                className="size-4 accent-indigo-500"
              />
              <span>
                Set as default backend
                {backends.length === 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    (first backend is always default)
                  </span>
                )}
              </span>
            </label>
            <div className="flex justify-end gap-2 max-sm:px-4">
              <Button
                type="submit"
                disabled={!!configError || createBackend.isPending}
              >
                Create
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingBackend)}
        onOpenChange={(open) => (!open ? resetForm() : undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editingBackend?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateBackend} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Input
                type="text"
                value={editingBackend ? getTypeName(editingBackend.type) : ""}
                disabled
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-backend-config">
                Configuration (JSON) *
              </Label>
              <Textarea
                id="edit-backend-config"
                value={configJson}
                onChange={(e) => {
                  setConfigJson(e.target.value);
                  validateConfig(e.target.value);
                }}
                rows={10}
                required
                className={cn(
                  "font-mono text-xs",
                  configError &&
                    "border-destructive focus-visible:ring-destructive/30",
                )}
              />
              {configError && (
                <span className="text-xs text-destructive-text">
                  {configError}
                </span>
              )}
            </div>
            {editingBackend && !editingBackend.isDefault && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editIsDefault}
                  onChange={(e) => setEditIsDefault(e.target.checked)}
                  className="size-4 accent-indigo-500"
                />
                Set as default backend
              </label>
            )}
            <div className="flex justify-end gap-2 max-sm:px-4">
              <Button
                type="submit"
                disabled={!!configError || updateBackend.isPending}
              >
                Save Changes
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
