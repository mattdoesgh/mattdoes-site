# mattdoes-contact Worker

Handles `POST https://mattdoes.online/api/contact` from `say-hi.html`.
Logs every submission to D1, sends successful ones via MailChannels.

## First-time setup

```bash
cd workers/contact
npm install

# 1. Create the D1 database
npx wrangler d1 create mattdoes-contact-log
# → copy the returned database_id into wrangler.toml

# 2. Apply the schema (local + remote)
npm run db:init
npm run db:init:remote

# 3. Set up MailChannels DKIM
#    Generate a 2048-bit RSA keypair, publish the TXT record at
#    mailchannels._domainkey.mattdoes.online, then:
npx wrangler secret put DKIM_PRIVATE_KEY
# (paste the base64 PKCS8 private key)

# 4. Deploy
npx wrangler deploy
```

## DNS prerequisites

- SPF: `v=spf1 include:relay.mailchannels.net ~all`
- DKIM: `mailchannels._domainkey.mattdoes.online` → `v=DKIM1; p=<pubkey>`
- MailChannels domain lock (required since 2023):
  `_mailchannels.mattdoes.online` → `v=mc1 cfid=<your-cf-account-id>.workers.dev`

## Eyeballing submissions

```bash
npx wrangler d1 execute mattdoes-contact-log --remote \
  --command "SELECT id, created_at, name, email, subject, mail_status FROM submissions ORDER BY id DESC LIMIT 20"
```

## Notes

- **Rate limit:** 5 submissions per IP per hour (hashed, rotates daily).
- **Honeypot:** `_hp` field. If filled, we 200 and log `honeypot_hit=1` but never send.
- **Origin check:** only accepts requests with `Origin` or `Referer` starting with `https://mattdoes.online`.
- **Failure mode:** if MailChannels fails, the submission is still logged with `mail_status='failed'` so nothing is lost.
