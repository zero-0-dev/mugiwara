export interface Source {
  id: string;
  name: string;
  description: string;
}

export interface SearchResult {
  sourceMangaId: string;
  title: string;
  coverImageUrl?: string;
}

export interface MangaDetails {
  sourceMangaId: string;
  title: string;
  coverImageUrl?: string;
  chapters: Array<{
    sourceChapterId: string;
    chapterId: string;
    title?: string;
    sortOrder: number;
    language?: string;
    scanlationGroup?: string;
  }>;
}

export interface ImportChapterProgress {
  chapterId: string;
  title?: string;
  sortOrder: number;
  status: "queued" | "downloading" | "complete" | "error";
  totalPages?: number;
  completedPages?: number;
  errorMessage?: string;
}

export interface ImportProgressResponse {
  mangaId: string;
  totalChapters: number;
  completedChapters: number;
  erroredChapters: number;
  downloadingChapters: number;
  queuedChapters: number;
  overallProgress: number;
  isComplete: boolean;
  chapters: ImportChapterProgress[];
}

export type Step = "search" | "select" | "importing" | "success";

export interface AddMangaState {
  step: Step;
  sources: Source[];
  selectedSource: string | null;
  searchQuery: string;
  searchResults: SearchResult[];
  hasSearched: boolean;
  selectedManga: SearchResult | null;
  mangaDetails: MangaDetails | null;
  mangaId: string | null;
  selectedChapters: Set<string>;
  importProgress: ImportProgressResponse | null;
  error: string | null;
  isLoadingSources: boolean;
  isSearching: boolean;
  isLoadingDetails: boolean;
  isImporting: boolean;
}

export type Action =
  | { type: "SET_SOURCES"; sources: Source[] }
  | { type: "SET_SOURCES_ERROR"; error: string }
  | { type: "SELECT_SOURCE"; sourceId: string }
  | { type: "SET_SEARCH_QUERY"; query: string }
  | { type: "SEARCH_START" }
  | { type: "SEARCH_SUCCESS"; results: SearchResult[] }
  | { type: "SEARCH_ERROR"; error: string }
  | { type: "SELECT_MANGA_START" }
  | { type: "SELECT_MANGA_SUCCESS"; manga: SearchResult; details: MangaDetails }
  | { type: "SELECT_MANGA_ERROR"; error: string }
  | { type: "TOGGLE_CHAPTER"; chapterId: string }
  | { type: "SET_SELECTED_CHAPTERS"; selected: Set<string> }
  | { type: "IMPORT_START"; mangaId: string }
  | { type: "UPDATE_IMPORT_PROGRESS"; progress: ImportProgressResponse }
  | { type: "IMPORT_SUCCESS" }
  | { type: "IMPORT_ERROR"; error: string }
  | { type: "BACK" }
  | { type: "CLEAR_ERROR" };
