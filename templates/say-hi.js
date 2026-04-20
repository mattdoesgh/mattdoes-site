// Contact form page. Posts to /api/contact (Cloudflare Worker).

import { base } from './base.js';
import { asset } from './_assets.js';

export function sayHiPage({ site } = {}) {
  const body = `
<main class="page contact">
  <section class="timeline contact-wrap">
    <div class="post-head">
      <div class="kicker"><span class="kind">contact</span><span class="dot">·</span><span>no forms, no funnels</span></div>
      <h1>send a note.</h1>
      <p class="lede">If something here sparked a thought — a post, a build, the last few tracks — I'd like to hear it. Plain email, sent through a tiny Cloudflare Worker. Replies come from me.</p>
    </div>

    <form class="note" action="/api/contact" method="POST" novalidate>
      <div class="field">
        <label for="name">name <span class="opt">optional</span></label>
        <input id="name" name="name" type="text" autocomplete="name" />
      </div>

      <div class="field">
        <label for="email">email</label>
        <input id="email" name="email" type="email" autocomplete="email" required />
      </div>

      <div class="field">
        <label for="about">about <span class="opt">optional</span></label>
        <select id="about" name="about">
          <option value="">— nothing in particular —</option>
          <option>a post or thought</option>
          <option>something you're building</option>
          <option>a track from the listening list</option>
          <option>a reply to a journal entry</option>
          <option>hello / the site itself</option>
        </select>
      </div>

      <div class="field">
        <label for="message">message</label>
        <textarea id="message" name="message" rows="6" required placeholder="Write the thing you'd say if we were on a slow walk."></textarea>
      </div>

      <!-- Honeypot — hidden from humans, tempting for bots -->
      <div class="hp" aria-hidden="true">
        <label for="website">website</label>
        <input id="website" name="website" type="text" tabindex="-1" autocomplete="off" />
      </div>

      <div class="actions-row">
        <div class="hint">Sent over HTTPS to a Cloudflare Worker. Your address stays between us; no list, no CRM, no follow-ups unless you ask.</div>
        <button type="submit">send →</button>
      </div>
    </form>

    <div class="thanks" id="thanks">thanks. I read everything. expect a reply within a few days — longer if I'm deep in a build.</div>

    <div class="fallback">
      <div>or the old-fashioned way: <span class="addr" id="addr">hi&#64;mattdoes.online</span></div>
      <button type="button" class="copy" id="copy">copy address</button>
    </div>
  </section>
</main>`;

  return base({
    page: {
      title: 'say hi',
      navActive: 'say-hi',
      nowPlaying: site?.nowPlaying || '',
      bodyScripts: `<script src="/${asset('contact.js')}" defer></script>`,
    },
    body,
  });
}
