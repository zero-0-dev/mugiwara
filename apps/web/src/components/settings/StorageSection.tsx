import React, { useRef, useState } from "react";
import { HardDrive, X } from "lucide-react";
import { useToast } from "../Toast";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useStorageBackends, useStorageTypes, useCreateStorageBackend, useUpdateStorageBackend, useDeleteStorageBackend, useScanStorage } from "../../api/hooks";
import { Select } from "../Select";

const DEFAULT_CONFIGS: Record<string, Record<string, unknown>> = {
  local: { basePath: "./data/manga" },
};

const BACKEND_TYPE_NAMES: Record<string, string> = {
  local: "Local Filesystem",
  s3: "Amazon S3",
  ftp: "FTP Server",
  webdav: "WebDAV",
};

export function StorageSection() {
  const toast = useToast();
  const { data: backends = [], isLoading: loading } = useStorageBackends();
  const { data: availableTypes = [] } = useStorageTypes();
  const createBackend = useCreateStorageBackend();
  const updateBackend = useUpdateStorageBackend();
  const deleteBackend = useDeleteStorageBackend();
  const scanStorage = useScanStorage();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingBackend, setEditingBackend] = useState<{ id: string; type: string; name: string; config: Record<string, unknown>; isDefault: boolean } | null>(null);
  const [configJson, setConfigJson] = useState("");
  const [configError, setConfigError] = useState<string | null>(null);
  const [scanResults, setScanResults] = useState<{ added: number; updated: number; errors: string[] } | null>(null);
  const [newBackend, setNewBackend] = useState({ name: "", type: "", config: {} as Record<string, unknown>, isDefault: false });
  const [editIsDefault, setEditIsDefault] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (editingBackend) {
      setConfigJson(JSON.stringify(editingBackend.config, null, 2));
    } else if (newBackend.type) {
      const defaultConfig = DEFAULT_CONFIGS[newBackend.type] || {};
      setNewBackend((prev) => ({ ...prev, config: defaultConfig }));
      setConfigJson(JSON.stringify(defaultConfig, null, 2));
    }
    setConfigError(null);
  }, [newBackend.type, editingBackend]);

  function validateConfig(json: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(json);
      if (typeof parsed !== "object" || parsed === null) {
        setConfigError("Config must be a valid JSON object");
        return null;
      }
      setConfigError(null);
      return parsed;
    } catch {
      setConfigError("Invalid JSON");
      return null;
    }
  }

  async function handleAddBackend(e: React.FormEvent) {
    e.preventDefault();
    const config = validateConfig(configJson);
    if (!config) return;
    createBackend.mutate({ ...newBackend, config } as { type: string; name: string; config: Record<string, unknown> }, {
      onSuccess: () => resetForm(),
      onError: (err) => toast.error(err.message),
    });
  }

  async function handleUpdateBackend(e: React.FormEvent) {
    e.preventDefault();
    if (!editingBackend) return;
    const config = validateConfig(configJson);
    if (!config) return;
    updateBackend.mutate({ id: editingBackend.id, config, isDefault: editIsDefault }, {
      onSuccess: () => resetForm(),
      onError: (err) => toast.error(err.message),
    });
  }

  async function handleDeleteBackend(id: string) {
    if (!confirm("Delete this storage backend?")) return;
    deleteBackend.mutate(id, { onError: (err) => toast.error(err.message) });
  }

  async function handleScan() {
    setScanResults(null);
    scanStorage.mutate(undefined, {
      onSuccess: (data) => setScanResults(data as unknown as { added: number; updated: number; errors: string[] }),
      onError: (err) => toast.error(err.message),
    });
  }

  function startEdit(backend: { id: string; type: string; name: string; config: Record<string, unknown>; isDefault: boolean }) {
    setEditingBackend(backend);
    setEditIsDefault(backend.isDefault);
    setConfigJson(JSON.stringify(backend.config, null, 2));
    setConfigError(null);
  }

  useFocusTrap(modalRef, showAddForm || Boolean(editingBackend), resetForm);

  function resetForm() {
    setShowAddForm(false);
    setEditingBackend(null);
    setEditIsDefault(false);
    const initialType = Array.isArray(availableTypes) && availableTypes.length > 0 ? availableTypes[0] : "";
    const initialTypeStr = typeof initialType === "string" ? initialType : initialType?.id || "";
    setNewBackend({ name: "", type: initialTypeStr, config: DEFAULT_CONFIGS[initialTypeStr] || {}, isDefault: false });
    setConfigJson("");
    setConfigError(null);
  }

  function formatConfigPreview(config: Record<string, unknown>): string {
    const keys = Object.keys(config);
    if (keys.length === 0) return "No configuration";
    return keys.slice(0, 3).join(", ") + (keys.length > 3 ? ` +${keys.length - 3} more` : "");
  }

  function getTypeName(type: string): string {
    return BACKEND_TYPE_NAMES[type] || type;
  }

  if (loading) {
    return <div className="storage-section" style={styles.container}><div style={styles.loading}>Loading storage backends...</div></div>;
  }

  return (
    <div className="storage-section" style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Storage Backends</h2>
        <p style={styles.subtitle}>Configure where your manga files are stored</p>
      </div>

      <div style={styles.cardsContainer}>
        {backends.map((backend) => (
          <div key={backend.id} style={{ ...styles.card, ...(backend.isDefault ? styles.cardDefault : {}) }}>
            <div style={styles.cardHeader}>
              <div style={styles.cardTitleRow}>
                <h3 style={styles.cardTitle}>{backend.name}</h3>
                {backend.isDefault && <span style={styles.defaultBadge}>DEFAULT</span>}
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
                <span style={styles.configPreview}>{formatConfigPreview(backend.config as Record<string, unknown>)}</span>
              </div>
            </div>
            <div className="storage-card-footer" style={styles.cardFooter}>
              {backend.type === "local" && window.electronAPI?.openFolder && (
                <button onClick={() => window.electronAPI?.openFolder((backend.config as Record<string, unknown>).basePath as string)} style={styles.btnFolder}>Open Folder</button>
              )}
              <button onClick={() => startEdit(backend as { id: string; type: string; name: string; config: Record<string, unknown>; isDefault: boolean })} style={styles.btnSecondary}>Edit</button>
              {!backend.isDefault && <button onClick={() => handleDeleteBackend(backend.id)} style={styles.btnDanger}>Delete</button>}
            </div>
          </div>
        ))}
      </div>

      {backends.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}><HardDrive size={48} /></div>
          <p>No storage backends configured</p>
        </div>
      )}

      {!showAddForm && !editingBackend && Array.isArray(availableTypes) && availableTypes.length > 0 && (
        <div className="storage-actions">
          <button onClick={() => setShowAddForm(true)} style={styles.btnPrimary}>+ Add Storage Backend</button>
          <button onClick={handleScan} disabled={scanStorage.isPending || backends.length === 0} style={{ ...styles.btnSecondary, backgroundColor: "#10b981", color: "#fff" }}>
            {scanStorage.isPending ? "Scanning..." : "Scan Storage"}
          </button>
        </div>
      )}

      {scanResults && (
        <div style={{ backgroundColor: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", padding: "16px", marginBottom: "20px", color: "#6ee7b7" }}>
          <h4 style={{ margin: "0 0 8px 0" }}>Scan Complete</h4>
          <p style={{ margin: "4px 0" }}>Added: {scanResults.added} manga</p>
          <p style={{ margin: "4px 0" }}>Updated: {scanResults.updated} chapters</p>
          {scanResults.errors.length > 0 && (
            <div style={{ marginTop: "8px" }}>
              <p style={{ margin: "4px 0", color: "#fca5a5" }}>Errors:</p>
              <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
                {scanResults.errors.slice(0, 5).map((err, i) => (
                  <li key={i} style={{ color: "#fca5a5", fontSize: "12px" }}>{err}</li>
                ))}
                {scanResults.errors.length > 5 && <li style={{ color: "#fca5a5", fontSize: "12px" }}>...and {scanResults.errors.length - 5} more</li>}
              </ul>
            </div>
          )}
        </div>
      )}

      {(!Array.isArray(availableTypes) || availableTypes.length === 0) && (
        <div style={styles.warningBox}>
          <p><strong>No storage plugins available.</strong></p>
          <p style={styles.warningSubtext}>Install storage plugins from the Plugins section to add storage backends.</p>
        </div>
      )}

      {showAddForm && (
        <div className="storage-modal-overlay">
          <div ref={modalRef} className="storage-modal" role="dialog" aria-modal="true" aria-labelledby="storage-modal-title">
            <div className="storage-modal-header">
              <h3 id="storage-modal-title" style={styles.modalTitle}>Add Storage Backend</h3>
              <button onClick={resetForm} style={styles.modalClose}><X size={20} /></button>
            </div>
            <form onSubmit={handleAddBackend} className="storage-form">
              <div style={styles.formGroup}>
                <label style={styles.label}>Name *</label>
                <input type="text" value={newBackend.name} onChange={(e) => setNewBackend({ ...newBackend, name: e.target.value })} placeholder="My Storage" style={styles.input} required />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Type *</label>
                <Select value={newBackend.type} onChange={(v) => setNewBackend({ ...newBackend, type: v, config: DEFAULT_CONFIGS[v] || {} })} options={(Array.isArray(availableTypes) ? availableTypes : []).map((type) => {
                  const typeId = typeof type === "string" ? type : type.id;
                  return { value: typeId, label: getTypeName(typeId) };
                })} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Configuration (JSON) *</label>
                <textarea value={configJson} onChange={(e) => { setConfigJson(e.target.value); validateConfig(e.target.value); }} style={{ ...styles.textarea, ...(configError ? styles.textareaError : {}) }} rows={8} required />
                {configError ? <span style={styles.errorText}>{configError}</span> : <span style={styles.hint}>Configuration as JSON object</span>}
              </div>
              <label style={styles.checkboxLabel}>
                <input type="checkbox" checked={newBackend.isDefault} onChange={(e) => setNewBackend({ ...newBackend, isDefault: e.target.checked })} style={styles.checkbox} />
                <span>Set as default backend{backends.length === 0 && <span style={styles.infoNote}> (first backend is always default)</span>}</span>
              </label>
              <div className="storage-form-actions">
                <button type="submit" style={styles.btnPrimary} disabled={!!configError || createBackend.isPending}>Create</button>
                <button type="button" onClick={resetForm} style={styles.btnSecondary}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingBackend && (
        <div className="storage-modal-overlay">
          <div ref={modalRef} className="storage-modal" role="dialog" aria-modal="true" aria-labelledby="storage-modal-title">
            <div className="storage-modal-header">
              <h3 id="storage-modal-title" style={styles.modalTitle}>Edit {editingBackend.name}</h3>
              <button onClick={resetForm} style={styles.modalClose}><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateBackend} className="storage-form">
              <div style={{ ...styles.formGroup, ...styles.readOnlyGroup }}>
                <label style={styles.label}>Type</label>
                <input type="text" value={getTypeName(editingBackend.type)} disabled style={styles.inputDisabled} />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Configuration (JSON) *</label>
                <textarea value={configJson} onChange={(e) => { setConfigJson(e.target.value); validateConfig(e.target.value); }} style={{ ...styles.textarea, ...(configError ? styles.textareaError : {}) }} rows={10} required />
                {configError && <span style={styles.errorText}>{configError}</span>}
              </div>
              {!editingBackend.isDefault && (
                <label style={styles.checkboxLabel}>
                  <input type="checkbox" checked={editIsDefault} onChange={(e) => setEditIsDefault(e.target.checked)} style={styles.checkbox} />
                  Set as default backend
                </label>
              )}
              <div className="storage-form-actions">
                <button type="submit" style={styles.btnPrimary} disabled={!!configError || updateBackend.isPending}>Save Changes</button>
                <button type="button" onClick={resetForm} style={styles.btnSecondary}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: "24px", maxWidth: "800px" },
  header: { marginBottom: "24px" },
  title: { fontSize: "24px", fontWeight: 600, margin: "0 0 8px 0", color: "var(--text-primary)" },
  subtitle: { fontSize: "14px", color: "var(--text-secondary)", margin: 0 },
  loading: { padding: "40px", textAlign: "center", color: "var(--text-secondary)" },
  errorBanner: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", marginBottom: "20px", color: "#fca5a5" },
  errorClose: { background: "none", border: "none", color: "#fca5a5", fontSize: "20px", cursor: "pointer", padding: "0 4px" },
  cardsContainer: { display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" },
  card: { backgroundColor: "var(--bg-secondary)", borderRadius: "12px", padding: "20px", border: "1px solid var(--bg-tertiary)" },
  cardDefault: { border: "1px solid #6366f1", backgroundColor: "rgba(99, 102, 241, 0.05)" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" },
  cardTitleRow: { display: "flex", alignItems: "center", gap: "12px" },
  cardTitle: { fontSize: "18px", fontWeight: 600, margin: 0, color: "var(--text-primary)" },
  defaultBadge: { backgroundColor: "#6366f1", color: "#fff", fontSize: "10px", fontWeight: 600, padding: "4px 8px", borderRadius: "4px", letterSpacing: "0.5px" },
  typeBadge: { backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)", fontSize: "12px", padding: "4px 10px", borderRadius: "6px", textTransform: "uppercase" },
  cardBody: { marginBottom: "16px" },
  metaRow: { display: "flex", gap: "8px", marginBottom: "6px", fontSize: "14px" },
  metaLabel: { color: "var(--text-secondary)", minWidth: "50px" },
  metaValue: { color: "var(--text-secondary)", fontFamily: "monospace", fontSize: "13px" },
  configPreview: { color: "var(--text-secondary)", fontStyle: "italic" },
  cardFooter: { display: "flex", gap: "10px" },
  btnPrimary: { backgroundColor: "#6366f1", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", fontSize: "14px", fontWeight: 500, cursor: "pointer" },
  btnFolder: { backgroundColor: "#10b981", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", cursor: "pointer" },
  btnSecondary: { backgroundColor: "var(--bg-tertiary)", color: "var(--text-primary)", border: "none", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", cursor: "pointer" },
  btnDanger: { backgroundColor: "transparent", color: "#ef4444", border: "1px solid #ef4444", padding: "8px 16px", borderRadius: "6px", fontSize: "13px", cursor: "pointer" },
  emptyState: { textAlign: "center", padding: "60px 20px", color: "var(--text-secondary)" },
  emptyIcon: { fontSize: "48px", marginBottom: "16px", opacity: 0.5 },
  warningBox: { backgroundColor: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "8px", padding: "16px", marginBottom: "20px", color: "#fbbf24" },
  warningSubtext: { fontSize: "13px", color: "#d97706", margin: "8px 0 0 0" },
  infoNote: { fontSize: "12px", color: "var(--text-secondary)", fontStyle: "italic" },
  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0, 0, 0, 0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" },
  modal: { backgroundColor: "var(--bg-secondary)", borderRadius: "16px", width: "100%", maxWidth: "500px", maxHeight: "90vh", overflow: "auto", border: "1px solid var(--bg-tertiary)" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid var(--bg-tertiary)" },
  modalTitle: { fontSize: "18px", fontWeight: 600, margin: 0, color: "var(--text-primary)" },
  modalClose: { background: "none", border: "none", color: "var(--text-secondary)", fontSize: "24px", cursor: "pointer", padding: "0", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px" },
  form: { padding: "24px" },
  formGroup: { marginBottom: "20px" },
  label: { display: "block", fontSize: "14px", fontWeight: 500, color: "var(--text-primary)", marginBottom: "8px" },
  input: { width: "100%", padding: "10px 14px", backgroundColor: "var(--bg-primary)", border: "1px solid var(--bg-tertiary)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "var(--input-font-size, 14px)", boxSizing: "border-box" },
  inputDisabled: { width: "100%", padding: "10px 14px", backgroundColor: "var(--bg-tertiary)", border: "1px solid var(--bg-tertiary)", borderRadius: "8px", color: "var(--text-secondary)", fontSize: "var(--input-font-size, 14px)", boxSizing: "border-box", cursor: "not-allowed" },
  select: { width: "100%", padding: "10px 14px", backgroundColor: "var(--bg-primary)", border: "1px solid var(--bg-tertiary)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "var(--input-font-size, 14px)", boxSizing: "border-box", cursor: "pointer" },
  textarea: { width: "100%", padding: "12px 14px", backgroundColor: "var(--bg-primary)", border: "1px solid var(--bg-tertiary)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "var(--input-font-size, 14px)", fontFamily: "monospace", boxSizing: "border-box", resize: "vertical" },
  textareaError: { border: "1px solid #ef4444" },
  hint: { display: "block", fontSize: "12px", color: "var(--text-secondary)", marginTop: "6px" },
  errorText: { display: "block", fontSize: "12px", color: "#ef4444", marginTop: "6px" },
  checkboxLabel: { display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", color: "var(--text-primary)", marginBottom: "24px", cursor: "pointer" },
  checkbox: { width: "18px", height: "18px", cursor: "pointer" },
  formActions: { display: "flex", gap: "12px", justifyContent: "flex-end" },
  readOnlyGroup: { opacity: 0.7 },
};
