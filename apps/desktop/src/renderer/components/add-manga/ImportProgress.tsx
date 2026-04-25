import type { ImportProgress as ImportProgressType } from "./types";

interface ImportProgressProps {
  progress: ImportProgressType | null;
}

export function ImportProgress({ progress }: ImportProgressProps) {
  const pct = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="add-manga-progress">
      <h4 className="add-manga-success-title">Importing...</h4>
      <div className="add-manga-progress-bar">
        <div
          className="add-manga-progress-fill"
          style={{ width: `${pct}%` }}
        />
      </div>
      {progress && (
        <p className="add-manga-success-text">
          {progress.current} / {progress.total} chapters
        </p>
      )}
    </div>
  );
}
