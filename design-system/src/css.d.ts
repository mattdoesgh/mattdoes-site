// Ambient declaration for side-effect CSS imports (e.g. styles-entry.ts's
// `import './styles.css'`). TypeScript 6.0 reports TS2882 for side-effect
// imports of modules it can't resolve; Vite handles the actual CSS at build
// time, so we only need the type to exist.
declare module '*.css';
