import { site, nav } from './content.mjs';

export const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Renders a <picture> that prefers the generated .webp and falls back to the original. */
export function picture(src, alt, { className = '', sizes = '100vw', eager = false, width, height } = {}) {
  const webp = src.replace(/\.(jpe?g|png)$/i, '.webp');
  const loading = eager ? 'eager' : 'lazy';
  const priority = eager ? ' fetchpriority="high" decoding="async"' : ' decoding="async"';
  const dims = width && height ? ` width="${width}" height="${height}"` : '';
  return `<picture class="${className}">
        <source type="image/webp" srcset="${webp}" sizes="${sizes}">
        <img src="${src}" alt="${esc(alt)}" loading="${loading}"${priority}${dims}>
      </picture>`;
}

export function eyebrow(text) {
  return `<p class="eyebrow"><span class="eyebrow__tick" aria-hidden="true"></span><span class="eyebrow__text">${esc(text)}</span></p>`;
}

export function button(label, href, variant = 'primary') {
  return `<a class="btn btn--${variant}" href="${href}">
        <span>${esc(label)}</span>
        <svg class="btn__arrow" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M1 8h13M9 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/></svg>
      </a>`;
}

const logoMark = `<svg class="logo__mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <path d="M4 30 L14 10 L36 10 L26 30 Z" fill="currentColor"/>
      <path d="M4 30 L14 10" fill="none" stroke="currentColor" stroke-width="0"/>
    </svg>`;

function navMarkup(current) {
  return nav
    .map((item) => {
      const active = current === item.href || (item.children || []).some((c) => c.href === current);
      if (!item.children) {
        return `<li class="nav__item"><a class="nav__link${active ? ' is-active' : ''}" href="${item.href}">${esc(item.label)}</a></li>`;
      }
      const cols = item.children
        .map(
          (c) =>
            `<li><a class="mega__link${current === c.href ? ' is-active' : ''}" href="${c.href}"><span>${esc(c.label)}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8h13M9 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/></svg></a></li>`
        )
        .join('\n              ');
      return `<li class="nav__item nav__item--has-mega">
            <button class="nav__link nav__link--toggle${active ? ' is-active' : ''}" type="button" aria-expanded="false" aria-controls="mega-services" data-href="${item.href}">
              ${esc(item.label)}
              <svg class="nav__chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/></svg>
            </button>
            <div class="mega" id="mega-services" hidden>
              <div class="mega__inner">
                <div class="mega__intro">
                  <p class="eyebrow"><span class="eyebrow__tick" aria-hidden="true"></span>What we do</p>
                  <p class="mega__blurb">Thirteen service lines delivered in-house, from milling and reinstatement through to line marking and traffic management.</p>
                  <a class="mega__all" href="services.html">All services<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8h13M9 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/></svg></a>
                </div>
                <ul class="mega__list">
              ${cols}
                </ul>
              </div>
            </div>
          </li>`;
    })
    .join('\n          ');
}

export function header(current, { overHero = false } = {}) {
  return `<a class="skip-link" href="#main">Skip to content</a>
    <header class="header${overHero ? ' header--over' : ''}" data-header>
      <div class="header__inner">
        <a class="logo" href="index.html" aria-label="${esc(site.name)} — home">
          <img src="assets/img/brand/rck-logo.png" alt="${esc(site.name)}" width="565" height="101">
        </a>

        <nav class="nav" aria-label="Primary">
          <ul class="nav__list">
          ${navMarkup(current)}
          </ul>
        </nav>

        <div class="header__actions">
          <a class="header__phone" href="${site.phone.href}">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5c0 5.5 4.5 10 10 10l1-2.2-3-1.4-1.3 1.3a11 11 0 0 1-4.4-4.4L6.1 5.5 4.7 2.5Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
            <span>${esc(site.phone.display)}</span>
          </a>
          ${button('Get a quote', 'contact.html', 'accent')}
          <button class="burger" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="Open menu" data-burger>
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
    </header>

    <div class="mobile-nav" id="mobile-nav" hidden data-mobile-nav>
      <div class="mobile-nav__scroll">
        <p class="eyebrow"><span class="eyebrow__tick" aria-hidden="true"></span>Menu</p>
        <ul class="mobile-nav__list">
          <li><a href="index.html">Home</a></li>
          <li><a href="services.html">What we do</a></li>
          ${nav[0].children.map((c) => `<li class="is-sub"><a href="${c.href}">${esc(c.label)}</a></li>`).join('\n          ')}
          <li><a href="about.html">About</a></li>
          <li><a href="gallery.html">Gallery</a></li>
          <li><a href="contact.html">Contact</a></li>
        </ul>
        <div class="mobile-nav__foot">
          <a class="mobile-nav__call" href="${site.phone.href}">${esc(site.phone.display)}</a>
          <a class="mobile-nav__mail" href="mailto:${site.email}">${esc(site.email)}</a>
        </div>
      </div>
    </div>`;
}

export function ctaBand() {
  return `<section class="cta-band" data-reveal>
      <div class="container cta-band__inner">
        <div>
          ${eyebrow('Contact us today')}
          <h2 class="cta-band__title">Ready when you are — including nights and weekends.</h2>
          <p class="cta-band__lede">All of our work is programmed to cause as minimal disruption to our customers as possible.</p>
        </div>
        <div class="cta-band__actions">
          <a class="cta-band__phone" href="${site.phone.href}">
            <span class="cta-band__phone-label">Call now</span>
            <span class="cta-band__phone-number">${esc(site.phone.display)}</span>
          </a>
          ${button('Send us a message', 'contact.html', 'ghost')}
        </div>
      </div>
    </section>`;
}

export function footer() {
  const serviceLinks = nav[0].children
    .map((c) => `<li><a href="${c.href}">${esc(c.label)}</a></li>`)
    .join('\n            ');
  return `<footer class="footer">
      <div class="container footer__inner">
        <div class="footer__brand">
          <img class="footer__logo" src="assets/img/brand/rck-logo.png" alt="${esc(site.name)}" width="565" height="101" loading="lazy">
          <p class="footer__tagline">${esc(site.tagline)}. Nationwide, Auckland based, family owned since ${site.established}.</p>
          <div class="footer__badges">
            <img src="assets/img/brand/totika.png" alt="Tōtika prequalified" loading="lazy">
          </div>
        </div>

        <div class="footer__col">
          <h2 class="footer__heading">What we do</h2>
          <ul class="footer__list">
            ${serviceLinks}
          </ul>
        </div>

        <div class="footer__col">
          <h2 class="footer__heading">Company</h2>
          <ul class="footer__list">
            <li><a href="about.html">About us</a></li>
            <li><a href="gallery.html">Gallery</a></li>
            <li><a href="contact.html">Contact us</a></li>
            <li><a href="privacy-policy.html">Privacy policy</a></li>
            <li><a href="${site.facebook}" rel="noopener">Facebook</a></li>
          </ul>
        </div>

        <div class="footer__col footer__col--contact">
          <h2 class="footer__heading">Get in touch</h2>
          <ul class="footer__list footer__list--contact">
            <li><a href="${site.phone.href}">${esc(site.phone.display)}</a></li>
            <li><a href="${site.phoneAlt.href}">${esc(site.phoneAlt.display)}</a></li>
            <li><a href="mailto:${site.email}">${esc(site.email)}</a></li>
            <li><a href="mailto:${site.emailSales}">${esc(site.emailSales)}</a></li>
          </ul>
          <address class="footer__address">
            ${esc(site.address.street)}<br>
            ${esc(site.address.suburb)}, ${esc(site.address.city)} ${esc(site.address.postcode)}<br>
            ${esc(site.address.country)}
          </address>
        </div>
      </div>

      <div class="container footer__bar">
        <p>&copy; <span data-year>${new Date().getFullYear()}</span> ${esc(site.legalName)}. All rights reserved.</p>
        <p class="footer__bar-right">Asphalt · Concrete · Reinstatement · Traffic management</p>
      </div>
    </footer>

    <a class="sticky-call" href="${site.phone.href}" aria-label="Call ${esc(site.phone.display)}">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5c0 5.5 4.5 10 10 10l1-2.2-3-1.4-1.3 1.3a11 11 0 0 1-4.4-4.4L6.1 5.5 4.7 2.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
      <span>Call ${esc(site.phone.display)}</span>
    </a>`;
}

function jsonLd(page) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'GeneralContractor',
    '@id': `${site.url}/#organisation`,
    name: site.name,
    legalName: site.legalName,
    description: site.description,
    url: site.url,
    telephone: site.phone.display,
    email: site.email,
    foundingDate: String(site.established),
    image: `${site.url}/assets/img/work/milling-1.jpg`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.address.street,
      addressLocality: site.address.suburb,
      addressRegion: site.address.city,
      postalCode: site.address.postcode,
      addressCountry: 'NZ',
    },
    areaServed: { '@type': 'Country', name: 'New Zealand' },
    sameAs: [site.facebook],
  };
  if (page.breadcrumb) {
    return [data, page.breadcrumb];
  }
  return data;
}

export function page({
  title,
  description,
  current,
  body,
  overHero = false,
  preload = null,
  breadcrumb = null,
  bodyClass = '',
}) {
  const fullTitle = current === 'index.html' ? `${site.name} | ${site.tagline}` : `${title} | ${site.name}`;
  const ld = JSON.stringify(jsonLd({ breadcrumb }), null, 2);
  return `<!DOCTYPE html>
<html lang="en-NZ">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${site.url}/${current === 'index.html' ? '' : current}">
  <meta name="theme-color" content="#0b0c0c">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(site.name)}">
  <meta property="og:title" content="${esc(fullTitle)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${site.url}/${current === 'index.html' ? '' : current}">
  <meta property="og:image" content="${site.url}/assets/img/work/milling-1.jpg">
  <meta name="twitter:card" content="summary_large_image">

  <link rel="icon" href="assets/img/brand/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="assets/img/brand/apple-touch-icon.png">

  <link rel="preload" as="font" type="font/woff2" href="assets/fonts/archivo-latin.woff2" crossorigin>
  <link rel="preload" as="font" type="font/woff2" href="assets/fonts/inter-latin.woff2" crossorigin>
  ${preload ? `<link rel="preload" as="image" href="${preload.replace(/\.(jpe?g|png)$/i, '.webp')}" type="image/webp" fetchpriority="high">` : ''}
  <link rel="stylesheet" href="assets/css/site.css">

  <script type="application/ld+json">
${ld}
  </script>
</head>
<body class="${bodyClass}">
${header(current, { overHero })}

  <main id="main">
${body}
  </main>

${footer()}

  <script src="assets/js/site.js" defer></script>
</body>
</html>
`;
}
