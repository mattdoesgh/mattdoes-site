export interface StatusPillProps {
  /** The status text, e.g. a now-playing track or a site-wide notice. */
  text: string;
  /** Show the leading accent dot (used for the live now-playing state). */
  dot?: boolean;
  /**
   * Wire this as the live now-playing element (`id="now-playing"`,
   * `data-state`), which the client now-playing script updates in place. When
   * `text` is empty the pill renders hidden/idle. A plain status notice leaves
   * this `false`.
   */
  live?: boolean;
}

/** The topbar status pill — a now-playing track or a static site notice. */
export function StatusPill({ text, dot = false, live = false }: StatusPillProps) {
  if (live) {
    const playing = text !== '';
    return (
      <span className="status" id="now-playing" hidden={!playing} data-state={playing ? 'playing' : 'idle'}>
        {dot && playing ? <span className="dot"></span> : null}
        {text}
      </span>
    );
  }
  return (
    <span className="status">
      {dot ? <span className="dot"></span> : null}
      {text}
    </span>
  );
}
