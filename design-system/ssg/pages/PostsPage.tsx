// /posts/ — original posts from @mattdoes, baked at build time.
// Not a notebook, and not an embedded X timeline.
import { PageShell, Time, safeUrl, relValue } from '../../src/index';

export interface XPost {
  id: string;
  text: string;
  createdAt: string;
  url: string;
}

export interface PostsPageProps {
  siteConfig: { title?: string; footerText?: string; status?: string };
  posts: XPost[];
  profileHref?: string;
  handle?: string;
  nowPlaying?: string;
}

function PostCard({ post }: { post: XPost }) {
  const href = safeUrl(post.url);
  return (
    <article className="row post-card">
      <div className="gutter">
        <span className="kind">
          <Time date={post.createdAt} format="day" />
        </span>
      </div>
      <div>
        <div className="body">
          <p>{post.text}</p>
          {href ? (
            <a className="on-x" href={href} rel={relValue(href)}>on x</a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function PostsPage({
  siteConfig,
  posts,
  profileHref = 'https://x.com/mattdoes',
  handle = 'mattdoes',
  nowPlaying = '',
}: PostsPageProps) {
  const profile = safeUrl(profileHref);
  const name = handle.replace(/^@/, '');
  return (
    <PageShell
      active="posts"
      siteTitle={siteConfig.title}
      manualStatus={siteConfig.status}
      nowPlaying={nowPlaying}
      footerText={siteConfig.footerText ?? ''}
    >
      <main className="page page--archive posts-page" id="main">
        <section className="timeline archive-listing" aria-labelledby="posts-title">
          <div className="post-head">
            <h1 id="posts-title">posts</h1>
          </div>
          <p className="archive-lede">
            Original posts from{' '}
            {profile ? <a href={profile} rel={relValue(profile)}>@{name}</a> : `@${name}`}.
            {' '}Reposts are not included.
          </p>
          {posts.length ? (
            posts.map((post) => <PostCard key={post.id} post={post} />)
          ) : (
            <p className="muted">
              No posts in this build.
              {profile ? <> <a href={profile} rel={relValue(profile)}>@{name} on x</a></> : null}
            </p>
          )}
        </section>
      </main>
    </PageShell>
  );
}
