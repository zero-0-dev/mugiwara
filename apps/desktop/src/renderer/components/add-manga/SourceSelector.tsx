import type { Source } from "./types";

interface SourceSelectorProps {
  sources: Source[];
  selectedSource: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
}

export function SourceSelector({ sources, selectedSource, onSelect, isLoading }: SourceSelectorProps) {
  if (isLoading) {
    return null;
  }

  if (sources.length === 0) {
    return (
      <div className="add-manga-empty">
        <p>No manga sources installed. Install plugins from Settings.</p>
      </div>
    );
  }

  return (
    <div className="source-tabs">
      {sources.map((source) => (
        <button
          key={source.id}
          className={`source-tab${selectedSource === source.id ? " active" : ""}`}
          onClick={() => onSelect(source.id)}
        >
          {source.name}
        </button>
      ))}
    </div>
  );
}
