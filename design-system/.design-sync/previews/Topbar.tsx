import { Topbar, StatusPill } from '@mattdoes/ds';

export const Home = () => <Topbar active="home" />;

export const OnBlog = () => <Topbar active="blog" />;

export const WithNowPlaying = () => (
  <Topbar active="listening" status={<StatusPill text="now: Boards of Canada — Roygbiv" dot live />} />
);
