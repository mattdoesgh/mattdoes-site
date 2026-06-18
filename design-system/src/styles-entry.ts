// CSS-only build entry. Kept separate from index.ts so the JS bundle stays
// importable under Node for SSG, while Vite still extracts dist/style.css
// (the re-exported static/_shared.css) for consumers that want
// `import '@mattdoes/ds/styles.css'`.
import './styles.css';
