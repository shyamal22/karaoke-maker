/* Daily Vlog — capture through the day, compile a vlog at the end of it.
 *
 * Everything lives on the device: metadata and media blobs in IndexedDB, no
 * accounts, no server, works offline. Media blobs are kept in their own store
 * so listing a month of days never pulls gigabytes of video into memory.
 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const view = $('#view');

  const TAGS = [
    { k: 'daily',  l: 'Photo of the day' },
    { k: 'before', l: 'Before' },
    { k: 'after',  l: 'After' },
    { k: 'run',    l: 'Run' },
    { k: 'gym',    l: 'Gym' },
    { k: 'food',   l: 'Food' },
    { k: 'life',   l: 'Life' }
  ];
  const TAG_LABEL = Object.fromEntries(TAGS.map((t) => [t.k, t.l]));

  const DEFAULT_OPTS = {
    size: 'portrait',
    photoMs: 2200,
    maxClipMs: 6000,
    bpm: 0,
    intro: true,
    stats: true,
    compare: true,
    outro: true
  };

  /* ================= storage ================= */

  const DB_NAME = 'daily-vlog';
  let _db = null;

  function db() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('media')) {
          const m = d.createObjectStore('media', { keyPath: 'id' });
          m.createIndex('date', 'date');
        }
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('days')) d.createObjectStore('days', { keyPath: 'date' });
        if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  const reqp = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  const store = (name, mode) => db().then((d) => d.transaction(name, mode).objectStore(name));

  const dbGet = (name, key) => store(name, 'readonly').then((s) => reqp(s.get(key)));
  const dbPut = (name, val) => store(name, 'readwrite').then((s) => reqp(s.put(val)));
  const dbDel = (name, key) => store(name, 'readwrite').then((s) => reqp(s.delete(key)));
  const dbAll = (name) => store(name, 'readonly').then((s) => reqp(s.getAll()));

  const mediaFor = (date) => store('media', 'readonly')
    .then((s) => reqp(s.index('date').getAll(date)))
    .then((rows) => rows.sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt)));

  const blobOf = (id) => dbGet('blobs', id).then((r) => (r ? r.blob : null));

  async function saveMedia(rec, blob) {
    await dbPut('blobs', { id: rec.id, blob });
    await dbPut('media', rec);
  }

  async function deleteMedia(id) {
    await dbDel('media', id);
    await dbDel('blobs', id);
  }

  /* ================= small helpers ================= */

  const uid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function todayKey(d) {
    const x = d ? new Date(d) : new Date();
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  }
  const keyToDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const dayDiff = (a, b) => Math.round((keyToDate(a) - keyToDate(b)) / 86400000);

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function fmtDate(k, long) {
    const d = keyToDate(k);
    return long
      ? `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`
      : `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
  }
  const fmtDur = (ms) => {
    const s = Math.round((ms || 0) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const fmtSize = (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? Math.round(b / 1e6) + ' MB' : Math.round(b / 1e3) + ' KB');

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  const urlCache = new Map();
  function thumbURL(rec) {
    if (!rec.thumb) return '';
    if (urlCache.has(rec.id)) return urlCache.get(rec.id);
    const u = URL.createObjectURL(rec.thumb);
    urlCache.set(rec.id, u);
    return u;
  }

  function openSheet(html) {
    $('#sheetInner').innerHTML = html;
    $('#sheet').hidden = false;
  }
  function closeSheet() {
    const s = $('#sheet');
    if (s.dataset.url) { URL.revokeObjectURL(s.dataset.url); delete s.dataset.url; }
    s.hidden = true;
    $('#sheetInner').innerHTML = '';
  }

  function download(blob, name) {
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 30000);
  }

  /* ================= state ================= */

  const state = {
    tab: 'today',
    view: 'today',
    date: todayKey(),
    profile: { name: '', startDate: '', goal: '' },
    day: null,
    media: [],
    days: [],
    pendingTag: null,
    render: null
  };

  const dayNumber = (date) => {
    const start = state.profile.startDate || (state.days.length ? state.days[state.days.length - 1].date : date);
    return Math.max(1, dayDiff(date, start) + 1);
  };

  function streakCount() {
    const keys = state.days.map((d) => d.date).sort().reverse();
    if (!keys.length) return 0;
    const t = todayKey();
    if (keys[0] !== t && dayDiff(t, keys[0]) > 1) return 0;
    let n = 1;
    for (let i = 1; i < keys.length; i++) {
      if (dayDiff(keys[i - 1], keys[i]) === 1) n++; else break;
    }
    return n;
  }

  async function loadDays() {
    const all = await dbAll('days');
    state.days = all.sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  async function ensureDay(date) {
    let d = await dbGet('days', date);
    if (!d) {
      d = { date, title: '', notes: '', stats: {}, opts: { ...DEFAULT_OPTS }, createdAt: Date.now() };
      await dbPut('days', d);
      await loadDays();
    }
    if (!d.opts) d.opts = { ...DEFAULT_OPTS };
    // logging a day earlier than the recorded start means the journey began then
    if (!state.profile.startDate || date < state.profile.startDate) {
      state.profile.startDate = date;
      await dbPut('meta', { k: 'profile', ...state.profile });
    }
    return d;
  }

  async function loadDay(date) {
    state.date = date;
    state.day = await ensureDay(date);
    state.media = await mediaFor(date);
  }

  const saveDay = () => dbPut('days', state.day);

  /* ================= import ================= */

  async function addFiles(files, tag) {
    if (!files || !files.length) return;
    const list = Array.from(files);
    toast(list.length > 1 ? `Adding ${list.length} items…` : 'Adding…');
    let order = state.media.reduce((m, x) => Math.max(m, x.order || 0), 0);

    for (const f of list) {
      const isVideo = (f.type || '').startsWith('video') || /\.(mp4|mov|m4v|webm|avi)$/i.test(f.name);
      const id = uid();
      const rec = {
        id, date: state.date, kind: isVideo ? 'video' : 'photo',
        tag: tag || (isVideo ? 'life' : 'life'),
        caption: '', include: true, order: ++order,
        createdAt: f.lastModified || Date.now(),
        w: 0, h: 0, durationMs: 0, trimIn: 0, trimOut: 0, mute: false,
        bytes: f.size, name: f.name
      };
      try {
        if (isVideo) {
          const meta = await Vlog.probeVideo(f);
          rec.w = meta.w; rec.h = meta.h; rec.durationMs = meta.durationMs;
          rec.trimOut = Math.min(meta.durationMs || 6000, 6000);
          rec.thumb = await Vlog.videoThumb(f, 200);
          await saveMedia(rec, f);
        } else {
          const small = await Vlog.shrinkImage(f, 1920, 0.86);
          rec.w = small.w; rec.h = small.h;
          rec.bytes = small.blob.size;
          rec.thumb = await Vlog.thumbFromImage(small.blob, 400);
          await saveMedia(rec, small.blob);
        }
      } catch (e) {
        toast('Could not add ' + (f.name || 'a file'));
        continue;
      }
      if (rec.tag === 'daily') await clearOtherDaily(rec.id);
      state.media.push(rec);
    }
    state.media.sort((a, b) => (a.order - b.order));
    await ensureDay(state.date);
    render();
    toast('Added');
  }

  async function clearOtherDaily(keepId) {
    for (const m of state.media) {
      if (m.id !== keepId && m.tag === 'daily') { m.tag = 'life'; await dbPut('media', m); }
    }
  }

  /* ================= views ================= */

  function render() {
    $('#backBtn').hidden = !(state.view === 'compile' || state.view === 'settings' || (state.view === 'today' && state.date !== todayKey()));
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.tab));
    if (state.view === 'today') viewDay();
    else if (state.view === 'days') viewDays();
    else if (state.view === 'journey') viewJourney();
    else if (state.view === 'compile') viewCompile();
    else if (state.view === 'settings') viewSettings();
    window.scrollTo(0, 0);
  }

  function tile(m) {
    const badge = m.tag && m.tag !== 'life' ? `<span class="tag">${esc(TAG_LABEL[m.tag] || m.tag)}</span>` : '';
    const dur = m.kind === 'video' ? `<span class="dur">${fmtDur((m.trimOut || m.durationMs) - (m.trimIn || 0))}</span>` : '';
    const n = m.include ? state.media.filter((x) => x.include).indexOf(m) + 1 : 0;
    return `<button class="tile ${m.include ? '' : 'off'}" data-act="media" data-id="${m.id}">
      ${m.thumb ? `<img src="${thumbURL(m)}" alt="">` : ''}
      ${badge}${dur}<span class="ord">${n || '–'}</span>
    </button>`;
  }

  /* ---------- day ---------- */

  function viewDay() {
    const d = state.day, m = state.media;
    const isToday = state.date === todayKey();
    $('#title').textContent = isToday ? 'Today' : fmtDate(state.date);

    const daily = m.find((x) => x.tag === 'daily');
    const before = m.find((x) => x.tag === 'before');
    const after = m.find((x) => x.tag === 'after');
    const included = m.filter((x) => x.include);
    const clipMs = included.reduce((t, x) => t + (x.kind === 'video'
      ? Math.min((x.trimOut || x.durationMs) - (x.trimIn || 0), d.opts.maxClipMs)
      : d.opts.photoMs), 0);
    const est = clipMs + (d.opts.intro ? 2400 : 0) + (d.opts.stats ? 2600 : 0) + (d.opts.outro ? 2400 : 0);
    const s = d.stats || {};

    const slot = (item, label, tag) => item
      ? `<button class="slot" data-act="media" data-id="${item.id}"><img src="${thumbURL(item)}" alt=""><span class="lbl">${label}</span></button>`
      : `<button class="slot" data-act="cap-photo" data-tag="${tag}"><span style="font-size:26px">+</span><span>${label}</span></button>`;

    view.innerHTML = `
      <div class="hero"><span class="daynum">DAY ${dayNumber(state.date)}</span>
        <span class="sub">${esc(fmtDate(state.date, true))}</span></div>

      <div class="stat-strip">
        <div><b>${m.length}</b><small>Captured</small></div>
        <div><b>${fmtDur(est)}</b><small>Vlog length</small></div>
        <div><b>${streakCount()}</b><small>Day streak</small></div>
      </div>

      <div class="btn-grid" style="margin:12px 0">
        <button class="btn" data-act="cap-photo">&#128247; Photo</button>
        <button class="btn" data-act="cap-video">&#127909; Video</button>
      </div>
      <button class="btn wide" data-act="import-media">&#43; Add from library</button>

      <h3>The daily shot</h3>
      <div class="grid" style="grid-template-columns:repeat(3,1fr)">
        ${slot(daily, 'Photo of the day', 'daily')}
        ${slot(before, 'Before', 'before')}
        ${slot(after, 'After', 'after')}
      </div>

      <h3>Everything from today ${m.length ? `<span class="muted">(${included.length} in the vlog)</span>` : ''}</h3>
      ${m.length
        ? `<div class="grid">${m.map(tile).join('')}</div>
           <div class="row" style="margin-top:8px">
             <button class="btn sm" data-act="sort-time">Sort by time taken</button>
             <button class="btn sm" data-act="all-on">Include all</button>
           </div>`
        : `<div class="card center muted">Nothing yet. Shoot a photo or a clip whenever something happens — a run, a meal, the gym, a thought to camera.</div>`}

      <h3>How the day went</h3>
      <div class="card">
        <label class="field"><span>Headline</span>
          <input type="text" id="fTitle" placeholder="e.g. First 10k without stopping" value="${esc(d.title)}"></label>
        <div class="row">
          <label class="field grow"><span>Distance (km)</span><input type="number" step="0.01" inputmode="decimal" id="sDist" value="${s.distanceKm ?? ''}"></label>
          <label class="field grow"><span>Moving (min)</span><input type="number" step="1" inputmode="numeric" id="sTime" value="${s.durationMin ?? ''}"></label>
        </div>
        <div class="row">
          <label class="field grow"><span>Weight (kg)</span><input type="number" step="0.1" inputmode="decimal" id="sWeight" value="${s.weightKg ?? ''}"></label>
          <label class="field grow"><span>Energy 1–5</span><input type="number" min="1" max="5" step="1" inputmode="numeric" id="sEnergy" value="${s.energy ?? ''}"></label>
        </div>
        <label class="field"><span>Notes to self</span>
          <textarea id="fNotes" placeholder="How it felt, what was hard, what you'd do differently.">${esc(d.notes)}</textarea></label>
        <button class="btn sm" data-act="save-day">Save</button>
      </div>

      <div class="gap"></div>
      <button class="btn primary wide" data-act="compile" ${m.length ? '' : 'disabled'}>Make today's vlog &#9654;</button>
      <div class="gap"></div>
      <button class="btn wide danger sm" data-act="del-day">Delete this day</button>
    `;
  }

  /* ---------- days ---------- */

  async function viewDays() {
    $('#title').textContent = 'Days';
    await loadDays();
    const counts = {};
    const all = await dbAll('media');
    all.forEach((m) => { (counts[m.date] = counts[m.date] || []).push(m); });

    view.innerHTML = `
      <h2>Every day so far</h2>
      <p class="sub">${state.days.length} logged &middot; ${streakCount()} day streak</p>
      <div class="gap"></div>
      <button class="btn wide" data-act="new-day">Open another date</button>
      <div class="gap"></div>
      <div class="daylist">
        ${state.days.map((d) => {
          const items = counts[d.date] || [];
          const daily = items.find((x) => x.tag === 'daily') || items.find((x) => x.thumb);
          return `<button class="dayrow" data-act="open-day" data-date="${d.date}">
            ${daily && daily.thumb ? `<img src="${thumbURL(daily)}" alt="">` : '<span class="no-img"></span>'}
            <span class="grow">
              <b>Day ${dayNumber(d.date)}</b> <span class="muted">&middot; ${esc(fmtDate(d.date))}</span><br>
              <span class="sub">${esc(d.title || (items.length ? `${items.length} item${items.length > 1 ? 's' : ''}` : 'Nothing captured'))}</span>
            </span>
            <span class="muted">&rsaquo;</span>
          </button>`;
        }).join('') || '<div class="card center muted">No days yet.</div>'}
      </div>`;
  }

  /* ---------- journey ---------- */

  async function viewJourney() {
    $('#title').textContent = 'Journey';
    await loadDays();
    const all = await dbAll('media');
    const dailies = all.filter((m) => m.tag === 'daily' && m.thumb).sort((a, b) => (a.date < b.date ? -1 : 1));
    const totals = state.days.reduce((t, d) => {
      const s = d.stats || {};
      t.km += Number(s.distanceKm) || 0;
      t.min += Number(s.durationMin) || 0;
      return t;
    }, { km: 0, min: 0 });
    const weights = state.days.filter((d) => d.stats && d.stats.weightKg).sort((a, b) => (a.date < b.date ? -1 : 1));
    const wDelta = weights.length > 1 ? (Number(weights[weights.length - 1].stats.weightKg) - Number(weights[0].stats.weightKg)) : null;

    view.innerHTML = `
      <h2>The journey</h2>
      <p class="sub">${state.profile.startDate ? `Started ${esc(fmtDate(state.profile.startDate, true))}` : 'Set a start date in Settings'}</p>

      <div class="stat-strip" style="grid-template-columns:repeat(4,1fr)">
        <div><b>${state.days.length}</b><small>Days</small></div>
        <div><b>${totals.km.toFixed(1)}</b><small>km</small></div>
        <div><b>${Math.round(totals.min / 60)}h</b><small>Moving</small></div>
        <div><b>${wDelta == null ? '–' : (wDelta > 0 ? '+' : '') + wDelta.toFixed(1)}</b><small>kg</small></div>
      </div>

      <h3>Photo a day (${dailies.length})</h3>
      ${dailies.length
        ? `<div class="grid">${dailies.map((m) => `<button class="tile" data-act="open-day" data-date="${m.date}">
             <img src="${thumbURL(m)}" alt=""><span class="tag">${esc(fmtDate(m.date).replace(/^\w+ /, ''))}</span></button>`).join('')}</div>`
        : '<div class="card center muted">Tag one photo a day as <b>Photo of the day</b> and they all line up here.</div>'}

      ${dailies.length > 1 ? `
        <h3>Then &amp; now</h3>
        <div class="row">
          <div class="grow"><div class="slot"><img src="${thumbURL(dailies[0])}" alt=""><span class="lbl">Day 1</span></div></div>
          <div class="grow"><div class="slot"><img src="${thumbURL(dailies[dailies.length - 1])}" alt=""><span class="lbl">Day ${dayNumber(dailies[dailies.length - 1].date)}</span></div></div>
        </div>` : ''}

      <div class="gap"></div>
      <button class="btn primary wide" data-act="recap" ${dailies.length > 1 ? '' : 'disabled'}>Compile the journey recap &#9654;</button>
      <p class="sub center" style="margin-top:8px">Every daily photo, cut fast, start to now.</p>
    `;
  }

  /* ---------- settings ---------- */

  function viewSettings() {
    $('#title').textContent = 'Settings';
    const p = state.profile;
    view.innerHTML = `
      <div class="card">
        <label class="field"><span>Your name (shown on the outro)</span>
          <input type="text" id="pName" value="${esc(p.name)}" placeholder="Optional"></label>
        <label class="field"><span>Journey started</span>
          <input type="date" id="pStart" value="${esc(p.startDate)}"></label>
        <label class="field"><span>What you're chasing</span>
          <input type="text" id="pGoal" value="${esc(p.goal)}" placeholder="e.g. Sub-25 5k by Christmas"></label>
        <button class="btn sm" data-act="save-profile">Save</button>
      </div>

      <h3>Music</h3>
      <div class="card">
        <p class="sub">Pick an audio file from your device to use as the bed under every vlog. Use music you own or that is cleared for use — nothing is downloaded from the internet.</p>
        <div id="musicRow" class="row"><span class="muted grow">No music set</span></div>
        <div class="gap"></div>
        <button class="btn sm" data-act="pick-music">Choose audio file</button>
      </div>

      <h3>Your data</h3>
      <div class="card">
        <p class="sub">Everything is stored on this device only. Export a backup regularly and keep it somewhere safe.</p>
        <div class="btn-grid">
          <button class="btn sm" data-act="export">Export backup</button>
          <button class="btn sm" data-act="import">Import backup</button>
        </div>
        <div class="gap"></div>
        <div id="storageLine" class="sub"></div>
      </div>

      <div class="gap"></div>
      <button class="btn wide danger sm" data-act="wipe">Erase everything</button>
      <p class="sub center" style="margin-top:14px">Daily Vlog &middot; works offline &middot; add to your home screen</p>
    `;
    showStorage($('#storageLine'));
    dbGet('meta', 'music').then((rec) => {
      const row = $('#musicRow');
      if (row && rec && rec.name) {
        row.innerHTML = `<span class="grow">&#9835; ${esc(rec.name)}</span><button class="btn sm" data-act="clear-music">Remove</button>`;
      }
    });
  }

  async function showStorage(node) {
    if (!node) return;
    let line = '';
    try {
      const est = await navigator.storage.estimate();
      line = `Using about ${fmtSize(est.usage || 0)}`;
      if (est.quota) line += ` of ${fmtSize(est.quota)} available`;
    } catch (e) { line = 'Storage size unavailable'; }
    node.textContent = line;
  }

  /* ================= compile ================= */

  async function buildContext(kind) {
    const p = state.profile;
    if (kind === 'recap') {
      const all = await dbAll('media');
      const dailies = all.filter((m) => m.tag === 'daily').sort((a, b) => (a.date < b.date ? -1 : 1));
      const items = dailies.map((m, i) => ({
        id: m.id, kind: 'photo', mediaId: m.id,
        caption: i === 0 || i === dailies.length - 1 ? `Day ${dayNumber(m.date)}` : '',
        badge: ''
      }));
      const totals = state.days.reduce((t, d) => t + (Number((d.stats || {}).distanceKm) || 0), 0);
      return {
        opts: { ...DEFAULT_OPTS, photoMs: 420, stats: false, compare: true, ...(state.recapOpts || {}) },
        items,
        kicker: p.goal || 'The journey',
        title: `${state.days.length} days`,
        subtitle: p.name || '',
        heroItem: dailies.length ? { mediaId: dailies[dailies.length - 1].id } : null,
        compare: dailies.length > 1
          ? { a: { mediaId: dailies[0].id }, b: { mediaId: dailies[dailies.length - 1].id }, labelA: 'Day 1', labelB: `Day ${dayNumber(dailies[dailies.length - 1].date)}` }
          : null,
        outro: [`${state.days.length} days`, totals ? `${totals.toFixed(0)} km` : (p.goal || ''), p.name || ''].filter(Boolean),
        fileBase: 'journey-recap'
      };
    }

    const d = state.day;
    const s = d.stats || {};
    const included = state.media.filter((m) => m.include);
    const daily = state.media.find((m) => m.tag === 'daily');
    const before = state.media.find((m) => m.tag === 'before');
    const after = state.media.find((m) => m.tag === 'after');

    const items = included.map((m) => ({
      id: m.id, mediaId: m.id, kind: m.kind,
      caption: m.caption || '',
      badge: m.tag === 'daily' ? `DAY ${dayNumber(d.date)}` : '',
      durationMs: m.durationMs, trimIn: m.trimIn || 0, trimOut: m.trimOut || m.durationMs, mute: !!m.mute
    }));

    const stats = [];
    if (s.distanceKm) stats.push({ v: Number(s.distanceKm).toFixed(2).replace(/\.?0+$/, '') + ' km', l: 'Distance' });
    if (s.durationMin) stats.push({ v: `${Math.floor(s.durationMin / 60) ? Math.floor(s.durationMin / 60) + 'h ' : ''}${s.durationMin % 60}m`, l: 'Moving' });
    if (s.distanceKm && s.durationMin) {
      const pace = s.durationMin / s.distanceKm;
      stats.push({ v: `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, '0')}`, l: 'Pace /km' });
    }
    if (s.weightKg) stats.push({ v: Number(s.weightKg).toFixed(1), l: 'Weight kg' });
    if (s.energy) stats.push({ v: '★'.repeat(Math.min(5, Number(s.energy))), l: 'Energy' });

    return {
      opts: d.opts,
      items,
      kicker: `Day ${dayNumber(d.date)}`,
      title: d.title || fmtDate(d.date, true),
      subtitle: d.title ? fmtDate(d.date, true) : (p.goal || ''),
      heroItem: daily ? { mediaId: daily.id } : null,
      stats,
      statsHeading: 'The numbers',
      compare: before && after ? { a: { mediaId: before.id }, b: { mediaId: after.id }, labelA: 'Before', labelB: 'After' } : null,
      outro: [`Day ${dayNumber(d.date)}`, p.name || '', `${streakCount()} day streak`].filter(Boolean),
      fileBase: `vlog-${d.date}`
    };
  }

  function viewCompile() {
    const recap = state.compileKind === 'recap';
    $('#title').textContent = recap ? 'Journey recap' : 'Make the vlog';
    const o = recap ? (state.recapOpts = state.recapOpts || { ...DEFAULT_OPTS, photoMs: 420, stats: false }) : state.day.opts;
    const ok = Vlog.supported();

    view.innerHTML = `
      ${ok ? '' : '<div class="notice bad">This browser can\'t record video. Open the app in Chrome, or Safari on iOS 15 or newer.</div>'}
      <div class="stage ${o.size === 'wide' ? 'wide' : ''}" id="stageBox" hidden><canvas id="stage"></canvas></div>

      <div id="progWrap" hidden>
        <div class="bar"><i id="progBar"></i></div>
        <div class="sub center" id="progText">Preparing…</div>
        <div class="gap"></div>
        <button class="btn wide danger" data-act="cancel-render">Stop</button>
      </div>

      <div id="setupWrap">
        <h2>${recap ? 'The whole journey' : "Today's vlog"}</h2>
        <p class="sub" id="planLine">Working out the edit…</p>
        <div class="gap"></div>
        <button class="btn primary wide" data-act="start-render" ${ok ? '' : 'disabled'}>Render the vlog &#9654;</button>
        <div class="notice" style="margin-top:12px">Rendering happens in real time, so a 1 minute vlog takes about a minute. Keep this screen open and don't switch apps while it runs.</div>

        <h3>Shape of it</h3>
        <div class="card">
          <div class="chips" style="margin-bottom:12px">
            ${[['portrait', 'Vertical 9:16'], ['square', 'Square 1:1'], ['wide', 'Wide 16:9']].map(([k, l]) =>
              `<button class="chip ${o.size === k ? 'on' : ''}" data-act="opt-size" data-v="${k}">${l}</button>`).join('')}
          </div>
          <label class="field"><span>Photo hold — ${(o.photoMs / 1000).toFixed(1)}s</span>
            <input type="range" min="300" max="5000" step="100" id="oPhoto" value="${o.photoMs}"></label>
          <label class="field"><span>Longest clip — ${(o.maxClipMs / 1000).toFixed(0)}s</span>
            <input type="range" min="1000" max="15000" step="500" id="oClip" value="${o.maxClipMs}"></label>
          <label class="field"><span>Cut to the beat (BPM, 0 = off)</span>
            <input type="number" inputmode="numeric" id="oBpm" value="${o.bpm || 0}" placeholder="0"></label>
          <div class="check"><input type="checkbox" id="oIntro" ${o.intro ? 'checked' : ''}><label for="oIntro">Title card</label></div>
          <div class="check"><input type="checkbox" id="oStats" ${o.stats ? 'checked' : ''}><label for="oStats">Stats card</label></div>
          <div class="check"><input type="checkbox" id="oCompare" ${o.compare ? 'checked' : ''}><label for="oCompare">Before / after split</label></div>
          <div class="check"><input type="checkbox" id="oOutro" ${o.outro ? 'checked' : ''}><label for="oOutro">Outro card</label></div>
        </div>

        <h3>Music</h3>
        <div class="card tight"><div id="musicRow" class="row"><span class="muted grow">No music set</span>
          <button class="btn sm" data-act="pick-music">Choose</button></div></div>
      </div>

      <div id="resultWrap" hidden></div>
    `;

    dbGet('meta', 'music').then((rec) => {
      const row = $('#musicRow');
      if (row && rec && rec.name) row.innerHTML = `<span class="grow">&#9835; ${esc(rec.name)}</span><button class="btn sm" data-act="pick-music">Change</button>`;
    });

    // show what the edit will come out to, without touching any media
    buildContext(state.compileKind).then((c) => {
      const line = $('#planLine');
      if (!line) return;
      if (!c.items.length) { line.textContent = 'Nothing to include yet.'; return; }
      const p = Vlog.buildPlan(c);
      line.textContent = `${p.segments.length} scenes · about ${fmtDur(p.totalMs)}`;
    }).catch(() => {});
  }

  /** Swap {mediaId} references for real blobs, lazily, as the renderer asks. */
  function attachLoaders(ctx) {
    const wrap = (o) => {
      if (!o || !o.mediaId) return o;
      o.getBlob = () => blobOf(o.mediaId);
      return o;
    };
    (ctx.items || []).forEach(wrap);
    wrap(ctx.heroItem);
    if (ctx.compare) { wrap(ctx.compare.a); wrap(ctx.compare.b); }
    return ctx;
  }

  async function startRender() {
    const kind = state.compileKind;
    const ctx = attachLoaders(await buildContext(kind));
    if (!ctx.items.length) { toast('Nothing to put in the vlog'); return; }

    const plan = Vlog.buildPlan(ctx);
    const musicRec = await dbGet('meta', 'music');
    const signal = { cancel: false };
    state.render = signal;

    $('#setupWrap').hidden = true;
    $('#stageBox').hidden = false;
    $('#progWrap').hidden = false;
    $('#resultWrap').hidden = true;

    let wake = null;
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) {}

    try {
      const out = await Vlog.render(plan, {
        size: ctx.opts.size,
        canvas: $('#stage'),
        music: musicRec ? musicRec.blob : null,
        signal,
        onProgress: (frac, label) => {
          const bar = $('#progBar'), txt = $('#progText');
          if (bar) bar.style.width = Math.round(frac * 100) + '%';
          if (txt) txt.textContent = `${label} — ${Math.round(frac * 100)}%`;
        }
      });
      if (!out) { toast('Stopped'); $('#progWrap').hidden = true; $('#setupWrap').hidden = false; return; }
      showResult(out, ctx);
    } catch (e) {
      $('#progWrap').hidden = true;
      $('#setupWrap').hidden = false;
      view.insertAdjacentHTML('afterbegin', `<div class="notice bad">${esc(e.message || 'Render failed')}</div>`);
    } finally {
      state.render = null;
      if (wake) { try { wake.release(); } catch (e) {} }
    }
  }

  function showResult(out, ctx) {
    $('#progWrap').hidden = true;
    if (state.out && state.out.url) URL.revokeObjectURL(state.out.url);
    const name = `${ctx.fileBase}.${out.ext}`;
    const url = URL.createObjectURL(out.blob);
    const wrap = $('#resultWrap');
    wrap.hidden = false;
    wrap.innerHTML = `
      <div class="gap"></div>
      <div class="spread"><b>Done — ${fmtDur(out.durationMs)}</b><span class="muted">${fmtSize(out.blob.size)}</span></div>
      <div class="gap"></div>
      <video id="outVid" src="${url}" controls playsinline style="width:100%;border-radius:16px;background:#000"></video>
      <div class="gap"></div>
      <button class="btn primary wide" data-act="save-out">Save to device</button>
      <div class="gap"></div>
      <button class="btn wide" data-act="share-out" hidden id="shareBtn">Share</button>
      <div class="gap"></div>
      <button class="btn wide sm" data-act="again">Change something and render again</button>
      <p class="sub center" style="margin-top:10px">The finished file isn't kept in the app — save or share it now.</p>
    `;
    $('#stageBox').hidden = true;
    state.out = { blob: out.blob, name, type: out.mime, url };

    if (navigator.canShare) {
      try {
        const f = new File([out.blob], name, { type: out.mime });
        if (navigator.canShare({ files: [f] })) $('#shareBtn').hidden = false;
      } catch (e) {}
    }
  }

  /* ================= media sheet ================= */

  async function mediaSheet(id) {
    const m = state.media.find((x) => x.id === id);
    if (!m) return;
    const blob = await blobOf(id);
    const url = blob ? URL.createObjectURL(blob) : '';
    const preview = m.kind === 'video'
      ? `<video id="mPrev" src="${url}" playsinline controls style="width:100%;max-height:44vh;border-radius:14px;background:#000"></video>`
      : `<img src="${url}" style="width:100%;max-height:44vh;object-fit:contain;border-radius:14px" alt="">`;

    openSheet(`
      ${preview}
      <div class="gap"></div>
      <label class="field"><span>Caption on screen</span>
        <input type="text" id="mCap" value="${esc(m.caption)}" placeholder="Optional — big text over the shot"></label>

      <h3 style="margin-top:6px">Tag</h3>
      <div class="chips">${TAGS.map((t) => `<button class="chip ${m.tag === t.k ? 'on' : ''}" data-act="set-tag" data-id="${m.id}" data-v="${t.k}">${t.l}</button>`).join('')}</div>

      ${m.kind === 'video' && m.durationMs ? `
        <h3>Trim — ${fmtDur((m.trimOut || m.durationMs) - (m.trimIn || 0))} used</h3>
        <label class="field"><span>Start ${fmtDur(m.trimIn || 0)}</span>
          <input type="range" id="mIn" min="0" max="${m.durationMs}" step="100" value="${m.trimIn || 0}"></label>
        <label class="field"><span>End ${fmtDur(m.trimOut || m.durationMs)}</span>
          <input type="range" id="mOut" min="0" max="${m.durationMs}" step="100" value="${m.trimOut || m.durationMs}"></label>
        <div class="check"><input type="checkbox" id="mMute" ${m.mute ? 'checked' : ''}><label for="mMute">Mute this clip</label></div>
      ` : ''}

      <div class="check"><input type="checkbox" id="mInc" ${m.include ? 'checked' : ''}><label for="mInc">Include in the vlog</label></div>

      <div class="btn-grid" style="margin-top:10px">
        <button class="btn sm" data-act="move" data-id="${m.id}" data-v="-1">&#8592; Earlier</button>
        <button class="btn sm" data-act="move" data-id="${m.id}" data-v="1">Later &#8594;</button>
      </div>
      <div class="gap"></div>
      <button class="btn wide" data-act="close-sheet">Done</button>
      <div class="gap"></div>
      <button class="btn wide danger sm" data-act="del-media" data-id="${m.id}">Delete</button>
    `);

    const save = async (patch) => { Object.assign(m, patch); await dbPut('media', m); };
    const cap = $('#mCap');
    if (cap) cap.onchange = () => save({ caption: cap.value.trim() });
    const inc = $('#mInc');
    if (inc) inc.onchange = () => save({ include: inc.checked }).then(render);
    const mi = $('#mIn'), mo = $('#mOut'), mm = $('#mMute'), prev = $('#mPrev');
    if (mi) mi.oninput = () => {
      const v = Math.min(Number(mi.value), Number(mo.value) - 500);
      mi.value = v;
      if (prev) prev.currentTime = v / 1000;
      save({ trimIn: v }).then(render);
    };
    if (mo) mo.oninput = () => {
      const v = Math.max(Number(mo.value), Number(mi.value) + 500);
      mo.value = v;
      if (prev) prev.currentTime = v / 1000;
      save({ trimOut: v }).then(render);
    };
    if (mm) mm.onchange = () => save({ mute: mm.checked });
    if (url) $('#sheet').dataset.url = url;
  }

  /* ================= backup ================= */

  const blobToDataURL = (b) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  function dataURLToBlob(u) {
    const [head, body] = u.split(',');
    const mime = (head.match(/:(.*?);/) || [, 'application/octet-stream'])[1];
    const bin = atob(body);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  async function exportBackup() {
    toast('Building backup…');
    const days = await dbAll('days');
    const media = await dbAll('media');
    const out = { app: 'daily-vlog', version: 1, exportedAt: new Date().toISOString(), profile: state.profile, days, media: [], skippedVideos: 0 };
    for (const m of media) {
      const rec = { ...m };
      delete rec.thumb;
      if (m.kind === 'photo') {
        const b = await blobOf(m.id);
        if (b) rec.data = await blobToDataURL(b);
      } else {
        out.skippedVideos++;
      }
      out.media.push(rec);
    }
    download(new Blob([JSON.stringify(out)], { type: 'application/json' }), `daily-vlog-backup-${todayKey()}.json`);
    toast(out.skippedVideos ? `Saved — ${out.skippedVideos} video(s) left out (too large)` : 'Backup saved');
  }

  async function importBackup(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { return toast('That file is not a backup'); }
    if (data.app !== 'daily-vlog') return toast('That file is not a Daily Vlog backup');
    for (const d of data.days || []) await dbPut('days', d);
    for (const m of data.media || []) {
      const rec = { ...m };
      const data64 = rec.data; delete rec.data;
      if (data64) {
        const blob = dataURLToBlob(data64);
        rec.thumb = await Vlog.thumbFromImage(blob, 400);
        await saveMedia(rec, blob);
      } else if (rec.kind === 'photo') {
        continue; // photo with no pixels is not worth restoring
      } else {
        await dbPut('media', rec); // video metadata only; the file itself wasn't in the backup
      }
    }
    if (data.profile) { state.profile = data.profile; await dbPut('meta', { k: 'profile', ...state.profile }); }
    await loadDays();
    await loadDay(state.date);
    render();
    toast('Backup restored');
  }

  /* ================= events ================= */

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) {
      if (!e.target.closest('#menu') && !e.target.closest('#menuBtn')) $('#menu').hidden = true;
      if (e.target.id === 'sheet') closeSheet();
      return;
    }
    const act = t.dataset.act, id = t.dataset.id, v = t.dataset.v;
    $('#menu').hidden = true;

    switch (act) {
      case 'cap-photo': state.pendingTag = t.dataset.tag || null; $('#capPhoto').click(); break;
      case 'cap-video': state.pendingTag = t.dataset.tag || null; $('#capVideo').click(); break;
      case 'import-media': state.pendingTag = null; $('#pickMedia').click(); break;
      case 'pick-music': $('#pickMusic').click(); break;
      case 'clear-music': await dbDel('meta', 'music'); render(); toast('Music removed'); break;

      case 'media': closeSheet(); mediaSheet(id); break;
      case 'close-sheet': closeSheet(); render(); break;

      case 'set-tag': {
        const m = state.media.find((x) => x.id === id);
        if (!m) break;
        m.tag = v;
        await dbPut('media', m);
        if (v === 'daily') await clearOtherDaily(id);
        closeSheet();
        render();
        break;
      }

      case 'move': {
        const list = state.media.slice();
        const i = list.findIndex((x) => x.id === id);
        const j = i + Number(v);
        if (i < 0 || j < 0 || j >= list.length) break;
        [list[i], list[j]] = [list[j], list[i]];
        for (let k = 0; k < list.length; k++) { list[k].order = k + 1; await dbPut('media', list[k]); }
        state.media = list;
        closeSheet();
        render();
        toast('Reordered');
        break;
      }

      case 'del-media':
        if (!confirm('Delete this item?')) break;
        await deleteMedia(id);
        state.media = state.media.filter((x) => x.id !== id);
        closeSheet();
        render();
        break;

      case 'sort-time': {
        const list = state.media.slice().sort((a, b) => a.createdAt - b.createdAt);
        for (let k = 0; k < list.length; k++) { list[k].order = k + 1; await dbPut('media', list[k]); }
        state.media = list;
        render();
        toast('Sorted by time taken');
        break;
      }

      case 'all-on':
        for (const m of state.media) { m.include = true; await dbPut('media', m); }
        render();
        break;

      case 'save-day': await collectDay(); toast('Saved'); break;

      case 'del-day': {
        if (!confirm(`Delete ${fmtDate(state.date)} and everything in it?`)) break;
        for (const m of state.media) await deleteMedia(m.id);
        await dbDel('days', state.date);
        await loadDays();
        await loadDay(todayKey());
        state.tab = state.view = 'today';
        render();
        break;
      }

      case 'compile':
        await collectDay();
        state.compileKind = 'day';
        state.view = 'compile';
        render();
        break;

      case 'recap':
        state.compileKind = 'recap';
        state.view = 'compile';
        render();
        break;

      case 'start-render': collectOpts(); await startRender(); break;
      case 'cancel-render': if (state.render) state.render.cancel = true; break;
      case 'again': state.view = 'compile'; render(); break;

      case 'save-out':
        if (state.out) { download(state.out.blob, state.out.name); toast('Saved'); }
        break;

      case 'share-out':
        if (state.out && navigator.share) {
          try {
            await navigator.share({ files: [new File([state.out.blob], state.out.name, { type: state.out.type })], title: state.out.name });
          } catch (err) { /* user dismissed */ }
        }
        break;

      case 'opt-size': {
        const o = state.compileKind === 'recap' ? state.recapOpts : state.day.opts;
        collectOpts();
        o.size = v;
        if (state.compileKind !== 'recap') await saveDay();
        render();
        break;
      }

      case 'open-day':
        await loadDay(t.dataset.date);
        state.tab = state.view = 'today';
        render();
        break;

      case 'new-day': {
        const d = prompt('Which date? (YYYY-MM-DD)', todayKey());
        if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) break;
        await loadDay(d);
        state.tab = state.view = 'today';
        render();
        break;
      }

      case 'save-profile':
        state.profile = { name: $('#pName').value.trim(), startDate: $('#pStart').value, goal: $('#pGoal').value.trim() };
        await dbPut('meta', { k: 'profile', ...state.profile });
        toast('Saved');
        break;

      case 'settings': state.view = 'settings'; render(); break;
      case 'export': await exportBackup(); break;
      case 'import': $('#importFile').click(); break;
      case 'storage': { const est = await navigator.storage.estimate().catch(() => null); toast(est ? `Using ${fmtSize(est.usage || 0)}` : 'Unavailable'); break; }
      case 'about': openSheet(`<h2>Daily Vlog</h2>
        <p class="sub">Capture the day, compile it into a vlog on the phone. No account, no server, no upload — the media never leaves the device unless you share the finished video yourself.</p>
        <p class="sub">Rendering runs in real time through the browser's own video recorder, so a one minute vlog takes about a minute and needs the screen to stay on.</p>
        <div class="gap"></div><button class="btn wide" data-act="close-sheet">Close</button>`); break;

      case 'wipe':
        if (!confirm('Erase every day, photo and clip on this device? This cannot be undone.')) break;
        if (!confirm('Really erase everything?')) break;
        indexedDB.deleteDatabase(DB_NAME);
        setTimeout(() => location.reload(), 400);
        break;
    }
  });

  async function collectDay() {
    const d = state.day;
    if (!$('#fTitle')) return;
    d.title = $('#fTitle').value.trim();
    d.notes = $('#fNotes').value;
    const num = (el) => { const x = parseFloat($(el).value); return isFinite(x) ? x : undefined; };
    d.stats = { distanceKm: num('#sDist'), durationMin: num('#sTime'), weightKg: num('#sWeight'), energy: num('#sEnergy') };
    await saveDay();
    await loadDays();
  }

  function collectOpts() {
    const o = state.compileKind === 'recap' ? state.recapOpts : state.day.opts;
    if (!$('#oPhoto')) return;
    o.photoMs = Number($('#oPhoto').value);
    o.maxClipMs = Number($('#oClip').value);
    o.bpm = Math.max(0, Number($('#oBpm').value) || 0);
    o.intro = $('#oIntro').checked;
    o.stats = $('#oStats').checked;
    o.compare = $('#oCompare').checked;
    o.outro = $('#oOutro').checked;
    if (state.compileKind !== 'recap') saveDay();
  }

  $('#menuBtn').onclick = () => { const m = $('#menu'); m.hidden = !m.hidden; };
  $('#backBtn').onclick = async () => {
    if (state.view === 'compile' || state.view === 'settings') { state.view = state.tab; }
    else if (state.view === 'today' && state.date !== todayKey()) { await loadDay(todayKey()); }
    render();
  };

  document.querySelectorAll('#tabs button').forEach((b) => {
    b.onclick = async () => {
      state.tab = state.view = b.dataset.tab;
      if (b.dataset.tab === 'today') await loadDay(state.date);
      render();
    };
  });

  ['capPhoto', 'capVideo', 'pickMedia'].forEach((idAttr) => {
    $('#' + idAttr).onchange = async (e) => {
      // FileList is live: copy it out before clearing the input, or it empties.
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      await addFiles(files, state.pendingTag);
      state.pendingTag = null;
    };
  });

  $('#pickMusic').onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    await dbPut('meta', { k: 'music', name: f.name, blob: f });
    render();
    toast('Music set');
  };

  $('#importFile').onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) await importBackup(f);
  };

  window.addEventListener('beforeunload', (e) => {
    if (state.render) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ================= boot ================= */

  (async function boot() {
    try {
      const p = await dbGet('meta', 'profile');
      if (p) state.profile = { name: p.name || '', startDate: p.startDate || '', goal: p.goal || '' };
      await loadDays();
      await loadDay(todayKey());
      if (!state.profile.startDate) {
        state.profile.startDate = state.days.length ? state.days[state.days.length - 1].date : todayKey();
        await dbPut('meta', { k: 'profile', ...state.profile });
      }
      render();
    } catch (err) {
      view.innerHTML = `<div class="notice bad">Could not open storage on this browser: ${esc(err.message || err)}.<br>Private/incognito windows block it — open the app in a normal tab.</div>`;
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  })();
})();
