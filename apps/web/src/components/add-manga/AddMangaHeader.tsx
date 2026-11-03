import { X } from "lucide-react";

interface AddMangaHeaderProps {
  title: string;
  onClose: () => void;
  canClose: boolean;
  titleId?: string;
}

export function AddMangaHeader({ title, onClose, canClose, titleId }: AddMangaHeaderProps) {
  return (
    <div className="add-manga-header">
      <h2 id={titleId}>{title}</h2>
      <button
        className="btn-icon"
        onClick={onClose}
        disabled={!canClose}
        aria-label="Close"
      >
        <X size={20} />
      </button>
    </div>
  );
}
