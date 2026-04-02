import React, { useEffect, useState } from 'react';
import { Manga } from '@mugiwara/types';

interface MangaWithCount extends Manga {
  chapterCount?: number;
}

interface LibraryProps {
  apiBaseUrl: string;
  onMangaSelect: (mangaId: string) => void;
}

export function Library({ apiBaseUrl, onMangaSelect }: LibraryProps) {
  const [manga, setManga] = useState<MangaWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directories, setDirectories] = useState<string[]>([]);
  const [newDirectory, setNewDirectory] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchManga();
    loadSavedDirectories();
  }, [apiBaseUrl]);

  async function loadSavedDirectories() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/library/sources/local/configure`);
      if (response.ok) {
        const data = await response.json();
        setDirectories(data.directories || []);
      }
    } catch (err) {
      console.error('Failed to load saved directories:', err);
    }
  }

  async function fetchManga() {
    try {
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/api/manga`);
      if (!response.ok) throw new Error('Failed to fetch manga');
      const data = await response.json();
      setManga(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleScan() {
    try {
      setScanning(true);
      setError(null);
      
      // First configure directories if any
      if (directories.length > 0) {
        await fetch(`${apiBaseUrl}/api/library/sources/local/configure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ directories })
        });
      }
      
      const response = await fetch(`${apiBaseUrl}/api/library/scan`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Scan failed');
      const result = await response.json();
      console.log('Scan result:', result);
      
      if (result.errors && result.errors.length > 0) {
        setError(`Scan completed with errors: ${result.errors.join(', ')}`);
      }
      
      await fetchManga();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }

  async function addDirectory() {
    if (newDirectory.trim() && !directories.includes(newDirectory.trim())) {
      const updated = [...directories, newDirectory.trim()];
      setDirectories(updated);
      setNewDirectory('');
      // Save immediately
      await saveDirectories(updated);
    }
  }

  async function removeDirectory(dir: string) {
    const updated = directories.filter(d => d !== dir);
    setDirectories(updated);
    // Save immediately
    await saveDirectories(updated);
  }

  async function saveDirectories(dirs: string[]) {
    try {
      await fetch(`${apiBaseUrl}/api/library/sources/local/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directories: dirs })
      });
    } catch (err) {
      console.error('Failed to save directories:', err);
    }
  }

  async function handleDeleteManga(mangaId: string, title: string, event: React.MouseEvent) {
    event.stopPropagation();
    
    if (!confirm(`Are you sure you want to remove "${title}" from your library?`)) {
      return;
    }
    
    try {
      setDeleting(mangaId);
      const response = await fetch(`${apiBaseUrl}/api/manga/${mangaId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to delete manga');
      
      // Remove from local state
      setManga(prev => prev.filter(m => m.id !== mangaId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete manga');
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return <div className="library-loading">Loading library...</div>;
  }

  return (
    <div className="library">
      <div className="library-header">
        <h2>Library</h2>
        <div className="library-actions">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="btn btn-secondary"
          >
            Settings
          </button>
          <button 
            onClick={handleScan} 
            disabled={scanning || directories.length === 0}
            className="btn btn-primary"
          >
            {scanning ? 'Scanning...' : 'Scan Library'}
          </button>
          <button 
            onClick={fetchManga}
            className="btn btn-secondary"
          >
            Refresh
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="settings-panel">
          <h3>Manga Directories</h3>
          <div className="directory-input">
            <input
              type="text"
              value={newDirectory}
              onChange={(e) => setNewDirectory(e.target.value)}
              placeholder="Enter directory path (e.g., /home/user/Manga)"
              onKeyPress={(e) => e.key === 'Enter' && addDirectory()}
            />
            <button onClick={addDirectory} className="btn btn-primary">
              Add
            </button>
          </div>
          <ul className="directory-list">
            {directories.map((dir) => (
              <li key={dir} className="directory-item">
                <span>{dir}</span>
                <button 
                  onClick={() => removeDirectory(dir)}
                  className="btn btn-danger"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {directories.length === 0 && (
            <p className="hint">Add at least one directory to scan for manga.</p>
          )}
        </div>
      )}

      {error && (
        <div className="error-message">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {manga.length === 0 ? (
        <div className="empty-library">
          <p>No manga found in your library.</p>
          <p>Click "Settings" to add manga directories, then click "Scan Library".</p>
        </div>
      ) : (
        <div className="manga-grid">
          {manga.map((m) => (
            <div key={m.id} className="manga-card" onClick={() => onMangaSelect(m.id)}>
              <div className="manga-cover">
                {m.coverImage ? (
                  <img 
                    src={`${apiBaseUrl}${m.coverImage}`} 
                    alt={m.title}
                    loading="lazy"
                  />
                ) : (
                  <div className="placeholder-cover">
                    <span>{m.title.charAt(0)}</span>
                  </div>
                )}
                {m.progress && m.progress.percentComplete > 0 && (
                  <div className="progress-bar">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${m.progress.percentComplete}%` }}
                    />
                  </div>
                )}
                <button
                  className="delete-manga-btn"
                  onClick={(e) => handleDeleteManga(m.id, m.title, e)}
                  disabled={deleting === m.id}
                  title="Remove from library"
                >
                  {deleting === m.id ? '...' : '×'}
                </button>
              </div>
              <div className="manga-info">
                <h3 className="manga-title" title={m.title}>
                  {m.title}
                </h3>
                <span className="manga-chapters">
                  {m.chapterCount || 0} chapters
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
