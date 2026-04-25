interface AddMangaHeaderProps {
  title: string;
  onClose: () => void;
  canClose: boolean;
}

export function AddMangaHeader({ title, onClose, canClose }: AddMangaHeaderProps) {
  return (
    <div className="add-manga-header">
      <h2>{title}</h2>
      <button
        className="btn-icon"
        onClick={onClose}
        disabled={!canClose}
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );
}
