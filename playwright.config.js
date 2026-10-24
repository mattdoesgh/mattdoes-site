import { defineConfig } from 'playwright/test';

const chromiumArgs = [
  '--font-render-hinting=none',
  '--disable-lcd-text',
  '--force-color-profile=srgb',
];

export default defineConfig({
  testDir: 'test/visual',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'line',
  outputDir: 'test/visual/test-results',
  snapshotPathTemplate: '{testDir}/baselines/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.002,
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'dark',
    launchOptions: { args: chromiumArgs },
  },
  webServer: {
    command: 'node scripts/visual-serve.js',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false },
    },
    {
      name: 'phone',
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
  ],
});
