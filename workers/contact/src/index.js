// /api/contact — accepts POST from say-hi.html, logs to D1, sends via MailChannels.
//
// Fields expected (multipart/form-data OR application/x-www-form-urlencoded):
//   name, email, subject, body
//   _hp     — honeypot; if present & non-empty, we 200 silently but don't send
//
// Secrets (set via `wrangler secret put`):
//   DKIM_PRIVATE_KEY   — base64 PKCS8 private key for MailChannels DKIM signing
//
// Bindings (wrangler.toml):
//   CONTACT_LOG        — D1 database
//   MAIL_TO / MAIL_FROM / MAIL_FROM_NAME / DKIM_DOMAIN / DKIM_SELECTOR — vars

const MAX_BODY_BYTES   = 32 * 1024;   // 32 KB — nobody is writing me a novel
const RATE_WINDOW_HOUR = 5;            // max 5 submissions/IP/hour
const ALLOWED_ORIGIN   = 'https://mattdoes.online';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return corsPreflight();
    if (request.method !== 'POST')    return json({ error: 'method_not_allowed' }, 405);

    // Origin / referer check — cheap filter for random curl spam.
    const origin = request.headers.get('origin') || request.headers.get('referer') || '';
    if (!origin.startsWith(ALLOWED_ORIGIN)) {
      return json({ error: 'bad_origin' }, 403);
    }

    const ip      = request.headers.get('cf-connecting-ip') || '0.0.0.0';
    const country = request.cf?.country || null;
    const ua      = (request.headers.get('user-agent') || '').slice(0, 500);
    const ipHash  = await sha256(`${ip}:${todayUTC()}`);

    // Rate limit via D1 lookup.
    const recent = await env.CONTACT_LOG.prepare(
      `SELECT COUNT(*) AS n FROM submissions
       WHERE ip_hash = ?1 AND created_at > datetime('now', '-1 hour')`
    ).bind(ipHash).first();
    if ((recent?.n ?? 0) >= RATE_WINDOW_HOUR) {
      return json({ error: 'rate_limited' }, 429);
    }

    // Parse body.
    let form;
    try {
      const ctype = request.headers.get('content-type') || '';
      if (ctype.includes('application/json')) {
        form = await request.json();
      } else {
        const fd = await request.formData();
        form = Object.fromEntries(fd.entries());
      }
    } catch {
      return json({ error: 'bad_body' }, 400);
    }

    const name    = clip(form.name,    200);
    const email   = clip(form.email,   320);
    const subject = clip(form.subject, 200);
    const body    = clip(form.body,    MAX_BODY_BYTES);
    const hp      = String(form._hp || '').trim();

    if (!body)  return json({ error: 'body_required' }, 400);
    if (email && !looksLikeEmail(email)) return json({ error: 'bad_email' }, 400);

    const honeypotHit = hp.length > 0 ? 1 : 0;
    let mailStatus = honeypotHit ? 'skipped' : null;
    let mailError  = null;

    if (!honeypotHit) {
      try {
        await sendViaMailChannels({ env, name, email, subject, body });
        mailStatus = 'sent';
      } catch (e) {
        mailStatus = 'failed';
        mailError  = String(e && e.message || e).slice(0, 500);
        // We still return 200 so the form UX succeeds — failure is logged.
      }
    }

    // Log everything, including honeypot hits, so we can eyeball spam trends.
    await env.CONTACT_LOG.prepare(
      `INSERT INTO submissions (ip_hash, country, ua, name, email, subject, body, honeypot_hit, mail_status, mail_error)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    ).bind(ipHash, country, ua, name, email, subject, body, honeypotHit, mailStatus, mailError).run();

    return json({ ok: true });
  },
};

// ── helpers ──────────────────────────────────────────────────────────────

function clip(v, max) {
  return typeof v === 'string' ? v.slice(0, max).trim() : '';
}

function looksLikeEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

async function sha256(s) {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type':                 'application/json; charset=utf-8',
      'access-control-allow-origin':  ALLOWED_ORIGIN,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'vary':                         'origin',
    },
  });
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin':  ALLOWED_ORIGIN,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age':       '86400',
    },
  });
}

async function sendViaMailChannels({ env, name, email, subject, body }) {
  const fromName  = env.MAIL_FROM_NAME || 'contact form';
  const replyTo   = email ? { email, name: name || email } : undefined;
  const subj      = subject ? `[mattdoes.online] ${subject}` : '[mattdoes.online] new message';

  const payload = {
    personalizations: [{
      to: [{ email: env.MAIL_TO }],
      dkim_domain:        env.DKIM_DOMAIN,
      dkim_selector:      env.DKIM_SELECTOR,
      dkim_private_key:   env.DKIM_PRIVATE_KEY,
    }],
    from:    { email: env.MAIL_FROM, name: fromName },
    ...(replyTo ? { reply_to: replyTo } : {}),
    subject: subj,
    content: [{
      type:  'text/plain',
      value: renderBody({ name, email, subject, body }),
    }],
  };

  const resp = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`mailchannels ${resp.status}: ${txt.slice(0, 300)}`);
  }
}

function renderBody({ name, email, subject, body }) {
  const lines = [];
  if (name)    lines.push(`From:    ${name}`);
  if (email)   lines.push(`Email:   ${email}`);
  if (subject) lines.push(`Subject: ${subject}`);
  if (lines.length) lines.push('');
  lines.push(body);
  return lines.join('\n');
}
