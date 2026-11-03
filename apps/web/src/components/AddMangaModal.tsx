import { useReducer, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../api/context";
import { useToast } from "./Toast";
import type {
  CancelImportResult,
  ImportProgressResponse,
} from "./add-manga/types";
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
} from "../api/hooks";
import type { SearchResult } from "../api/client";
import {
  formatImportError,
  formatLocalSearchError,
  getLocalImportEnvironment,
  getLocalPathHint,
  pickLocalFolder,
} from "../platform/localImport";

interface AddMangaModalProps {
  onClose: () => void;
  onSuccess: (mangaId: string) => void;
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
  importProgress: ImportProgressResponse | null;
  cancelResult: CancelImportResult | null;
  error: string | null;
}

const initialLocal: LocalState = {
  step: "search",
  selectedSource: null,
  searchQuery: "",
  hasSearched: false,
  selectedManga: null,
  selectedChapters: new Set(),
  importProgress: null,
  cancelResult: null,
  error: null,
};

function localReducer(state: LocalState, action: any): LocalState {
  switch (action.type) {
    case "SELECT_SOURCE":
      return {
        ...state,
        selectedSource: action.sourceId,
        selectedManga: null,
        searchQuery: "",
        hasSearched: false,
        importProgress: null,
        cancelResult: null,
        error: null,
      };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.query, hasSearched: true, error: null };
    case "SET_HAS_SEARCHED":
      return { ...state, hasSearched: action.value, error: null };
    case "SET_SELECTED_MANGA":
      return { ...state, selectedManga: action.manga, error: null };
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
    case "SET_ERROR":
      return { ...state, error: action.error };
    case "IMPORT_START":
      return {
        ...state,
        step: "importing",
        importProgress: null,
        cancelResult: null,
        error: null,
      };
    case "IMPORT_FINISH":
      return {
        ...state,
        step: "success",
        importProgress: action.progress,
        cancelResult: null,
      };
    case "IMPORT_CANCELLED":
      return {
        ...state,
        step: "success",
        importProgress: action.progress,
        cancelResult: action.result,
      };
    case "BACK":
      return {
        ...state,
        step: "search",
        selectedManga: null,
        selectedChapters: new Set(),
        importProgress: null,
        cancelResult: null,
      };
    case "ADD_ANOTHER":
      return {
        ...initialLocal,
        selectedSource: state.selectedSource,
      };
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
  const toast = useToast();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const debouncedQuery = useDebounce(local.searchQuery, 300);
  const autoSelectRan = useRef(false);
  const [detailSourceMangaId, setDetailSourceMangaId] = useState<string | null>(null);
  const [localSearchPath, setLocalSearchPath] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: sources = [], isLoading: isLoadingSources } = useSources();
  const isLocal = local.selectedSource === "local";
  const localEnvironment = useMemo(() => getLocalImportEnvironment(), []);

  const { data: searchResults = [], isFetching: isSearching, error: searchError } = useSearchSource(
    local.selectedSource,
    isLocal
      ? localSearchPath
      : debouncedQuery.length >= 2
        ? debouncedQuery
        : "",
  );
  const { data: mangaDetails, isFetching: isLoadingDetails } = useSourceManga(local.selectedSource, detailSourceMangaId);

  const importMutation = useImportManga();
  const reloadLibrary = () => {
    queryClient.invalidateQueries({ queryKey: ["library"] });
    queryClient.invalidateQueries({ queryKey: ["filterOptions"] });
    queryClient.invalidateQueries({ queryKey: ["queueTasks"] });
    queryClient.invalidateQueries({ queryKey: ["queueStats"] });
    if (importMutation.data?.mangaId) {
      queryClient.invalidateQueries({ queryKey: ["manga", importMutation.data.mangaId] });
      queryClient.invalidateQueries({ queryKey: ["chapters", importMutation.data.mangaId] });
      queryClient.invalidateQueries({ queryKey: ["importProgress", importMutation.data.mangaId] });
    }
  };

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

  // Starting the import only moves the modal to the progress step. The parent
  // is not notified until the user explicitly opens the library, so the modal
  // cannot disappear before progress has been shown.
  useEffect(() => {
    if (!importMutation.isSuccess || !importMutation.data) return;
    // A previous import of the same manga (completed, cancelled or failed)
    // leaves a cached progress snapshot. Drop it so the progress view does
    // not immediately treat the new queue as finished.
    queryClient.removeQueries({ queryKey: ["importProgress", importMutation.data.mangaId] });
    dispatch({ type: "IMPORT_START" });
    reloadLibrary();
    if (importMutation.data.reusedExistingManga) {
      toast.success("This manga is already in your library. Existing chapters were reused.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importMutation.isSuccess, importMutation.data]);

  function handleSelectManga(manga: SearchResult) {
    dispatch({ type: "SET_SELECTED_MANGA", manga });
    setDetailSourceMangaId(manga.sourceMangaId);
  }

  function handleQueryChange(query: string) {
    dispatch({ type: "SET_SEARCH_QUERY", query });
    if (isLocal) {
      setLocalSearchPath("");
      dispatch({ type: "SET_HAS_SEARCHED", value: false });
    }
  }

  function handleSearchImmediate() {
    const query = local.searchQuery.trim();
    if (!query) return;
    if (isLocal) {
      setLocalSearchPath(query);
      dispatch({ type: "SET_HAS_SEARCHED", value: true });
    } else {
      dispatch({ type: "SET_SEARCH_QUERY", query });
    }
  }

  async function handleBrowse() {
    if (isLocal && localEnvironment.hasFolderPicker) {
      try {
        const path = await pickLocalFolder();
        if (!path) return;
        dispatch({ type: "SET_SEARCH_QUERY", query: path });
        setLocalSearchPath(path);
      } catch (err) {
        const message = formatImportError(err);
        dispatch({ type: "SET_ERROR", error: message });
        toast.error(message);
      }
      return;
    }

    // No native picker (browser/Capacitor). Focus the path field and let the
    // helper text explain that the path belongs to the server machine.
    searchInputRef.current?.focus();
  }

  function handleImport() {
    if (!mangaDetails) return;
    const selected = mangaDetails.chapters.filter((ch) => local.selectedChapters.has(ch.chapterId));
    if (selected.length === 0) {
      dispatch({
        type: "SET_ERROR",
        error: "Select at least one chapter to import.",
      });
      return;
    }
    if (importMutation.isPending) return;

    dispatch({ type: "SET_ERROR", error: null });
    importMutation.mutate(
      {
        sourceId: local.selectedSource!,
        sourceMangaId: mangaDetails.sourceMangaId,
        chapters: selected,
      },
      {
        onError: (err) => {
          const message = formatImportError(err);
          dispatch({ type: "SET_ERROR", error: message });
          toast.error(message);
        },
      },
    );
  }

  function handleImportComplete(progress: ImportProgressResponse) {
    dispatch({ type: "IMPORT_FINISH", progress });
    reloadLibrary();
    queryClient.invalidateQueries({ queryKey: ["importProgress", progress.mangaId] });
    toast.success("Import complete.");
  }

  function handleImportCancelled(
    progress: ImportProgressResponse | null,
    result: CancelImportResult,
  ) {
    dispatch({ type: "IMPORT_CANCELLED", progress, result });
    reloadLibrary();
    toast.toast(result.message || "Import cancelled.", "info");
  }

  function handleClose() {
    if (importMutation.isPending) return;
    if (local.step === "importing") {
      toast.toast("Import continues on the server. You can follow it from the library.", "info");
    }
    onClose();
  }

  function handleViewInLibrary(mangaId: string) {
    onSuccess(mangaId);
    onViewManga(mangaId);
    onClose();
  }

  function handleAddAnother() {
    importMutation.reset();
    dispatch({ type: "ADD_ANOTHER" });
    setDetailSourceMangaId(null);
    setLocalSearchPath("");
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      e.preventDefault();
      if (local.step === "select") {
        if (!importMutation.isPending) dispatch({ type: "BACK" });
      } else if (local.step === "importing") {
        handleClose();
      } else {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, local.step, importMutation.isPending]);

  const headerTitle = local.step === "search"
    ? "Add Manga — Search"
    : local.step === "select"
      ? "Add Manga — Select Chapters"
      : local.step === "importing"
        ? "Add Manga — Importing"
        : "Add Manga";

  const displayDetails = mangaDetails && local.selectedManga?.sourceMangaId === mangaDetails.sourceMangaId ? mangaDetails : null;
  const searchErrorMessage = searchError
    ? isLocal
      ? formatLocalSearchError(searchError, localSearchPath || local.searchQuery)
      : searchError instanceof Error
        ? searchError.message
        : "Search failed. Check the server and try again."
    : null;

  return (
    <div className="add-manga-overlay" onClick={handleClose}>
      <div className="add-manga-modal" onClick={(e) => e.stopPropagation()}>
        <AddMangaHeader title={headerTitle} onClose={handleClose} canClose={!importMutation.isPending} />
        <div className="add-manga-body">
          {local.step === "search" && (
            <>
              <SourceSelector
                sources={sources}
                selectedSource={local.selectedSource}
                onSelect={(id) => {
                  setLocalSearchPath("");
                  dispatch({ type: "SELECT_SOURCE", sourceId: id });
                }}
                isLoading={isLoadingSources}
              />
              <SearchStep
                isLocal={isLocal}
                searchQuery={local.searchQuery}
                searchResults={searchResults}
                isSearching={isSearching}
                hasSearched={local.hasSearched}
                onQueryChange={handleQueryChange}
                onSearchImmediate={handleSearchImmediate}
                onClear={() => handleQueryChange("")}
                onBrowse={handleBrowse}
                onResultClick={handleSelectManga}
                isLoadingDetails={isLoadingDetails}
                searchError={searchErrorMessage || local.error}
                nativeFolderPicker={isLocal && localEnvironment.hasFolderPicker}
                localHint={isLocal ? getLocalPathHint(localEnvironment.context) : undefined}
                showKeyboardHints={!localEnvironment.touchOnly}
                inputRef={searchInputRef}
              />
            </>
          )}

          {local.step === "select" && displayDetails && (
            <>
              <button className="add-manga-back-btn" onClick={() => { dispatch({ type: "BACK" }); setDetailSourceMangaId(null); }}>
                <ArrowLeft size={16} /> Back to Search
              </button>
              <div className="add-manga-detail">
                {displayDetails.coverImageUrl && <img src={api.getAssetUrl(displayDetails.coverImageUrl)} alt={displayDetails.title} className="add-manga-detail-cover" />}
                <div className="add-manga-detail-info">
                  <h4 className="add-manga-detail-title">{displayDetails.title}</h4>
                  <p className="add-manga-detail-meta">{displayDetails.chapters.length} chapters available</p>
                </div>
              </div>
              {local.error && (
                <div className="add-manga-error" role="alert">{local.error}</div>
              )}
              {isLoadingDetails ? (
                <div className="loading-spinner" />
              ) : displayDetails.chapters.length === 0 ? (
                <div className="add-manga-empty" role="alert">
                  <p>No chapters were found in this folder.</p>
                  <p>
                    A manga folder needs chapter subfolders, image files, or
                    CBZ/ZIP archives. Try another folder on the server.
                  </p>
                </div>
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
              onComplete={handleImportComplete}
              onCancelled={handleImportCancelled}
            />
          )}

          {local.step === "success" && displayDetails && (
            <SuccessView
              mangaDetails={displayDetails}
              mangaId={importMutation.data?.mangaId || displayDetails.sourceMangaId}
              progress={local.importProgress || {
                overallProgress: 0,
                completedChapters: 0,
                totalChapters: displayDetails.chapters.length,
                isComplete: true,
                mangaId: importMutation.data?.mangaId || "",
                erroredChapters: 0,
                downloadingChapters: 0,
                queuedChapters: 0,
                cancelledChapters: 0,
                chapters: [],
              }}
              cancelled={Boolean(local.cancelResult)}
              cancelResult={local.cancelResult}
              onViewInLibrary={handleViewInLibrary}
              onAddAnother={handleAddAnother}
            />
          )}
        </div>
      </div>
    </div>
  );
}
