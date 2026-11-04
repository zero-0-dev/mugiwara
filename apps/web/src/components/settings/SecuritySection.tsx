import React, { useState } from "react";
import { KeyRound, Shield, Smartphone, Trash2 } from "lucide-react";
import {
  useAuthDevices,
  useCreatePairingCode,
  useLogoutAllDevices,
  useRevokeDevice,
} from "../../api/hooks";

export function SecuritySection() {
  const { data: devices = [], isLoading } = useAuthDevices();
  const revokeDevice = useRevokeDevice();
  const logoutAll = useLogoutAllDevices();
  const createPairingCode = useCreatePairingCode();
  const [error, setError] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);

  if (isLoading) return <div className="loading">Loading devices...</div>;

  return (
    <section className="settings-section security-section">
      <h2>Devices &amp; security</h2>
      <p className="section-description">
        Every app instance has its own token. Only token hashes are stored on
        the server. Revoke a device here, or log out every device at once.
      </p>

      {error && <div className="error-message">{error}</div>}

      <div className="security-actions">
        <button
          className="btn btn-secondary"
          onClick={() => {
            setError(null);
            createPairingCode.mutate(undefined, {
              onSuccess: (data) => setPairingCode(data.code),
              onError: (err) => setError(err.message),
            });
          }}
          disabled={createPairingCode.isPending}
        >
          <KeyRound size={16} />
          {createPairingCode.isPending ? "Creating..." : "Pair a new device"}
        </button>
        <button
          className="btn btn-danger"
          onClick={() => {
            if (
              !window.confirm(
                "Log out all devices? Every paired app will need to pair again.",
              )
            )
              return;
            setError(null);
            logoutAll.mutate(undefined, {
              onError: (err) => setError(err.message),
            });
          }}
          disabled={logoutAll.isPending}
        >
          <Shield size={16} />
          {logoutAll.isPending ? "Logging out..." : "Log out all devices"}
        </button>
      </div>

      {pairingCode && (
        <div className="pairing-code-panel">
          <p>Enter this one-time code in the other app:</p>
          <code className="pairing-code-value">{pairingCode}</code>
          <p className="pairing-code-hint">
            It expires in 10 minutes and works once.
          </p>
        </div>
      )}

      <div className="device-list">
        {(Array.isArray(devices) ? devices : []).map((device) => (
          <div
            key={device.id}
            className={`device-card ${device.isCurrent ? "current" : ""}`}
          >
            <div className="device-card-icon">
              <Smartphone size={18} />
            </div>
            <div className="device-card-body">
              <div className="device-card-title">
                {device.label}
                {device.isCurrent && (
                  <span className="device-badge">This device</span>
                )}
              </div>
              <div className="device-card-meta">
                Paired {new Date(device.createdAt).toLocaleString()}
                {device.lastUsedAt
                  ? ` · Last used ${new Date(device.lastUsedAt).toLocaleString()}`
                  : " · Not used yet"}
                {device.revokedAt ? " · Revoked" : ""}
              </div>
            </div>
            {!device.revokedAt && (
              <button
                className="btn btn-secondary btn-small"
                onClick={() => {
                  if (!window.confirm(`Revoke ${device.label}?`)) return;
                  setError(null);
                  revokeDevice.mutate(device.id, {
                    onError: (err) => setError(err.message),
                  });
                }}
                disabled={revokeDevice.isPending}
              >
                <Trash2 size={14} /> Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
