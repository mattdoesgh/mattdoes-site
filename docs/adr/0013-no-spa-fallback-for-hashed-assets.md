# No SPA fallback for hashed assets

Cloudflare Pages treats a project with no top-level `404.html` as a single-page
app and serves `/index.html` with **HTTP 200** for every path that is not a
real file. This site is static HTML, not an SPA, but it had no `404.html`, so
a missing `/_shared.<hash>.css` returned the homepage.

`_headers` matches the **request URL**. The `/*.css` and `/*.js` rules therefore
attached `Cache-Control: public, max-age=31536000, immutable` to that HTML
response. With `X-Content-Type-Options: nosniff`, browsers refused to apply it
(`MIME type ('text/html') is not a supported stylesheet MIME type`) and stored
the refusal for a year. A deploy race, or any wrong hash, left the site
unstyled until the filename changed. Hard refresh does not bypass `immutable`.

We decided:

- Ship `static/404.html`. Pages then 404s unknown paths instead of serving the
  homepage shell. Confirmed with
  `curl -sI https://mattdoes.online/_shared.DOESNOTEXIST.css` — that must be
  **404**, not 200, and must not carry `immutable`.
- Do not declare `/*.css` or `/*.js` in `_headers`. Emit writes one exact rule
  per CSS/JS file that exists in `dist/`, including `Content-Type: text/css`
  or `text/javascript`. A hash that is not in the build cannot inherit the
  asset cache policy.
- Pages `_redirects` cannot express this. Status codes other than the redirect
  set are unsupported (`/missing.css /404.html 404` is ignored), and a redirect
  rule runs even when the static file exists, so a `/*.css` redirect would
  steal the real stylesheets.

`/fonts/*` stays a wildcard. Those filenames are stable and are not the
deploy-race that cached HTML as CSS.
