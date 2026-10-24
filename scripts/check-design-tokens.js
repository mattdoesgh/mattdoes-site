// Fail when CSS or templates use a raw color, font family, or font size
// that is not a custom property from site/tokens.css.

import { findTokenViolations } from '../lib/design-tokens.js';

const violations = findTokenViolations();
if (violations.length) {
  console.error(`design tokens: ${violations.length} violation${violations.length === 1 ? '' : 's'}`);
  for (const line of violations) console.error(`  ${line}`);
  process.exit(1);
}
console.log('design tokens: colors, font families, and font sizes stay in site/tokens.css');
