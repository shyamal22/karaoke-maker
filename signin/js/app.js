/* RCK Sign In / Sign Out — tablet kiosk.
   Two buttons on the landing screen, one question per screen after that.
   Everything is stored on the tablet; the office side lives behind a PIN. */
(function () {
  'use strict';

  const CREWS = ['Green Crew', 'Yellow Crew', 'Traffic', 'Office', 'Yard', 'Transport', 'Trucking', 'Other'];
  const QUICK_SITES = ['Yard', 'Office', 'Depot'];
  const ADMIN_IDLE_MS = 5 * 60 * 1000;
  const ALERT_CHECK_MS = 5 * 60 * 1000;

  const R = () => window.Reports;
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let state = { screen: 'home', flow: {}, admin: { tab: 'now', preset: 'week', from: null, to: null, view: 'employee', entryId: null, personId: null } };
  let idleTimer = null, doneTimer = null, clockTimer = null, wakeLock = null;

  // ------------------------------------------------------------------ helpers
  const view = () => $('#view');

  function go(screen, patch) {
    if (patch) Object.assign(state.flow, patch);
    state.screen = screen;
    render();
    window.scrollTo(0, 0);
    resetIdle();
  }

  function home() {
    state.flow = {};
    clearTimeout(doneTimer);
    go('home');
  }

  function toast(msg, kind) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.className = ''; }, 3200);
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  const toLocalInput = iso => {
    if (!iso) return '';
    const d = new Date(iso);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  };
  const fromLocalInput = v => (v ? new Date(v).toISOString() : null);

  // ------------------------------------------------------------------- chrome
  function chrome() {
    const s = Store.settings();
    const onSite = Store.openEntries().length;
    const flagged = alertState.current.length;
    const inFlow = state.screen !== 'home' && state.screen !== 'done';
    $('#bar').innerHTML =
      (inFlow ? '<button class="bar-btn" data-act="cancel">&#10005; Cancel</button>' : '<span class="brand">RCK<i></i></span>') +
      '<span class="bar-mid">' + esc(inFlow ? '' : s.siteName) + '</span>' +
      '<span class="clock" id="clock"></span>';
    $('#foot').innerHTML = state.screen === 'home'
      ? '<button class="foot-onsite" data-act="onsite"><b>' + onSite + '</b> ' + (onSite === 1 ? 'person' : 'people') + ' on site now</button>' +
        '<button class="foot-admin" data-act="admin">Office' + (flagged ? '<em>' + flagged + '</em>' : '') + '</button>'
      : '';
    $('#foot').hidden = state.screen !== 'home';
    tickClock();
  }

  function tickClock() {
    const c = $('#clock');
    if (!c) return;
    const now = new Date();
    c.innerHTML = '<b>' + now.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' }).toLowerCase() + '</b>' +
      '<i>' + now.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' }) + '</i>';
  }

  // --------------------------------------------------------------------- idle
  function resetIdle() {
    clearTimeout(idleTimer);
    if (state.screen === 'home') return;
    const s = Store.settings();
    const ms = ['admin', 'entry', 'newEntry', 'person', 'pin'].indexOf(state.screen) >= 0
      ? ADMIN_IDLE_MS
      : Math.max(20, Number(s.idleSeconds) || 60) * 1000;
    idleTimer = setTimeout(() => { if (state.screen !== 'done') home(); }, ms);
  }

  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { /* not supported — the tablet's own display settings apply */ }
  }

  // ------------------------------------------------------------------ screens
  function render() {
    refreshAlerts();
    const fn = SCREENS[state.screen] || SCREENS.home;
    view().innerHTML = fn();
    chrome();
    const focus = view().querySelector('[data-autofocus]');
    if (focus) setTimeout(() => focus.focus(), 60);
  }

  function head(title, sub, step) {
    return '<div class="head">' +
      (step ? '<div class="step">Step ' + step[0] + ' of ' + step[1] + '</div>' : '') +
      '<h2>' + esc(title) + '</h2>' +
      (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }

  function backBtn(act) {
    return '<button class="back" data-act="' + act + '">&#8592; Back</button>';
  }

  const SCREENS = {};

  // -------- landing
  SCREENS.home = function () {
    const now = new Date();
    return '<div class="home">' +
      '<div class="bigclock">' + now.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' }).toLowerCase() + '</div>' +
      '<div class="bigdate">' + now.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' }) + '</div>' +
      '<div class="megas">' +
        '<button class="mega in" data-act="start-in"><span class="mega-ico">&#8594;</span><b>SIGN IN</b><i>Starting work</i></button>' +
        '<button class="mega out" data-act="start-out"><span class="mega-ico">&#8592;</span><b>SIGN OUT</b><i>Finished work</i></button>' +
      '</div></div>';
  };

  // -------- sign in: who
  SCREENS.who = function () {
    const open = new Set(Store.openEntries().map(e => e.employeeId));
    const people = Store.employees().slice().sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || '') || a.name.localeCompare(b.name));
    const tiles = people.map(p =>
      '<button class="tile person' + (open.has(p.id) ? ' busy' : '') + '" data-act="pick-person" data-id="' + p.id + '" data-name="' + esc(p.name.toLowerCase()) + '">' +
      '<b>' + esc(p.name) + '</b>' +
      '<i>' + esc(open.has(p.id) ? 'Already signed in' : (p.crew || 'Tap to sign in')) + '</i></button>').join('');
    return head('Who are you?', 'Tap your name', [1, 3]) +
      (people.length > 8 ? '<input class="search" id="nameSearch" type="search" placeholder="Type your name to find it" autocomplete="off">' : '') +
      '<div class="grid" id="peopleGrid">' + tiles +
      '<button class="tile new" data-act="new-person"><b>+ New</b><i>I am not on the list</i></button>' +
      '</div>' +
      (people.length ? '' : '<p class="hint">Nobody has signed in on this tablet yet. Tap <b>+ New</b> to add yourself — after that your name stays in the list.</p>');
  };

  SCREENS.newperson = function () {
    return backBtn('who') + head('Your name', 'You only have to do this once', [1, 3]) +
      '<div class="form">' +
      '<label>First name<input id="fnEl" type="text" autocapitalize="words" autocomplete="off" data-autofocus></label>' +
      '<label>Last name<input id="lnEl" type="text" autocapitalize="words" autocomplete="off"></label>' +
      '</div>' +
      '<button class="go" data-act="save-person">Next &#8594;</button>';
  };

  // -------- sign in: crew
  SCREENS.crew = function () {
    const last = state.flow.employee && state.flow.employee.crew;
    return backBtn('who') + head('Which crew today?', esc((state.flow.employee || {}).name || ''), [2, 3]) +
      '<div class="grid crews">' + CREWS.map(c =>
        '<button class="tile crew' + (c === last ? ' last' : '') + '" data-act="pick-crew" data-crew="' + esc(c) + '">' +
        '<b>' + esc(c) + '</b>' + (c === last ? '<i>Last time</i>' : '') + '</button>').join('') +
      '</div>';
  };

  // -------- sign in: site
  function recentSites(limit) {
    const seen = new Map();
    Store.entries().slice().sort((a, b) => b.inAt.localeCompare(a.inAt)).forEach(e => {
      R().sitesOf(e).forEach(s => {
        const k = R().siteKey(s);
        if (k && !seen.has(k) && s !== '(no job recorded)') seen.set(k, s);
      });
    });
    return [...seen.values()].slice(0, limit || 10);
  }

  SCREENS.site = function () {
    const chips = recentSites(9);
    QUICK_SITES.forEach(q => { if (!chips.some(c => R().siteKey(c) === R().siteKey(q))) chips.push(q); });
    return backBtn('crew') + head('Where are you working?', 'Job name, road or address', [3, 3]) +
      '<input class="bigin" id="siteEl" type="text" autocapitalize="words" autocomplete="off" placeholder="Type the job / site" value="' + esc(state.flow.site || '') + '">' +
      (chips.length ? '<div class="section">Recent jobs — tap to use</div><div class="chips">' +
        chips.map(c => '<button class="chip" data-act="pick-site" data-site="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' : '') +
      '<button class="go" data-act="site-next">Next &#8594;</button>';
  };

  SCREENS.confirmIn = function () {
    const f = state.flow;
    return backBtn('site') + head('Check this is right', '', null) +
      '<div class="summary">' +
        row('Name', f.employee.name) +
        row('Crew', f.crew) +
        row('Job / site', f.site) +
        row('Time in', R().fmtDateTime(new Date().toISOString())) +
      '</div>' +
      '<button class="go big-in" data-act="do-signin">SIGN IN</button>';
  };

  function row(label, value) {
    return '<div class="srow"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
  }

  // -------- sign out: who
  SCREENS.outWho = function () {
    const open = Store.openEntries();
    if (!open.length) {
      return head('Nobody is signed in', 'There is no one to sign out right now.') +
        '<button class="go" data-act="home">Back to start</button>';
    }
    const long = Number(Store.settings().longShiftHours) || 14;
    return head('Who is signing out?', 'Tap your name') +
      (open.length > 8 ? '<input class="search" id="nameSearch" type="search" placeholder="Type your name to find it" autocomplete="off">' : '') +
      '<div class="grid" id="peopleGrid">' + open.map(e => {
        const h = R().elapsedSince(e.inAt);
        return '<button class="tile person' + (h > long ? ' overdue' : '') + '" data-act="pick-open" data-id="' + e.id + '" data-name="' + esc(e.name.toLowerCase()) + '">' +
          '<b>' + esc(e.name) + '</b>' +
          '<i>' + esc(e.crew) + ' &middot; in ' + esc(R().fmtTime(e.inAt)) + ' &middot; ' + esc(R().hm(h)) + '</i></button>';
      }).join('') + '</div>';
  };

  // -------- sign out: job check
  SCREENS.outJob = function () {
    const f = state.flow;
    const sites = f.sites || [];
    return backBtn('outWho') + head('Where did you work?', esc(f.employee.name), [1, 2]) +
      '<div class="joblist">' + sites.map((s, i) =>
        '<div class="jobrow"><b>' + esc(s) + '</b>' +
        (sites.length > 1 ? '<button class="rm" data-act="rm-site" data-i="' + i + '">&#10005;</button>' : '') + '</div>').join('') +
      '</div>' +
      '<button class="go big-ok" data-act="job-yes">&#10003; YES — that is right</button>' +
      '<div class="two">' +
        '<button class="alt" data-act="job-change">Change job</button>' +
        '<button class="alt" data-act="job-add">+ Another job</button>' +
      '</div>';
  };

  SCREENS.outAddJob = function () {
    const chips = recentSites(9);
    return backBtn('outJob') + head(state.flow.replaceSite ? 'Which job were you on?' : 'Add another job', 'Type it or tap a recent job') +
      '<input class="bigin" id="siteEl" type="text" autocapitalize="words" autocomplete="off" placeholder="Job / site" data-autofocus>' +
      (chips.length ? '<div class="chips">' + chips.map(c => '<button class="chip" data-act="add-site-chip" data-site="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' : '') +
      '<button class="go" data-act="add-site">Add</button>';
  };

  SCREENS.outExtra = function () {
    const s = Store.settings();
    return backBtn('outJob') + head('Anything to note?', 'You can skip this', [2, 2]) +
      (s.askNotes ? '<label class="lbl">What did you do on the job? (optional)</label>' +
        '<textarea id="notesEl" rows="3" placeholder="e.g. finished the north side, waiting on line marking">' + esc(state.flow.notes || '') + '</textarea>' : '') +
      (s.askBreak ? '<label class="lbl">Unpaid break (minutes)</label>' +
        '<div class="chips breaks">' + [0, 30, 45, 60].map(m =>
          '<button class="chip' + ((state.flow.breakMins || 0) === m ? ' on' : '') + '" data-act="pick-break" data-m="' + m + '">' + (m ? m + ' min' : 'None') + '</button>').join('') + '</div>' : '') +
      '<button class="go" data-act="extra-next">Next &#8594;</button>';
  };

  SCREENS.confirmOut = function () {
    const f = state.flow;
    const e = f.entry;
    const preview = Object.assign({}, e, { outAt: new Date().toISOString(), breakMins: f.breakMins || 0 });
    return backBtn('outJob') + head('Check this is right', '', null) +
      '<div class="summary">' +
        row('Name', e.name) +
        row('Crew', e.crew) +
        row('Job / site', (f.sites || []).join(', ')) +
        row('Time in', R().fmtDateTime(e.inAt)) +
        row('Time out', R().fmtDateTime(preview.outAt)) +
        (f.breakMins ? row('Unpaid break', f.breakMins + ' min') : '') +
        '<div class="srow total"><span>Hours today</span><b>' + esc(R().hm(R().hoursOf(preview))) + '</b></div>' +
      '</div>' +
      '<button class="go big-out" data-act="do-signout">SIGN OUT</button>';
  };

  // -------- done
  SCREENS.done = function () {
    const d = state.flow.done || {};
    return '<div class="done ' + (d.kind === 'in' ? 'is-in' : 'is-out') + '" data-act="home">' +
      '<div class="tick">&#10003;</div>' +
      '<h2>' + esc(d.title) + '</h2>' +
      '<p>' + esc(d.line) + '</p>' +
      (d.big ? '<div class="donebig">' + esc(d.big) + '</div>' : '') +
      '<button class="undo" data-act="undo">Made a mistake? Undo</button>' +
      '<div class="counting" id="counting"></div>' +
      '<div class="counting">Tap the screen for the next person</div>' +
      '</div>';
  };

  // -------- admin gate
  SCREENS.pin = function () {
    return backBtn('home') + head('Office only', 'Enter the PIN') +
      '<div class="pindots" id="pindots"></div>' +
      '<div class="keypad">' +
        [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => '<button data-act="pin" data-n="' + n + '">' + n + '</button>').join('') +
        '<button class="ghost" data-act="pin-clear">Clear</button>' +
        '<button data-act="pin" data-n="0">0</button>' +
        '<button class="ghost" data-act="pin-ok">OK</button>' +
      '</div>';
  };

  // ------------------------------------------------------------------- admin
  function adminRange() {
    const a = state.admin;
    if (a.preset === 'custom' && a.from && a.to) return [new Date(a.from), new Date(a.to)];
    const p = R().PRESETS.find(x => x.key === a.preset) || R().PRESETS[2];
    return p.range();
  }

  SCREENS.admin = function () {
    const tabs = [['now', 'On site'], ['flags', 'Flags'], ['reports', 'Reports'], ['people', 'People'], ['data', 'Data']];
    const flagged = alertState.current.length;
    return backBtn('home') +
      '<div class="tabs">' + tabs.map(t =>
        '<button class="tab' + (state.admin.tab === t[0] ? ' on' : '') + '" data-act="tab" data-tab="' + t[0] + '">' + t[1] +
        (t[0] === 'flags' && flagged ? '<em>' + flagged + '</em>' : '') + '</button>').join('') + '</div>' +
      '<div class="admin">' + ADMIN[state.admin.tab]() + '</div>';
  };

  const ADMIN = {};

  ADMIN.now = function () {
    const open = Store.openEntries();
    const long = Number(Store.settings().longShiftHours) || 14;
    const today = R().filter(R().dayStart(new Date()), R().dayEnd(new Date()));
    const sum = R().summary(today);
    return statTiles([
      ['On site now', String(open.length)],
      ['Signed in today', String(sum.shifts)],
      ['Hours today', R().hm(sum.hours)],
      ['Jobs today', String(sum.jobs)],
    ]) +
      '<div class="section">Signed in right now</div>' +
      (open.length ? '<div class="list">' + open.map(e => {
        const h = R().elapsedSince(e.inAt);
        return '<div class="li' + (h > long ? ' warn' : '') + '">' +
          '<div class="li-main"><b>' + esc(e.name) + '</b><i>' + esc(e.crew) + ' &middot; ' + esc(R().sitesOf(e)[0]) + ' &middot; in ' + esc(R().fmtDateTime(e.inAt)) + '</i></div>' +
          '<div class="li-side">' + esc(R().hm(h)) + '</div>' +
          '<button class="mini" data-act="admin-signout" data-id="' + e.id + '">Sign out</button>' +
          '<button class="mini ghost" data-act="edit-entry" data-id="' + e.id + '">Edit</button>' +
          '</div>';
      }).join('') + '</div>' : '<p class="hint">Nobody is signed in.</p>') +
      '<div class="btnrow"><button class="alt" data-act="rollcall">Roll call PDF</button></div>';
  };

  ADMIN.flags = function () {
    const s = Store.settings();
    const list = alertState.current;
    return '<p class="hint">Anyone still signed in after <b>' + esc(s.forgotHours) + ' hours</b>, or any shift over <b>' + esc(s.longShiftHours) + ' hours</b>, is flagged here' +
      (s.syncUrl ? ' and emailed to ' + esc(s.alertEmail || 'the office') + ' automatically.' : '. Set up email alerts under <b>Data</b>.') + '</p>' +
      (list.length ? '<div class="list">' + list.map(a =>
        '<div class="li ' + (a.severity === 'high' ? 'bad' : 'warn') + '">' +
          '<div class="li-main"><b>' + esc(a.title) + '</b><i>' + esc(a.detail) + '</i></div>' +
          '<button class="mini" data-act="edit-entry" data-id="' + a.entryId + '">Fix</button>' +
        '</div>').join('') + '</div>' : '<p class="ok-note">&#10003; Nothing flagged. Everyone has signed out.</p>') +
      (list.length ? '<div class="btnrow">' +
        (s.syncUrl ? '<button class="alt" data-act="send-alerts">Email these now</button>' : '') +
        (s.alertEmail ? '<button class="alt" data-act="mail-alerts">Open in email app</button>' : '') +
        '</div>' : '');
  };

  ADMIN.reports = function () {
    const [from, to] = adminRange();
    const list = R().filter(from, to);
    const sum = R().summary(list);
    const a = state.admin;

    const presets = R().PRESETS.map(p =>
      '<button class="chip' + (a.preset === p.key ? ' on' : '') + '" data-act="preset" data-p="' + p.key + '">' + p.label + '</button>').join('') +
      '<button class="chip' + (a.preset === 'custom' ? ' on' : '') + '" data-act="preset" data-p="custom">Custom</button>';

    const dayValue = v => R().localDay(new Date(v || Date.now()).toISOString());
    const custom = a.preset === 'custom'
      ? '<div class="two dates"><label>From<input type="date" id="fromEl" value="' + esc(dayValue(a.from)) + '"></label>' +
        '<label>To<input type="date" id="toEl" value="' + esc(dayValue(a.to)) + '"></label>' +
        '<button class="mini" data-act="apply-dates">Apply</button></div>'
      : '';

    const views = [['employee', 'By employee'], ['crew', 'By crew'], ['job', 'By job'], ['entries', 'Every shift']];
    let table = '';
    if (a.view === 'employee') {
      table = tableHtml(['Employee', 'Crew', 'Days', 'Shifts', 'Hours'],
        R().byEmployee(list).map(r => [r.name, [...r.crews].join(', '), r.days.size, r.shifts, R().hm(r.hours)]),
        ['', '', 'n', 'n', 'n']);
    } else if (a.view === 'crew') {
      table = tableHtml(['Crew', 'People', 'Shifts', 'Jobs', 'Hours'],
        R().byCrew(list).map(r => [r.crew, r.people.size, r.shifts, r.jobs.size, R().hm(r.hours)]),
        ['', 'n', 'n', 'n', 'n']);
    } else if (a.view === 'job') {
      table = '<p class="hint">Job hours are everyone&rsquo;s hours added together. A shift covering more than one job is split evenly between them.</p>' +
        tableHtml(['Job / site', 'People', 'Shifts', 'Days', 'Total hours'],
          R().byJob(list).map(r => [r.site, r.people.size, r.shifts, r.days.size, R().hm(r.hours)]),
          ['', 'n', 'n', 'n', 'n']);
    } else {
      table = '<div class="list">' + (list.length ? list.slice().reverse().map(e =>
        '<div class="li' + (e.outAt ? '' : ' warn') + '">' +
          '<div class="li-main"><b>' + esc(e.name) + '</b><i>' + esc(R().fmtDate(e.inAt)) + ' &middot; ' + esc(e.crew) + ' &middot; ' + esc(R().sitesOf(e).join(', ')) + '<br>' +
          esc(R().fmtTime(e.inAt)) + ' &#8594; ' + esc(e.outAt ? R().fmtTime(e.outAt) : 'still signed in') + (e.autoClosed ? ' (auto-closed)' : '') + '</i></div>' +
          '<div class="li-side">' + esc(e.outAt ? R().hm(R().hoursOf(e)) : '—') + '</div>' +
          '<button class="mini ghost" data-act="edit-entry" data-id="' + e.id + '">Edit</button>' +
        '</div>').join('') : '<p class="hint">No shifts in this range.</p>') + '</div>' +
        '<div class="btnrow"><button class="alt" data-act="add-entry">+ Add a missing shift</button></div>';
    }

    return '<div class="chips">' + presets + '</div>' + custom +
      statTiles([
        ['Hours', R().hm(sum.hours)],
        ['Shifts', String(sum.shifts)],
        ['People', String(sum.people)],
        ['Jobs', String(sum.jobs)],
      ]) +
      '<div class="btnrow"><button class="alt" data-act="export-xlsx">Export Excel</button><button class="alt" data-act="export-pdf">Export PDF</button></div>' +
      '<div class="tabs sub">' + views.map(v =>
        '<button class="tab' + (a.view === v[0] ? ' on' : '') + '" data-act="view" data-v="' + v[0] + '">' + v[1] + '</button>').join('') + '</div>' +
      table;
  };

  ADMIN.people = function () {
    const people = Store.employees().slice().sort((a, b) => a.name.localeCompare(b.name));
    const all = Store.entries();
    return '<p class="hint">Names people picked at sign-in. Fix a spelling here and every future sign-in uses it.</p>' +
      '<div class="list">' + people.map(p => {
        const n = all.filter(e => e.employeeId === p.id).length;
        return '<div class="li"><div class="li-main"><b>' + esc(p.name) + '</b><i>' + esc(p.crew || 'no crew yet') + ' &middot; ' + n + ' shift' + (n === 1 ? '' : 's') +
          (p.lastSeen ? ' &middot; last ' + esc(R().fmtDate(p.lastSeen)) : '') + '</i></div>' +
          '<button class="mini ghost" data-act="edit-person" data-id="' + p.id + '">Edit</button></div>';
      }).join('') + '</div>' +
      '<div class="btnrow"><button class="alt" data-act="new-person-admin">+ Add person</button></div>';
  };

  ADMIN.data = function () {
    const s = Store.settings();
    const h = Store.storageHealth();
    const backupAge = h.lastBackupAt ? Math.floor((Date.now() - new Date(h.lastBackupAt)) / 86400000) : null;
    return '<div class="section">Backup</div>' +
      (backupAge === null ? '<p class="hint bad-note">No backup has been saved from this tablet yet.</p>'
        : backupAge > 7 ? '<p class="hint bad-note">Last backup was ' + backupAge + ' days ago.</p>'
        : '<p class="hint">Last backup ' + esc(R().fmtDate(h.lastBackupAt)) + '.</p>') +
      '<div class="btnrow"><button class="alt" data-act="backup">Save backup file</button><button class="alt" data-act="restore">Restore from file</button></div>' +

      '<div class="section">Automatic email alerts</div>' +
      '<p class="hint">Paste the web app URL from the Google Apps Script in <code>apps-script/Code.gs</code>. The tablet then sends every shift to your spreadsheet, and Google emails you the flags even if the tablet is off.</p>' +
      '<div class="form">' +
        '<label>Email for alerts<input id="setEmail" type="email" value="' + esc(s.alertEmail) + '" placeholder="office@rcknz.co.nz"></label>' +
        '<label>Sync / alert URL<input id="setSync" type="url" value="' + esc(s.syncUrl) + '" placeholder="https://script.google.com/macros/s/..."></label>' +
        '<div class="two">' +
          '<label>Flag no sign-out after (hours)<input id="setForgot" type="number" min="1" max="72" value="' + esc(s.forgotHours) + '"></label>' +
          '<label>Flag shift longer than (hours)<input id="setLong" type="number" min="6" max="24" value="' + esc(s.longShiftHours) + '"></label>' +
        '</div>' +
      '</div>' +
      '<div class="btnrow"><button class="alt" data-act="save-settings">Save settings</button><button class="alt" data-act="sync-now">Sync now</button><button class="alt" data-act="resync">Re-send everything</button></div>' +

      '<div class="section">Sign-out questions</div>' +
      '<label class="toggle"><input type="checkbox" id="setNotes"' + (s.askNotes ? ' checked' : '') + '> Ask &ldquo;what did you do on the job?&rdquo;</label>' +
      '<label class="toggle"><input type="checkbox" id="setBreak"' + (s.askBreak ? ' checked' : '') + '> Ask for unpaid break minutes</label>' +

      '<div class="section">This tablet</div>' +
      '<div class="form">' +
        '<label>Location name<input id="setSite" type="text" value="' + esc(s.siteName) + '"></label>' +
        '<label>Office PIN<input id="setPin" type="text" inputmode="numeric" maxlength="8" value="' + esc(s.adminPin) + '"></label>' +
        '<label>Return to start screen after (seconds)<input id="setIdle" type="number" min="20" max="300" value="' + esc(s.idleSeconds) + '"></label>' +
      '</div>' +
      (s.adminPin === '1234' ? '<p class="hint bad-note">The PIN is still 1234 — change it.</p>' : '') +
      '<div class="btnrow"><button class="alt" data-act="save-settings">Save settings</button><button class="alt" data-act="fullscreen">Full screen</button></div>' +

      '<div class="section">Storage health</div>' +
      '<div class="health">' +
        hrow('Shifts stored', String(h.entries)) +
        hrow('People', String(h.employees)) +
        hrow('Database', h.idb ? 'OK' : 'Unavailable — using on-device backup copy') +
        hrow('On-device backup copy', h.mirrorAt ? R().fmtDateTime(h.mirrorAt) : 'none') +
        hrow('Waiting to sync', String(h.pending)) +
        hrow('Last sync', h.lastSyncAt ? R().fmtDateTime(h.lastSyncAt) : 'never') +
      '</div>' +
      '<div class="section">Recent changes</div>' +
      '<div class="log">' + Store.auditLog().slice(0, 25).map(l =>
        '<div><span>' + esc(R().fmtDateTime(l.at)) + '</span> ' + esc(l.detail) + '</div>').join('') + '</div>';
  };

  function hrow(k, v) { return '<div><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>'; }

  function statTiles(pairs) {
    return '<div class="stats">' + pairs.map(p =>
      '<div class="stat"><b>' + esc(p[1]) + '</b><i>' + esc(p[0]) + '</i></div>').join('') + '</div>';
  }

  function tableHtml(headers, rows, align) {
    if (!rows.length) return '<p class="hint">Nothing in this range.</p>';
    return '<div class="tablewrap"><table><thead><tr>' +
      headers.map((h, i) => '<th' + (align[i] === 'n' ? ' class="n"' : '') + '>' + esc(h) + '</th>').join('') +
      '</tr></thead><tbody>' + rows.map(r => '<tr>' +
        r.map((c, i) => '<td' + (align[i] === 'n' ? ' class="n"' : '') + '>' + esc(c) + '</td>').join('') +
      '</tr>').join('') + '</tbody></table></div>';
  }

  // -------- entry editor
  SCREENS.entry = function () {
    const e = Store.entryById(state.admin.entryId);
    if (!e) return backBtn('admin') + head('Shift not found');
    const sites = R().sitesOf(e);
    return backBtn('admin') + head('Edit shift', e.name) +
      '<div class="form">' +
        '<label>Crew<select id="edCrew">' + CREWS.map(c => '<option' + (c === e.crew ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></label>' +
        '<label>Job / site (separate several with a comma)<input id="edSites" type="text" value="' + esc(sites.join(', ')) + '"></label>' +
        '<div class="two">' +
          '<label>Signed in<input id="edIn" type="datetime-local" value="' + esc(toLocalInput(e.inAt)) + '"></label>' +
          '<label>Signed out<input id="edOut" type="datetime-local" value="' + esc(toLocalInput(e.outAt)) + '"></label>' +
        '</div>' +
        '<label>Unpaid break (minutes)<input id="edBreak" type="number" min="0" max="600" value="' + esc(e.breakMins || 0) + '"></label>' +
        '<label>Job notes<textarea id="edNotes" rows="3">' + esc(e.notes || '') + '</textarea></label>' +
      '</div>' +
      '<p class="hint">Changes are logged. Original sign-in was ' + esc(R().fmtDateTime(e.createdAt)) + ' on ' + esc(e.device || 'this tablet') + '.</p>' +
      '<div class="btnrow"><button class="go" data-act="save-entry">Save</button></div>' +
      '<div class="btnrow"><button class="alt danger" data-act="del-entry">Remove this shift</button></div>';
  };

  SCREENS.newEntry = function () {
    const people = Store.employees().slice().sort((a, b) => a.name.localeCompare(b.name));
    const now = new Date();
    return backBtn('admin') + head('Add a missing shift', 'For someone who could not sign in on the tablet') +
      '<div class="form">' +
        '<label>Person<select id="neWho">' + people.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('') + '</select></label>' +
        '<label>Crew<select id="neCrew">' + CREWS.map(c => '<option>' + esc(c) + '</option>').join('') + '</select></label>' +
        '<label>Job / site<input id="neSite" type="text"></label>' +
        '<div class="two">' +
          '<label>Signed in<input id="neIn" type="datetime-local" value="' + esc(toLocalInput(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0).toISOString())) + '"></label>' +
          '<label>Signed out<input id="neOut" type="datetime-local" value="' + esc(toLocalInput(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 0).toISOString())) + '"></label>' +
        '</div>' +
        '<label>Reason<input id="neWhy" type="text" placeholder="e.g. tablet was flat"></label>' +
      '</div>' +
      (people.length ? '<button class="go" data-act="save-new-entry">Save shift</button>' : '<p class="hint">Add a person first.</p>');
  };

  SCREENS.person = function () {
    const p = Store.employeeById(state.admin.personId);
    if (!p) return backBtn('admin') + head('Not found');
    const others = Store.employees().filter(x => x.id !== p.id).sort((a, b) => a.name.localeCompare(b.name));
    return backBtn('admin') + head('Edit person', p.name) +
      '<div class="form">' +
        '<div class="two">' +
          '<label>First name<input id="peFirst" type="text" value="' + esc(p.first || '') + '"></label>' +
          '<label>Last name<input id="peLast" type="text" value="' + esc(p.last || '') + '"></label>' +
        '</div>' +
        '<label>Usual crew<select id="peCrew"><option value="">—</option>' + CREWS.map(c => '<option' + (c === p.crew ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></label>' +
      '</div>' +
      '<div class="btnrow"><button class="go" data-act="save-person-admin">Save</button></div>' +
      '<div class="section">Duplicate name?</div>' +
      '<p class="hint">Merging moves every shift onto the person you pick, then hides this one.</p>' +
      '<div class="form"><label>Merge this person into<select id="peMerge"><option value="">—</option>' +
        others.map(o => '<option value="' + o.id + '">' + esc(o.name) + '</option>').join('') + '</select></label></div>' +
      '<div class="btnrow"><button class="alt" data-act="merge-person">Merge</button>' +
      '<button class="alt danger" data-act="hide-person">Remove from list</button></div>';
  };

  // ------------------------------------------------------------------ actions
  const ACTIONS = {
    home: () => home(),
    cancel: () => home(),
    onsite: () => go('outWho'),

    'start-in': () => { state.flow = { mode: 'in' }; go('who'); },
    'start-out': () => { state.flow = { mode: 'out' }; go('outWho'); },
    who: () => go('who'),
    outWho: () => go('outWho'),
    site: () => go('site'),
    crew: () => go('crew'),
    outJob: () => go('outJob'),
    admin: () => { state.pin = ''; go('pin'); },

    'new-person': () => go('newperson'),

    'save-person': () => {
      const first = $('#fnEl').value.trim(), last = $('#lnEl').value.trim();
      if (!first) return toast('Please type your first name');
      const dup = Store.employees().find(p => p.name.toLowerCase() === (first + ' ' + last).trim().toLowerCase());
      const emp = dup || Store.saveEmployee({ first, last });
      if (!dup) Store.log('person', 'Added ' + emp.name);
      go('crew', { employee: emp });
    },

    'pick-person': el => {
      const emp = Store.employeeById(el.dataset.id);
      const open = Store.openEntryFor(emp.id);
      if (open) {
        state.flow = { mode: 'out', entry: open, employee: emp, sites: R().sitesOf(open) };
        toast(emp.name + ' is already signed in — signing out instead');
        return go('outJob');
      }
      go('crew', { employee: emp });
    },

    'pick-crew': el => go('site', { crew: el.dataset.crew }),
    'pick-site': el => { $('#siteEl').value = el.dataset.site; },

    'site-next': () => {
      const site = $('#siteEl').value.trim();
      if (!site) return toast('Please type where you are working');
      go('confirmIn', { site });
    },

    'do-signin': () => {
      const f = state.flow;
      const entry = Store.saveEntry({
        employeeId: f.employee.id, name: f.employee.name, crew: f.crew,
        siteIn: f.site, sites: [f.site], inAt: Store.nowISO(), outAt: null, breakMins: 0, notes: '',
      });
      const emp = Object.assign({}, f.employee, { crew: f.crew, lastSeen: entry.inAt, lastSite: f.site });
      Store.saveEmployee(emp);
      Store.flush();
      showDone('in', 'Signed in', f.employee.name + ' — ' + f.crew, R().fmtTime(entry.inAt), entry);
    },

    'pick-open': el => {
      const entry = Store.entryById(el.dataset.id);
      go('outJob', { entry, employee: { name: entry.name }, sites: R().sitesOf(entry).slice(), notes: entry.notes || '', breakMins: entry.breakMins || 0 });
    },

    'job-yes': () => {
      const s = Store.settings();
      if (s.askNotes || s.askBreak) go('outExtra'); else go('confirmOut');
    },
    'job-change': () => go('outAddJob', { replaceSite: true }),
    'job-add': () => go('outAddJob', { replaceSite: false }),
    'add-site-chip': el => { $('#siteEl').value = el.dataset.site; },
    'add-site': () => {
      const v = $('#siteEl').value.trim();
      if (!v) return toast('Type the job name');
      const f = state.flow;
      f.sites = f.replaceSite ? [v] : (f.sites || []).concat([v]);
      f.replaceSite = false;
      go('outJob');
    },
    'rm-site': el => {
      state.flow.sites.splice(Number(el.dataset.i), 1);
      go('outJob');
    },
    'pick-break': el => go('outExtra', { breakMins: Number(el.dataset.m) }),
    'extra-next': () => {
      const n = $('#notesEl');
      go('confirmOut', { notes: n ? n.value.trim() : '' });
    },

    'do-signout': () => {
      const f = state.flow;
      const before = Object.assign({}, f.entry);
      const entry = Store.saveEntry(Object.assign({}, f.entry, {
        outAt: Store.nowISO(), sites: f.sites, notes: f.notes || f.entry.notes || '', breakMins: f.breakMins || 0,
      }));
      const emp = Store.employeeById(entry.employeeId);
      if (emp) Store.saveEmployee(Object.assign({}, emp, { lastSeen: entry.outAt }));
      Store.flush();
      showDone('out', 'Signed out', entry.name + ' — ' + R().fmtTime(entry.outAt), R().hm(R().hoursOf(entry)) + ' today', entry, before);
    },

    undo: () => {
      const d = state.flow.done;
      clearTimeout(doneTimer);
      if (!d) return home();
      if (d.kind === 'in') {
        Store.voidEntry(d.entry.id, 'Undone on the tablet');
        toast('Sign in cancelled');
      } else {
        Store.saveEntry(Object.assign({}, d.entry, { outAt: null, sites: d.before.sites, notes: d.before.notes, breakMins: d.before.breakMins || 0 }));
        Store.log('undo', 'Sign-out undone for ' + d.entry.name);
        toast('Sign out cancelled — still signed in');
      }
      home();
    },

    // -------- admin
    pin: el => {
      state.pin = (state.pin || '') + el.dataset.n;
      const dots = $('#pindots');
      dots.textContent = '•'.repeat(state.pin.length);
      if (state.pin.length >= String(Store.settings().adminPin).length) ACTIONS['pin-ok']();
    },
    'pin-clear': () => { state.pin = ''; $('#pindots').textContent = ''; },
    'pin-ok': () => {
      if (state.pin === String(Store.settings().adminPin)) { state.pin = ''; go('admin'); }
      else { state.pin = ''; $('#pindots').textContent = ''; toast('Wrong PIN', 'bad'); }
    },
    tab: el => { state.admin.tab = el.dataset.tab; go('admin'); },
    view: el => { state.admin.view = el.dataset.v; go('admin'); },
    preset: el => { state.admin.preset = el.dataset.p; go('admin'); },
    'apply-dates': () => {
      const f = $('#fromEl').value, t = $('#toEl').value;
      if (!f || !t) return toast('Pick both dates');
      state.admin.from = R().dayStart(R().fromDayKey(f));
      state.admin.to = R().dayEnd(R().fromDayKey(t));
      go('admin');
    },

    'admin-signout': el => {
      const e = Store.entryById(el.dataset.id);
      Store.saveEntry(Object.assign({}, e, { outAt: Store.nowISO(), editedAt: Store.nowISO() }));
      Store.log('office', 'Office signed out ' + e.name);
      toast(e.name + ' signed out');
      go('admin');
    },
    'edit-entry': el => { state.admin.entryId = el.dataset.id; go('entry'); },
    'add-entry': () => go('newEntry'),

    'save-entry': () => {
      const e = Store.entryById(state.admin.entryId);
      const inAt = fromLocalInput($('#edIn').value);
      const outAt = fromLocalInput($('#edOut').value);
      if (!inAt) return toast('Sign-in time is required');
      if (outAt && new Date(outAt) <= new Date(inAt)) return toast('Sign-out must be after sign-in', 'bad');
      const sites = $('#edSites').value.split(',').map(s => s.trim()).filter(Boolean);
      Store.saveEntry(Object.assign({}, e, {
        crew: $('#edCrew').value, sites: sites.length ? sites : e.sites,
        inAt, outAt, breakMins: Number($('#edBreak').value) || 0,
        notes: $('#edNotes').value.trim(), editedAt: Store.nowISO(),
        autoClosed: !!e.autoClosed || (!!outAt && !e.outAt),   // signed out by the office, not by the worker
      }));
      Store.log('edit', 'Edited shift for ' + e.name + ' on ' + R().fmtDate(inAt));
      toast('Saved');
      go('admin');
    },
    'del-entry': () => {
      const e = Store.entryById(state.admin.entryId);
      const why = prompt('Why is this shift being removed? (kept in the log)');
      if (why === null) return;
      Store.voidEntry(e.id, why);
      toast('Shift removed');
      go('admin');
    },
    'save-new-entry': () => {
      const p = Store.employeeById($('#neWho').value);
      const inAt = fromLocalInput($('#neIn').value), outAt = fromLocalInput($('#neOut').value);
      if (!p || !inAt) return toast('Pick a person and a start time');
      if (outAt && new Date(outAt) <= new Date(inAt)) return toast('Sign-out must be after sign-in', 'bad');
      const site = $('#neSite').value.trim() || '(no job recorded)';
      Store.saveEntry({
        employeeId: p.id, name: p.name, crew: $('#neCrew').value, siteIn: site, sites: [site],
        inAt, outAt, breakMins: 0, notes: '', addedByOffice: true, editedAt: Store.nowISO(),
      });
      Store.log('office', 'Office added a shift for ' + p.name + ' (' + ($('#neWhy').value.trim() || 'no reason given') + ')');
      toast('Shift added');
      go('admin');
    },

    'edit-person': el => { state.admin.personId = el.dataset.id; go('person'); },
    'new-person-admin': () => { state.flow = { mode: 'admin' }; go('newperson'); },
    'save-person-admin': () => {
      const p = Store.employeeById(state.admin.personId);
      const updated = Store.saveEmployee(Object.assign({}, p, {
        first: $('#peFirst').value.trim(), last: $('#peLast').value.trim(), crew: $('#peCrew').value,
      }));
      Store.entries().filter(e => e.employeeId === p.id).forEach(e => {
        if (e.name !== updated.name) Store.saveEntry(Object.assign({}, e, { name: updated.name }));
      });
      Store.log('person', 'Renamed to ' + updated.name);
      toast('Saved');
      go('admin');
    },
    'merge-person': () => {
      const target = Store.employeeById($('#peMerge').value);
      const p = Store.employeeById(state.admin.personId);
      if (!target) return toast('Pick who to merge into');
      Store.entries().filter(e => e.employeeId === p.id).forEach(e => {
        Store.saveEntry(Object.assign({}, e, { employeeId: target.id, name: target.name }));
      });
      Store.saveEmployee(Object.assign({}, p, { void: true }));
      Store.log('person', 'Merged ' + p.name + ' into ' + target.name);
      toast('Merged');
      go('admin');
    },
    'hide-person': () => {
      const p = Store.employeeById(state.admin.personId);
      if (!confirm('Remove ' + p.name + ' from the sign-in list? Their past shifts are kept.')) return;
      Store.saveEmployee(Object.assign({}, p, { void: true }));
      Store.log('person', 'Removed ' + p.name + ' from the list');
      go('admin');
    },

    // -------- exports
    'export-xlsx': () => {
      const [from, to] = adminRange();
      const list = R().filter(from, to);
      if (!list.length) return toast('Nothing to export in this range');
      download(Xlsx.build(R().workbook(list, from, to)), 'RCK-hours-' + R().fileStamp(from, to) + '.xlsx');
      Store.log('export', 'Excel export ' + R().rangeLabel(from, to));
      toast('Excel file saved');
    },
    'export-pdf': () => {
      const [from, to] = adminRange();
      const list = R().filter(from, to);
      if (!list.length) return toast('Nothing to export in this range');
      download(Pdf.build(R().pdfDoc(list, from, to)), 'RCK-hours-' + R().fileStamp(from, to) + '.pdf');
      Store.log('export', 'PDF export ' + R().rangeLabel(from, to));
      toast('PDF saved');
    },
    rollcall: () => {
      download(Pdf.build(R().rollCallDoc()), 'RCK-rollcall-' + R().localDay(new Date().toISOString()) + '.pdf');
      toast('Roll call PDF saved');
    },

    // -------- data
    backup: () => {
      const blob = new Blob([JSON.stringify(Store.exportAll())], { type: 'application/json' });
      download(blob, 'RCK-signin-backup-' + R().localDay(new Date().toISOString()) + '.json');
      Store.setSetting('lastBackupAt', Store.nowISO());
      Store.log('backup', 'Backup file saved');
      toast('Backup saved — keep it somewhere safe');
      go('admin');
    },
    restore: () => $('#importFile').click(),
    'save-settings': () => {
      const set = (id, key, cast) => { const el = $('#' + id); if (el) Store.setSetting(key, cast ? cast(el.value) : el.value.trim()); };
      set('setEmail', 'alertEmail');
      set('setSync', 'syncUrl');
      set('setForgot', 'forgotHours', v => Number(v) || 24);
      set('setLong', 'longShiftHours', v => Number(v) || 14);
      set('setSite', 'siteName');
      set('setPin', 'adminPin');
      set('setIdle', 'idleSeconds', v => Number(v) || 60);
      if ($('#setNotes')) Store.setSetting('askNotes', $('#setNotes').checked);
      if ($('#setBreak')) Store.setSetting('askBreak', $('#setBreak').checked);
      Store.log('settings', 'Settings updated');
      toast('Settings saved');
      go('admin');
    },
    'sync-now': async () => {
      const r = await Store.flush();
      toast(Store.settings().syncUrl ? 'Sent ' + r.sent + ' record(s), ' + r.pending + ' waiting' : 'Add a sync URL first');
      go('admin');
    },
    resync: async () => {
      if (!Store.settings().syncUrl) return toast('Add a sync URL first');
      toast('Re-sending everything…');
      const r = await Store.resyncAll();
      toast('Sent ' + r.sent + ' record(s)');
      go('admin');
    },
    'send-alerts': async () => {
      const ok = await Store.sendAlerts(alertState.current);
      toast(ok ? 'Sent to the office' : 'Could not send — check the sync URL', ok ? '' : 'bad');
    },
    'mail-alerts': () => {
      const s = Store.settings();
      const body = alertState.current.map(a => '- ' + a.title + '\n  ' + a.detail).join('\n\n');
      location.href = 'mailto:' + encodeURIComponent(s.alertEmail) +
        '?subject=' + encodeURIComponent('RCK sign-in flags — ' + R().fmtDate(new Date().toISOString())) +
        '&body=' + encodeURIComponent(body);
    },
    fullscreen: () => {
      const el = document.documentElement;
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen();
    },
  };

  function showDone(kind, title, line, big, entry, before) {
    state.flow.done = { kind, title, line, big, entry, before };
    go('done');
    let left = 6;
    const el = $('#counting');
    const tick = () => {
      if (el) el.textContent = 'Back to the start screen in ' + left + '…';
      if (left-- <= 0) return home();
      doneTimer = setTimeout(tick, 1000);
    };
    tick();
    checkAlerts();
  }

  // ------------------------------------------------------------------- alerts
  const alertState = { current: [] };

  function refreshAlerts() {
    alertState.current = R().alerts();
    return alertState.current;
  }

  async function checkAlerts() {
    refreshAlerts();
    const s = Store.settings();
    if (!s.syncUrl || !alertState.current.length) return;
    const notified = s.notifiedAlerts || {};
    const fresh = alertState.current.filter(a => !notified[a.key]);
    if (!fresh.length) return;
    const ok = await Store.sendAlerts(fresh);
    if (ok) {
      fresh.forEach(a => { notified[a.key] = Store.nowISO(); });
      // Keep the ledger from growing forever.
      const keys = Object.keys(notified).sort((a, b) => notified[a].localeCompare(notified[b]));
      while (keys.length > 500) delete notified[keys.shift()];
      Store.setSetting('notifiedAlerts', notified);
    }
  }

  // --------------------------------------------------------------------- boot
  function bindEvents() {
    document.addEventListener('click', ev => {
      const el = ev.target.closest('[data-act]');
      resetIdle();
      if (!el) return;
      const fn = ACTIONS[el.dataset.act];
      if (fn) { ev.preventDefault(); fn(el); }
    });

    document.addEventListener('input', ev => {
      resetIdle();
      if (ev.target.id === 'nameSearch') {
        const q = ev.target.value.toLowerCase().trim();
        [...document.querySelectorAll('#peopleGrid .tile')].forEach(t => {
          const name = t.dataset.name || '';
          t.hidden = !!q && !!name && name.indexOf(q) < 0;
        });
      }
    });

    document.addEventListener('pointerdown', resetIdle, { passive: true });

    $('#importFile').addEventListener('change', ev => {
      const file = ev.target.files[0];
      if (!file) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const res = Store.importAll(JSON.parse(fr.result), 'merge');
          toast('Restored — ' + res.added + ' new, ' + res.updated + ' updated');
          go('admin');
        } catch (e) { toast(e.message || 'Could not read that file', 'bad'); }
      };
      fr.readAsText(file);
      ev.target.value = '';
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { keepAwake(); checkAlerts(); }
      else Store.forceMirror();
    });
    window.addEventListener('pagehide', () => Store.forceMirror());
    window.addEventListener('online', () => Store.flush());
  }

  async function boot() {
    await Store.init();
    bindEvents();
    await checkAlerts();
    render();
    keepAwake();
    clockTimer = setInterval(() => { tickClock(); if (state.screen === 'home') render(); }, 30000);
    setInterval(checkAlerts, ALERT_CHECK_MS);
    setInterval(() => Store.flush(), 60000);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* offline cache is a bonus, not a requirement */ });
    }
  }

  boot();
})();
