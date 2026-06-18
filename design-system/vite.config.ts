import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';

// Strip @font-face blocks out of the emitted stylesheet. In library mode Vite
// ALWAYS base64-inlines assets referenced by url() (build.assetsInlineLimit is
// ignored), so the JetBrains Mono faces in static/_shared.css would otherwise
// bloat dist/style.css — and the design bundle's _ds_bundle.css — by ~600 KB
// of base64. The design-sync converter re-adds these faces as real woff2 FILES
// from the same source (cfg.extraFonts → static/_shared.css), which is what
// ships to Claude Design. The deployed site uses static/_shared.css directly
// (not this output), so its @font-face + /fonts/ serving is unaffected.
function stripFontFace() {
  return {
    name: 'strip-font-face',
    enforce: 'post' as const,
    generateBundle(_options: unknown, bundle: Record<string, any>) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.css')) continue;
        const css = typeof file.source === 'string'
          ? file.source
          : Buffer.from(file.source).toString('utf8');
        file.source = css.replace(/@font-face\s*\{[^}]*\}/g, '');
      }
    },
  };
}

// Library build. Produces:
//   dist/index.es.js  — ESM entry esbuild/Claude Design consumes (window.MattdoesDS via the design-sync converter)
//   dist/index.d.ts   — per-file declarations the converter reads for prop contracts
//   dist/style.css    — the bundled stylesheet (re-exports static/_shared.css, minus @font-face)
// react/react-dom stay external so the host (the SSG harness, or Claude Design's
// runtime) provides a single React instance.
export default defineConfig({
  plugins: [
    react(),
    dts({ include: ['src'], rollupTypes: false, insertTypesEntry: true }),
    stripFontFace(),
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
