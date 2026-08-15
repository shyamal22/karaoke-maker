/**
 * Static site generator for rckgroup.co.nz.
 *
 *   node build.mjs
 *
 * Reads src/content.mjs, writes plain .html files into this folder.
 * No dependencies, no build toolchain — the output is deployable as-is.
 */

import { writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  site,
  hero,
  stats,
  intro,
  services,
  alsoOffer,
  approach,
  accreditations,
  clients,
  gallery,
  about,
  structure,
  team,
  contact,
} from './src/content.mjs';
import { page, header, footer, ctaBand, eyebrow, button, picture, esc } from './src/layout.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const out = (name, html) => {
  writeFileSync(join(root, name), html);
  console.log('  ✓', name);
};

const arrow = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8h13M9 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square"/></svg>`;

/* ------------------------------------------------------------------ *
 * Shared blocks
 * ------------------------------------------------------------------ */

function statRail() {
  return `<section class="stat-rail">
      <div class="container">
        <div class="stat-rail__grid" data-reveal-stagger>
          ${stats
            .map(
              (s) => `<div class="stat">
            <p class="stat__value">${esc(s.value)}</p>
            <p class="stat__label">${esc(s.label)}</p>
          </div>`
            )
            .join('\n          ')}
        </div>
      </div>
    </section>`;
}

function serviceCards(list = services, { dark = false } = {}) {
  return `<div class="services-grid" data-reveal-stagger>
        ${list
          .map(
            (s, i) => `<article class="service-card">
          <div class="service-card__bg" aria-hidden="true">${picture(s.image, '', { sizes: '(max-width: 620px) 100vw, 33vw' })}</div>
          <p class="service-card__n">${String(i + 1).padStart(2, '0')} —</p>
          <h3 class="service-card__title">${esc(s.title)}</h3>
          <p class="service-card__summary">${esc(s.summary)}</p>
          <p class="service-card__more">Find out more ${arrow}</p>
          <a class="service-card__link" href="${s.slug}.html"><span>${esc(s.title)}</span></a>
        </article>`
          )
          .join('\n        ')}
      </div>`;
}

/** Six division cards — the company-structure block. */
function structureSection() {
  return `<section class="section section--muted">
      <div class="container">
        <div class="section-head" data-reveal>
          <div>
            ${eyebrow(structure.eyebrow)}
            <h2 class="section-head__title">${esc(structure.headline)}</h2>
          </div>
          <div class="section-head__aside">
            <p class="lede">${esc(structure.lede)}</p>
          </div>
        </div>
        <div class="divisions" data-reveal-stagger>
          ${structure.divisions
            .map(
              (d) => `<article class="division">
            <h3 class="division__name">${esc(d.name)}</h3>
            <p class="division__covers">${esc(d.covers)}</p>
            <p class="division__body">${esc(d.body)}</p>
            ${d.lead ? `<p class="division__lead"><span>Division lead</span>${esc(d.lead)}</p>` : ''}
          </article>`
            )
            .join('\n          ')}
        </div>
      </div>
    </section>`;
}

/** People cards. Falls back to a typographic initial where there is no photo. */
function teamSection() {
  const cards = team.people
    .map(
      (p) => `<article class="person">
            <div class="person__portrait">
              ${
                p.photo
                  ? picture(p.photo, p.name, { sizes: '(max-width: 620px) 100vw, 33vw' })
                  : `<span class="person__initial" aria-hidden="true">${esc(p.name.trim().charAt(0))}</span>`
              }
            </div>
            <div class="person__body">
              <h3 class="person__name">${esc(p.name)}</h3>
              <p class="person__role">${esc(p.role)}</p>
              ${p.covers ? `<p class="person__covers">${esc(p.covers)}</p>` : ''}
              <ul class="person__contact">
                ${p.phone ? `<li><a href="${p.phone.href}">${esc(p.phone.display)}</a></li>` : ''}
                ${p.email ? `<li><a href="mailto:${p.email}">${esc(p.email)}</a></li>` : ''}
              </ul>
            </div>
          </article>`
    )
    .join('\n          ');

  return `<section class="section section--dark">
      <div class="container">
        <div class="section-head" data-reveal>
          <div>
            ${eyebrow(team.eyebrow)}
            <h2 class="section-head__title">${esc(team.headline)}</h2>
          </div>
          <div class="section-head__aside">
            <p class="lede">${esc(team.lede)}</p>
          </div>
        </div>
        <div class="team-layout${team.people.length < 3 ? ' team-layout--feature' : ''}">
          <div class="team-grid" data-reveal-stagger>
            ${cards}
          </div>
          ${
            team.people.length < 3
              ? `<aside class="team-aside" data-reveal>
            <h3 class="team-aside__title">One call covers the whole job.</h3>
            <p class="team-aside__body">Because every division is in-house, ${esc(
              site.contactName
            )} can price and programme milling, surfacing, concrete, reinstatement and traffic management on the same call — you are not chasing four subcontractors for one site.</p>
            <dl class="team-aside__list">
              <div>
                <dt>Office and accounts</dt>
                <dd><a href="mailto:${site.email}">${esc(site.email)}</a></dd>
              </div>
              <div>
                <dt>Hours</dt>
                <dd>Monday – Friday, 7am – 5pm. Night and weekend works by arrangement, and traffic management 24/7 as required.</dd>
              </div>
              <div>
                <dt>Head office</dt>
                <dd>${esc(site.address.street)}, ${esc(site.address.suburb)}, ${esc(site.address.city)}</dd>
              </div>
            </dl>
            ${team.note ? `<p class="team-note">${esc(team.note)}</p>` : ''}
          </aside>`
              : ''
          }
        </div>
        ${team.people.length >= 3 && team.note ? `<p class="team-note" data-reveal>${esc(team.note)}</p>` : ''}
      </div>
    </section>`;
}

function clientsMarquee() {
  const row = clients.logos
    .map(
      (l) =>
        `<img class="clients__logo" src="${l.file}" alt="${esc(l.name)}" loading="lazy" decoding="async">`
    )
    .join('\n          ');
  return `<section class="clients section--tight">
      <div class="container">
        ${eyebrow(clients.eyebrow)}
      </div>
      <div class="clients__track" aria-label="${esc(clients.headline)}">
          ${row}
          ${row.replace(/alt="[^"]*"/g, 'alt="" aria-hidden="true"')}
      </div>
    </section>`;
}

function pageHero({ eyebrowText, title, lede, image, alt, crumbs = [] }) {
  const crumbMarkup = crumbs.length
    ? `<nav class="breadcrumb" aria-label="Breadcrumb">
            ${crumbs
              .map((c, i) =>
                c.href
                  ? `<a href="${c.href}">${esc(c.label)}</a><span class="breadcrumb__sep" aria-hidden="true">/</span>`
                  : `<span aria-current="page">${esc(c.label)}</span>`
              )
              .join('\n            ')}
          </nav>`
    : '';
  return `<section class="page-hero">
      ${image ? `<div class="page-hero__media">${picture(image, alt || '', { sizes: '100vw', eager: true })}</div>` : ''}
      <div class="container page-hero__inner">
        ${crumbMarkup}
        ${eyebrow(eyebrowText)}
        <h1 class="page-hero__title">${esc(title)}</h1>
        ${lede ? `<p class="page-hero__lede">${esc(lede)}</p>` : ''}
      </div>
    </section>`;
}

function breadcrumbLd(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      item: `${site.url}/${c.href || ''}`.replace(/index\.html$/, ''),
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Home
 * ------------------------------------------------------------------ */

function buildHome() {
  const body = `<section class="hero">
      <div class="hero__media">${picture(hero.image, hero.alt, { sizes: '100vw', eager: true })}</div>
      <div class="hero__scrim" aria-hidden="true"></div>
      <div class="hero__inner">
        <div class="hero__content">
          ${eyebrow(hero.eyebrow)}
          <h1 class="hero__title">${hero.headline.map((l) => `<span><i>${esc(l)}</i></span>`).join('\n            ')}</h1>
          <p class="hero__lede">${esc(hero.lede)}</p>
          <div class="hero__actions">
            ${button(hero.primary.label, hero.primary.href, 'accent')}
            ${button(hero.secondary.label, hero.secondary.href, 'ghost')}
          </div>
        </div>
      </div>
      <div class="hero__scroll" aria-hidden="true">
        <span>Scroll</span>
        <span class="hero__scroll-line"></span>
      </div>
    </section>

${statRail()}

    <section class="section">
      <div class="container">
        <div class="split" data-reveal>
          <div class="split__media">${picture(intro.image, intro.alt, { sizes: '(max-width: 960px) 100vw, 50vw' })}</div>
          <div class="split__text">
            ${eyebrow(intro.eyebrow)}
            <h2 class="split__title">${esc(intro.headline)}</h2>
            <div class="split__body prose">
              ${intro.body.map((p) => `<p>${esc(p)}</p>`).join('\n              ')}
            </div>
            <ul class="split__points">
              ${intro.points.map((p) => `<li>${esc(p)}</li>`).join('\n              ')}
            </ul>
            <div class="split__actions">
              ${button('More about us', 'about.html', 'ghost')}
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--muted">
      <div class="container">
        <div class="section-head" data-reveal>
          <div>
            ${eyebrow('What we do')}
            <h2 class="section-head__title">Nine core service lines, one accountable crew.</h2>
          </div>
          <div class="section-head__aside">
            <p class="lede">Milling, surfacing, concrete, reinstatement, marking and traffic management are all delivered by our own people — so programmes hold and quality is ours to answer for.</p>
          </div>
        </div>
        ${serviceCards()}
        <div class="split__actions" style="margin-top:2.5rem" data-reveal>
          ${button('All services', 'services.html', 'ghost')}
        </div>
      </div>
    </section>

    <section class="section section--dark">
      <div class="container">
        <div class="section-head" data-reveal>
          <div>
            ${eyebrow(approach.eyebrow)}
            <h2 class="section-head__title">${esc(approach.headline)}</h2>
          </div>
          <div class="section-head__aside">
            <p class="lede">${esc(approach.lede)}</p>
          </div>
        </div>
        <div class="process" data-reveal-stagger>
          ${approach.steps
            .map(
              (s) => `<article class="process__item">
            <p class="process__n">${esc(s.n)}</p>
            <h3 class="process__title">${esc(s.title)}</h3>
            <p class="process__body">${esc(s.body)}</p>
          </article>`
            )
            .join('\n          ')}
        </div>
      </div>
    </section>

    <section class="section section--muted">
      <div class="container">
        <div class="accred" data-reveal>
          <div>
            ${eyebrow(accreditations.eyebrow)}
            <h2 class="title-3">${esc(accreditations.headline)}</h2>
            <div class="prose" style="margin-top:1.5rem"><p>${esc(accreditations.body)}</p></div>
            <div class="split__actions">
              ${button('Talk to us', 'contact.html', 'ghost')}
            </div>
          </div>
          <div class="accred__badges">
            <img src="${accreditations.image}" alt="${esc(accreditations.alt)}" loading="lazy" decoding="async">
          </div>
        </div>
      </div>
    </section>

${clientsMarquee()}

    <section class="section">
      <div class="container">
        <div class="section-head" data-reveal>
          <div>
            ${eyebrow(gallery.eyebrow)}
            <h2 class="section-head__title">${esc(gallery.headline)}</h2>
          </div>
          <div class="section-head__aside">
            <p class="lede">${esc(gallery.lede)}</p>
          </div>
        </div>
        <div class="gallery-grid" data-reveal-stagger>
          ${gallery.images
            /* Five tiles fill the 4-column grid exactly: one 2x2 feature plus
               four singles. Any other count leaves holes. */
            .slice(0, 5)
            .map(
              (g) =>
                `<figure>${picture(g.file, g.alt, { sizes: '(max-width: 620px) 50vw, 25vw' })}</figure>`
            )
            .join('\n          ')}
        </div>
        <div class="split__actions" style="margin-top:2.5rem" data-reveal>
          ${button('View the gallery', 'gallery.html', 'ghost')}
        </div>
      </div>
    </section>

${ctaBand()}`;

  return page({
    title: site.name,
    description: `${site.tagline} in Auckland and nationwide. Asphalt paving, road milling, concrete, reinstatement, line marking and traffic management. Family owned since ${site.established}.`,
    current: 'index.html',
    overHero: true,
    preload: hero.image,
    body,
  });
}

/* ------------------------------------------------------------------ *
 * Services index
 * ------------------------------------------------------------------ */

function buildServices() {
  const crumbs = [
    { label: 'Home', href: 'index.html' },
    { label: 'What we do' },
  ];
  const body = `${pageHero({
    eyebrowText: 'What we do',
    title: 'Everything from the sub-base up.',
    lede:
      'Thirteen service lines delivered in-house. Click through for the detail on each, or call us and we will tell you straight whether it is a job for us.',
    image: 'assets/img/work/rck-4.jpg',
    alt: 'RCK Group asphalt works in progress',
    crumbs,
  })}

    <section class="section">
      <div class="container">
        ${serviceCards()}
      </div>
    </section>

    <section class="section section--muted section--tight">
      <div class="container">
        <div class="section-head" data-reveal>
          <div>
            ${eyebrow('Also available')}
            <h2 class="section-head__title">Four more things we are set up for.</h2>
          </div>
          <div class="section-head__aside">
            <p class="lede">Ancillary services that sit alongside the main crews — often the difference between a tidy job and a tidy site.</p>
          </div>
        </div>
        <div class="also-grid" data-reveal-stagger>
          ${alsoOffer
            .map(
              (a) => `<article class="also-card">
            <h3>${esc(a.title)}</h3>
            <p>${esc(a.body)}</p>
          </article>`
            )
            .join('\n          ')}
        </div>
      </div>
    </section>

${ctaBand()}`;

  return page({
    title: 'What we do',
    description:
      'Asphalt paving, road milling and hire, chipseal, concrete, line marking, civil projects, recycled millings, road reinstatement and traffic management.',
    current: 'services.html',
    preload: 'assets/img/work/rck-4.jpg',
    breadcrumb: breadcrumbLd(crumbs),
    body,
  });
}

/* ------------------------------------------------------------------ *
 * Service detail pages
 * ------------------------------------------------------------------ */

function buildService(service) {
  const crumbs = [
    { label: 'Home', href: 'index.html' },
    { label: 'What we do', href: 'services.html' },
    { label: service.title },
  ];
  const others = services.filter((s) => s.slug !== service.slug);

  const body = `${pageHero({
    eyebrowText: 'What we do',
    title: service.title,
    lede: service.summary,
    image: service.image,
    alt: service.alt,
    crumbs,
  })}

    <section class="section">
      <div class="container">
        <div class="detail">
          <div data-reveal>
            <p class="detail__lede">${esc(service.lede)}</p>
            <div class="prose">
              ${service.body.map((p) => `<p>${esc(p)}</p>`).join('\n              ')}
            </div>
            <div class="detail__points-wrap" style="margin-top:2.5rem">
              <p class="detail__points-title">${esc(service.pointsTitle || 'What that covers')}</p>
              <ul class="detail__points">
                ${service.points.map((p) => `<li>${esc(p)}</li>`).join('\n                ')}
              </ul>
            </div>
            ${
              service.gallery.length
                ? `<div class="detail-gallery">
              ${service.gallery
                .map((g) => picture(g, `${service.title} — RCK Group`, { sizes: '(max-width: 620px) 100vw, 33vw' }))
                .join('\n              ')}
            </div>`
                : ''
            }
          </div>

          <aside class="aside-card" data-reveal>
            <h2 class="aside-card__title">Get a price on this.</h2>
            <p class="aside-card__body">All of our work is programmed to cause as minimal disruption as possible — including night works and weekend work if required.</p>
            <p class="aside-card__list-title" style="margin-top:1.75rem;margin-bottom:0">Talk to ${esc(site.contactName)}</p>
            <a class="aside-card__phone" href="${site.phone.href}">${esc(site.phone.display)}</a>
            ${button('Send us a message', 'contact.html', 'accent')}
            <div class="aside-card__list">
              <h3 class="aside-card__list-title">Other services</h3>
              ${others
                .slice(0, 6)
                .map((s) => `<a href="${s.slug}.html">${esc(s.nav)}</a>`)
                .join('\n              ')}
              <a class="aside-card__list-all" href="services.html">All services</a>
            </div>
          </aside>
        </div>
      </div>
    </section>

${ctaBand()}`;

  return page({
    title: service.title,
    description: service.meta,
    current: `${service.slug}.html`,
    preload: service.image,
    breadcrumb: breadcrumbLd(crumbs),
    body,
  });
}

/* ------------------------------------------------------------------ *
 * About
 * ------------------------------------------------------------------ */

function buildAbout() {
  const crumbs = [
    { label: 'Home', href: 'index.html' },
    { label: 'About us' },
  ];
  const body = `${pageHero({
    eyebrowText: about.eyebrow,
    title: about.headline,
    lede: `${site.tagline}. Nationwide, Auckland based, and still run by the family that started it.`,
    image: 'assets/img/work/rck-2.jpg',
    alt: about.alt,
    crumbs,
  })}

    <section class="section">
      <div class="container">
        <div class="split split--reverse" data-reveal>
          <div class="split__media">${picture('assets/img/work/milling-2.jpg', 'RCK Group road miller at work', { sizes: '(max-width: 960px) 100vw, 50vw' })}</div>
          <div class="split__text">
            ${eyebrow('Our story')}
            <h2 class="split__title">Above industry standard, on every job.</h2>
            <div class="split__body prose">
              ${about.body.map((p) => `<p>${esc(p)}</p>`).join('\n              ')}
            </div>
            <div class="split__actions">
              ${button('See what we do', 'services.html', 'ghost')}
            </div>
          </div>
        </div>
      </div>
    </section>

${statRail()}

${structureSection()}

${teamSection()}

    <section class="section">
      <div class="container">
        <div class="section-head" data-reveal>
          <div>
            ${eyebrow('What you get')}
            <h2 class="section-head__title">Why clients keep us on the panel.</h2>
          </div>
          <div class="section-head__aside">
            <p class="lede">We carry out reinstatement for high-profile companies and New Zealand government networks. That work only continues if the standard holds.</p>
          </div>
        </div>
      </div>
      <div class="container">
        <div class="values" data-reveal-stagger>
          ${about.values
            .map(
              (v) => `<article class="value">
            <h3>${esc(v.title)}</h3>
            <p>${esc(v.body)}</p>
          </article>`
            )
            .join('\n          ')}
        </div>
      </div>
    </section>

    <section class="section section--muted">
      <div class="container">
        <div class="accred" data-reveal>
          <div>
            ${eyebrow(accreditations.eyebrow)}
            <h2 class="title-3">${esc(accreditations.headline)}</h2>
            <div class="prose" style="margin-top:1.5rem"><p>${esc(accreditations.body)}</p></div>
          </div>
          <div class="accred__badges">
            <img src="${accreditations.image}" alt="${esc(accreditations.alt)}" loading="lazy" decoding="async">
          </div>
        </div>
      </div>
    </section>

${clientsMarquee()}

${ctaBand()}`;

  return page({
    title: 'About us',
    description: about.body[0],
    current: 'about.html',
    preload: 'assets/img/work/rck-2.jpg',
    breadcrumb: breadcrumbLd(crumbs),
    body,
  });
}

/* ------------------------------------------------------------------ *
 * Gallery
 * ------------------------------------------------------------------ */

function buildGallery() {
  const crumbs = [
    { label: 'Home', href: 'index.html' },
    { label: 'Gallery' },
  ];
  const body = `${pageHero({
    eyebrowText: gallery.eyebrow,
    title: gallery.headline,
    lede: gallery.lede,
    image: 'assets/img/work/concrete-2.jpg',
    alt: 'Concrete works by RCK Group',
    crumbs,
  })}

    <section class="section">
      <div class="container">
        <div class="gallery-grid" data-reveal-stagger>
          ${gallery.images
            .map(
              (g) =>
                `<figure>${picture(g.file, g.alt, { sizes: '(max-width: 620px) 50vw, 25vw' })}</figure>`
            )
            .join('\n          ')}
        </div>
        <div class="split__actions" style="margin-top:3rem" data-reveal>
          ${button('Follow us on Facebook', site.facebook, 'ghost')}
        </div>
      </div>
    </section>

${ctaBand()}`;

  return page({
    title: 'Gallery',
    description:
      'Photos of recent asphalt, concrete, road milling, chipseal and reinstatement work by RCK Group across Auckland and New Zealand.',
    current: 'gallery.html',
    preload: 'assets/img/work/concrete-2.jpg',
    breadcrumb: breadcrumbLd(crumbs),
    body,
  });
}

/* ------------------------------------------------------------------ *
 * Contact
 * ------------------------------------------------------------------ */

function buildContact() {
  const crumbs = [
    { label: 'Home', href: 'index.html' },
    { label: 'Contact us' },
  ];
  const serviceOptions = services
    .map((s) => `<option value="${esc(s.title)}">${esc(s.title)}</option>`)
    .join('\n                ');

  const body = `${pageHero({
    eyebrowText: contact.eyebrow,
    title: contact.headline,
    lede: contact.lede,
    image: 'assets/img/work/asphalt-night.jpg',
    alt: 'Night asphalt works by RCK Group',
    crumbs,
  })}

    <section class="section">
      <div class="container">
        <div class="contact-layout">
          <div data-reveal>
            ${eyebrow('Enquiry form')}
            <h2 class="title-3" style="max-width:18ch">Send through the details.</h2>
            <form class="form" style="margin-top:2.5rem" data-form data-email="${site.email}"${contact.formEndpoint ? ` action="${contact.formEndpoint}" method="POST"` : ''}>
              <div class="form__row">
                <div class="field">
                  <label for="f-name">Name</label>
                  <input id="f-name" name="name" type="text" autocomplete="name" required placeholder="Your name">
                </div>
                <div class="field">
                  <label for="f-phone">Contact number</label>
                  <input id="f-phone" name="phone" type="tel" autocomplete="tel" placeholder="e.g. 021 123 4567">
                </div>
              </div>
              <div class="form__row">
                <div class="field">
                  <label for="f-email">Email address</label>
                  <input id="f-email" name="email" type="email" autocomplete="email" required placeholder="you@company.co.nz">
                </div>
                <div class="field">
                  <label for="f-service">What do you need?</label>
                  <select id="f-service" name="service">
                    <option value="">Select a service</option>
                ${serviceOptions}
                    <option value="Something else">Something else</option>
                  </select>
                </div>
              </div>
              <div class="field">
                <label for="f-location">Site location</label>
                <input id="f-location" name="location" type="text" placeholder="Street, suburb, city">
              </div>
              <div class="field">
                <label for="f-message">Message</label>
                <textarea id="f-message" name="message" required placeholder="Tell us about the site, the timeframe and anything we should know before we price it."></textarea>
              </div>

              <div class="field" aria-hidden="true" style="position:absolute;left:-9999px">
                <label for="f-trap">Company website</label>
                <input id="f-trap" name="company_website" type="text" tabindex="-1" autocomplete="off">
              </div>

              <label class="form__consent">
                <input type="checkbox" name="consent" required>
                <span>I am happy for RCK Group to contact me about this enquiry.</span>
              </label>

              <button class="btn btn--accent form__submit" type="submit">
                <span>Send enquiry</span>
                ${arrow.replace('<svg', '<svg class="btn__arrow"')}
              </button>

              <p class="form__status" data-form-status hidden></p>
              <p class="form__note">Prefer to talk it through? Call ${esc(site.contactName)} on ${esc(site.phone.display)} — we answer after hours for urgent works.</p>
            </form>
          </div>

          <aside class="contact-panel" data-reveal>
            <div class="contact-block">
              <h3>Speak to</h3>
              <a href="${site.phone.href}">${esc(site.contactName)} — ${esc(site.phone.display)}</a>
              <p class="contact-block__hint">Quotes, programming, urgent call-outs — every division</p>
            </div>
            <div class="contact-block">
              <h3>Email</h3>
              <a href="mailto:${site.emailSales}">${esc(site.emailSales)}</a>
              <p class="contact-block__hint">Quotes and new work</p>
              <a href="mailto:${site.email}" style="display:block;margin-top:0.75rem">${esc(site.email)}</a>
              <p class="contact-block__hint">Office and accounts</p>
            </div>
            <div class="contact-block">
              <h3>Head office</h3>
              <address>
                ${esc(site.address.street)}<br>
                ${esc(site.address.suburb)}, ${esc(site.address.city)} ${esc(site.address.postcode)}
              </address>
              <p class="contact-block__hint">Aggregate supply yard in Silverdale</p>
            </div>
            <div class="contact-block">
              <h3>Hours</h3>
              <address>Monday – Friday, 7am – 5pm<br>Night and weekend works by arrangement<br>24/7 traffic management as required</address>
            </div>
          </aside>
        </div>

        <div class="map" data-reveal>
          <iframe
            title="Map showing RCK Group at ${esc(site.address.street)}, ${esc(site.address.suburb)}"
            src="https://www.google.com/maps?q=${encodeURIComponent(
              `${site.address.street}, ${site.address.suburb}, ${site.address.city}, New Zealand`
            )}&output=embed"
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>
      </div>
    </section>`;

  return page({
    title: 'Contact us',
    description: `Contact RCK Group — ${site.phone.display}, ${site.email}. ${site.address.street}, ${site.address.suburb}, ${site.address.city}.`,
    current: 'contact.html',
    preload: 'assets/img/work/asphalt-night.jpg',
    breadcrumb: breadcrumbLd(crumbs),
    body,
  });
}

/* ------------------------------------------------------------------ *
 * Privacy + 404
 * ------------------------------------------------------------------ */

function buildPrivacy() {
  const sections = [
    {
      h: 'What we collect',
      p: [
        'When you contact us through this website we collect the name, email address, phone number, site location and message you choose to give us. If you email or phone us directly, we hold whatever details you provide in that correspondence.',
        'This website does not use advertising or tracking cookies.',
      ],
    },
    {
      h: 'How we use it',
      p: [
        'We use your details only to respond to your enquiry, prepare a quote, deliver the work and keep the usual project and accounting records. We do not sell your information.',
        'We may share details with our own crews, suppliers or subcontractors where that is necessary to price or deliver your job.',
      ],
    },
    {
      h: 'How long we keep it',
      p: [
        'Enquiry correspondence is retained while it is useful to us and for as long as we are required to keep business records. Project and financial records are held for the periods required by New Zealand law.',
      ],
    },
    {
      h: 'Your rights',
      p: [
        'Under the Privacy Act 2020 you may ask us for a copy of the personal information we hold about you, and ask us to correct it. Email office@rcknz.co.nz and we will respond as soon as we reasonably can.',
      ],
    },
    {
      h: 'Third-party services',
      p: [
        'The contact page embeds a Google Map. Google may collect information about your use of that map under its own privacy policy.',
      ],
    },
    {
      h: 'Contact',
      p: [
        `Questions about this policy can be sent to ${site.email} or posted to ${site.address.street}, ${site.address.suburb}, ${site.address.city} ${site.address.postcode}.`,
      ],
    },
  ];

  const body = `${pageHero({
    eyebrowText: 'Legal',
    title: 'Privacy policy',
    lede: 'How RCK Group handles the information you give us through this website.',
    crumbs: [{ label: 'Home', href: 'index.html' }, { label: 'Privacy policy' }],
  })}

    <section class="section">
      <div class="container">
        <div class="prose" style="max-width:70ch">
          ${sections
            .map(
              (s) =>
                `<h2 class="title-3" style="color:var(--text);margin-top:2.5rem">${esc(s.h)}</h2>\n          ${s.p
                  .map((p) => `<p>${esc(p)}</p>`)
                  .join('\n          ')}`
            )
            .join('\n          ')}
        </div>
      </div>
    </section>`;

  return page({
    title: 'Privacy policy',
    description: 'How RCK Group collects, uses and stores the personal information you provide through this website.',
    current: 'privacy-policy.html',
    body,
  });
}

function build404() {
  const body = `${pageHero({
    eyebrowText: 'Error 404',
    title: 'That page has been resurfaced.',
    lede: 'The link you followed does not exist any more. Try our services, or call us and we will point you the right way.',
    image: 'assets/img/work/milling-2.jpg',
    alt: '',
  })}
    <section class="section">
      <div class="container">
        <div class="split__actions">
          ${button('Back to home', 'index.html', 'accent')}
          ${button('What we do', 'services.html', 'ghost')}
        </div>
      </div>
    </section>`;
  return page({
    title: 'Page not found',
    description: 'The page you were looking for could not be found.',
    current: '404.html',
    body,
  });
}

/* ------------------------------------------------------------------ *
 * Sitemap + robots
 * ------------------------------------------------------------------ */

function buildSitemap(pages) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = pages
    .filter((p) => p !== '404.html')
    .map((p) => {
      const loc = `${site.url}/${p === 'index.html' ? '' : p}`;
      const priority = p === 'index.html' ? '1.0' : p === 'contact.html' ? '0.9' : '0.7';
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

console.log('Building RCK Group site…');

// Clear previously generated HTML so removed pages do not linger.
for (const f of readdirSync(root)) {
  if (f.endsWith('.html')) unlinkSync(join(root, f));
}

const written = [];
const write = (name, html) => {
  out(name, html);
  written.push(name);
};

write('index.html', buildHome());
write('services.html', buildServices());
for (const s of services) write(`${s.slug}.html`, buildService(s));
write('about.html', buildAbout());
write('gallery.html', buildGallery());
write('contact.html', buildContact());
write('privacy-policy.html', buildPrivacy());
write('404.html', build404());

writeFileSync(join(root, 'sitemap.xml'), buildSitemap(written));
console.log('  ✓ sitemap.xml');
writeFileSync(join(root, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`);
console.log('  ✓ robots.txt');

console.log(`\nDone — ${written.length} pages.`);
