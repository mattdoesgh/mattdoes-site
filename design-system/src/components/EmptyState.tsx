export type EmptyKind = 'journal' | 'making' | 'listening' | 'thoughts' | 'blog';

const COPY: Record<EmptyKind, string> = {
  journal: 'No journal entries yet.',
  making: 'Nothing posted to making yet.',
  listening: 'No scrobbles yet — check back after a listen.',
  thoughts: 'No thoughts yet — check back soon.',
  blog: 'Nothing published yet.',
};

export interface EmptyStateProps {
  /** Which timeline is empty — selects the copy. */
  kind: EmptyKind;
}

/**
 * Muted empty-state row in the Row shape, so a timeline with no entries stays
 * structurally identical between server render and a valid-but-empty live
 * update.
 */
export function EmptyState({ kind }: EmptyStateProps) {
  const copy = COPY[kind] ?? 'Nothing here yet.';
  return (
    <div className="row">
      <div className="gutter">
        <span className="kind">—</span>
        <span className="when"></span>
      </div>
      <div>
        <div className="body muted">{copy}</div>
      </div>
    </div>
  );
}
