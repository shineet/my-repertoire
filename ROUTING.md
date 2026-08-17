# Subdomain routing and why it looks inconsistent

`vercel.json` has three rewrites and three redirects. That is deliberate, not
drift. The rationale lives here rather than in the file because Vercel validates
`vercel.json` against a strict schema and rejects unknown top-level keys, so a
comment block in there fails the build.

Every subdomain below is an alias of this one Vercel project, so all of them can
serve all paths. What differs is which URL each page claims as its canonical.

## City subdomains: the page IS the root

| subdomain | serves |
|---|---|
| `houston.texasmentalist.com/` | `/houston-corporate-mentalist` |
| `dallas.texasmentalist.com/` | `/dallas-corporate-mentalist` |
| `sanantonio.texasmentalist.com/` | `/san-antonio-corporate-mentalist` |

These are **rewrites**, so the root returns 200 and there is no redirect at all.
That is what each page's own `<link rel="canonical">` already claims, and it is
what `sitemap.xml` lists.

**They were redirects until 2026-08-17, and that was a real bug.** The sitemap
pointed Google at the subdomain root, the root 307-redirected away, and the page
it landed on nominated a canonical (the root) that served no content. Search
Console reported "Page with redirect" on 2026-08-17, and the three city landing
pages were at risk of never being indexed under the URL they claim.

The long path still resolves, so the content is reachable at two URLs on that
host. That is exactly what a canonical tag is for. Deliberately not papered over
with a second redirect back to the root, which would only add a rule to reason
about later for no crawler benefit.

## Press / private / FAQ: the page is the PATH

| subdomain | redirects to |
|---|---|
| `press.texasmentalist.com/` | `/press-kit` |
| `private.texasmentalist.com/` | `/private-events` |
| `faq.texasmentalist.com/` | `/magician-vs-mentalist` |

Opposite intent: these pages' canonicals point at the path, the sitemap lists
the path, and the bare subdomain is only a convenience shortcut worth keeping.
So they stay **redirects** — but permanent (308), not temporary (307). A
temporary redirect tells Google to keep treating the original URL as the real
one and not to consolidate signals onto the destination, which is the opposite
of what is wanted for a structural route that is not going to change.

Note that 308 is cached hard by browsers. If one of these destinations ever
changes, expect to test in a private window.

## If you add a subdomain

Decide first which URL should be canonical, then pick the matching tool:

- Canonical is the bare subdomain → **rewrite**, and set the page's canonical
  tag to the root.
- Canonical is a path → **redirect** with `"permanent": true`, and set the
  page's canonical tag to that path.

Then make `sitemap.xml` list the canonical URL, and only the canonical URL.
A sitemap must never list a URL that redirects — that is the whole cause of the
2026-08-17 incident.
