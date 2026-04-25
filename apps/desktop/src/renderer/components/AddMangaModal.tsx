import { useReducer, useEffect } from "react";
import type { AddMangaState, Action, SearchResult, ImportProgressResponse } from "./add-manga/types";
import { useDebounce } from "../hooks/useDebounce";
import { AddMangaHeader } from "./add-manga/AddMangaHeader";
import { ChapterSelect } from "./add-manga/ChapterSelect";
import { ImportProgress } from "./add-manga/ImportProgress";
import { SearchStep } from "./add-manga/SearchStep";
import { SourceSelector } from "./add-manga/SourceSelector";
import { SuccessView } from "./add-manga/SuccessView";

interface AddMangaModalProps {
  apiBaseUrl: string;
  onClose: () => void;
  onSuccess: () => void;
  onViewManga: (mangaId: string) => void;
}

const initialState: AddMangaState = {
  step: "search",
  sources: [],
  selectedSource: null,
  searchQuery: "",
  searchResults: [],
  hasSearched: false,
  selectedManga: null,
  mangaDetails: null,
  mangaId: null,
  selectedChapters: new Set(),
  importProgress: null,
  error: null,
  isLoadingSources: true,
  isSearching: false,
  isLoadingDetails: false,
  isImporting: false,
};

function reducer(state: AddMangaState, action: Action): AddMangaState {
  switch (action.type) {
    case "SET_SOURCES":
      return { ...state, sources: action.sources, isLoadingSources: false };
    case "SET_SOURCES_ERROR":
      return { ...state, error: action.error, isLoadingSources: false };
    case "SELECT_SOURCE":
      return {
        ...state,
        selectedSource: action.sourceId,
        searchQuery: "",
        searchResults: [],
        hasSearched: false,
        error: null,
      };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.query };
    case "SEARCH_START":
      return { ...state, isSearching: true, error: null, searchResults: [], hasSearched: true };
    case "SEARCH_SUCCESS":
      return { ...state, isSearching: false, searchResults: action.results };
    case "SEARCH_ERROR":
      return { ...state, isSearching: false, error: action.error };
    case "SELECT_MANGA_START":
      return { ...state, isLoadingDetails: true, error: null };
    case "SELECT_MANGA_SUCCESS":
      return {
        ...state,
        isLoadingDetails: false,
        selectedManga: action.manga,
        mangaDetails: action.details,
        selectedChapters: new Set(action.details.chapters.map((c) => c.chapterId)),
        step: "select",
      };
    case "SELECT_MANGA_ERROR":
      return { ...state, isLoadingDetails: false, error: action.error };
    case "TOGGLE_CHAPTER": {
      const next = new Set(state.selectedChapters);
      if (next.has(action.chapterId)) {
        next.delete(action.chapterId);
      } else {
        next.add(action.chapterId);
      }
      return { ...state, selectedChapters: next };
    }
    case "SET_SELECTED_CHAPTERS":
      return { ...state, selectedChapters: action.selected };
    case "IMPORT_START":
      return { ...state, mangaId: action.mangaId, isImporting: true, step: "importing", error: null };
    case "UPDATE_IMPORT_PROGRESS":
      return { ...state, importProgress: action.progress };
    case "IMPORT_SUCCESS":
      return { ...state, isImporting: false, step: "success" };
    case "IMPORT_ERROR":
      return { ...state, isImporting: false, error: action.error };
    case "BACK":
      return {
        ...state,
        step: "search",
        selectedManga: null,
        mangaDetails: null,
        mangaId: null,
        selectedChapters: new Set(),
        importProgress: null,
      };
    case "CLEAR_ERROR":
      return { ...state, error: null };
  }
}

export function AddMangaModal({
  apiBaseUrl,
  onClose,
  onSuccess,
  onViewManga,
}: AddMangaModalProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const debouncedQuery = useDebounce(state.searchQuery, 300);

  useEffect(() => {
    loadSources();
  }, []);

  useEffect(() => {
    if (state.step !== "search") return;
    if (!state.selectedSource) return;
    if (debouncedQuery.length < 2) return;
    performSearch(debouncedQuery);
  }, [debouncedQuery, state.selectedSource]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      e.preventDefault();
      if (state.step === "select" || state.step === "importing") {
        if (!state.isImporting) {
          dispatch({ type: "BACK" });
        }
      } else {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, state.step, state.isImporting]);

  async function loadSources() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/library/sources`);
      if (!response.ok) throw new Error("Failed to load sources");
      const data = await response.json();
      dispatch({ type: "SET_SOURCES", sources: data });
      if (data.length > 0) {
        dispatch({ type: "SELECT_SOURCE", sourceId: data[0].id });
      }
    } catch (err) {
      dispatch({
        type: "SET_SOURCES_ERROR",
        error: err instanceof Error ? err.message : "Failed to load sources",
      });
    }
  }

  async function performSearch(query: string) {
    if (!state.selectedSource) return;

    dispatch({ type: "SEARCH_START" });

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/library/sources/${state.selectedSource}/search?q=${encodeURIComponent(query)}`,
      );
      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      dispatch({ type: "SEARCH_SUCCESS", results: data });
    } catch (err) {
      dispatch({
        type: "SEARCH_ERROR",
        error: err instanceof Error ? err.message : "Search failed",
      });
    }
  }

  function handleSearchImmediate() {
    if (!state.searchQuery.trim()) return;
    performSearch(state.searchQuery);
  }

  function handleClear() {
    dispatch({ type: "SET_SEARCH_QUERY", query: "" });
    dispatch({ type: "CLEAR_ERROR" });
  }

  async function handleBrowse() {
    const folder = await window.electronAPI.selectFolder();
    if (folder) {
      dispatch({ type: "SET_SEARCH_QUERY", query: folder });
      dispatch({ type: "SEARCH_START" });

      try {
        const response = await fetch(
          `${apiBaseUrl}/api/library/sources/local/search?q=${encodeURIComponent(folder)}`,
        );
        if (!response.ok) throw new Error("Scan failed");
        const data = await response.json();
        dispatch({ type: "SEARCH_SUCCESS", results: data });
      } catch (err) {
        dispatch({
          type: "SEARCH_ERROR",
          error: err instanceof Error ? err.message : "Scan failed",
        });
      }
    }
  }

  async function handleSelectManga(manga: SearchResult) {
    dispatch({ type: "SELECT_MANGA_START" });

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/library/sources/${state.selectedSource}/manga/${encodeURIComponent(manga.sourceMangaId)}`,
      );
      if (!response.ok) throw new Error("Failed to load manga details");
      const data = await response.json();
      dispatch({ type: "SELECT_MANGA_SUCCESS", manga, details: data });
    } catch (err) {
      dispatch({
        type: "SELECT_MANGA_ERROR",
        error: err instanceof Error ? err.message : "Failed to load manga details",
      });
    }
  }

  async function handleImport() {
    if (!state.selectedManga || !state.mangaDetails) return;

    try {
      const response = await fetch(`${apiBaseUrl}/api/library/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: state.selectedSource,
          sourceMangaId: state.selectedManga.sourceMangaId,
          chapters: state.mangaDetails.chapters.filter((ch) =>
            state.selectedChapters.has(ch.chapterId),
          ),
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Import failed" }));
        throw new Error(errorData.error);
      }

      const data = await response.json();
      dispatch({ type: "IMPORT_START", mangaId: data.mangaId });
      onSuccess();
    } catch (err) {
      dispatch({
        type: "IMPORT_ERROR",
        error: err instanceof Error ? err.message : "Import failed",
      });
    }
  }

  function handleClose() {
    if (!state.isImporting) {
      onClose();
    }
  }

  function handleImportComplete(progress: ImportProgressResponse) {
    dispatch({ type: "UPDATE_IMPORT_PROGRESS", progress });
    dispatch({ type: "IMPORT_SUCCESS" });
  }

  function handleImportCancelled() {
    dispatch({ type: "IMPORT_SUCCESS" });
  }

  function handleViewInLibrary(mangaId: string) {
    onViewManga(mangaId);
    onClose();
  }

  function handleAddAnother() {
    dispatch({ type: "BACK" });
  }

  const headerTitle =
    state.step === "search"
      ? "Add Manga \u2014 Search"
      : state.step === "select"
        ? "Add Manga \u2014 Select Chapters"
        : state.step === "importing"
          ? "Add Manga \u2014 Importing"
          : "Add Manga";

  const isLocal = state.selectedSource === "local";

  return (
    <div className="add-manga-overlay" onClick={handleClose}>
      <div className="add-manga-modal" onClick={(e) => e.stopPropagation()}>
        <AddMangaHeader
          title={headerTitle}
          onClose={handleClose}
          canClose={!state.isImporting}
        />
        <div className="add-manga-body">
          {state.error && (
            <div className="error-message">
              <span>{"\u26A0"} {state.error}</span>
              <button onClick={() => dispatch({ type: "CLEAR_ERROR" })}>
                {"\u00D7"}
              </button>
            </div>
          )}

          {state.step === "search" && (
            <>
              <SourceSelector
                sources={state.sources}
                selectedSource={state.selectedSource}
                onSelect={(id) => dispatch({ type: "SELECT_SOURCE", sourceId: id })}
                isLoading={state.isLoadingSources}
              />
              <SearchStep
                isLocal={isLocal}
                searchQuery={state.searchQuery}
                searchResults={state.searchResults}
                isSearching={state.isSearching}
                hasSearched={state.hasSearched}
                onQueryChange={(query) => dispatch({ type: "SET_SEARCH_QUERY", query })}
                onSearchImmediate={handleSearchImmediate}
                onClear={handleClear}
                onBrowse={handleBrowse}
                onResultClick={handleSelectManga}
                isLoadingDetails={state.isLoadingDetails}
              />
            </>
          )}

          {state.step === "select" && (
            <>
              <button
                className="add-manga-back-btn"
                onClick={() => dispatch({ type: "BACK" })}
              >
                {"\u2190"} Back to Search
              </button>

              <div className="add-manga-detail">
                {state.mangaDetails?.coverImageUrl && (
                  <img
                    src={state.mangaDetails.coverImageUrl}
                    alt={state.mangaDetails.title}
                    className="add-manga-detail-cover"
                  />
                )}
                <div className="add-manga-detail-info">
                  <h4 className="add-manga-detail-title">
                    {state.mangaDetails?.title}
                  </h4>
                  <p className="add-manga-detail-meta">
                    {state.mangaDetails?.chapters.length} chapters available
                  </p>
                </div>
              </div>

              {state.isLoadingDetails ? (
                <div className="loading-spinner" />
              ) : (
                <ChapterSelect
                  mangaDetails={state.mangaDetails}
                  selectedChapters={state.selectedChapters}
                  onSelectionChange={(selected) =>
                    dispatch({ type: "SET_SELECTED_CHAPTERS", selected })
                  }
                  onImport={handleImport}
                />
              )}
            </>
          )}

          {state.step === "importing" && state.mangaId && (
            <ImportProgress
              apiBaseUrl={apiBaseUrl}
              mangaId={state.mangaId}
              mangaTitle={state.mangaDetails?.title || ""}
              onComplete={handleImportComplete}
              onCancel={handleImportCancelled}
            />
          )}

          {state.step === "success" && state.mangaDetails && state.importProgress && (
            <SuccessView
              mangaDetails={state.mangaDetails}
              mangaId={state.mangaId || state.mangaDetails.sourceMangaId}
              progress={state.importProgress}
              onViewInLibrary={handleViewInLibrary}
              onAddAnother={handleAddAnother}
            />
          )}
        </div>
      </div>
    </div>
  );
}
