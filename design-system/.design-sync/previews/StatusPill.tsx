import { StatusPill } from '@mattdoes/ds';

export const NowPlaying = () => <StatusPill text="now: Boards of Canada — Roygbiv" dot live />;

export const StaticNotice = () => <StatusPill text="back in august" />;

export const WithDot = () => <StatusPill text="live from the studio" dot />;
