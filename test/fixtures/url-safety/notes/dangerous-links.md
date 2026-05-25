---
publish: journal
title: Dangerous links fixture
slug: dangerous-links
date: 2026-02-01
summary: Authored Markdown links carrying unsafe schemes and attribute-breaking text.
---

A paragraph with a [javascript scheme link](javascript:alert(1)) that must be
neutralized by the build's scheme allowlist.

A second [data URI link](data:text/html,<script>alert(1)</script>) which is
also not on the allowlist.

A [vbscript link](vbscript:msgbox(1)) for good measure.

A link whose URL tries to break out of the href attribute:
[quote breakout](https://example.com/"onmouseover="alert(1)).

And a perfectly normal [safe link](https://example.com/page) which must
survive untouched.

An inline image with a poisoned source: ![bad image](javascript:alert(2)).
