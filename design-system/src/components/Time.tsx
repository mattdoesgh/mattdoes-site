import type { DateInput, DateFormat } from '../lib/format';
import { fmtDate, isoAttr } from '../lib/format';

export interface TimeProps {
  /** The instant to display. Absolute (UTC); rendered in America/Chicago. */
  date: DateInput;
  /** Display format. Defaults to `'day'` (`'mon DD'`). */
  format?: DateFormat;
  /** Optional `aria-label`, e.g. `"published"`. */
  ariaLabel?: string;
  /**
   * Override the rendered text while keeping the ISO `datetime` attribute — for
   * relative labels like the home feed's `"2h"`/`"3d"`. When omitted the text
   * is `fmtDate(date, format)`.
   */
  label?: string;
}

/**
 * A timestamp wrapped in `<time class="ts">` with a machine-readable ISO
 * `datetime`, rendered in Central Time. The `ts` class is the contract the
 * client local-time script keys on to layer a visitor-local tooltip.
 */
export function Time({ date, format = 'day', ariaLabel, label }: TimeProps) {
  const iso = isoAttr(date);
  if (!iso) return null;
  // Emit a lowercase `datetime` attribute (the canonical HTML the client
  // local-time script keys on — `time.ts[datetime]` — and the form
  // `templates/_helpers.js` emits, so React- and string-rendered timestamps
  // stay byte-identical). React 19's own `dateTime` prop serialises camelCase
  // (`dateTime="…"`), so the spread is the only way to get lowercase. React's
  // dev build warns "Invalid DOM property `datetime`" but still emits it
  // verbatim; the warning is stripped in the production-mode build
  // (`NODE_ENV=production node build.js`). Do NOT switch to `dateTime` to
  // silence it — that breaks the lowercase contract.
  const dateAttr = { datetime: iso } as Record<string, string>;
  return (
    <time className="ts" aria-label={ariaLabel} {...dateAttr}>
      {label ?? fmtDate(date, format)}
    </time>
  );
}
