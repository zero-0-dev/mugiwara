import type { MangaDetails } from "./types";

interface ChapterItemProps {
  chapter: MangaDetails["chapters"][number];
  isSelected: boolean;
  onToggle: (chapterId: string) => void;
}

export function ChapterItem({ chapter, isSelected, onToggle }: ChapterItemProps) {
  return (
    <div
      className={`add-manga-chapter-item${isSelected ? " selected" : ""}`}
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
        className="add-manga-chapter-checkbox"
        checked={isSelected}
        onChange={() => onToggle(chapter.chapterId)}
        tabIndex={-1}
      />
      <span className="add-manga-chapter-number">
        Ch. {chapter.chapterId}
      </span>
      {chapter.title && (
        <span className="add-manga-chapter-title">— {chapter.title}</span>
      )}
      <span className="add-manga-chapter-spacer" />
      {chapter.language && (
        <span className="add-manga-chapter-badge add-manga-chapter-badge-lang">
          {chapter.language.toUpperCase()}
        </span>
      )}
      {chapter.scanlationGroup && (
        <span className="add-manga-chapter-badge add-manga-chapter-badge-group" title={chapter.scanlationGroup}>
          {chapter.scanlationGroup}
        </span>
      )}
    </div>
  );
}
