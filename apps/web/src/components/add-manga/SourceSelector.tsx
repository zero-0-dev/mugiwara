import type { Source } from "./types";
import { cn } from "@/lib/utils";

interface SourceSelectorProps {
  sources: Source[];
  selectedSource: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
}

export function SourceSelector({
  sources,
  selectedSource,
  onSelect,
  isLoading,
}: SourceSelectorProps) {
  if (isLoading) {
    return null;
  }

  if (sources.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <p>No manga sources installed.</p>
      </div>
    );
  }

  const activeSource = sources.find((s) => s.id === selectedSource);

  return (
    <div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {sources.map((source) => (
          <button
            key={source.id}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              selectedSource === source.id
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border/70 bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            onClick={() => onSelect(source.id)}
          >
            {source.name}
          </button>
        ))}
      </div>
      {activeSource?.description && (
        <p className="mt-2 text-xs text-muted-foreground">
          {activeSource.description}
        </p>
      )}
    </div>
  );
}
