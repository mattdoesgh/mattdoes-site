// Generate the Signal / Station preview HTML from the frozen snapshots.
// Run: node concepts/signal-station/render.mjs
// The Pages preview copies the generated files. It does not run this script.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PRIZE = 'mailto:luciadoes@mail.grokbot.com';
const PUBLIC_MAIL = 'mailto:unshared@mattdoes.online';

const watches = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'watches.json'), 'utf8'));
const listening = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'listening.json'), 'utf8'));
const shownTracks = listening.tracks.slice(0, 10);
const latest = listening.tracks[0];
const latestWatch = watches.watches[0];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function stamp(iso) {
  if (!iso) return '';
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`;
}

function rootFor(depth) {
  return depth === 0 ? './' : '../'.repeat(depth);
}

function redaction(body) {
  return `<details class="redaction">
        <summary>
          <span class="redaction-bar" aria-hidden="true"></span>
          <span class="redaction-hint">Redacted. Activate to reveal.</span>
        </summary>
        <div class="redaction-body">
          ${body}
        </div>
      </details>`;
}

function broadcast() {
  return `<nav class="broadcast" aria-label="Elsewhere">
        <a href="https://letterboxd.com/mattdoes">Letterboxd</a>
        <a href="https://x.com/mattdoes">X @mattdoes</a>
      </nav>`;
}

function verbNav(root, current) {
  const items = [
    ['station', `${root}`],
    ['watch', `${root}watch/`],
    ['listen', `${root}listen/`],
    ['unshared', `${root}unshared/`],
  ];
  const links = items.map(([label, href]) => {
    const currentAttr = label === current ? ' aria-current="page"' : '';
    return `<a href="${href}"${currentAttr}>${label}</a>`;
  }).join('\n        ');
  return `<nav class="verb-nav" aria-label="Verbs">
        ${links}
      </nav>`;
}

function anomalies(open) {
  return `<details class="anomalies" id="anomalies"${open ? ' open' : ''}>
        <summary>Index of anomalies</summary>
        <ol>
          <li>AN-01. Redaction bars. A solid bar is a closed line. Reach it from the keyboard and press Enter, or use a pointer. It opens with scripts turned off.</li>
          <li>AN-02. A typed sequence, only while scripts run. With scripts off, the bars still open.</li>
        </ol>
      </details>`;
}

function shell({
  depth,
  polarity,
  title,
  description,
  main,
  current,
  anomaliesOpen = false,
  showVerbNav = true,
}) {
  const root = rootFor(depth);
  const bug = depth === 0 && current === 'station'
    ? '<span>STN · MATT</span>'
    : `<a href="${root}">STN · MATT</a>`;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <meta name="description" content="${esc(description)}">
    <title>${esc(title)}</title>
    <link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="${root}assets/station.css">
  </head>
  <body data-polarity="${polarity}" data-root="${root}">
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="status">
      ${bug}
      <span>Preview · not on air</span>
      <time class="time" datetime="2026-10-20T04:51:00Z">2026-10-20 04:51 UTC</time>
    </header>
    <main id="main">
      ${main}
      ${broadcast()}
    </main>
    <footer class="site-footer">
      ${showVerbNav ? verbNav(root, current) : ''}
      ${anomalies(anomaliesOpen)}
    </footer>
    <script src="${root}assets/station.js" defer></script>
  </body>
</html>
`;
}

const watchTeaser = `${latestWatch.title} · ${latestWatch.year}${latestWatch.stars ? ` · ${latestWatch.stars}` : ''}`;
const listenTeaser = `${latest.artist} — ${latest.track}`;

const home = shell({
  depth: 0,
  polarity: 'field',
  current: 'station',
  showVerbNav: false,
  title: 'matt does … · signal / station',
  description: 'Station ident. matt does watch, listen, and unshared.',
  main: `<h1 class="ident"><span>matt</span> <span>does</span> <span class="mark">…</span></h1>
      <p class="lede">An anomalous broadcast. Pick a verb.</p>
      <nav aria-label="Verbs">
        <ol class="verbs">
          <li>
            <a class="verb" href="./watch/">
              <span class="verb-no">01</span>
              <span>
                <span class="verb-name">Watch</span>
                <span class="verb-teaser">${esc(watchTeaser)}</span>
              </span>
            </a>
          </li>
          <li>
            <a class="verb" href="./listen/">
              <span class="verb-no">02</span>
              <span>
                <span class="verb-name">Listen</span>
                <span class="verb-teaser">${esc(listenTeaser)}</span>
              </span>
            </a>
          </li>
          <li>
            <a class="verb" href="./unshared/">
              <span class="verb-no">03</span>
              <span>
                <span class="verb-name">Unshared</span>
                <span class="verb-teaser">verism RIP · restricted door</span>
              </span>
            </a>
          </li>
        </ol>
      </nav>
      ${redaction(`<p>Three verbs are scheduled. The night shift is not on the board. It is filed on the restricted door, under a second bar.</p>
          <p><a href="./unshared/">Restricted door</a></p>`)}`,
});

function incident(watch) {
  const when = watch.watchedDate || '';
  const stars = watch.stars ? `<span class="stars">${esc(watch.stars)}</span>` : '<span>Unrated</span>';
  const flag = watch.rewatch ? '<span class="flag">Rewatch</span>' : '';
  const title = watch.link
    ? `<a href="${esc(watch.link)}">${esc(watch.title)}</a>`
    : esc(watch.title);
  const statement = watch.review
    ? esc(watch.review)
    : 'No witness statement filed.';
  return `<li class="incident">
          <div>
            <time class="time" datetime="${esc(when)}">${esc(when)}</time>
          </div>
          <div>
            <h2>${title}</h2>
            <p class="meta">${stars}${watch.year ? ` · ${esc(watch.year)}` : ''}${flag}</p>
            <p class="statement">${statement}</p>
          </div>
          <div class="evidence">
            <p class="kicker">Evidence</p>
            <p>${esc(watch.title)}. Poster stays on Letterboxd. This preview does not hotlink it.</p>
          </div>
        </li>`;
}

const watch = shell({
  depth: 1,
  polarity: 'flip',
  current: 'watch',
  title: 'matt does watch · signal / station',
  description: 'Letterboxd reviews as incident reports.',
  main: `<h1 class="sign"><span class="sign-small">matt does</span> watch</h1>
      <p class="lede">Incident reports. The review is the witness statement.</p>
      <p class="note">${watches.watches.length} recent watches from the Letterboxd diary, frozen ${esc(stamp(watches.fetchedAt))}.</p>
      <ol class="feed">
        ${watches.watches.map(incident).join('\n        ')}
      </ol>`,
});

function intercept(track) {
  const title = track.link
    ? `<a href="${esc(track.link)}">${esc(track.track)}</a>`
    : esc(track.track);
  return `<li>
          <time class="time" datetime="${esc(track.date)}">${esc(stamp(track.date))}</time>
          <div>
            ${title}
            <span class="by">${esc(track.artist)}</span>
            ${track.album ? `<span class="album">${esc(track.album)}</span>` : ''}
          </div>
        </li>`;
}

const playcount = Number(listening.playcount).toLocaleString('en-US');

const listen = shell({
  depth: 1,
  polarity: 'field',
  current: 'listen',
  title: 'matt does listen · signal / station',
  description: 'Recent listening intercepts and an idle signal meter.',
  main: `<h1 class="sign"><span class="sign-small">matt does</span> listen</h1>
      <section class="carrier" aria-labelledby="carrier-heading">
        <p class="kicker">Live signal</p>
        <h2 id="carrier-heading">Idle</h2>
        <div class="bars" role="meter" aria-label="Signal strength" aria-valuemin="0" aria-valuemax="5" aria-valuenow="1" aria-valuetext="Idle. No live carrier in this snapshot.">
          <span class="on" aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
          <span aria-hidden="true"></span>
        </div>
        <p>No live carrier in this snapshot. Last intercept <time class="time" datetime="${esc(latest.date)}">${esc(stamp(latest.date))}</time>.</p>
        <p>${esc(latest.artist)} — ${esc(latest.track)}</p>
      </section>
      <p class="total"><span class="total-num">${esc(playcount)}</span> <span class="total-label">scrobbles logged</span></p>
      <h2 class="log-heading">Intercept log</h2>
      <p class="note">${shownTracks.length} of ${listening.tracks.length} intercepts from the listening worker, frozen ${esc(stamp(listening.fetchedAt))}.</p>
      <ol class="log">
        ${shownTracks.map(intercept).join('\n        ')}
      </ol>
      <p class="note"><a href="https://www.last.fm/user/djverism">last.fm / djverism</a></p>`,
});

const unshared = shell({
  depth: 1,
  polarity: 'flip',
  current: 'unshared',
  title: 'matt does unshared · signal / station',
  description: 'Unshared, Matt’s music project. Public contact is unshared@mattdoes.online.',
  main: `<h1 class="sign"><span class="sign-small">matt does</span> unshared</h1>
      <p class="stamp">Restricted</p>
      <p class="lede">Matt makes music as verism RIP. One-offs, released when they finish. No album cycle and no schedule.</p>
      <p class="note">Intro is a stand-in from the current about page. Matt rewrites it.</p>
      <section class="contact" aria-labelledby="contact-heading">
        <h2 id="contact-heading">Contact</h2>
        <p><a href="${PUBLIC_MAIL}">unshared@mattdoes.online</a></p>
      </section>
      <section class="players" aria-labelledby="players-heading">
        <h2 id="players-heading">Players</h2>
        <div class="slot">
          <p class="kicker">Bandcamp</p>
          <p>Player embed goes here. No release URL is on file for this preview.</p>
        </div>
        <iframe class="apple" title="verism RIP on Apple Music" src="https://embed.music.apple.com/us/artist/verism-rip/1676956374" height="450" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation" allow="autoplay; encrypted-media; fullscreen"></iframe>
        <ul class="outlinks">
          <li><a href="https://music.apple.com/us/artist/verism-rip/1676956374">Apple Music</a></li>
          <li><a href="https://open.spotify.com/artist/617fKVTXkDafXJshlNUzF3">Spotify</a></li>
        </ul>
      </section>
      ${redaction(`<p>The public address is the one above. The night operator signs Lucia. Her carrier is not listed with the anomalies.</p>
          <p><a href="../frequency/">Open the night file</a></p>`)}`,
});

const frequency = shell({
  depth: 1,
  polarity: 'field',
  current: 'frequency',
  showVerbNav: true,
  title: 'night frequency · signal / station',
  description: 'A carrier that is not on the board.',
  main: `<h1 class="sign"><span class="sign-small">off the board</span> night frequency</h1>
      <section class="prize" aria-labelledby="prize-heading">
        <p class="kicker">Carrier locked</p>
        <h2 id="prize-heading">Lucia</h2>
        <p><a href="${PRIZE}">send a transmission</a></p>
        <p>luciadoes@mail.grokbot.com</p>
        <p>She logs what arrives. Nothing answers by itself.</p>
      </section>`,
});

const missing = shell({
  depth: 0,
  polarity: 'field',
  current: 'lost',
  anomaliesOpen: true,
  title: '404 no carrier · signal / station',
  description: 'This frequency is not assigned.',
  main: `<h1 class="sign"><span class="sign-small">404</span> no carrier</h1>
      <p class="lede">This frequency is not assigned. The board is still on the air.</p>
      <p><a href="./">Return to the station</a></p>
      <p><a href="#anomalies">Index of anomalies</a></p>`,
});

const files = {
  'index.html': home,
  'watch/index.html': watch,
  'listen/index.html': listen,
  'unshared/index.html': unshared,
  'frequency/index.html': frequency,
  '404.html': missing,
};

const publicFiles = ['index.html', 'watch/index.html', 'listen/index.html', 'unshared/index.html', '404.html'];

for (const [rel, html] of Object.entries(files)) {
  const dest = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
}

for (const rel of publicFiles) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (html.includes('luciadoes@mail.grokbot.com') || html.includes(PRIZE)) {
    throw new Error(`${rel} lists the hidden prize`);
  }
}

const freqHtml = fs.readFileSync(path.join(ROOT, 'frequency', 'index.html'), 'utf8');
if (!freqHtml.includes(PRIZE)) throw new Error('frequency page is missing the prize');
const unsharedHtml = fs.readFileSync(path.join(ROOT, 'unshared', 'index.html'), 'utf8');
if (!unsharedHtml.includes(PUBLIC_MAIL)) throw new Error('unshared is missing the public contact');

console.log(`wrote ${Object.keys(files).length} pages`);
