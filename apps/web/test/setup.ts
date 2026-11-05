import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// React Router's data router builds a Request for every navigation. In jsdom
// the global AbortSignal comes from jsdom while Request comes from Node's
// undici, and undici rejects it as "not an instance of AbortSignal". The signal
// is irrelevant to these client-side route smoke tests, so drop it.
const NativeRequest = globalThis.Request;
if (NativeRequest) {
  class JsdomSafeRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (init?.signal) {
        const { signal: _signal, ...rest } = init;
        super(input, rest);
      } else {
        super(input, init);
      }
    }
  }
  globalThis.Request = JsdomSafeRequest as typeof Request;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (window as any).electronAPI;
  delete (window as any).Capacitor;
});

// jsdom does not implement matchMedia. Default to a desktop, hover-capable
// device; individual tests override this for touch-only behavior. Keep this a
// plain function rather than vi.fn: `restoreMocks` resets mock implementations
// between tests, which would leave matchMedia() returning undefined.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  configurable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList),
});
