import { useState } from "react";
import { ArrowLeft, KeyRound, Server, ShieldCheck, Wifi } from "lucide-react";
import {
  getStoredServerUrl,
  isCapacitor,
  isElectron,
  normalizeServerUrl,
  pairDevice,
  testServerUrl,
  validateToken,
} from "../platform/server";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Alert, AlertDescription } from "./ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

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
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        aria-hidden="true"
      >
        <div className="absolute left-1/2 top-[-10rem] size-[28rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-[-12rem] right-[-6rem] size-[26rem] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-border/80 bg-card/90 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-7">
          {canCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="mb-3 -ml-2"
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
          )}

          <div className="flex flex-col items-center text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-[var(--brand-hover)] text-primary-foreground shadow-lg shadow-black/30">
              <Server className="size-7" />
            </span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">
              Connect to Mugiwara
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Pair this app with the server running on your computer or NAS. The
              server prints a short-lived code on startup.
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="server-url">Server address</Label>
              {lockUrl ? (
                <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5 font-mono text-sm text-muted-foreground">
                  {normalizeServerUrl(url) || url}
                </div>
              ) : (
                <Input
                  id="server-url"
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="http://192.168.1.20:3001"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              )}
            </div>

            <Tabs
              value={mode}
              onValueChange={(value) => {
                setMode(value as Mode);
                setError(null);
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="code">
                  <KeyRound className="size-4" /> Pairing code
                </TabsTrigger>
                <TabsTrigger value="token">
                  <ShieldCheck className="size-4" /> Access token
                </TabsTrigger>
              </TabsList>

              <TabsContent value="code" className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pairing-code">Pairing code</Label>
                  <div className="flex gap-2">
                    <Input
                      id="pairing-code"
                      type="text"
                      inputMode="text"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={12}
                      placeholder="ABCD2345"
                      value={code}
                      onChange={(event) =>
                        setCode(event.target.value.toUpperCase())
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleConnect();
                      }}
                      className="font-mono tracking-[0.2em]"
                    />
                    <Button
                      variant="outline"
                      type="button"
                      onClick={handleRequestCode}
                      disabled={testing}
                    >
                      Get code
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="device-label">Device name</Label>
                  <Input
                    id="device-label"
                    type="text"
                    maxLength={80}
                    value={deviceLabel}
                    onChange={(event) => setDeviceLabel(event.target.value)}
                  />
                </div>
              </TabsContent>

              <TabsContent value="token" className="mt-3 space-y-1.5">
                <Label htmlFor="access-token">Access token</Label>
                <Input
                  id="access-token"
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
                  className="font-mono"
                />
              </TabsContent>
            </Tabs>

            <Button
              variant="brand"
              className="w-full"
              size="lg"
              onClick={handleConnect}
              disabled={testing}
            >
              {testing ? "Connecting..." : "Connect"}
            </Button>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {notice && (
              <Alert variant="success">
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-background/40 p-3 text-xs text-muted-foreground">
              <Wifi className="mt-0.5 size-4 shrink-0" />
              <span>
                The server prints its LAN address and a first-run pairing code
                on startup. Pairing codes expire after 10 minutes and work once.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
