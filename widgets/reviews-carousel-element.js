/*
 * <shine-reviews> -- the Google reviews carousel as a Wix Custom Element.
 *
 * Why this exists alongside reviews-carousel.html:
 * the .html version is embedded in Wix as an iframe, and Google never
 * attributes iframe content to the parent page. The reviews were doing
 * nothing for the homepage's rankings. A Custom Element renders into the
 * homepage's OWN DOM instead, so the review text is part of the page.
 *
 * Consequences of living in the parent page rather than an iframe:
 *   - No style isolation. Every rule below is scoped to the `shine-reviews`
 *     host and every class is `sr-` prefixed so nothing leaks either way.
 *     Deliberately NOT using shadow DOM: light DOM keeps the review text
 *     plainly in the page for crawlers, with no flattening step in between.
 *   - No sandbox. The old window.open/window.top popup dance was a
 *     workaround for the iframe sandbox blocking target="_blank"; a plain
 *     anchor works correctly here, so that code is gone.
 *   - No fixed height. The old postMessage height reporting is gone too,
 *     and the mobile rules no longer have to fight a clip line.
 *
 * Carries NO structured data on purpose. The homepage's EntertainmentBusiness
 * JSON-LD with aggregateRating is set on the Wix side and is correct; a second
 * aggregateRating here would compete with it.
 */
(function () {
  'use strict';

  var TAG = 'shine-reviews';
  if (window.customElements && customElements.get(TAG)) return;

  var ENDPOINT = 'https://www.texasmentalist.com/_functions/reviews';
  var CLAMP_AT = 240; // characters before we offer "Read more"
  var GAP = 18;       // must match --sr-gap below; used for scroll stepping

  var FONTS = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Montserrat:wght@400;500;600;700&display=swap';

  var CSS = [
    'shine-reviews{',
    '  --sr-ink:#000; --sr-panel:#141210; --sr-cream:#f4efe6; --sr-muted:#a99f8e;',
    '  --sr-gold:#c9a24a; --sr-gold-soft:#e3c77e; --sr-line:rgba(201,162,74,.28);',
    '  --sr-gap:18px;',
    /* Paints its own black background, exactly as the old iframe did via
       html,body{background:#000}. Transparent was tried first so the host
       would inherit the Wix section colour -- but the section it sits in is
       white, so the whole rail rendered on white. If the surrounding section
       is ever made dark, this can go back to transparent. */
    '  display:none; background:var(--sr-ink);',
    '  font-family:"Montserrat","Avenir Next","Segoe UI",Helvetica,Arial,sans-serif;',
    '  color:var(--sr-cream); -webkit-font-smoothing:antialiased;',
    '}',
    /* Vertical padding so the black reads as a deliberate band rather than a
       tight box. The iframe got this for free from its fixed 640px height. */
    'shine-reviews[data-ready]{display:block;padding:34px 0 30px;}',
    'shine-reviews *{box-sizing:border-box;}',

    'shine-reviews .sr-head{text-align:center;padding:0 20px 22px;}',
    'shine-reviews .sr-head h2{',
    '  font-family:"Playfair Display",Georgia,serif;font-weight:800;',
    '  font-size:clamp(26px,4.2vw,40px);line-height:1.15;margin:0;',
    '  background:linear-gradient(90deg,#fff,var(--sr-gold-soft));',
    '  -webkit-background-clip:text;background-clip:text;color:transparent;',
    '}',
    'shine-reviews .sr-rating{',
    '  margin-top:12px;display:flex;align-items:center;justify-content:center;',
    '  gap:10px;flex-wrap:wrap;font-size:14px;color:var(--sr-muted);',
    '}',
    'shine-reviews .sr-stars{color:var(--sr-gold);letter-spacing:2px;font-size:17px;}',
    'shine-reviews .sr-rating strong{color:var(--sr-cream);font-weight:600;}',

    'shine-reviews .sr-viewport{overflow:hidden;padding:4px 0;}',
    'shine-reviews .sr-track{',
    '  display:flex;gap:var(--sr-gap);',
    '  padding:0 max(20px, calc((100% - 1120px) / 2));',
    '  overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;',
    '  scrollbar-width:none;-ms-overflow-style:none;margin:0;',
    '}',
    'shine-reviews .sr-track::-webkit-scrollbar{display:none;}',

    'shine-reviews .sr-card{',
    '  flex:0 0 calc((100% - 36px) / 3);scroll-snap-align:start;',
    '  background:var(--sr-panel);border:1px solid var(--sr-line);',
    '  border-radius:12px;padding:24px 24px 20px;',
    '  display:flex;flex-direction:column;gap:12px;min-height:230px;',
    '}',
    'shine-reviews .sr-cstars{color:var(--sr-gold);letter-spacing:2px;font-size:15px;}',
    'shine-reviews .sr-card blockquote{',
    '  color:var(--sr-cream);font-size:14.5px;line-height:1.6;',
    '  font-style:italic;margin:0;padding:0;border:0;quotes:none;',
    '}',
    'shine-reviews .sr-card blockquote.sr-clamped{',
    '  display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden;',
    '}',
    'shine-reviews .sr-readmore{',
    '  align-self:flex-start;background:none;border:none;padding:0;',
    '  color:var(--sr-gold-soft);font:inherit;font-size:12.5px;font-style:normal;',
    '  cursor:pointer;text-decoration:underline;',
    '}',
    'shine-reviews .sr-readmore:hover{color:var(--sr-gold);}',
    'shine-reviews .sr-meta{margin-top:auto;padding-top:12px;border-top:1px solid rgba(255,255,255,.06);}',
    'shine-reviews .sr-who{color:var(--sr-cream);font-size:13.5px;font-weight:600;}',
    'shine-reviews .sr-ctx{color:var(--sr-muted);font-size:12px;margin-top:3px;}',
    'shine-reviews .sr-via{',
    '  color:var(--sr-muted);font-size:10.5px;letter-spacing:.06em;',
    '  margin-top:8px;display:flex;align-items:center;gap:6px;',
    '}',
    'shine-reviews .sr-g{font-family:"Playfair Display",Georgia,serif;font-weight:800;font-size:13px;color:var(--sr-gold-soft);line-height:1;}',

    'shine-reviews .sr-controls{',
    '  display:flex;align-items:center;justify-content:center;',
    '  gap:14px;margin-top:20px;padding:0 20px;flex-wrap:wrap;',
    '}',
    'shine-reviews .sr-nav{',
    '  width:42px;height:42px;border-radius:50%;',
    '  background:var(--sr-panel);border:1px solid var(--sr-line);',
    '  color:var(--sr-gold-soft);font-size:17px;line-height:1;cursor:pointer;',
    '  display:flex;align-items:center;justify-content:center;',
    '  touch-action:manipulation;-webkit-tap-highlight-color:transparent;',
    '}',
    'shine-reviews .sr-nav:hover:not(:disabled){background:#221f1a;border-color:var(--sr-gold);}',
    'shine-reviews .sr-nav:disabled{opacity:.3;cursor:default;}',
    'shine-reviews .sr-nav:focus-visible,shine-reviews .sr-readmore:focus-visible,shine-reviews .sr-cta:focus-visible{',
    '  outline:2px solid var(--sr-gold-soft);outline-offset:3px;',
    '}',
    'shine-reviews .sr-cta{',
    '  display:inline-block;background:var(--sr-gold);color:#1a1510;',
    '  font-weight:700;letter-spacing:.05em;text-transform:uppercase;',
    '  font-size:12.5px;padding:13px 26px;border-radius:6px;text-decoration:none;',
    '  touch-action:manipulation;-webkit-tap-highlight-color:transparent;',
    '}',
    'shine-reviews .sr-cta:hover{background:var(--sr-gold-soft);color:#1a1510;}',
    'shine-reviews .sr-cta-short{display:none;}',

    '@media(max-width:900px){shine-reviews .sr-card{flex:0 0 calc((100% - 18px) / 2);}}',
    /* Mobile keeps the single-row control layout Shine asked for: arrows
       sized to content, CTA taking the remainder, nowrap so they never
       stack. The old height-clipping rules are gone -- without the fixed
       iframe there is nothing to clip against. */
    '@media(max-width:600px){',
    '  shine-reviews{--sr-gap:12px;}',
    '  shine-reviews[data-ready]{padding:24px 0 22px;}',
    '  shine-reviews .sr-card{flex:0 0 88%;padding:18px 18px 15px;min-height:0;gap:9px;}',
    '  shine-reviews .sr-track{padding:0 16px;}',
    '  shine-reviews .sr-head{padding-bottom:14px;}',
    '  shine-reviews .sr-head h2{font-size:clamp(22px,6.4vw,28px);}',
    '  shine-reviews .sr-rating{margin-top:8px;font-size:13px;}',
    '  shine-reviews .sr-avg{display:none;}',
    '  shine-reviews .sr-card blockquote{font-size:14px;line-height:1.5;}',
    '  shine-reviews .sr-card blockquote.sr-clamped{-webkit-line-clamp:4;}',
    '  shine-reviews .sr-meta{padding-top:9px;}',
    '  shine-reviews .sr-via{margin-top:6px;}',
    '  shine-reviews .sr-controls{margin-top:14px;gap:10px;flex-wrap:nowrap;padding:0 14px;}',
    '  shine-reviews .sr-nav{flex:0 0 auto;width:46px;height:46px;border-radius:8px;}',
    '  shine-reviews .sr-cta{flex:1 1 auto;min-width:0;text-align:center;padding:15px 8px;',
    '    font-size:11.5px;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '  shine-reviews .sr-cta-full{display:none;}',
    '  shine-reviews .sr-cta-short{display:inline;}',
    '}',
    '@media(prefers-reduced-motion:reduce){shine-reviews .sr-track{scroll-behavior:auto;}}'
  ].join('\n');

  function once(id, build) {
    if (document.getElementById(id)) return;
    var el = build();
    el.id = id;
    document.head.appendChild(el);
  }

  function injectAssets() {
    once('sr-styles', function () {
      var s = document.createElement('style');
      s.textContent = CSS;
      return s;
    });
    once('sr-fonts', function () {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = FONTS;
      return l;
    });
  }

  function starsFor(n) {
    var r = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
  }

  // Every value from the feed is written via textContent rather than
  // interpolated into markup. In the parent page an injection here would be
  // an injection into the homepage itself, not into a sandboxed frame.
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function buildCard(rev) {
    var card = el('article', 'sr-card');
    var quoteText = rev.quote || '';
    var long = quoteText.length > CLAMP_AT;

    var stars = el('div', 'sr-cstars');
    stars.setAttribute('role', 'img');
    stars.setAttribute('aria-label', rev.rating + ' out of 5 stars');
    var glyphs = el('span', null, starsFor(rev.rating));
    glyphs.setAttribute('aria-hidden', 'true');
    stars.appendChild(glyphs);
    card.appendChild(stars);

    var quote = el('blockquote', long ? 'sr-clamped' : null, quoteText);
    card.appendChild(quote);

    if (long) {
      var btn = el('button', 'sr-readmore', 'Read more');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        var clamped = quote.classList.toggle('sr-clamped');
        btn.textContent = clamped ? 'Read more' : 'Show less';
      });
      card.appendChild(btn);
    }

    var meta = el('div', 'sr-meta');
    meta.appendChild(el('div', 'sr-who', rev.name));
    // Only rendered when real context exists. Never invented.
    if (rev.eventContext) meta.appendChild(el('div', 'sr-ctx', rev.eventContext));

    var via = el('div', 'sr-via');
    var g = el('span', 'sr-g', 'G');
    g.setAttribute('aria-hidden', 'true');
    via.appendChild(g);
    via.appendChild(document.createTextNode(' Review via Google'));
    meta.appendChild(via);

    card.appendChild(meta);
    return card;
  }

  class ShineReviews extends HTMLElement {}

  ShineReviews.prototype.connectedCallback = function () {
    if (this._init) return; // Wix can re-attach the node; only build once.
    this._init = true;

    injectAssets();
    var host = this;

    var headingId = 'sr-heading';
    host.setAttribute('aria-labelledby', headingId);

    var head = el('div', 'sr-head');
    var h2 = el('h2', null, 'Loved by Audiences Across Texas');
    h2.id = headingId;
    head.appendChild(h2);

    var rating = el('div', 'sr-rating');
    var starLine = el('span', 'sr-stars', '★★★★★');
    starLine.setAttribute('aria-hidden', 'true');
    var summary = el('span', 'sr-summary');
    rating.appendChild(starLine);
    rating.appendChild(summary);
    head.appendChild(rating);

    var viewport = el('div', 'sr-viewport');
    var track = el('div', 'sr-track');
    track.tabIndex = 0;
    track.setAttribute('role', 'region');
    track.setAttribute('aria-label', 'Google reviews, use arrow keys to scroll');
    viewport.appendChild(track);

    var controls = el('div', 'sr-controls');
    var prev = el('button', 'sr-nav', '‹');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous reviews');
    var next = el('button', 'sr-nav', '›');
    next.type = 'button';
    next.setAttribute('aria-label', 'Next reviews');

    // Label shortens on narrow screens so the row fits one line. Attribution
    // isn't lost either way -- every card carries "Review via Google".
    var cta = el('a', 'sr-cta');
    cta.target = '_blank';
    cta.rel = 'noopener noreferrer';
    cta.setAttribute('aria-label', 'View all Google reviews');
    cta.appendChild(el('span', 'sr-cta-full', 'View All Google Reviews'));
    cta.appendChild(el('span', 'sr-cta-short', 'All Reviews'));

    controls.appendChild(prev);
    controls.appendChild(cta);
    controls.appendChild(next);

    host.appendChild(head);
    host.appendChild(viewport);
    host.appendChild(controls);

    function step() {
      var card = track.querySelector('.sr-card');
      return card ? card.getBoundingClientRect().width + GAP : 320;
    }
    function syncNav() {
      var maxScroll = track.scrollWidth - track.clientWidth - 2;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= maxScroll;
    }

    prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
    next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); });
    track.addEventListener('scroll', syncNav, { passive: true });
    window.addEventListener('resize', syncNav);
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); track.scrollBy({ left: step(), behavior: 'smooth' }); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); track.scrollBy({ left: -step(), behavior: 'smooth' }); }
    });

    fetch(ENDPOINT)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.configured || !Array.isArray(data.reviews) || !data.reviews.length) {
          return; // stays hidden -- never render an empty or broken rail
        }

        data.reviews.forEach(function (rev) { track.appendChild(buildCard(rev)); });

        var s = data.summary || {};
        summary.textContent = '';
        var label = s.totalReviewCount
          ? s.totalReviewCount + ' Five-Star Google Reviews'
          : 'Five-Star Google Reviews';
        summary.appendChild(el('strong', null, label));
        // Hidden on mobile (see .sr-avg): the line wrapped onto two rows
        // and the rating collided with the Wix chat bubble. Five gold stars
        // sit immediately beside it, so nothing is really lost.
        if (s.averageRating) {
          summary.appendChild(el(
            'span', 'sr-avg',
            ' ·  ' + Number(s.averageRating).toFixed(1) + ' average rating'
          ));
        }

        if (s.reviewsUrl) cta.href = s.reviewsUrl;
        else cta.style.display = 'none';

        host.setAttribute('data-ready', '');
        syncNav();
      })
      .catch(function () { /* stays hidden -- homepage unaffected */ });
  };

  customElements.define(TAG, ShineReviews);
})();
