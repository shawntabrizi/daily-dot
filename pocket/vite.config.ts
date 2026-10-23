import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";

// The Pocket worker: the host boots it headless to draw the card face. It never
// shares a document with the app.
//
// Load-bearing, per paritytech/humanity-spa's worker build (and Nemanja's pets):
//  - a plain build with an explicit input, NOT `build.lib`: lib mode skips
//    minification and the NODE_ENV replacement, and `process` is undefined in
//    the host's worker WebView, so a dependency's NODE_ENV check kills the boot.
//  - one entry, one file: the manifest names `worker.js` and the host fetches
//    exactly that path, so nothing may be split into a sibling chunk.
//  - ASCII output: the host reads worker JS as Latin-1.
//
// `public/faces/daily.json` is the add-sheet preview, written by
// `pnpm pocket:assets` from the same face module the worker streams; Vite
// copies it into dist, which is the worker archive the manifest's `preview`
// path resolves against.
export default defineConfig({
  base: "./",
  define: { global: "globalThis" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    minify: "esbuild",
    rollupOptions: {
      input: fileURLToPath(new URL("./src/worker.ts", import.meta.url)),
      output: {
        entryFileNames: "worker.js",
        inlineDynamicImports: true,
        format: "es",
      },
    },
  },
  esbuild: { charset: "ascii", legalComments: "none" },
});
