import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-client',
    emptyOutDir: true,
    rollupOptions: {
      input: 'client/timeline-controls.tsx',
      output: {
        entryFileNames: 'timeline-controls.[hash].js',
        chunkFileNames: 'timeline-vendor.[hash].js',
        manualChunks(id) {
          return id.includes('/node_modules/') ? 'timeline-vendor' : undefined;
        },
      },
    },
  },
});
