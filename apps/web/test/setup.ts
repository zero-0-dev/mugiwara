import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

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
