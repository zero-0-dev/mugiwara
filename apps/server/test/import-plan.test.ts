import { describe, expect, it } from "vitest";
import { buildImportPlan } from "../src/services/import-plan";

const chapter = (chapterId: string) => ({
  chapterId,
  sourceChapterId: `/library/My Manga/Chapter ${chapterId}`,
  title: `Chapter ${chapterId}`,
  sortOrder: Number(chapterId) * 1000,
});

describe("buildImportPlan", () => {
  it("deduplicates source chapters and creates only missing rows", () => {
    const plan = buildImportPlan({
      sourceChapters: [chapter("1"), chapter("2"), chapter("1")],
      existingChapters: [{ chapterId: "1", importStatus: "complete" }],
    });

    expect(plan.uniqueChapters.map((c) => c.chapterId)).toEqual(["1", "2"]);
    expect(plan.chaptersToCreate.map((c) => c.chapterId)).toEqual(["2"]);
  });

  it("reuses the existing manga chapter rows instead of duplicating them", () => {
    const plan = buildImportPlan({
      sourceChapters: [chapter("1"), chapter("2")],
      existingChapters: [
        { chapterId: "1", importStatus: "complete" },
        { chapterId: "2", importStatus: "complete" },
      ],
    });

    expect(plan.chaptersToCreate).toEqual([]);
    expect(plan.chaptersToQueue).toEqual([]);
    expect(plan.completedChapters.map((c) => c.chapterId)).toEqual(["1", "2"]);
  });

  it("queues cancelled or errored chapters again on retry", () => {
    const plan = buildImportPlan({
      sourceChapters: [chapter("1"), chapter("2"), chapter("3")],
      existingChapters: [
        { chapterId: "1", importStatus: "cancelled" },
        { chapterId: "2", importStatus: "error" },
        { chapterId: "3", importStatus: "complete" },
      ],
    });

    expect(plan.chaptersToCreate).toEqual([]);
    expect(plan.chaptersToQueue.map((c) => c.chapterId)).toEqual(["1", "2"]);
  });

  it("does not queue chapters that already have an active task", () => {
    const plan = buildImportPlan({
      sourceChapters: [chapter("1"), chapter("2")],
      existingChapters: [
        { chapterId: "1", importStatus: "pending" },
        { chapterId: "2", importStatus: "pending" },
      ],
      activeChapterIds: new Set(["1"]),
    });

    expect(plan.chaptersToQueue.map((c) => c.chapterId)).toEqual(["2"]);
    expect(plan.activeChapters.map((c) => c.chapterId)).toEqual(["1"]);
  });

  it("honours the user's chapter selection", () => {
    const plan = buildImportPlan({
      sourceChapters: [chapter("1"), chapter("2"), chapter("3")],
      existingChapters: [],
      selectedChapterIds: new Set(["3"]),
    });

    expect(plan.chaptersToCreate.map((c) => c.chapterId)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(plan.chaptersToQueue.map((c) => c.chapterId)).toEqual(["3"]);
  });
});
