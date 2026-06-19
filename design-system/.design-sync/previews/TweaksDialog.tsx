import { TweaksDialog } from '@mattdoes/ds';

// Rendered in its open state so the panel is visible in the card; on the site
// the client tweaks script opens it modally from the footer toggle.
//
// The shipped CSS anchors `dialog#tweaks` `position: fixed` bottom-right (for
// the showModal() top layer). Rendered inline in a preview card that clips to
// content height, that fixed panel falls outside the capture, so the card reads
// blank. This preview-only <style> pins the open panel static so it shows
// in-card. The shipped component is untouched — the site still opens it modally.
export const Open = () => (
  <>
    <style>{`dialog#tweaks{position:static;right:auto;bottom:auto;left:auto;top:auto;margin:16px auto;}`}</style>
    <TweaksDialog open />
  </>
);
