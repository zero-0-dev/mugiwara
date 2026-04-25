import type { MangaDetails } from "./types";

interface ChapterSelectProps {
  mangaDetails: MangaDetails | null;
  selectedChapters: Set<string>;
  onToggle: (id: string) => void;
}

export function ChapterSelect({ mangaDetails, selectedChapters, onToggle }: ChapterSelectProps) {
  if (!mangaDetails) return null;

  return (
    <div className="add-manga-chapters">
      <h5 className="add-manga-chapters-title">Chapters to Import</h5>
      {mangaDetails.chapters.map((chapter) => (
        <div
          key={chapter.chapterId}
          className="add-manga-chapter-item"
          onClick={() => onToggle(chapter.chapterId)}
        >
          <input
            type="checkbox"
            className="add-manga-chapter-checkbox"
            checked={selectedChapters.has(chapter.chapterId)}
            onChange={() => onToggle(chapter.chapterId)}
          />
          <span className="add-manga-chapter-number">
            Chapter {chapter.sourceChapterId}
          </span>
          {chapter.title && (
            <span className="add-manga-chapter-title"> - {chapter.title}</span>
          )}
        </div>
      ))}
    </div>
  );
}
