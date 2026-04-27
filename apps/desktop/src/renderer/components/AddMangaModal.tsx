import { useReducer, useEffect, useRef, useState } from "react";
import type { ImportProgressResponse } from "./add-manga/types";
import { useDebounce } from "../hooks/useDebounce";
import { AddMangaHeader } from "./add-manga/AddMangaHeader";
import { ChapterSelect } from "./add-manga/ChapterSelect";
import { ImportProgress } from "./add-manga/ImportProgress";
import { SearchStep } from "./add-manga/SearchStep";
import { SourceSelector } from "./add-manga/SourceSelector";
import { SuccessView } from "./add-manga/SuccessView";
import {
  useSources,
  useSearchSource,
  useSourceManga,
  useImportManga,
  useCancelImport,
} from "../api/hooks";
import type { SearchResult } from "../api/client";

interface AddMangaModalProps {
  onClose: () => void;
  onSuccess: () => void;
  onViewManga: (mangaId: string) => void;
  initialSearchQuery?: string;
  initialSourceId?: string;
  initialSearchResult?: SearchResult;
}

interface LocalState {
  step: "search" | "select" | "importing" | "success";
  selectedSource: string | null;
  searchQuery: string;
  hasSearched: boolean;
  selectedManga: SearchResult | null;
  selectedChapters: Set<string>;
  error: string | null;
}

const initialLocal: LocalState = {
  step: "search",
  selectedSource: null,
  searchQuery: "",
  hasSearched: false,
  selectedManga: null,
  selectedChapters: new Set(),
  error: null,
};

function localReducer(state: LocalState, action: any): LocalState {
  switch (action.type) {
    case "SELECT_SOURCE":
      return { ...state, selectedSource: action.sourceId, selectedManga: null, searchQuery: "", hasSearched: false, error: null };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.query, hasSearched: true };
    case "SET_SELECTED_MANGA":
      return { ...state, selectedManga: action.manga };
    case "SELECT_MANGA_SUCCESS":
      return { ...state, step: "select", selectedChapters: action.chapterIds, error: null };
    case "TOGGLE_CHAPTER": {
      const next = new Set(state.selectedChapters);
      if (next.has(action.chapterId)) next.delete(action.chapterId);
      else next.add(action.chapterId);
      return { ...state, selectedChapters: next };
    }
    case "SET_SELECTED_CHAPTERS":
      return { ...state, selectedChapters: action.selected };
    case "IMPORT_START":
      return { ...state, step: "importing", error: null };
    case "IMPORT_SUCCESS":
      return { ...state, step: "success" };
    case "IMPORT_ERROR":
      return { ...state, error: action.error };
    case "BACK":
      return { ...state, step: "search", selectedManga: null, selectedChapters: new Set(), error: null };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    default:
      return state;
  }
}

export function AddMangaModal({
  onClose,
  onSuccess,
  onViewManga,
  initialSearchQuery,
  initialSourceId,
  initialSearchResult,
}: AddMangaModalProps) {
  const [local, dispatch] = useReducer(localReducer, initialLocal);
  const debouncedQuery = useDebounce(local.searchQuery, 300);
  const autoSelectRan = useRef(false);
  const [detailSourceMangaId, setDetailSourceMangaId] = useState<string | null>(null);

  const { data: sources = [], isLoading: isLoadingSources } = useSources();
  const { data: searchResults = [], isFetching: isSearching } = useSearchSource(local.selectedSource, debouncedQuery.length >= 2 ? debouncedQuery : "");
  const { data: mangaDetails, isFetching: isLoadingDetails } = useSourceManga(local.selectedSource, detailSourceMangaId);

  const importMutation = useImportManga();
  const cancelImport = useCancelImport();

  useEffect(() => {
    if (sources.length > 0 && local.selectedSource === null) {
      const targetId = initialSourceId && sources.some((s) => s.id === initialSourceId)
        ? initialSourceId
        : sources[0]?.id;
      if (targetId) dispatch({ type: "SELECT_SOURCE", sourceId: targetId });
    }
  }, [sources, local.selectedSource, initialSourceId]);

  useEffect(() => {
    if (initialSearchQuery && local.selectedSource && !local.hasSearched) {
      dispatch({ type: "SET_SEARCH_QUERY", query: initialSearchQuery });
    }
  }, [initialSearchQuery, local.selectedSource]);

  useEffect(() => {
    if (!initialSearchResult) return;
    if (!local.selectedSource || sources.length === 0) return;
    if (autoSelectRan.current) return;
    autoSelectRan.current = true;
    dispatch({ type: "SET_SELECTED_MANGA", manga: initialSearchResult });
    setDetailSourceMangaId(initialSearchResult.sourceMangaId);
  }, [initialSearchResult, local.selectedSource, sources]);

  useEffect(() => {
    if (mangaDetails && detailSourceMangaId && local.selectedManga && local.step === "search") {
      dispatch({
        type: "SELECT_MANGA_SUCCESS",
        chapterIds: new Set(mangaDetails.chapters.map((c) => c.chapterId)),
      });
    }
  }, [mangaDetails, detailSourceMangaId, local.selectedManga, local.step]);

  function handleSelectManga(manga: SearchResult) {
    dispatch({ type: "SET_SELECTED_MANGA", manga });
    setDetailSourceMangaId(manga.sourceMangaId);
  }

  async function handleImport() {
    if (!mangaDetails) return;
    importMutation.mutate(
      {
        sourceId: local.selectedSource!,
        sourceMangaId: mangaDetails.sourceMangaId,
        chapters: mangaDetails.chapters.filter((ch) => local.selectedChapters.has(ch.chapterId)),
      },
      { onError: (err) => dispatch({ type: "IMPORT_ERROR", error: err.message }) },
    );
  }

  useEffect(() => {
    if (importMutation.isSuccess && importMutation.data) {
      dispatch({ type: "IMPORT_START" });
      onSuccess();
    }
  }, [importMutation.isSuccess, importMutation.data]);

  function handleClose() {
    if (!importMutation.isPending) onClose();
  }

  function handleImportCancelled() {
    if (importMutation.data) cancelImport.mutate(importMutation.data.mangaId);
    dispatch({ type: "IMPORT_SUCCESS" });
  }

  function handleViewInLibrary(mangaId: string) {
    onViewManga(mangaId);
    onClose();
  }

  function handleAddAnother() {
    dispatch({ type: "BACK" });
    setDetailSourceMangaId(null);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      e.preventDefault();
      if (local.step === "select" || local.step === "importing") {
        if (!importMutation.isPending) dispatch({ type: "BACK" });
      } else onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, local.step, importMutation.isPending]);

  const headerTitle = local.step === "search"
    ? "Add Manga \u2014 Search"
    : local.step === "select"
      ? "Add Manga \u2014 Select Chapters"
      : local.step === "importing"
        ? "Add Manga \u2014 Importing"
        : "Add Manga";

  const isLocal = local.selectedSource === "local";
  const displayDetails = mangaDetails && local.selectedManga?.sourceMangaId === mangaDetails.sourceMangaId ? mangaDetails : null;

  return (
    <div className="add-manga-overlay" onClick={handleClose}>
      <div className="add-manga-modal" onClick={(e) => e.stopPropagation()}>
        <AddMangaHeader title={headerTitle} onClose={handleClose} canClose={!importMutation.isPending} />
        <div className="add-manga-body">
          {local.error && (
            <div className="error-message">
              <span>{"\u26A0"} {local.error}</span>
              <button onClick={() => dispatch({ type: "CLEAR_ERROR" })}>{"\u00D7"}</button>
            </div>
          )}

          {local.step === "search" && (
            <>
              <SourceSelector
                sources={sources}
                selectedSource={local.selectedSource}
                onSelect={(id) => dispatch({ type: "SELECT_SOURCE", sourceId: id })}
                isLoading={isLoadingSources}
              />
              <SearchStep
                isLocal={isLocal}
                searchQuery={local.searchQuery}
                searchResults={searchResults}
                isSearching={isSearching}
                hasSearched={local.hasSearched}
                onQueryChange={(query) => dispatch({ type: "SET_SEARCH_QUERY", query })}
                onSearchImmediate={() => {
                  if (local.searchQuery.trim()) dispatch({ type: "SET_SEARCH_QUERY", query: local.searchQuery });
                }}
                onClear={() => dispatch({ type: "SET_SEARCH_QUERY", query: "" })}
                onBrowse={() => {}}
                onResultClick={handleSelectManga}
                isLoadingDetails={isLoadingDetails}
              />
            </>
          )}

          {local.step === "select" && displayDetails && (
            <>
              <button className="add-manga-back-btn" onClick={() => { dispatch({ type: "BACK" }); setDetailSourceMangaId(null); }}>
                {"\u2190"} Back to Search
              </button>
              <div className="add-manga-detail">
                {displayDetails.coverImageUrl && <img src={displayDetails.coverImageUrl} alt={displayDetails.title} className="add-manga-detail-cover" />}
                <div className="add-manga-detail-info">
                  <h4 className="add-manga-detail-title">{displayDetails.title}</h4>
                  <p className="add-manga-detail-meta">{displayDetails.chapters.length} chapters available</p>
                </div>
              </div>
              {isLoadingDetails ? (
                <div className="loading-spinner" />
              ) : (
                <ChapterSelect
                  mangaDetails={displayDetails}
                  selectedChapters={local.selectedChapters}
                  onSelectionChange={(selected) => dispatch({ type: "SET_SELECTED_CHAPTERS", selected })}
                  onImport={handleImport}
                />
              )}
            </>
          )}

          {local.step === "importing" && importMutation.data && (
            <ImportProgress
              mangaId={importMutation.data.mangaId}
              mangaTitle={displayDetails?.title || ""}
              onComplete={() => dispatch({ type: "IMPORT_SUCCESS" })}
              onCancel={handleImportCancelled}
            />
          )}

          {local.step === "success" && displayDetails && (
            <SuccessView
              mangaDetails={displayDetails}
              mangaId={importMutation.data?.mangaId || displayDetails.sourceMangaId}
              progress={{
                overallProgress: 100,
                completedChapters: displayDetails.chapters.length,
                totalChapters: displayDetails.chapters.length,
                isComplete: true,
                mangaId: importMutation.data?.mangaId || "",
                erroredChapters: 0,
                downloadingChapters: 0,
                queuedChapters: 0,
                chapters: [],
              }}
              onViewInLibrary={handleViewInLibrary}
              onAddAnother={handleAddAnother}
            />
          )}
        </div>
      </div>
    </div>
  );
}
