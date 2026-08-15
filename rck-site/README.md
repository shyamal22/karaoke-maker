# RCK Group — website redesign

A rebuilt marketing site for [rckgroup.co.nz](https://www.rckgroup.co.nz), replacing the
current WordPress/Divi build with a hand-written static site.

All copy, contact details, service descriptions and photography are RCK's own, pulled
from the existing site — nothing has been invented. The change is in structure, typography,
hierarchy and pace, aimed at a more premium, contractor-of-scale feel.

## What changed

**Design**

- Asphalt-dark base (`#0b0c0c`) with warm off-white paper, RCK green used as a signal
  colour rather than decoration. Yellow is reserved for the logo.
- Archivo (display) + Inter (text), self-hosted, with a fluid `clamp()` type scale — no
  breakpoint jumps between phone and desktop.
- Full-bleed hero with a layered scrim, staggered line reveal and a fact rail underneath.
- Editorial section rhythm: eyebrow → oversized statement → supporting column, alternating
  light and dark bands so the page has a pulse instead of one flat colour.
- Numbered service cards that fill with the relevant photograph on hover.
- Scroll reveals, a client-logo marquee and count-safe motion — all disabled under
  `prefers-reduced-motion`.

**Structure**

- A services mega menu replaces the old dropdown, so all nine service lines are one hover away.
- Every service page follows the same spine: hero → statement → body → what-it-covers →
  photos → sticky quote card.
- Four service lines that existed as orphan pages on the old site (sweeping, joint sealing,
  aggregate supply, haulage) are now surfaced on the services index.
- A real contact page: form, both phone numbers, both email addresses, yard locations, hours,
  and a map.

**Technical**

- Static HTML. No WordPress, no plugins, no database, no monthly patching.
- Self-hosted fonts (no Google Fonts request), lazy-loaded imagery, WebP with JPEG fallback,
  hero preloaded.
- Per-page `<title>`/description, Open Graph tags, canonical URLs, `GeneralContractor` and
  `BreadcrumbList` JSON-LD, `sitemap.xml` and `robots.txt`.
- Semantic landmarks, skip link, visible focus rings, labelled form fields, alt text on every
  image, one `<h1>` per page.

## Layout

```
rck-site/
  build.mjs              generator — run this after editing content
  src/content.mjs        every word, image path and contact detail on the site
  src/layout.mjs         page shell, header, footer, shared components
  assets/css/site.css    the design system
  assets/js/site.js      header, mega menu, mobile nav, reveals, form
  assets/fonts/          self-hosted Archivo + Inter (woff2)
  assets/img/            RCK photography and client logos
  tools/optimise-images.py  resize + WebP pass over the photography
  *.html                 generated — do not hand-edit
```

## Working on it

```bash
cd rck-site
node build.mjs                      # regenerate all 16 pages
python3 -m http.server 8000         # preview at http://localhost:8000
```

Change copy in `src/content.mjs` and re-run `build.mjs`. The HTML files are generated
output; edits made directly to them are overwritten on the next build.

After adding new photographs:

```bash
pip install Pillow
python3 tools/optimise-images.py    # downscales to 1600px and writes .webp siblings
```

## Before it goes live

1. **Contact form.** `contact.formEndpoint` in `src/content.mjs` is empty, so the form
   currently falls back to opening the visitor's email client with the fields filled in.
   Set it to a Formspree/Netlify/server endpoint for proper submissions. A honeypot field
   is already in place; add a captcha if spam becomes a problem.
2. **Check the details.** Phone numbers, both email addresses, the Whenuapai address and the
   Silverdale yard were taken from the current site — confirm they are still correct.
3. **Accreditations.** The SiteWise badge shown is the 2022/23 artwork carried over from the
   existing site. Swap in the current year's badge.
4. **Photography.** The imagery is the existing site's library. A day with a photographer on
   two or three live sites would lift this further than any amount of code.
5. **Client logos.** Amotai, Citycare, Downer, Fulton Hogan, Higgins and Ventia are shown as
   on the current site. Confirm each is happy to be named.

## Deploying

The output is plain files — upload the contents of `rck-site/` to any static host
(Netlify, Cloudflare Pages, GitHub Pages, or the existing hosting). Point `404.html` at the
host's not-found handler and update `site.url` in `src/content.mjs` if the domain changes.
