// lib/x-posts.js — pure X post codec (see CONTEXT.md: Posts).
//
// No fetch, no fs. The build-time snapshot (lib/posts.js) owns the network
// and the disk cache. The page is original posts only: retweets, quote
// posts, and replies are dropped even if the API `exclude` parameter
// misses one. Permalinks are built here so a payload cannot supply a
// javascript: URL.

const REPOST_TYPES = new Set(['retweeted', 'quoted', 'replied_to']);
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const ID_RE = /^\d{1,25}$/;
const TEXT_MAX = 4000;

/**
 * A repost is a retweet, a quote post, a reply, or a classic "RT @…" body.
 * Original posts have no referenced_tweets of those types.
 *
 * @param {object} post
 * @returns {boolean}
 */
export function isRepost(post) {
  const refs = Array.isArray(post?.referenced_tweets) ? post.referenced_tweets : [];
  if (refs.some((ref) => REPOST_TYPES.has(ref?.type))) return true;
  return /^RT @/i.test(String(post?.text || ''));
}

/**
 * @param {unknown} id
 * @param {unknown} handle
 * @returns {string} https://x.com/{handle}/status/{id}, or ''
 */
export function postPermalink(id, handle) {
  const statusId = String(id || '');
  const name = String(handle || '');
  if (!ID_RE.test(statusId) || !HANDLE_RE.test(name)) return '';
  return `https://x.com/${name}/status/${statusId}`;
}

/**
 * Prefer the long-form note body when X sends one. Collapse whitespace so
 * a card is one paragraph, not a raw payload dump.
 *
 * @param {object} post
 * @returns {string}
 */
export function postText(post) {
  const note = post?.note_tweet?.text;
  const raw = typeof note === 'string' && note.trim() ? note : post?.text;
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX);
}

/**
 * @param {object|object[]} payload API `data` array, or `{ data: [...] }`
 * @param {object} [opts]
 * @param {string} [opts.handle]
 * @param {number} [opts.limit]
 * @returns {{ id: string, text: string, createdAt: string, url: string }[]}
 */
export function selectOriginalPosts(payload, { handle = 'mattdoes', limit = 20 } = {}) {
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : (Array.isArray(payload) ? payload : []);
  const cap = Number.isFinite(limit) && limit > 0 ? limit : 20;
  const posts = [];
  for (const post of rows) {
    if (!post || isRepost(post)) continue;
    const url = postPermalink(post.id, handle);
    const text = postText(post);
    const createdAt = String(post.created_at || post.createdAt || '');
    if (!url || !text || Number.isNaN(Date.parse(createdAt))) continue;
    posts.push({ id: String(post.id), text, createdAt, url });
    if (posts.length >= cap) break;
  }
  return posts;
}
