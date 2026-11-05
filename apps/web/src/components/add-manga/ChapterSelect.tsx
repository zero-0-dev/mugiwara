import { useState, useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { MangaDetails } from "./types";
import { ChapterItem } from "./ChapterItem";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { Select } from "../Select";
import { Button } from "../ui/button";

interface ChapterSelectProps {
  mangaDetails: MangaDetails | null;
  selectedChapters: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  onImport: () => void;
}

const EMPTY_CHAPTERS: MangaDetails["chapters"] = [];

export function ChapterSelect({
  mangaDetails,
  selectedChapters,
  onSelectionChange,
  onImport,
}: ChapterSelectProps) {
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const selectAllRef = useRef<HTMLInputElement>(null);
  const allChapters = mangaDetails?.chapters ?? EMPTY_CHAPTERS;

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
          const allChapterIds = new Set(
            mangaDetails.chapters.map((ch) => ch.chapterId),
          );
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

  const languages = useMemo(() => {
    const set = new Set<string>();
    allChapters.forEach((ch) => {
      if (ch.language) set.add(ch.language);
    });
    return Array.from(set).sort();
  }, [allChapters]);

  const visibleChapters = useMemo(() => {
    let chapters = [...allChapters];
    if (languageFilter) {
      chapters = chapters.filter((ch) => ch.language === languageFilter);
    }
    chapters.sort((a, b) =>
      sortOrder === "asc"
        ? a.sortOrder - b.sortOrder
        : b.sortOrder - a.sortOrder,
    );
    return chapters;
  }, [allChapters, languageFilter, sortOrder]);

  const visibleSelectedCount = useMemo(
    () =>
      visibleChapters.filter((ch) => selectedChapters.has(ch.chapterId)).length,
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

  if (!mangaDetails) return null;
  const details = mangaDetails;

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
      (a, b) => b.sortOrder - a.sortOrder,
    );
    const ids = sorted.slice(0, n).map((ch) => ch.chapterId);
    onSelectionChange(new Set(ids));
  }

  function handleSelectFirst(n: number) {
    const sorted = [...details.chapters].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const ids = sorted.slice(0, n).map((ch) => ch.chapterId);
    onSelectionChange(new Set(ids));
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allVisibleSelected && visibleChapters.length > 0}
            onChange={handleSelectAllChange}
            className="size-4 accent-indigo-500"
          />
          Select All
        </label>

        <Select
          value={languageFilter ?? ""}
          onChange={(v) => setLanguageFilter(v || null)}
          aria-label="Filter by language"
          className="w-36"
          options={[
            { value: "", label: "All Languages" },
            ...languages.map((lang) => ({
              value: lang,
              label: lang.toUpperCase(),
            })),
          ]}
        />

        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
          title={sortOrder === "asc" ? "Ascending" : "Descending"}
        >
          Chapter #{" "}
          {sortOrder === "asc" ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </Button>

        <Select
          value=""
          onChange={(v) => {
            switch (v) {
              case "select-all":
                onSelectionChange(
                  new Set(visibleChapters.map((ch) => ch.chapterId)),
                );
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
          placeholder="Quick Select..."
          aria-label="Quick select chapters"
          className="w-36"
          options={[
            { value: "select-all", label: "Select All" },
            { value: "deselect-all", label: "Deselect All" },
            { value: "latest-10", label: "Select Latest 10" },
            { value: "latest-50", label: "Select Latest 50" },
            { value: "first-10", label: "Select First 10" },
          ]}
        />
      </div>

      <div className="mt-3 max-h-[42dvh] space-y-1.5 overflow-y-auto rounded-xl border border-border/60 bg-background/30 p-2 scrollbar-thin">
        {visibleChapters.map((chapter) => (
          <ChapterItem
            key={chapter.chapterId}
            chapter={chapter}
            isSelected={selectedChapters.has(chapter.chapterId)}
            onToggle={handleToggleChapter}
          />
        ))}
        {visibleChapters.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">
            No chapters match the current filter.
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          Selected: {selectedChapters.size} / {mangaDetails.chapters.length}
        </span>
        <Button
          variant="brand"
          onClick={onImport}
          disabled={selectedChapters.size === 0}
        >
          Import{" "}
          {selectedChapters.size > 0
            ? `${selectedChapters.size} Chapters`
            : "Chapters"}
        </Button>
      </div>
    </div>
  );
}
