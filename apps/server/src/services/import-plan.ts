export interface SourceChapterLike {
  chapterId: string;
  sourceChapterId: string;
  title?: string;
  sortOrder: number;
  pageCount?: number;
}

export interface ExistingChapterLike {
  chapterId: string;
  importStatus?: string | null;
}

export interface ImportPlan {
  /** Source chapters after removing duplicate chapter ids. */
  uniqueChapters: SourceChapterLike[];
  /** Chapters that do not exist in the library yet. */
  chaptersToCreate: SourceChapterLike[];
  /** Selected chapters that need a download task. */
  chaptersToQueue: SourceChapterLike[];
  /** Selected chapters already imported completely. */
  completedChapters: SourceChapterLike[];
  /** Chapters already waiting in the queue (pending/running). */
  activeChapters: SourceChapterLike[];
}

/**
 * Builds a deterministic import plan so retrying an import reuses the existing
 * manga and chapter rows. Existing chapter ids are never created again, a
 * completed chapter is not queued again, and a chapter with an active task is
 * not queued twice. Cancelled or errored chapters are queued again when the
 * user retries.
 */
export function buildImportPlan(input: {
  sourceChapters: SourceChapterLike[];
  existingChapters: ExistingChapterLike[];
  selectedChapterIds?: Set<string> | null;
  activeChapterIds?: Set<string>;
}): ImportPlan {
  const seen = new Set<string>();
  const uniqueChapters = input.sourceChapters.filter((chapter) => {
    if (!chapter.chapterId || seen.has(chapter.chapterId)) return false;
    seen.add(chapter.chapterId);
    return true;
  });

  const existingByChapterId = new Map(
    input.existingChapters.map((chapter) => [chapter.chapterId, chapter]),
  );
  const activeChapterIds = input.activeChapterIds ?? new Set<string>();

  const chaptersToCreate = uniqueChapters.filter(
    (chapter) => !existingByChapterId.has(chapter.chapterId),
  );

  const selected = uniqueChapters.filter(
    (chapter) =>
      !input.selectedChapterIds || input.selectedChapterIds.has(chapter.chapterId),
  );

  const completedChapters: SourceChapterLike[] = [];
  const activeChapters: SourceChapterLike[] = [];
  const chaptersToQueue: SourceChapterLike[] = [];

  for (const chapter of selected) {
    const existing = existingByChapterId.get(chapter.chapterId);
    if (existing?.importStatus === "complete") {
      completedChapters.push(chapter);
      continue;
    }
    if (activeChapterIds.has(chapter.chapterId)) {
      activeChapters.push(chapter);
      continue;
    }
    chaptersToQueue.push(chapter);
  }

  return {
    uniqueChapters,
    chaptersToCreate,
    chaptersToQueue,
    completedChapters,
    activeChapters,
  };
}
