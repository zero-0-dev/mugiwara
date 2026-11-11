import React from "react";
import { Check, Moon, Sun } from "lucide-react";
import { useSaveSetting, useSettings } from "../../api/hooks";
import {
  THEME_FAMILIES,
  applyTheme,
  resolveTheme,
  type ThemeFamily,
  type ThemeVariant,
} from "../../lib/theme";
import { useToast } from "../Toast";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";

const MODES = ["light", "dark"] as const;

export function ThemeSection() {
  const { data: serverSettings } = useSettings();
  const saveSetting = useSaveSetting();
  const toast = useToast();

  const savedTheme = resolveTheme(
    (serverSettings as Record<string, string> | undefined)?.["ui.theme"],
  );
  const [selectedId, setSelectedId] = React.useState(savedTheme.id);

  React.useEffect(() => {
    setSelectedId(savedTheme.id);
  }, [savedTheme.id]);

  const selected = resolveTheme(selectedId);
  const selectedFamily =
    THEME_FAMILIES.find((theme) => theme.id === selected.familyId) ??
    THEME_FAMILIES[0]!;

  function selectTheme(variant: ThemeVariant) {
    if (variant.id === selectedId) return;

    const previousId = selectedId;
    setSelectedId(variant.id);
    applyTheme(variant.id);

    saveSetting.mutate(
      { key: "ui.theme", value: variant.id },
      {
        onError: (err) => {
          setSelectedId(previousId);
          applyTheme(previousId);
          toast.error(
            err instanceof Error ? err.message : "Failed to save theme",
          );
        },
      },
    );
  }

  return (
    <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Appearance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a palette and a light or dark variant. Reader pages keep their
            dark canvas so artwork stays the focus.
          </p>
        </div>
        <Badge variant="secondary" aria-live="polite">
          {selectedFamily.name} · {selected.mode === "dark" ? "Dark" : "Light"}
        </Badge>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {THEME_FAMILIES.map((theme) => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            selectedId={selectedId}
            disabled={saveSetting.isPending}
            onSelect={selectTheme}
          />
        ))}
      </div>
    </section>
  );
}

function ThemeCard({
  theme,
  selectedId,
  disabled,
  onSelect,
}: {
  theme: ThemeFamily;
  selectedId: string;
  disabled: boolean;
  onSelect: (variant: ThemeVariant) => void;
}) {
  const isActiveFamily =
    theme.light.id === selectedId || theme.dark.id === selectedId;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-background/40 p-3 transition-colors",
        isActiveFamily && "border-primary/50 bg-primary/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="truncate">{theme.name}</span>
            {theme.id === "mugiwara" && (
              <Badge
                variant="outline"
                className="shrink-0 px-1.5 py-0 text-[10px] uppercase tracking-wide"
              >
                Default
              </Badge>
            )}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {theme.description}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {MODES.map((mode) => {
          const variant = theme[mode];
          const isActive = variant.id === selectedId;
          const Icon = mode === "dark" ? Moon : Sun;

          return (
            <button
              key={mode}
              type="button"
              onClick={() => onSelect(variant)}
              disabled={disabled}
              aria-pressed={isActive}
              aria-label={`${theme.name} ${mode} theme`}
              title={`${theme.name} — ${mode === "dark" ? "Dark" : "Light"}`}
              className={cn(
                "group relative overflow-hidden rounded-lg border text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                isActive
                  ? "border-primary ring-2 ring-primary/40"
                  : "border-border/70 hover:border-primary/50 hover:shadow-sm",
              )}
            >
              <ThemePreview variant={variant} />
              <span
                className={cn(
                  "flex items-center justify-between gap-1 border-t border-border/60 px-2 py-1.5 text-[11px] font-medium",
                  isActive ? "text-brand-text" : "text-muted-foreground",
                )}
              >
                <span className="flex items-center gap-1">
                  <Icon className="size-3" />
                  {mode === "dark" ? "Dark" : "Light"}
                </span>
                {isActive && <Check className="size-3.5 shrink-0" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ThemePreview({ variant }: { variant: ThemeVariant }) {
  const palette = variant.palette;

  return (
    <span
      aria-hidden="true"
      className="block h-[68px] p-2"
      style={{ backgroundColor: palette.background }}
    >
      <span
        className="flex h-full items-center gap-1.5 rounded-md border p-1.5"
        style={{
          backgroundColor: palette.card,
          borderColor: palette.border,
        }}
      >
        <span
          className="size-4 shrink-0 rounded-full"
          style={{ backgroundColor: palette.primary }}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span
            className="h-1 w-3/4 rounded-full"
            style={{ backgroundColor: palette.foreground, opacity: 0.8 }}
          />
          <span
            className="h-1 w-1/2 rounded-full"
            style={{ backgroundColor: palette.mutedForeground, opacity: 0.7 }}
          />
          <span
            className="h-1 w-2/3 rounded-full"
            style={{ backgroundColor: palette.secondary }}
          />
        </span>
      </span>
    </span>
  );
}
