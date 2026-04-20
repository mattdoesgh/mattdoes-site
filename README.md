# mattdoes.online

source for [mattdoes.online](https://mattdoes.online) — my personal site. i write here, think out loud here, and log what i'm listening to here.

## what's on it

- **journal** — reflective posts, usually weighing a tradeoff.
- **making** — building-in-public notes on projects, tools, and stack choices.
- **thoughts** — short, one-idea posts, time-stamped through the day.
- **listening** — recent plays pulled from Last.fm at build time.

## how it's built

static HTML generated from an Obsidian vault (`mattdoes-vault`, private repo). a small Node script walks the vault with `gray-matter` + `marked` and writes `dist/`. no framework, no templating engine, no CMS. hosted on Cloudflare Pages. a couple of Workers handle the contact form (via MailChannels, logged to D1) and the Last.fm feed. fonts are self-hosted — JetBrains Mono and Fraunces — no Google Fonts call. no tracker, no analytics.

the vault is cloned into `./vault/` at build time via a fine-grained PAT. submodules were out because Cloudflare Pages' GitHub App auth doesn't propagate to them.

## running it

```
npm install
npm run build
```

output lands in `dist/`. serve it however.

## why like this

low vendor surface isn't an aesthetic. it's a bet that fewer moving parts now means fewer things to un-break later. the whole site is markdown, one build script, and two Workers — if any of it breaks, the fix is in this repo.
