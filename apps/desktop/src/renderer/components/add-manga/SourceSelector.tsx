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
        <p>No manga sources installed.</p>
        <button
          className="btn btn-secondary"
          onClick={() => {
            // Navigate to settings is handled externally; for now just a visual hint
          }}
        >
          Install more...
        </button>
      </div>
    );
  }

  const activeSource = sources.find((s) => s.id === selectedSource);

  return (
    <div className="source-selector">
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
      {activeSource?.description && (
        <p className="source-description">{activeSource.description}</p>
      )}
    </div>
  );
}
