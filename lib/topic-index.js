// lib/topic-index.js — a pure cross-kind projection from rendered writing to
// topic paths. The returned index is the seam used by topic pages, homepage
// curation, and related-writing links; callers do not need to know how tags are
// normalized, excerpts are derived, or related entries are ranked.

const SAFE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeTopic(tag) {
  return String(tag || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function shortHash(value) {
  // FNV-1a, encoded compactly. Used only when punctuation would otherwise make
  // two different topic names collapse onto the same readable path.
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0').slice(0, 7);
}

/** Return the stable, filesystem-safe slug for a topic tag. */
export function topicSlug(tag) {
  const topic = normalizeTopic(tag);
  if (!topic) return '';
  if (SAFE_SLUG_RE.test(topic)) return topic;

  const readable = topic
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'topic';
  return `${readable}-${shortHash(topic)}`;
}

/** Return the canonical public path for a topic tag, or null for an empty tag. */
export function topicPath(tag) {
  const slug = topicSlug(tag);
  return slug ? `/topics/${slug}/` : null;
}

function plainText(value) {
  return String(value || '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/```[^\n]*\n?/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]\s)\s*/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerpt(value, maxLength) {
  const text = plainText(value);
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, Math.max(1, maxLength - 1));
  const boundary = clipped.lastIndexOf(' ');
  return `${(boundary > maxLength * 0.6 ? clipped.slice(0, boundary) : clipped).trimEnd()}…`;
}

function timestamp(date) {
  const value = new Date(date).getTime();
  return Number.isFinite(value) ? value : 0;
}

function normalizedTags(tags) {
  return [...new Set((Array.isArray(tags) ? tags : []).map(normalizeTopic).filter(Boolean))];
}

function publicItem(item) {
  return {
    kind: item.kind,
    title: item.title,
    url: item.url,
    date: item.date,
    excerpt: item.excerpt,
    topics: [...item.topics],
  };
}

function toItem(entry, fallbackKind, excerptLength) {
  const kind = entry.kind || fallbackKind;
  const isThought = kind === 'thought';
  const body = entry.body || entry.summary || entry.html || '';
  const itemExcerpt = excerpt(isThought ? body : entry.summary || body, excerptLength);
  const url = entry.url || (isThought && entry.id ? `/thoughts/#${entry.id}` : '');
  const key = url || `${kind}:${entry.id || entry.title || ''}:${timestamp(entry.date)}`;
  return {
    key,
    kind,
    title: isThought ? '' : String(entry.title || ''),
    url,
    date: entry.date,
    excerpt: itemExcerpt,
    topics: normalizedTags(entry.tags),
    timestamp: timestamp(entry.date),
  };
}

function compareItems(a, b) {
  return b.timestamp - a.timestamp || a.key.localeCompare(b.key);
}

/**
 * Build a topic index over rendered articles and thoughts.
 *
 * Interface:
 *   index.topics                 ranked topic summaries
 *   index.get(tag)               one topic summary, or null
 *   index.relatedTo(entry, opts) cross-kind related items
 *
 * Topic summaries contain `count`, per-kind `counts`, ISO `latestAt`, a stable
 * `path`, and the newest representative `items` (default three).
 */
export function buildTopicIndex(articles = [], thoughts = [], options = {}) {
  const representativeLimit = Math.max(1, Number(options.representativeLimit) || 3);
  const excerptLength = Math.max(40, Number(options.excerptLength) || 180);
  const allItems = [
    ...articles.map(entry => toItem(entry, 'journal', excerptLength)),
    ...thoughts.map(entry => toItem(entry, 'thought', excerptLength)),
  ].filter(item => item.topics.length > 0).sort(compareItems);

  const buckets = new Map();
  for (const item of allItems) {
    for (const name of item.topics) {
      let bucket = buckets.get(name);
      if (!bucket) {
        bucket = { name, count: 0, counts: {}, items: [] };
        buckets.set(name, bucket);
      }
      bucket.count += 1;
      bucket.counts[item.kind] = (bucket.counts[item.kind] || 0) + 1;
      bucket.items.push(item);
    }
  }

  const topics = [...buckets.values()].map(bucket => ({
    name: bucket.name,
    slug: topicSlug(bucket.name),
    path: topicPath(bucket.name),
    count: bucket.count,
    counts: { ...bucket.counts },
    latestAt: bucket.items[0]?.timestamp
      ? new Date(bucket.items[0].timestamp).toISOString()
      : null,
    items: bucket.items.slice(0, representativeLimit).map(publicItem),
  })).sort((a, b) =>
    b.count - a.count
      || String(b.latestAt || '').localeCompare(String(a.latestAt || ''))
      || a.name.localeCompare(b.name));

  const byName = new Map(topics.map(topic => [topic.name, topic]));

  return {
    topics,
    get(tag) {
      return byName.get(normalizeTopic(tag)) || null;
    },
    relatedTo(entry, relatedOptions = {}) {
      const requestedLimit = relatedOptions.limit == null ? 5 : Number(relatedOptions.limit);
      const limit = Number.isFinite(requestedLimit) ? Math.max(0, Math.floor(requestedLimit)) : 5;
      if (limit === 0) return [];
      const subject = toItem(entry, entry.kind || 'journal', excerptLength);
      const subjectTopics = new Set(subject.topics);
      if (!subjectTopics.size) return [];

      return allItems
        .filter(candidate => candidate.key !== subject.key)
        .map(candidate => ({
          candidate,
          sharedTopics: candidate.topics.filter(topic => subjectTopics.has(topic)),
        }))
        .filter(result => result.sharedTopics.length > 0)
        .sort((a, b) =>
          b.sharedTopics.length - a.sharedTopics.length
            || compareItems(a.candidate, b.candidate))
        .slice(0, limit)
        .map(({ candidate, sharedTopics }) => ({
          ...publicItem(candidate),
          sharedTopics,
        }));
    },
  };
}
