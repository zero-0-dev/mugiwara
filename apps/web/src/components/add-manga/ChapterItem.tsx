import type { MangaDetails } from "./types";
import { cn } from "@/lib/utils";

interface ChapterItemProps {
  chapter: MangaDetails["chapters"][number];
  isSelected: boolean;
  onToggle: (chapterId: string) => void;
}

export function ChapterItem({
  chapter,
  isSelected,
  onToggle,
}: ChapterItemProps) {
  return (
    <div
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        isSelected
          ? "border-primary/40 bg-primary/10"
          : "border-border/60 hover:bg-accent/60",
      )}
      onClick={() => onToggle(chapter.chapterId)}
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          onToggle(chapter.chapterId);
        }
      }}
    >
      <input
        type="checkbox"
        className="size-4 shrink-0 accent-primary"
        checked={isSelected}
        onChange={() => onToggle(chapter.chapterId)}
        tabIndex={-1}
      />
      <span className="shrink-0 font-medium">Ch. {chapter.chapterId}</span>
      {chapter.title && (
        <span className="truncate text-muted-foreground">
          — {chapter.title}
        </span>
      )}
      <span className="flex-1" />
      {chapter.language && (
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
          {chapter.language}
        </span>
      )}
      {chapter.scanlationGroup && (
        <span
          className="hidden shrink-0 truncate rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground sm:inline"
          title={chapter.scanlationGroup}
        >
          {chapter.scanlationGroup}
        </span>
      )}
    </div>
  );
}
