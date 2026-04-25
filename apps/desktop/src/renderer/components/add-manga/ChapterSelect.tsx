import { useState, useEffect, useMemo, useRef } from "react";
import type { MangaDetails } from "./types";
import { ChapterItem } from "./ChapterItem";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";

interface ChapterSelectProps {
  mangaDetails: MangaDetails | null;
  selectedChapters: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  onImport: () => void;
}

export function ChapterSelect({
  mangaDetails,
  selectedChapters,
  onSelectionChange,
  onImport,
}: ChapterSelectProps) {
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const selectAllRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts([
    {
      key: "a",
      ctrl: true,
      action: () => {
        if (mangaDetails) {
          const sorted = [...mangaDetails.chapters].sort((a, b) =>
            sortOrder === "asc"
              ? a.sortOrder - b.sortOrder
              : b.sortOrder - a.sortOrder,
          );
          const visible = languageFilter
            ? sorted.filter((ch) => ch.language === languageFilter)
            : sorted;
          const ids = new Set(visible.map((ch) => ch.chapterId));
          const prev = new Set(selectedChapters);
          const merged = new Set([...prev, ...ids]);
          onSelectionChange(merged);
        }
      },
    },
    {
      key: "d",
      ctrl: true,
      action: () => {
        if (mangaDetails) {
          const allChapterIds = new Set(mangaDetails.chapters.map((ch) => ch.chapterId));
          const deselected = new Set(selectedChapters);
          for (const id of allChapterIds) {
            deselected.delete(id);
          }
          onSelectionChange(deselected);
        }
      },
    },
  ]);

  useEffect(() => {
    selectAllRef.current?.focus();
  }, []);

  if (!mangaDetails) return null;
  const details = mangaDetails;

  const languages = useMemo(() => {
    const set = new Set<string>();
    mangaDetails.chapters.forEach((ch) => {
      if (ch.language) set.add(ch.language);
    });
    return Array.from(set).sort();
  }, [mangaDetails.chapters]);

  const visibleChapters = useMemo(() => {
    let chapters = [...mangaDetails.chapters];
    if (languageFilter) {
      chapters = chapters.filter((ch) => ch.language === languageFilter);
    }
    chapters.sort((a, b) =>
      sortOrder === "asc"
        ? a.sortOrder - b.sortOrder
        : b.sortOrder - a.sortOrder
    );
    return chapters;
  }, [mangaDetails.chapters, languageFilter, sortOrder]);

  const visibleSelectedCount = useMemo(
    () => visibleChapters.filter((ch) => selectedChapters.has(ch.chapterId)).length,
    [visibleChapters, selectedChapters],
  );

  const allVisibleSelected = visibleSelectedCount === visibleChapters.length;
  const noneVisibleSelected = visibleSelectedCount === 0;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        !allVisibleSelected && !noneVisibleSelected;
    }
  }, [allVisibleSelected, noneVisibleSelected]);

  function handleSelectAllChange() {
    if (allVisibleSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(visibleChapters.map((ch) => ch.chapterId)));
    }
  }

  function handleToggleChapter(chapterId: string) {
    const next = new Set(selectedChapters);
    if (next.has(chapterId)) {
      next.delete(chapterId);
    } else {
      next.add(chapterId);
    }
    onSelectionChange(next);
  }

  function handleSelectLatest(n: number) {
    const sorted = [...details.chapters].sort(
      (a, b) => b.sortOrder - a.sortOrder
    );
    const ids = sorted.slice(0, n).map((ch) => ch.chapterId);
    onSelectionChange(new Set(ids));
  }

  function handleSelectFirst(n: number) {
    const sorted = [...details.chapters].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );
    const ids = sorted.slice(0, n).map((ch) => ch.chapterId);
    onSelectionChange(new Set(ids));
  }

  return (
    <div className="add-manga-chapters-container">
      <div className="add-manga-chapter-controls">
        <label className="add-manga-chapter-select-all">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allVisibleSelected && visibleChapters.length > 0}
            onChange={handleSelectAllChange}
          />
          {" "}Select All
        </label>

        <select
          className="add-manga-chapter-filter"
          value={languageFilter ?? ""}
          onChange={(e) => setLanguageFilter(e.target.value || null)}
        >
          <option value="">All Languages</option>
          {languages.map((lang) => (
            <option key={lang} value={lang}>
              {lang.toUpperCase()}
            </option>
          ))}
        </select>

        <button
          className="add-manga-chapter-sort"
          onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
          title={sortOrder === "asc" ? "Ascending" : "Descending"}
        >
          Chapter # {sortOrder === "asc" ? "▲" : "▼"}
        </button>

        <select
          className="add-manga-chapter-quick-select"
          defaultValue=""
          onChange={(e) => {
            const value = e.target.value;
            e.target.value = "";
            switch (value) {
              case "select-all":
                onSelectionChange(new Set(visibleChapters.map((ch) => ch.chapterId)));
                break;
              case "deselect-all":
                onSelectionChange(new Set());
                break;
              case "latest-10":
                handleSelectLatest(10);
                break;
              case "latest-50":
                handleSelectLatest(50);
                break;
              case "first-10":
                handleSelectFirst(10);
                break;
            }
          }}
        >
          <option value="" disabled>
            Quick Select...
          </option>
          <option value="select-all">Select All</option>
          <option value="deselect-all">Deselect All</option>
          <option value="latest-10">Select Latest 10</option>
          <option value="latest-50">Select Latest 50</option>
          <option value="first-10">Select First 10</option>
        </select>
      </div>

      <div className="add-manga-chapters">
        {visibleChapters.map((chapter) => (
          <ChapterItem
            key={chapter.chapterId}
            chapter={chapter}
            isSelected={selectedChapters.has(chapter.chapterId)}
            onToggle={handleToggleChapter}
          />
        ))}
        {visibleChapters.length === 0 && (
          <div className="add-manga-chapters-empty">
            No chapters match the current filter.
          </div>
        )}
      </div>

      <div className="add-manga-chapter-footer">
        <span className="add-manga-chapter-footer-count">
          Selected: {selectedChapters.size} / {mangaDetails.chapters.length}
        </span>
        <button
          className="btn btn-primary"
          onClick={onImport}
          disabled={selectedChapters.size === 0}
        >
          Import {selectedChapters.size > 0 ? `${selectedChapters.size} Chapters` : "Chapters"}
        </button>
      </div>
    </div>
  );
}
