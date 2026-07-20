import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Production CSP from docs/06. Dev server omits it because HMR needs websockets. */
const csp = [
  "default-src 'self'",
  "connect-src 'none'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "style-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

export default defineConfig({
  root: r("."),
  publicDir: r("../public"),
  plugins: [
    {
      name: "letters-light-csp",
      apply: "build",
      transformIndexHtml(html) {
        return html.replace("<!--%CSP%-->", `<meta http-equiv="Content-Security-Policy" content="${csp}">`);
      },
    },
  ],
  base: "./",
  resolve: {
    alias: {
      "@core": r("../src"),
      "@data": r("../data"),
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        /** Keep the exact-font acquisition record and framework runtime in
         * stable cacheable chunks. This is not a fake warning threshold: the
         * application/editor code stays independently invalidatable. */
        manualChunks(id) {
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/") || id.includes("/node_modules/scheduler/")) return "react-runtime";
          if (id.includes("/data/type-library/") || id.endsWith("font-library.lock.json")) return "exact-type-library";
          return undefined;
        },
      },
    },
  },
  worker: {
    format: "es",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    css: false,
    restoreMocks: true,
  },
});
