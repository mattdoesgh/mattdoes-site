/**
 * The `#tweaks` preferences dialog: dark-mode toggle, accent swatches, and the
 * local-map segmented controls. Pure markup — the client tweaks script wires
 * the controls, persists choices, and applies `data-theme` / `--accent`. The
 * `id="tweaks"` and the `data-key` / `data-value` hooks are that script's
 * contract, so they are reproduced verbatim.
 */
export interface TweaksDialogProps {
  /**
   * Render the dialog in its open (non-modal) state. On the real site the
   * client tweaks script opens it with `showModal()`; set this to show the
   * panel inline (e.g. in a preview, or for a CSS-only fallback).
   */
  open?: boolean;
}

export function TweaksDialog({ open = false }: TweaksDialogProps) {
  return (
    <dialog id="tweaks" aria-labelledby="tweaks-title" open={open}>

      <header>
        <span id="tweaks-title">tweaks</span>
        <button type="button" className="close" aria-label="close tweaks">
          ×
        </button>
      </header>
      <div className="row-t">
        <span className="row-t-label">dark mode</span>
        <button type="button" className="tk-toggle" data-key="dark" aria-pressed="true" aria-label="dark mode"></button>
      </div>
      <div className="row-t">
        <fieldset className="tk-swatches" data-key="accent">
          <legend className="row-t-label">accent</legend>
          <label className="tk-sw" data-value="warm">
            <input type="radio" name="tk-accent" value="warm" />
            <span className="tk-sw-dot"></span>
            <span className="visually-hidden">warm terracotta</span>
          </label>
          <label className="tk-sw" data-value="pink">
            <input type="radio" name="tk-accent" value="pink" />
            <span className="tk-sw-dot"></span>
            <span className="visually-hidden">hot pink</span>
          </label>
          <label className="tk-sw" data-value="blue">
            <input type="radio" name="tk-accent" value="blue" />
            <span className="tk-sw-dot"></span>
            <span className="visually-hidden">cool blue</span>
          </label>
          <label className="tk-sw" data-value="green">
            <input type="radio" name="tk-accent" value="green" />
            <span className="tk-sw-dot"></span>
            <span className="visually-hidden">fern green</span>
          </label>
        </fieldset>
      </div>
      <div className="row-t">
        <span className="row-t-label">local map</span>
        <div className="tk-seg" data-key="geo" role="group" aria-label="local map source">
          <button type="button" data-value="home" aria-pressed="true" aria-label="local map: home">
            home
          </button>
          <button type="button" data-value="mine" aria-pressed="false" aria-label="local map: mine">
            mine
          </button>
          <button type="button" data-value="off" aria-pressed="false" aria-label="local map: off">
            off
          </button>
        </div>
      </div>
      <div className="row-t">
        <span className="row-t-label">map style</span>
        <div className="tk-seg" data-key="geoShape" role="group" aria-label="map style">
          <button type="button" data-value="points" aria-pressed="true" aria-label="map style: points">
            points
          </button>
          <button type="button" data-value="solid" aria-pressed="false" aria-label="map style: solid">
            solid
          </button>
        </div>
      </div>
      <div className="row-t help">
        <p className="note">
          picking <em>mine</em> uses your location once to look up your city outline. the outline is cached on this
          device for 7 days; your coordinates aren't saved and never leave the lookup. switch back to <em>home</em> to
          clear it.
        </p>
      </div>
    </dialog>
  );
}
