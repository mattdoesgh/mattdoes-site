import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SSG build — the bundle lib/emit.js imports to render the real site pages.
//
// Separate from vite.config.ts (the design-sync / Claude Design bundle) so that
// output stays untouched. Produces dist-ssg/ssg.js: the render* functions plus
// every DS component + page they pull in, bundled into one ESM file.
//
// react / react-dom / react-dom/server stay EXTERNAL — they're resolved at
// runtime from design-system/node_modules (this bundle lives under
// design-system/dist-ssg/), so the root build runs on plain `node` with no
// React dependency of its own. renderToStaticMarkup is called inside the bundle
// (ssg/document.tsx), never by emit.js.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-ssg',
    emptyOutDir: true,
    lib: {
      entry: { ssg: 'ssg/index.tsx' },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server'],
    },
  },
});
