import { useState } from "react";
import { Server, Wifi, ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";
import {
  getStoredServerUrl,
  isCapacitor,
  isElectron,
  normalizeServerUrl,
  pairDevice,
  testServerUrl,
  validateToken,
} from "../platform/server";

interface ServerSetupProps {
  initialUrl?: string;
  canCancel?: boolean;
  lockUrl?: boolean;
  onCancel?: () => void;
  onConnected: (url: string, token: string) => void;
}

type Mode = "code" | "token";

function defaultDeviceLabel(): string {
  if (isElectron()) return "Mugiwara Desktop";
  if (isCapacitor()) return "Mugiwara Mobile";
  const platform = navigator.userAgent.includes("Mac")
    ? "Browser (macOS)"
    : "Browser";
  return platform;
}

export function ServerSetup({
  initialUrl,
  canCancel = false,
  lockUrl = false,
  onCancel,
  onConnected,
}: ServerSetupProps) {
  const [url, setUrl] = useState(
    initialUrl ||
      getStoredServerUrl() ||
      (typeof window !== "undefined" ? window.location.origin : ""),
  );
  const [mode, setMode] = useState<Mode>("code");
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [deviceLabel, setDeviceLabel] = useState(defaultDeviceLabel);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const checkServer = async (normalized: string): Promise<boolean> => {
    const ok = await testServerUrl(normalized);
    if (!ok) {
      setError(
        `Could not reach ${normalized}. Check that the server is running and that this device is on the same network.`,
      );
      return false;
    }
    return true;
  };

  const handleConnect = async () => {
    const normalized = normalizeServerUrl(url);
    if (!normalized) {
      setError("Enter the address of your Mugiwara server.");
      return;
    }

    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      if (!(await checkServer(normalized))) return;

      if (mode === "token") {
        if (!token.trim()) {
          setError("Paste an access token, or pair with a code instead.");
          return;
        }
        if (!(await validateToken(normalized, token.trim()))) {
          setError(
            "That token is invalid or has been revoked. Generate a new token on the server.",
          );
          return;
        }
        onConnected(normalized, token.trim());
        return;
      }

      if (!code.trim()) {
        setError("Enter the pairing code shown by the server.");
        return;
      }
      const result = await pairDevice({
        baseUrl: normalized,
        code: code.trim(),
        deviceLabel: deviceLabel.trim() || defaultDeviceLabel(),
      });
      onConnected(normalized, result.token);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not connect to the server.",
      );
    } finally {
      setTesting(false);
    }
  };

  const handleRequestCode = async () => {
    const normalized = normalizeServerUrl(url);
    if (!normalized) {
      setError("Enter the server address first.");
      return;
    }
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${normalized}/api/auth/pairing/init`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await response.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
        error?: string;
      };
      if (response.status === 202) {
        setNotice(
          body.message || "A pairing code was printed on the server console.",
        );
        return;
      }
      if (!response.ok) {
        setError(body.error || "Could not create a pairing code.");
        return;
      }
      if (body.code) {
        setCode(body.code);
        setNotice("Pairing code filled in. It is valid for 10 minutes.");
      }
    } catch {
      setError("Could not reach the server to create a pairing code.");
    } finally {
      setTesting(false);
    }
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
          Mugiwara requires a paired device. Run the server on a computer or
          NAS, then pair this app with the short-lived code printed by the
          server.
        </p>

        <label className="server-setup-label" htmlFor="server-url">
          Server address
        </label>
        {lockUrl ? (
          <div className="server-setup-locked-url">
            {normalizeServerUrl(url) || url}
          </div>
        ) : (
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
            />
          </div>
        )}

        <div
          className="server-setup-tabs"
          role="tablist"
          aria-label="Pairing method"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "code"}
            className={`server-setup-tab ${mode === "code" ? "active" : ""}`}
            onClick={() => {
              setMode("code");
              setError(null);
            }}
          >
            <KeyRound size={15} /> Pairing code
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "token"}
            className={`server-setup-tab ${mode === "token" ? "active" : ""}`}
            onClick={() => {
              setMode("token");
              setError(null);
            }}
          >
            <ShieldCheck size={15} /> Access token
          </button>
        </div>

        {mode === "code" ? (
          <>
            <label className="server-setup-label" htmlFor="pairing-code">
              Pairing code
            </label>
            <div className="server-setup-row">
              <input
                id="pairing-code"
                className="server-setup-input server-setup-code"
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={12}
                placeholder="ABCD2345"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleConnect();
                }}
              />
              <button
                className="btn btn-secondary"
                type="button"
                onClick={handleRequestCode}
                disabled={testing}
              >
                Get code
              </button>
            </div>
            <label className="server-setup-label" htmlFor="device-label">
              Device name
            </label>
            <input
              id="device-label"
              className="server-setup-input"
              type="text"
              maxLength={80}
              value={deviceLabel}
              onChange={(event) => setDeviceLabel(event.target.value)}
            />
          </>
        ) : (
          <>
            <label className="server-setup-label" htmlFor="access-token">
              Access token
            </label>
            <input
              id="access-token"
              className="server-setup-input server-setup-code"
              type="password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="mgt_..."
              value={token}
              onChange={(event) => setToken(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleConnect();
              }}
            />
          </>
        )}

        <button
          className="btn btn-primary server-setup-connect"
          onClick={handleConnect}
          disabled={testing}
        >
          {testing ? "Connecting..." : "Connect"}
        </button>

        {error && <p className="server-setup-error">{error}</p>}
        {notice && <p className="server-setup-notice">{notice}</p>}

        <div className="server-setup-help">
          <Wifi size={16} />
          <span>
            The server prints its LAN address and a first-run pairing code on
            startup. Pairing codes expire after 10 minutes and work once.
          </span>
        </div>
      </div>
    </div>
  );
}
