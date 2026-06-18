import { ListeningRow } from '@mattdoes/ds';

export const NowPlaying = () => (
  <ListeningRow
    track="Roygbiv"
    artist="Boards of Canada"
    album="Music Has the Right to Children"
    link="https://www.last.fm/music/Boards+of+Canada/_/Roygbiv"
    date="2026-06-17T15:00:00.000Z"
    nowPlaying
  />
);

export const RecentScrobble = () => (
  <ListeningRow
    track="An Eagle in Your Mind"
    artist="Boards of Canada"
    album="Music Has the Right to Children"
    link="https://www.last.fm/music/Boards+of+Canada"
    date="2026-06-16T22:10:00.000Z"
  />
);

export const NoAlbumNoLink = () => (
  <ListeningRow track="Untitled Demo" artist="verism" date="2026-06-15T12:00:00.000Z" />
);
