# Journal and making are not published

The public site no longer carries long-form writing. Journal entries and
making notes — essays and build posts such as “porting to react for a
future i want” — are off the site, along with the routes that listed them.

We decided:

- **Vault.** `publish: journal` and `publish: making` stay valid so an
  older vault still builds. Intake does not put those notes in the article
  list or the wikilink index. Two notes that would have shared a slug still
  fail the build. `publish: thoughts` is unchanged (ADR 0015).
- **Routes.** Do not generate `/blog/`, `/journal/`, `/making/`,
  `/journal/<slug>/`, `/making/<slug>/`, or topic paths derived from those
  notes. Do not redirect those paths at another page. Unknown paths 404.
- **Feeds.** Do not write `feed.xml`. Do not advertise it from the footer
  or from an Atom autodiscovery link. `/rss.xml` and `/atom.xml` are not
  aliases of a missing feed.
- **Nav.** The topbar is listening and about. The homepage shelves are
  listening, digs, movies, and grok says. The footer keeps those logs,
  colophon, and say hi.
- **Homepage.** No featured post and no recent-writing list. The intro is
  the name, the short identity, and the tagline, with the shelves under it.

Digs, movies, grok, listening, about, search, colophon, and the design
sketches stay.
