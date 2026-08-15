/* RCK Group — interaction layer. No dependencies. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- Header: solid on scroll, hide on scroll down ---------------------- */
  var header = document.querySelector('[data-header]');
  if (header) {
    var lastY = window.scrollY;
    var onScroll = function () {
      var y = window.scrollY;
      header.classList.toggle('is-stuck', y > 24);
      if (!document.body.classList.contains('is-locked')) {
        header.classList.toggle('is-hidden', y > 420 && y > lastY);
      }
      lastY = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* --- Services mega menu ------------------------------------------------ */
  var megaItem = document.querySelector('.nav__item--has-mega');
  if (megaItem) {
    var toggle = megaItem.querySelector('.nav__link--toggle');
    var panel = megaItem.querySelector('.mega');
    var closeTimer;

    var setMega = function (open) {
      clearTimeout(closeTimer);
      megaItem.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      panel.hidden = false; // CSS controls visibility; keeps it animatable
      // Solidify a transparent over-hero header so the panel does not float
      // against see-through chrome.
      if (header && open) header.classList.add('is-stuck');
      else if (header && window.scrollY <= 24) header.classList.remove('is-stuck');
    };

    var canHover = function () {
      return window.matchMedia('(hover: hover)').matches;
    };

    // On pointer devices the panel opens on hover, so a click on the trigger
    // means "take me to the full listing". On touch there is no hover, so the
    // same control toggles the panel instead.
    toggle.addEventListener('click', function () {
      if (canHover()) {
        window.location.href = toggle.dataset.href || 'services.html';
      } else {
        setMega(!megaItem.classList.contains('is-open'));
      }
    });
    // Keyboard users get the panel when the trigger takes focus.
    toggle.addEventListener('focus', function () {
      if (canHover()) setMega(true);
    });
    megaItem.addEventListener('mouseenter', function () {
      if (canHover()) setMega(true);
    });
    megaItem.addEventListener('mouseleave', function () {
      if (canHover()) {
        closeTimer = setTimeout(function () {
          setMega(false);
        }, 140);
      }
    });
    megaItem.addEventListener('focusout', function (e) {
      if (!megaItem.contains(e.relatedTarget)) setMega(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setMega(false);
    });
    document.addEventListener('click', function (e) {
      if (!megaItem.contains(e.target)) setMega(false);
    });
  }

  /* --- Mobile nav -------------------------------------------------------- */
  var burger = document.querySelector('[data-burger]');
  var mobileNav = document.querySelector('[data-mobile-nav]');
  if (burger && mobileNav) {
    var setNav = function (open) {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      mobileNav.classList.toggle('is-open', open);
      mobileNav.hidden = false;
      document.body.classList.toggle('is-locked', open);
      if (open) header && header.classList.remove('is-hidden');
    };
    burger.addEventListener('click', function () {
      setNav(burger.getAttribute('aria-expanded') !== 'true');
    });
    mobileNav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setNav(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 960) setNav(false);
    });
  }

  /* --- Scroll reveals ---------------------------------------------------- */
  var revealTargets = document.querySelectorAll('[data-reveal], [data-reveal-stagger]');
  if (!('IntersectionObserver' in window) || reduceMotion) {
    revealTargets.forEach(function (el) {
      el.classList.add('is-in');
    });
  } else {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
    );
    revealTargets.forEach(function (el) {
      revealObserver.observe(el);
    });
  }

  /* --- Stat count-up ----------------------------------------------------- */
  var counters = document.querySelectorAll('[data-count]');
  if (counters.length && 'IntersectionObserver' in window && !reduceMotion) {
    var countObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          countObserver.unobserve(el);
          var target = parseInt(el.getAttribute('data-count'), 10);
          if (isNaN(target)) return;
          var start = performance.now();
          var duration = 1100;
          var tick = function (now) {
            var p = Math.min((now - start) / duration, 1);
            var eased = 1 - Math.pow(1 - p, 3);
            el.textContent = String(Math.round(target * eased));
            if (p < 1) requestAnimationFrame(tick);
          };
          el.textContent = '0';
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach(function (el) {
      countObserver.observe(el);
    });
  }

  /* --- Sticky mobile call bar ------------------------------------------- */
  var stickyCall = document.querySelector('.sticky-call');
  if (stickyCall) {
    var showAfter = function () {
      stickyCall.classList.toggle('is-in', window.scrollY > 600);
    };
    showAfter();
    window.addEventListener('scroll', showAfter, { passive: true });
  }

  /* --- Contact form ------------------------------------------------------ */
  var form = document.querySelector('[data-form]');
  if (form) {
    var status = form.querySelector('[data-form-status]');
    var say = function (message, ok) {
      if (!status) return;
      status.hidden = false;
      status.textContent = message;
      status.style.borderLeftColor = ok ? 'var(--accent)' : '#d24b2f';
    };

    form.addEventListener('submit', function (e) {
      // Honeypot: bots fill hidden fields.
      var trap = form.querySelector('[name="company_website"]');
      if (trap && trap.value) {
        e.preventDefault();
        return;
      }

      var endpoint = form.getAttribute('action');
      if (endpoint) return; // let a real endpoint handle it

      // No endpoint configured — fall back to composing an email.
      e.preventDefault();
      var data = new FormData(form);
      var lines = [
        'Name: ' + (data.get('name') || ''),
        'Email: ' + (data.get('email') || ''),
        'Phone: ' + (data.get('phone') || ''),
        'Service: ' + (data.get('service') || ''),
        'Location: ' + (data.get('location') || ''),
        '',
        data.get('message') || '',
      ];
      var subject = 'Website enquiry — ' + (data.get('service') || 'General');
      window.location.href =
        'mailto:' +
        form.dataset.email +
        '?subject=' +
        encodeURIComponent(subject) +
        '&body=' +
        encodeURIComponent(lines.join('\n'));
      say('Opening your email app with the details filled in. If nothing happens, email us directly at ' + form.dataset.email + '.', true);
    });
  }

  /* --- Footer year ------------------------------------------------------- */
  var year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
