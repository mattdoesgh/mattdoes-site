import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

// Library build. Produces:
//   dist/index.es.js  — ESM entry esbuild/Claude Design consumes (window.MattdoesDS via the design-sync converter)
//   dist/index.d.ts   — per-file declarations the converter reads for prop contracts
//   dist/style.css    — the bundled stylesheet (re-exports static/_shared.css verbatim)
// react/react-dom stay external so the host (the SSG harness, or Claude Design's
// runtime) provides a single React instance.
export default defineConfig({
  plugins: [
    react(),
    dts({ include: ['src'], rollupTypes: false, insertTypesEntry: true }),
  ],
  build: {
    lib: {
      entry: { index: 'src/index.ts', styles: 'src/styles-entry.ts' },
      formats: ['es'],
      fileName: (_format, name) => `${name}.es.js`,
    },
    cssCodeSplit: false,
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react-dom/server',
      ],
      output: { assetFileNames: 'style.css' },
    },
  },
});
