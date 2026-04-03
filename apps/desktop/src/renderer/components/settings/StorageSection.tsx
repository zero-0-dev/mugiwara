import React, { useState, useEffect } from "react";

interface StorageBackend {
  id: string;
  name: string;
  type: string;
  config: Record<string, any>;
  isDefault: boolean;
}

interface StorageSectionProps {
  apiBaseUrl: string;
}

// Default configs for known backend types
const DEFAULT_CONFIGS: Record<string, Record<string, any>> = {
  local: { basePath: "./data/manga" },
};

// Human-readable names for known backend types
const BACKEND_TYPE_NAMES: Record<string, string> = {
  local: "Local Filesystem",
  s3: "Amazon S3",
  ftp: "FTP Server",
  webdav: "WebDAV",
};

export function StorageSection({ apiBaseUrl }: StorageSectionProps) {
  const [backends, setBackends] = useState<StorageBackend[]>([]);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingBackend, setEditingBackend] = useState<StorageBackend | null>(
    null,
  );
  const [configJson, setConfigJson] = useState("");
  const [configError, setConfigError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{
    added: number;
    updated: number;
    errors: string[];
  } | null>(null);

  const [newBackend, setNewBackend] = useState({
    name: "",
    type: "",
    config: {},
    isDefault: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  // Update config when type changes
  useEffect(() => {
    if (editingBackend) {
      setConfigJson(JSON.stringify(editingBackend.config, null, 2));
    } else if (newBackend.type) {
      const defaultConfig = DEFAULT_CONFIGS[newBackend.type] || {};
      setNewBackend((prev) => ({ ...prev, config: defaultConfig }));
      setConfigJson(JSON.stringify(defaultConfig, null, 2));
    }
    setConfigError(null);
  }, [newBackend.type, editingBackend]);

  async function loadData() {
    try {
      setLoading(true);
      // Load backends and available types in parallel
      const [backendsRes, typesRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/storage/backends`),
        fetch(`${apiBaseUrl}/api/storage/types`),
      ]);

      if (!backendsRes.ok) throw new Error("Failed to load backends");
      if (!typesRes.ok) throw new Error("Failed to load storage types");

      const backendsData = await backendsRes.json();
      const typesData = await typesRes.json();

      setBackends(backendsData);
      setAvailableTypes(typesData);

      // Set initial type if available
      if (typesData.length > 0 && !newBackend.type) {
        const initialType = typesData[0];
        setNewBackend((prev) => ({
          ...prev,
          type: initialType,
          config: DEFAULT_CONFIGS[initialType] || {},
        }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  function validateConfig(json: string): Record<string, any> | null {
    try {
      const parsed = JSON.parse(json);
      if (typeof parsed !== "object" || parsed === null) {
        setConfigError("Config must be a valid JSON object");
        return null;
      }
      setConfigError(null);
      return parsed;
    } catch (e) {
      setConfigError("Invalid JSON");
      return null;
    }
  }

  function handleTypeChange(type: string) {
    const defaultConfig = DEFAULT_CONFIGS[type] || {};
    setNewBackend({
      ...newBackend,
      type,
      config: defaultConfig,
    });
  }

  async function handleAddBackend(e: React.FormEvent) {
    e.preventDefault();
    const config = validateConfig(configJson);
    if (!config) return;

    try {
      const response = await fetch(`${apiBaseUrl}/api/storage/backends`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newBackend, config }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to create backend");
      }

      resetForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create backend");
    }
  }

  const [editIsDefault, setEditIsDefault] = useState(false);

  async function handleUpdateBackend(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBackend) return;
    const config = validateConfig(configJson);
    if (!config) return;

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/storage/backends/${editingBackend.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config, isDefault: editIsDefault }),
        },
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to update backend");
      }

      resetForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update backend");
    }
  }

  async function handleDeleteBackend(id: string) {
    if (!confirm("Delete this storage backend?")) return;
    try {
      const response = await fetch(`${apiBaseUrl}/api/storage/backends/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete backend");
    }
  }

  async function handleScan() {
    setScanning(true);
    setScanResults(null);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/storage/scan`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Scan failed" }));
        throw new Error(errorData.error);
      }

      const results = await response.json();
      setScanResults(results);

      if (results.added > 0 || results.updated > 0) {
        // Reload backends to show updated data
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  function startEdit(backend: StorageBackend) {
    setEditingBackend(backend);
    setEditIsDefault(backend.isDefault);
    setConfigJson(JSON.stringify(backend.config, null, 2));
    setConfigError(null);
  }

  function resetForm() {
    setShowAddForm(false);
    setEditingBackend(null);
    setEditIsDefault(false);
    const initialType = availableTypes[0] || "";
    setNewBackend({
      name: "",
      type: initialType,
      config: DEFAULT_CONFIGS[initialType] || {},
      isDefault: false,
    });
    setConfigJson("");
    setConfigError(null);
  }

  function formatConfigPreview(config: Record<string, any>): string {
    const keys = Object.keys(config);
    if (keys.length === 0) return "No configuration";
    return (
      keys.slice(0, 3).join(", ") +
      (keys.length > 3 ? ` +${keys.length - 3} more` : "")
    );
  }

  function getTypeName(type: string): string {
    return BACKEND_TYPE_NAMES[type] || type;
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading storage backends...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Storage Backends</h2>
        <p style={styles.subtitle}>
          Configure where your manga files are stored
        </p>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={styles.errorClose}>
            ×
          </button>
        </div>
      )}

      {/* Backends List */}
      <div style={styles.cardsContainer}>
        {backends.map((backend) => (
          <div
            key={backend.id}
            style={{
              ...styles.card,
              ...(backend.isDefault ? styles.cardDefault : {}),
            }}
          >
            <div style={styles.cardHeader}>
              <div style={styles.cardTitleRow}>
                <h3 style={styles.cardTitle}>{backend.name}</h3>
                {backend.isDefault && (
                  <span style={styles.defaultBadge}>DEFAULT</span>
                )}
              </div>
              <span style={styles.typeBadge}>{backend.type}</span>
            </div>

            <div style={styles.cardBody}>
              <div style={styles.metaRow}>
                <span style={styles.metaLabel}>ID:</span>
                <code style={styles.metaValue}>{backend.id}</code>
              </div>
              <div style={styles.metaRow}>
                <span style={styles.metaLabel}>Config:</span>
                <span style={styles.configPreview}>
                  {formatConfigPreview(backend.config)}
                </span>
              </div>
            </div>

            <div style={styles.cardFooter}>
              <button
                onClick={() => startEdit(backend)}
                style={styles.btnSecondary}
              >
                Edit
              </button>
              {!backend.isDefault && (
                <button
                  onClick={() => handleDeleteBackend(backend.id)}
                  style={styles.btnDanger}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {backends.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>💾</div>
          <p>No storage backends configured</p>
        </div>
      )}

      {/* Action Buttons */}
      {!showAddForm && !editingBackend && availableTypes.length > 0 && (
        <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
          <button
            onClick={() => setShowAddForm(true)}
            style={styles.btnPrimary}
          >
            + Add Storage Backend
          </button>
          <button
            onClick={handleScan}
            disabled={scanning || backends.length === 0}
            style={{
              ...styles.btnSecondary,
              backgroundColor: "#10b981",
              color: "#fff",
            }}
          >
            {scanning ? "Scanning..." : "Scan Storage"}
          </button>
        </div>
      )}

      {/* Scan Results */}
      {scanResults && (
        <div
          style={{
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "20px",
            color: "#6ee7b7",
          }}
        >
          <h4 style={{ margin: "0 0 8px 0" }}>Scan Complete</h4>
          <p style={{ margin: "4px 0" }}>Added: {scanResults.added} manga</p>
          <p style={{ margin: "4px 0" }}>
            Updated: {scanResults.updated} chapters
          </p>
          {scanResults.errors.length > 0 && (
            <div style={{ marginTop: "8px" }}>
              <p style={{ margin: "4px 0", color: "#fca5a5" }}>Errors:</p>
              <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
                {scanResults.errors.slice(0, 5).map((err, i) => (
                  <li key={i} style={{ color: "#fca5a5", fontSize: "12px" }}>
                    {err}
                  </li>
                ))}
                {scanResults.errors.length > 5 && (
                  <li style={{ color: "#fca5a5", fontSize: "12px" }}>
                    ...and {scanResults.errors.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* No Types Available Message */}
      {availableTypes.length === 0 && (
        <div style={styles.warningBox}>
          <p>
            <strong>No storage plugins available.</strong>
          </p>
          <p style={styles.warningSubtext}>
            Install storage plugins from the Plugins section to add storage
            backends.
          </p>
        </div>
      )}

      {/* Add Form Modal */}
      {showAddForm && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Add Storage Backend</h3>
              <button onClick={resetForm} style={styles.modalClose}>
                ×
              </button>
            </div>

            <form onSubmit={handleAddBackend} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Name *</label>
                <input
                  type="text"
                  value={newBackend.name}
                  onChange={(e) =>
                    setNewBackend({ ...newBackend, name: e.target.value })
                  }
                  placeholder="My Storage"
                  style={styles.input}
                  required
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Type *</label>
                <select
                  value={newBackend.type}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  style={styles.select}
                  required
                >
                  {availableTypes.map((type) => (
                    <option key={type} value={type}>
                      {getTypeName(type)}
                    </option>
                  ))}
                </select>
                <span style={styles.hint}>
                  Only installed storage plugins are shown
                </span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Configuration (JSON) *</label>
                <textarea
                  value={configJson}
                  onChange={(e) => {
                    setConfigJson(e.target.value);
                    validateConfig(e.target.value);
                  }}
                  style={{
                    ...styles.textarea,
                    ...(configError ? styles.textareaError : {}),
                  }}
                  rows={8}
                  required
                />
                {configError ? (
                  <span style={styles.errorText}>{configError}</span>
                ) : (
                  <span style={styles.hint}>Configuration as JSON object</span>
                )}
              </div>

              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={newBackend.isDefault}
                  onChange={(e) =>
                    setNewBackend({
                      ...newBackend,
                      isDefault: e.target.checked,
                    })
                  }
                  style={styles.checkbox}
                />
                <span>
                  Set as default backend
                  {backends.length === 0 && (
                    <span style={styles.infoNote}>
                      {" "}
                      (first backend is always default)
                    </span>
                  )}
                </span>
              </label>

              <div style={styles.formActions}>
                <button
                  type="submit"
                  style={styles.btnPrimary}
                  disabled={!!configError}
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  style={styles.btnSecondary}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Form Modal */}
      {editingBackend && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Edit {editingBackend.name}</h3>
              <button onClick={resetForm} style={styles.modalClose}>
                ×
              </button>
            </div>

            <form onSubmit={handleUpdateBackend} style={styles.form}>
              <div style={{ ...styles.formGroup, ...styles.readOnlyGroup }}>
                <label style={styles.label}>Type</label>
                <input
                  type="text"
                  value={getTypeName(editingBackend.type)}
                  disabled
                  style={styles.inputDisabled}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Configuration (JSON) *</label>
                <textarea
                  value={configJson}
                  onChange={(e) => {
                    setConfigJson(e.target.value);
                    validateConfig(e.target.value);
                  }}
                  style={{
                    ...styles.textarea,
                    ...(configError ? styles.textareaError : {}),
                  }}
                  rows={10}
                  required
                />
                {configError && (
                  <span style={styles.errorText}>{configError}</span>
                )}
              </div>

              {!editingBackend.isDefault && (
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={editIsDefault}
                    onChange={(e) => setEditIsDefault(e.target.checked)}
                    style={styles.checkbox}
                  />
                  Set as default backend
                </label>
              )}

              <div style={styles.formActions}>
                <button
                  type="submit"
                  style={styles.btnPrimary}
                  disabled={!!configError}
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  style={styles.btnSecondary}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "24px",
    maxWidth: "800px",
  },
  header: {
    marginBottom: "24px",
  },
  title: {
    fontSize: "24px",
    fontWeight: 600,
    margin: "0 0 8px 0",
    color: "#fff",
  },
  subtitle: {
    fontSize: "14px",
    color: "#9ca3af",
    margin: 0,
  },
  loading: {
    padding: "40px",
    textAlign: "center",
    color: "#9ca3af",
  },
  errorBanner: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "8px",
    marginBottom: "20px",
    color: "#fca5a5",
  },
  errorClose: {
    background: "none",
    border: "none",
    color: "#fca5a5",
    fontSize: "20px",
    cursor: "pointer",
    padding: "0 4px",
  },
  cardsContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    marginBottom: "24px",
  },
  card: {
    backgroundColor: "#1f2937",
    borderRadius: "12px",
    padding: "20px",
    border: "1px solid #374151",
  },
  cardDefault: {
    border: "1px solid #6366f1",
    backgroundColor: "rgba(99, 102, 241, 0.05)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "12px",
  },
  cardTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  cardTitle: {
    fontSize: "18px",
    fontWeight: 600,
    margin: 0,
    color: "#fff",
  },
  defaultBadge: {
    backgroundColor: "#6366f1",
    color: "#fff",
    fontSize: "10px",
    fontWeight: 600,
    padding: "4px 8px",
    borderRadius: "4px",
    letterSpacing: "0.5px",
  },
  typeBadge: {
    backgroundColor: "#374151",
    color: "#d1d5db",
    fontSize: "12px",
    padding: "4px 10px",
    borderRadius: "6px",
    textTransform: "uppercase",
  },
  cardBody: {
    marginBottom: "16px",
  },
  metaRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "6px",
    fontSize: "14px",
  },
  metaLabel: {
    color: "#6b7280",
    minWidth: "50px",
  },
  metaValue: {
    color: "#9ca3af",
    fontFamily: "monospace",
    fontSize: "13px",
  },
  configPreview: {
    color: "#9ca3af",
    fontStyle: "italic",
  },
  cardFooter: {
    display: "flex",
    gap: "10px",
  },
  btnPrimary: {
    backgroundColor: "#6366f1",
    color: "#fff",
    border: "none",
    padding: "10px 20px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  btnSecondary: {
    backgroundColor: "#374151",
    color: "#d1d5db",
    border: "none",
    padding: "8px 16px",
    borderRadius: "6px",
    fontSize: "13px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  btnDanger: {
    backgroundColor: "transparent",
    color: "#ef4444",
    border: "1px solid #ef4444",
    padding: "8px 16px",
    borderRadius: "6px",
    fontSize: "13px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  emptyState: {
    textAlign: "center",
    padding: "60px 20px",
    color: "#6b7280",
  },
  emptyIcon: {
    fontSize: "48px",
    marginBottom: "16px",
    opacity: 0.5,
  },
  warningBox: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    border: "1px solid rgba(245, 158, 11, 0.3)",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "20px",
    color: "#fbbf24",
  },
  warningSubtext: {
    fontSize: "13px",
    color: "#d97706",
    margin: "8px 0 0 0",
  },
  infoNote: {
    fontSize: "12px",
    color: "#6b7280",
    fontStyle: "italic",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "20px",
  },
  modal: {
    backgroundColor: "#1f2937",
    borderRadius: "16px",
    width: "100%",
    maxWidth: "500px",
    maxHeight: "90vh",
    overflow: "auto",
    border: "1px solid #374151",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 24px",
    borderBottom: "1px solid #374151",
  },
  modalTitle: {
    fontSize: "18px",
    fontWeight: 600,
    margin: 0,
    color: "#fff",
  },
  modalClose: {
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
    transition: "background-color 0.2s",
  },
  form: {
    padding: "24px",
  },
  formGroup: {
    marginBottom: "20px",
  },
  label: {
    display: "block",
    fontSize: "14px",
    fontWeight: 500,
    color: "#d1d5db",
    marginBottom: "8px",
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    backgroundColor: "#111827",
    border: "1px solid #374151",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "14px",
    boxSizing: "border-box",
  },
  inputDisabled: {
    width: "100%",
    padding: "10px 14px",
    backgroundColor: "#374151",
    border: "1px solid #4b5563",
    borderRadius: "8px",
    color: "#9ca3af",
    fontSize: "14px",
    boxSizing: "border-box",
    cursor: "not-allowed",
  },
  select: {
    width: "100%",
    padding: "10px 14px",
    backgroundColor: "#111827",
    border: "1px solid #374151",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "14px",
    boxSizing: "border-box",
    cursor: "pointer",
  },
  textarea: {
    width: "100%",
    padding: "12px 14px",
    backgroundColor: "#111827",
    border: "1px solid #374151",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "13px",
    fontFamily: "monospace",
    boxSizing: "border-box",
    resize: "vertical",
  },
  textareaError: {
    border: "1px solid #ef4444",
  },
  hint: {
    display: "block",
    fontSize: "12px",
    color: "#6b7280",
    marginTop: "6px",
  },
  errorText: {
    display: "block",
    fontSize: "12px",
    color: "#ef4444",
    marginTop: "6px",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "14px",
    color: "#d1d5db",
    marginBottom: "24px",
    cursor: "pointer",
  },
  checkbox: {
    width: "18px",
    height: "18px",
    cursor: "pointer",
  },
  formActions: {
    display: "flex",
    gap: "12px",
    justifyContent: "flex-end",
  },
  readOnlyGroup: {
    opacity: 0.7,
  },
};
