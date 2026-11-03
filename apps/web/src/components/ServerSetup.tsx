import { useState } from "react";
import { Server, Wifi, ArrowLeft } from "lucide-react";
import {
  getStoredServerUrl,
  normalizeServerUrl,
  testServerUrl,
} from "../platform/server";

interface ServerSetupProps {
  initialUrl?: string;
  canCancel?: boolean;
  onCancel?: () => void;
  onConnected: (url: string) => void;
}

export function ServerSetup({
  initialUrl,
  canCancel = false,
  onCancel,
  onConnected,
}: ServerSetupProps) {
  const [url, setUrl] = useState(initialUrl || getStoredServerUrl());
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    const normalized = normalizeServerUrl(url);
    if (!normalized) {
      setError("Enter the address of your Mugiwara server.");
      return;
    }

    setTesting(true);
    setError(null);
    const ok = await testServerUrl(normalized);
    setTesting(false);

    if (!ok) {
      setError(
        `Could not reach ${normalized}. Check that the server is running and that this device is on the same network.`,
      );
      return;
    }

    onConnected(normalized);
  };

  return (
    <div className="server-setup">
      <div className="server-setup-card">
        {canCancel && (
          <button className="server-setup-back" onClick={onCancel}>
            <ArrowLeft size={16} /> Back
          </button>
        )}
        <div className="server-setup-icon">
          <Server size={32} />
        </div>
        <h1>Connect to Mugiwara</h1>
        <p className="server-setup-description">
          Run Mugiwara on a computer or NAS on your local network, then enter
          its address here.
        </p>

        <label className="server-setup-label" htmlFor="server-url">
          Server address
        </label>
        <div className="server-setup-row">
          <input
            id="server-url"
            className="server-setup-input"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="http://192.168.1.20:3001"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleConnect();
            }}
          />
          <button
            className="btn btn-primary"
            onClick={handleConnect}
            disabled={testing}
          >
            {testing ? "Checking..." : "Connect"}
          </button>
        </div>

        {error && <p className="server-setup-error">{error}</p>}

        <div className="server-setup-help">
          <Wifi size={16} />
          <span>
            The server prints its LAN address on startup, for example{" "}
            <code>http://192.168.1.20:3001</code>.
          </span>
        </div>
      </div>
    </div>
  );
}
