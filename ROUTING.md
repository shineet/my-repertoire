# Subdomain routing

Every subdomain below is an alias of this one Vercel project, so all of them can
serve all paths. What makes a URL "the" URL for a page is its canonical tag, and
those three things — canonical tag, `sitemap.xml`, and what the server actually
returns — must agree. This note exists because they did not, and Search Console
caught it.

The rationale is here rather than in `vercel.json` because Vercel validates that
file against a strict schema and rejects unknown top-level keys, so a comment
block in there fails the build.

## The rule

**Each page is canonical at its PATH on its own subdomain.** The bare subdomain
is a convenience shortcut that permanently redirects there.

| subdomain root (308 →) | canonical page |
|---|---|
| `houston.texasmentalist.com/` | `/houston-corporate-mentalist` |
| `dallas.texasmentalist.com/` | `/dallas-corporate-mentalist` |
| `sanantonio.texasmentalist.com/` | `/san-antonio-corporate-mentalist` |
| `press.texasmentalist.com/` | `/press-kit` |
| `private.texasmentalist.com/` | `/private-events` |
| `faq.texasmentalist.com/` | `/magician-vs-mentalist` |

Redirects are **permanent (308)**, not temporary. A temporary redirect tells
Google to keep treating the original URL as the real one and not to consolidate
signals onto the destination, which is the opposite of what is wanted for a
structural route that is not going to change. Note that 308 is cached hard by
browsers: if a destination ever changes, test in a private window.

## What went wrong on 2026-08-17

Search Console reported "Page with redirect". Cause: the three city pages
declared their canonical as the bare subdomain **root**, and `sitemap.xml`
listed that root — but the root redirected away to the long path. So the sitemap
pointed Google at a URL that redirects, and the page it landed on nominated a
canonical that served no content. The three city landing pages were at real risk
of never being indexed under the URL they claimed.

Fixed by moving the city pages to the path-canonical pattern the other three
already used: canonical tag, JSON-LD `url`, and sitemap entry all changed to the
long path.

## The failed first attempt, so nobody repeats it

The first fix tried the opposite: keep the root as canonical and serve the page
there with a **rewrite**, eliminating the redirect entirely. It deployed clean
and returned 200, which looked like success.

It was not. **Vercel checks the filesystem before applying `rewrites`.** `/`
matches the real `index.html` at the repo root, so that file was served and the
rewrite never fired — every city subdomain root quietly returned the repertoire
page instead of the city page. A 200 with the wrong content is worse than the
redirect it replaced, and a status-code check alone does not catch it.

Two lessons worth keeping:

- A rewrite cannot override a path that already resolves to a static file. Only
  the legacy `routes` config runs before the filesystem, and it cannot coexist
  with `redirects` / `rewrites` / `headers`.
- When verifying routing, assert on the **content** (page title, canonical tag),
  never just the status code.

## If you add a subdomain

1. Put the page at a path, e.g. `/austin-corporate-mentalist`.
2. Set its `<link rel="canonical">` and its JSON-LD `url` to that full path URL.
3. Add a `"permanent": true` redirect from `/` on that host to the path.
4. Add **only the path URL** to `sitemap.xml`.

A sitemap must never list a URL that redirects. That was the whole cause of the
incident above.
