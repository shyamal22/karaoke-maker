/**
 * Bundles the generated site into ONE self-contained HTML file for sharing as
 * a hosted preview.
 *
 *   node tools/build-preview.mjs [imageDir] [outFile]
 *
 * Every page body, the stylesheet, the fonts and the photography are inlined,
 * and a small router swaps pages on click so the preview behaves like the real
 * multi-page site with no network access at all.
 *
 * This is a preview artifact only — the deployable site is the .html files in
 * the project root.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const imageDir = process.argv[2] || join(root, 'assets/img');
const outFile = process.argv[3] || join(root, 'preview.html');

/* --- Images --------------------------------------------------------------- */

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const images = {};
let imageBytes = 0;
for (const file of walk(imageDir)) {
  if (!/\.webp$/i.test(file)) continue;
  const key = relative(imageDir, file).replace(/\\/g, '/');
  const b64 = readFileSync(file).toString('base64');
  images[key] = `data:image/webp;base64,${b64}`;
  imageBytes += b64.length;
}
console.log(`  ${Object.keys(images).length} images inlined (${Math.round(imageBytes / 1024)}KB base64)`);

/* --- Stylesheet, with fonts inlined --------------------------------------- */

let css = readFileSync(join(root, 'assets/css/site.css'), 'utf8');
css = css.replace(/url\('\.\.\/fonts\/([^']+)'\)/g, (_, name) => {
  const b64 = readFileSync(join(root, 'assets/fonts', name)).toString('base64');
  return `url(data:font/woff2;base64,${b64})`;
});

/* --- Behaviour script, made re-runnable ----------------------------------- */

let js = readFileSync(join(root, 'assets/js/site.js'), 'utf8');
js = js.replace('(function () {', 'window.__initSite = function () {');
js = js.replace(/\}\)\(\);\s*$/, '};\n');
if (!js.includes('window.__initSite')) throw new Error('could not wrap site.js');

/* --- Page bodies ---------------------------------------------------------- */

const pages = {};
for (const file of readdirSync(root).filter((f) => f.endsWith('.html') && f !== 'preview.html')) {
  let html = readFileSync(join(root, file), 'utf8');
  html = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'));
  html = html.slice(html.indexOf('>') + 1);

  // The behaviour script is inlined once for the whole bundle.
  html = html.replace(/<script src="assets\/js\/site\.js"[^>]*><\/script>/g, '');

  // <picture> fallbacks are redundant when everything is an inlined WebP.
  html = html.replace(/<source[^>]*>/g, '');

  // Point every image at the inlined map instead of a network path.
  html = html.replace(/src="assets\/img\/([^"]+)"/g, (_, p) => `data-k="${p.replace(/\.(jpe?g|png)$/i, '.webp')}"`);

  // The map embed needs a network request the preview cannot make.
  html = html.replace(
    /<div class="map"[\s\S]*?<\/div>/,
    '<p class="preview-note">The interactive map is omitted from this preview — it loads from Google on the live site.</p>'
  );

  // Mark the build as a preview so it is never mistaken for the live site.
  html = html.replace(
    /(All rights reserved\.)/,
    '$1 <span class="preview-flag">Design preview</span>'
  );

  pages[file] = html;
}
console.log(`  ${Object.keys(pages).length} pages inlined`);

/* --- Assemble ------------------------------------------------------------- */

const out = `<title>RCK Group Redesign</title>
<style>
${css}

/* --- Preview-only chrome ------------------------------------------------- */
.preview-note {
  margin-top: clamp(3rem, 6vw, 5rem);
  padding: 1.25rem 1.5rem;
  border-left: 3px solid var(--accent);
  background: var(--paper-2);
  color: var(--text-muted);
  font-size: var(--step--1);
}
/* The router moves focus to the new page heading for screen readers; the
   heading is not an interactive control, so it should not draw a ring. */
#app h1[tabindex='-1']:focus,
#app h1[tabindex='-1']:focus-visible {
  outline: none;
}
.preview-flag {
  display: inline-block;
  margin-left: 0.6rem;
  padding: 0.15rem 0.5rem;
  border: 1px solid var(--line-dark);
  border-radius: 2px;
  font-family: 'Archivo', sans-serif;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--accent);
}
</style>

<div id="app"></div>

<script>
const IMAGES = ${JSON.stringify(images)};
const PAGES = ${JSON.stringify(pages)};
</script>

<script>
${js}
</script>

<script>
(function () {
  'use strict';
  var app = document.getElementById('app');

  function hydrateImages(scope) {
    scope.querySelectorAll('[data-k]').forEach(function (el) {
      var src = IMAGES[el.getAttribute('data-k')];
      if (src) el.src = src;
      el.removeAttribute('data-k');
    });
  }

  function render(name, push) {
    var html = PAGES[name] || PAGES['404.html'];
    app.innerHTML = html;
    hydrateImages(app);
    document.body.className = '';
    window.scrollTo(0, 0);
    window.__initSite();
    if (push) history.pushState({ page: name }, '', '#' + name);
    // Move focus to the new page heading so keyboard and screen-reader users
    // land in the right place — but not on first paint, where nothing has
    // navigated yet.
    var h1 = app.querySelector('h1');
    if (h1 && push) {
      h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
    }
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || !/\\.html$/.test(href) || /^https?:/.test(href)) return;
    e.preventDefault();
    render(href, true);
  });

  window.addEventListener('popstate', function () {
    render((location.hash || '#index.html').slice(1), false);
  });

  render((location.hash || '#index.html').slice(1), false);
})();
</script>
`;

writeFileSync(outFile, out);
console.log(`\n  ✓ ${relative(process.cwd(), outFile)} — ${(statSync(outFile).size / 1024 / 1024).toFixed(2)}MB`);
