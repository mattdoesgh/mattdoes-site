import type { DateInput, DateFormat } from '../lib/format';
import { fmtDate, isoAttr } from '../lib/format';

export interface TimeProps {
  /** The instant to display. Absolute (UTC); rendered in America/Chicago. */
  date: DateInput;
  /** Display format. Defaults to `'day'` (`'mon DD'`). */
  format?: DateFormat;
  /** Optional `aria-label`, e.g. `"published"`. */
  ariaLabel?: string;
}

/**
 * A timestamp wrapped in `<time class="ts">` with a machine-readable ISO
 * `datetime`, rendered in Central Time. The `ts` class is the contract the
 * client local-time script keys on to layer a visitor-local tooltip.
 */
export function Time({ date, format = 'day', ariaLabel }: TimeProps) {
  const iso = isoAttr(date);
  if (!iso) return null;
  // Emit a lowercase `datetime` attribute (the canonical HTML the client
  // local-time script and the rest of the codebase expect) rather than
  // React's pass-through `dateTime`. A lowercase custom attribute is emitted
  // verbatim by React.
  const dateAttr = { datetime: iso } as Record<string, string>;
  return (
    <time className="ts" aria-label={ariaLabel} {...dateAttr}>
      {fmtDate(date, format)}
    </time>
  );
}
