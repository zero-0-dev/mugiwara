import { X } from "lucide-react";
import { Button } from "../ui/button";

interface AddMangaHeaderProps {
  title: string;
  onClose: () => void;
  canClose: boolean;
  titleId?: string;
}

export function AddMangaHeader({
  title,
  onClose,
  canClose,
  titleId,
}: AddMangaHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-5 max-sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
      <h2 id={titleId} className="truncate text-base font-semibold sm:text-lg">
        {title}
      </h2>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        disabled={!canClose}
        aria-label="Close"
      >
        <X className="size-5" />
      </Button>
    </div>
  );
}
