import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom gaps the app touches: media queries (theme + reduced motion) and
// the beacon API the privacy canary spies on.
if (typeof window !== "undefined") {
  // Node 26 exposes a partial global Storage surface unless a backing file is
  // configured. Give jsdom the browser contract the product actually uses.
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, String(value)),
    },
  });
  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  }
  if (typeof navigator.sendBeacon !== "function") {
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  }
  // jsdom does not implement scrollTo; the app calls it on route change.
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
}

afterEach(() => {
  cleanup();
});
