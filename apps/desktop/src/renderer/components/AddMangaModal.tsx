import React, { useState, useEffect } from "react";

interface Source {
  id: string;
  name: string;
  description: string;
}

interface SearchResult {
  sourceMangaId: string;
  title: string;
  coverImageUrl?: string;
}

interface MangaDetails {
  sourceMangaId: string;
  title: string;
  coverImageUrl?: string;
  chapters: Array<{
    sourceChapterId: string;
    chapterId: string;
    title?: string;
    sortOrder: number;
  }>;
}

interface AddMangaModalProps {
  apiBaseUrl: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddMangaModal({
  apiBaseUrl,
  onClose,
  onSuccess,
}: AddMangaModalProps) {
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedManga, setSelectedManga] = useState<SearchResult | null>(null);
  const [mangaDetails, setMangaDetails] = useState<MangaDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"search" | "select" | "import">("search");
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    loadSources();
  }, []);

  async function loadSources() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/library/sources`);
      if (!response.ok) throw new Error("Failed to load sources");
      const data = await response.json();
      setSources(data);
      if (data.length > 0) {
        setSelectedSource(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sources");
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSource || !searchQuery.trim()) return;

    setLoading(true);
    setError(null);
    setSearchResults([]);
    setHasSearched(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/library/sources/${selectedSource}/search?q=${encodeURIComponent(searchQuery)}`,
      );
      if (!response.ok) throw new Error("Search failed");
      const data = await response.json();
      setSearchResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectManga(manga: SearchResult) {
    setSelectedManga(manga);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/library/sources/${selectedSource}/manga/${encodeURIComponent(manga.sourceMangaId)}`,
      );
      if (!response.ok) throw new Error("Failed to load manga details");
      const data = await response.json();
      setMangaDetails(data);
      setStep("select");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load manga details",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!selectedManga || !mangaDetails) return;

    setImporting(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/library/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: selectedSource,
          sourceMangaId: selectedManga.sourceMangaId,
          chapters: mangaDetails.chapters,
        }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Import failed" }));
        throw new Error(errorData.error);
      }

      setStep("import");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function handleBack() {
    if (step === "select") {
      setStep("search");
      setSelectedManga(null);
      setMangaDetails(null);
    }
  }

  function handleClose() {
    if (!importing) {
      onClose();
    }
  }

  if (sources.length === 0) {
    return (
      <div style={modalOverlayStyles}>
        <div style={modalStyles}>
          <div style={headerStyles}>
            <h3 style={titleStyles}>Add Manga</h3>
            <button onClick={handleClose} style={closeButtonStyles}>
              ×
            </button>
          </div>
          <div style={contentStyles}>
            <div style={emptyStateStyles}>
              <p>No manga sources available.</p>
              <p style={hintStyles}>Install source plugins to add manga.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={modalOverlayStyles}>
      <div style={modalStyles}>
        <div style={headerStyles}>
          <h3 style={titleStyles}>
            {step === "search" && "Add Manga - Search"}
            {step === "select" && "Add Manga - Select Chapters"}
            {step === "import" && "Add Manga - Importing"}
          </h3>
          <button
            onClick={handleClose}
            style={closeButtonStyles}
            disabled={importing}
          >
            ×
          </button>
        </div>

        <div style={contentStyles}>
          {error && (
            <div style={errorStyles}>
              <span>⚠️ {error}</span>
            </div>
          )}

          {step === "search" && (
            <>
              <form onSubmit={handleSearch} style={searchFormStyles}>
                <div style={formGroupStyles}>
                  <label style={labelStyles}>Source</label>
                  <select
                    value={selectedSource}
                    onChange={(e) => {
                      setSelectedSource(e.target.value);
                      setSearchQuery("");
                      setSearchResults([]);
                      setError(null);
                      setHasSearched(false);
                    }}
                    style={selectStyles}
                  >
                    {sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={formGroupStyles}>
                  <label style={labelStyles}>
                    {selectedSource === "local" ? "Select Folder" : "Search"}
                  </label>
                  {selectedSource === "local" ? (
                    <div style={folderPickerRowStyles}>
                      <input
                        type="text"
                        value={searchQuery}
                        readOnly
                        placeholder="Select a folder containing manga..."
                        style={{ ...inputStyles, flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const folder =
                            await window.electronAPI.selectFolder();
                          if (folder) {
                            setSearchQuery(folder);
                          }
                        }}
                        style={secondaryButtonStyles}
                      >
                        Browse...
                      </button>
                      <button
                        type="submit"
                        disabled={loading || !searchQuery.trim()}
                        style={primaryButtonStyles}
                      >
                        {loading ? "Scanning..." : "Scan"}
                      </button>
                    </div>
                  ) : (
                    <div style={searchInputRowStyles}>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Enter manga title..."
                        style={inputStyles}
                      />
                      <button
                        type="submit"
                        disabled={loading || !searchQuery.trim()}
                        style={primaryButtonStyles}
                      >
                        {loading ? "Searching..." : "Search"}
                      </button>
                    </div>
                  )}
                </div>
              </form>

              {searchResults.length > 0 && (
                <div style={resultsStyles}>
                  <h4 style={resultsTitleStyles}>Search Results</h4>
                  <div style={resultsListStyles}>
                    {searchResults.map((result) => (
                      <div
                        key={result.sourceMangaId}
                        onClick={() => handleSelectManga(result)}
                        style={resultItemStyles}
                      >
                        {result.coverImageUrl && (
                          <img
                            src={result.coverImageUrl}
                            alt={result.title}
                            style={coverImageStyles}
                          />
                        )}
                        <div style={resultInfoStyles}>
                          <span style={resultTitleStyles}>{result.title}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.length === 0 && hasSearched && !loading && (
                <div style={emptyStateStyles}>
                  <p>No results found.</p>
                </div>
              )}
            </>
          )}

          {step === "select" && selectedManga && mangaDetails && (
            <>
              <button onClick={handleBack} style={backButtonStyles}>
                ← Back to Search
              </button>

              <div style={mangaInfoStyles}>
                {mangaDetails.coverImageUrl && (
                  <img
                    src={mangaDetails.coverImageUrl}
                    alt={mangaDetails.title}
                    style={detailCoverStyles}
                  />
                )}
                <div style={mangaMetaStyles}>
                  <h4 style={mangaTitleStyles}>{mangaDetails.title}</h4>
                  <p style={chapterCountStyles}>
                    {mangaDetails.chapters.length} chapters available
                  </p>
                </div>
              </div>

              <div style={chaptersListStyles}>
                <h5 style={chaptersTitleStyles}>Chapters to Import</h5>
                {mangaDetails.chapters.map((chapter) => (
                  <div key={chapter.chapterId} style={chapterItemStyles}>
                    <span style={chapterNumberStyles}>
                      Chapter {chapter.chapterId}
                    </span>
                    {chapter.title && (
                      <span style={chapterTitleStyles}> - {chapter.title}</span>
                    )}
                  </div>
                ))}
              </div>

              <div style={actionsStyles}>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  style={primaryButtonStyles}
                >
                  {importing
                    ? "Importing..."
                    : `Import ${mangaDetails.chapters.length} Chapters`}
                </button>
              </div>
            </>
          )}

          {step === "import" && (
            <div style={successStyles}>
              <div style={successIconStyles}>✓</div>
              <h4 style={successTitleStyles}>Import Started!</h4>
              <p style={successTextStyles}>
                Manga has been added to your library and chapters are being
                imported.
              </p>
              <p style={hintStyles}>
                Check the Queue section in Settings to monitor progress.
              </p>
              <button onClick={handleClose} style={primaryButtonStyles}>
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Styles
const modalOverlayStyles: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.8)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: "20px",
};

const modalStyles: React.CSSProperties = {
  backgroundColor: "#1f2937",
  borderRadius: "16px",
  width: "100%",
  maxWidth: "700px",
  maxHeight: "90vh",
  overflow: "auto",
  border: "1px solid #374151",
};

const headerStyles: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "20px 24px",
  borderBottom: "1px solid #374151",
};

const titleStyles: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 600,
  margin: 0,
  color: "#fff",
};

const closeButtonStyles: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#6b7280",
  fontSize: "24px",
  cursor: "pointer",
  padding: "0",
  width: "32px",
  height: "32px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "6px",
};

const contentStyles: React.CSSProperties = {
  padding: "24px",
};

const errorStyles: React.CSSProperties = {
  padding: "12px 16px",
  backgroundColor: "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  borderRadius: "8px",
  marginBottom: "20px",
  color: "#fca5a5",
};

const searchFormStyles: React.CSSProperties = {
  marginBottom: "24px",
};

const formGroupStyles: React.CSSProperties = {
  marginBottom: "16px",
};

const labelStyles: React.CSSProperties = {
  display: "block",
  fontSize: "14px",
  fontWeight: 500,
  color: "#d1d5db",
  marginBottom: "8px",
};

const selectStyles: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "14px",
};

const inputStyles: React.CSSProperties = {
  flex: 1,
  padding: "10px 14px",
  backgroundColor: "#111827",
  border: "1px solid #374151",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "14px",
};

const searchInputRowStyles: React.CSSProperties = {
  display: "flex",
  gap: "12px",
};

const folderPickerRowStyles: React.CSSProperties = {
  display: "flex",
  gap: "12px",
};

const secondaryButtonStyles: React.CSSProperties = {
  backgroundColor: "#374151",
  color: "#d1d5db",
  border: "none",
  padding: "10px 20px",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 500,
  cursor: "pointer",
};

const primaryButtonStyles: React.CSSProperties = {
  backgroundColor: "#6366f1",
  color: "#fff",
  border: "none",
  padding: "10px 20px",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 500,
  cursor: "pointer",
};

const backButtonStyles: React.CSSProperties = {
  backgroundColor: "transparent",
  color: "#9ca3af",
  border: "none",
  padding: "8px 0",
  fontSize: "14px",
  cursor: "pointer",
  marginBottom: "16px",
};

const resultsStyles: React.CSSProperties = {
  marginTop: "24px",
};

const resultsTitleStyles: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 600,
  color: "#fff",
  marginBottom: "12px",
};

const resultsListStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: "16px",
};

const resultItemStyles: React.CSSProperties = {
  backgroundColor: "#111827",
  borderRadius: "8px",
  overflow: "hidden",
  cursor: "pointer",
  border: "1px solid #374151",
  transition: "transform 0.2s, border-color 0.2s",
};

const coverImageStyles: React.CSSProperties = {
  width: "100%",
  height: "200px",
  objectFit: "cover",
};

const resultInfoStyles: React.CSSProperties = {
  padding: "12px",
};

const resultTitleStyles: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 500,
  color: "#fff",
  display: "block",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const emptyStateStyles: React.CSSProperties = {
  textAlign: "center",
  padding: "40px",
  color: "#6b7280",
};

const hintStyles: React.CSSProperties = {
  fontSize: "13px",
  color: "#6b7280",
  marginTop: "8px",
};

const mangaInfoStyles: React.CSSProperties = {
  display: "flex",
  gap: "16px",
  marginBottom: "24px",
  padding: "16px",
  backgroundColor: "#111827",
  borderRadius: "8px",
};

const detailCoverStyles: React.CSSProperties = {
  width: "120px",
  height: "180px",
  objectFit: "cover",
  borderRadius: "8px",
};

const mangaMetaStyles: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};

const mangaTitleStyles: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  color: "#fff",
  margin: "0 0 8px 0",
};

const chapterCountStyles: React.CSSProperties = {
  fontSize: "14px",
  color: "#9ca3af",
  margin: 0,
};

const chaptersListStyles: React.CSSProperties = {
  maxHeight: "300px",
  overflow: "auto",
  backgroundColor: "#111827",
  borderRadius: "8px",
  padding: "16px",
  marginBottom: "24px",
};

const chaptersTitleStyles: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#d1d5db",
  margin: "0 0 12px 0",
};

const chapterItemStyles: React.CSSProperties = {
  padding: "8px 0",
  borderBottom: "1px solid #374151",
  fontSize: "14px",
};

const chapterNumberStyles: React.CSSProperties = {
  color: "#fff",
  fontWeight: 500,
};

const chapterTitleStyles: React.CSSProperties = {
  color: "#9ca3af",
};

const actionsStyles: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
};

const successStyles: React.CSSProperties = {
  textAlign: "center",
  padding: "40px",
};

const successIconStyles: React.CSSProperties = {
  fontSize: "48px",
  color: "#22c55e",
  marginBottom: "16px",
};

const successTitleStyles: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  color: "#fff",
  margin: "0 0 12px 0",
};

const successTextStyles: React.CSSProperties = {
  fontSize: "14px",
  color: "#9ca3af",
  margin: "0 0 8px 0",
};
