// Small shared helpers.

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtDate(d, fmt = 'apr 17') {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return '';
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const mon = months[date.getUTCMonth()];
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = date.getUTCFullYear();
  if (fmt === 'iso')       return date.toISOString().slice(0, 10);
  if (fmt === 'long')      return `${year}·${String(date.getUTCMonth()+1).padStart(2,'0')}·${day}`;
  if (fmt === 'month')     return `${mon} · ${year}`;
  if (fmt === 'day')       return `${mon} ${day}`;
  return `${mon} ${day}`;
}

export function relTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 3600)  return `${Math.max(1, Math.round(diff/60))}m`;
  if (diff < 86400) return `${Math.round(diff/3600)}h`;
  if (diff < 86400 * 7) return `${Math.round(diff/86400)}d`;
  return fmtDate(d, 'day');
}

export function tagList(tags) {
  if (!tags || !tags.length) return '';
  return tags.map(t => `<a class="tg" href="/tags/${encodeURIComponent(t)}/">${esc(t)}</a>`).join(' ');
}
