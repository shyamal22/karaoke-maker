/* Asphalt QA — field capture app for mill & fill / paving QA
   Plain JS, IndexedDB storage, works fully offline. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  // Company branding for generated documents — edit here.
  const BRAND = {
    name: 'RCK NZ',
    tagline: 'Asphalt & Civil Contracting',
    contact: 'office@rcknz.co.nz • rcknz.co.nz',
  };
  const PHOTO_CATS = [
    { key: 'before', label: 'Before' },
    { key: 'milled', label: 'Milled' },
    { key: 'spray',  label: 'Spray / Membrane' },
    { key: 'finish', label: 'Finish' },
  ];
  const STRING_CAT = { key: 'stringing', label: 'Stringing / Depth' };
  const ALL_CATS = PHOTO_CATS.concat([STRING_CAT]);
  const MIX_TYPES = ['AC10', 'AC14', 'AC20', 'SMA10', 'SMA14', 'OGPA', 'Mix 10', 'Mix 20'];
  const TREATMENTS = ['None', 'Tack coat', 'Membrane seal — Grade 4', 'Membrane seal — Grade 3/5'];
  const JOB_TYPES = ['Mill & Fill', 'Paving only', 'Overlay', 'Dig-out & repave', 'Prelevel & overlay', 'Full reconstruction', 'Footpath', 'Car park'];
  const LAYOUTS = ['Multiple patches', 'Single large area'];
  const DEFAULT_DENSITY = 2.4;   // t/m3 compacted asphalt
  const DEFAULT_TARGET = 40;     // mm generic depth
  const MAX_PHOTO_PX = 1600;
  const JPEG_Q = 0.8;

  // ---------------------------------------------------------------- indexeddb
  let db;
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('asphalt-qa', 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('jobs', { keyPath: 'id' });
        const p = d.createObjectStore('patches', { keyPath: 'id' });
        p.createIndex('jobId', 'jobId');
        const ph = d.createObjectStore('photos', { keyPath: 'id' });
        ph.createIndex('patchId', 'patchId');
        ph.createIndex('jobId', 'jobId');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function tx(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }
  const put = (store, val) => tx(store, 'readwrite', s => s.put(val));
  const del = (store, key) => tx(store, 'readwrite', s => s.delete(key));
  function get(store, key) {
    return new Promise((resolve, reject) => {
      const r = db.transaction(store).objectStore(store).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  function getAll(store, indexName, key) {
    return new Promise((resolve, reject) => {
      const s = db.transaction(store).objectStore(store);
      const src = indexName ? s.index(indexName) : s;
      const r = key !== undefined ? src.getAll(key) : src.getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const fmt = (n, dp) => isFinite(n) ? n.toFixed(dp === undefined ? 2 : dp) : '';

  // ------------------------------------------------------------- blob helpers
  let liveUrls = [];
  function blobUrl(blob) { const u = URL.createObjectURL(blob); liveUrls.push(u); return u; }
  function revokeUrls() { liveUrls.forEach(u => URL.revokeObjectURL(u)); liveUrls = []; }

  function loadImageEl(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }
  async function compressImage(file) {
    let src;
    try { src = await createImageBitmap(file); } catch (e) { src = await loadImageEl(file); }
    const w0 = src.width, h0 = src.height;
    if (!w0 || !h0) throw new Error('empty image');
    const scale = Math.min(1, MAX_PHOTO_PX / Math.max(w0, h0));
    const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(src, 0, 0, w, h);
    if (src.close) src.close();
    return new Promise((resolve, reject) =>
      c.toBlob(b => b ? resolve(b) : reject(new Error('compress failed')), 'image/jpeg', JPEG_Q));
  }
  // Never lose a field photo: if compression fails (odd format, low memory),
  // store the original file untouched instead of erroring out.
  async function processPhoto(file) {
    try { return await compressImage(file); } catch (e) { return file; }
  }
  // Photos are stored as raw bytes, not Blobs — iOS Safari can silently
  // fail to persist Blob objects into IndexedDB. Legacy Blob records still load.
  function photoBlob(ph) {
    if (ph.bytes) return new Blob([ph.bytes], { type: ph.type || 'image/jpeg' });
    return ph.blob;
  }
  async function savePhoto(rec, blob) {
    rec.bytes = await blob.arrayBuffer();
    rec.type = blob.type || 'image/jpeg';
    await put('photos', rec);
  }
  function haptic() { try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) { /* not supported */ } }
  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  function dataURLToBlob(durl) {
    const [head, data] = durl.split(',');
    const mime = (head.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
    const bin = atob(data);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // ------------------------------------------------------------- calculations
  function patchAvgDepth(p) {
    const rs = (p.readings || []).map(r => num(r.depth)).filter(d => d > 0);
    if (!rs.length) return 0;
    return rs.reduce((a, b) => a + b, 0) / rs.length;
  }
  function patchArea(p) { return num(p.length) * num(p.width); }
  function jobDensity(job) { return (job && num(job.density)) || DEFAULT_DENSITY; }
  // target depth for a patch: its own design depth, else the job's client target
  function patchTarget(p, job) { return num(p.depth) || (job && num(job.targetDepth)) || 0; }
  // best-known depth: measured stringing average beats design
  function patchBestDepth(p, job) { return patchAvgDepth(p) || patchTarget(p, job); }
  // estimated tonnes at best-known depth (run sheet / totals)
  function patchTonnes(p, job) {
    return patchArea(p) * (patchBestDepth(p, job) / 1000) * jobDensity(job);
  }
  // mix used, strictly from stringing measurements (0 when no readings yet)
  function patchUsedTonnes(p, job) {
    const avg = patchAvgDepth(p);
    return avg ? patchArea(p) * (avg / 1000) * jobDensity(job) : 0;
  }
  // prelevel required where the measured cut is deeper than the target depth
  function patchPrelevel(p, job) {
    const avg = patchAvgDepth(p);
    const target = patchTarget(p, job);
    if (!avg || !target || avg <= target) return { mm: 0, tonnes: 0 };
    const mm = avg - target;
    return { mm, tonnes: patchArea(p) * (mm / 1000) * jobDensity(job) };
  }
  function jobTotals(job, patches) {
    return {
      area: patches.reduce((a, p) => a + patchArea(p), 0),
      tonnes: patches.reduce((a, p) => a + patchTonnes(p, job), 0),
      used: patches.reduce((a, p) => a + patchUsedTonnes(p, job), 0),
      prelevel: patches.reduce((a, p) => a + patchPrelevel(p, job).tonnes, 0),
      measured: patches.filter(p => patchAvgDepth(p) > 0).length,
    };
  }
  function pfx(job) { return job && job.layout === 'Single large area' ? 'A' : 'P'; }
  function patchWord(job) { return job && job.layout === 'Single large area' ? 'area' : 'patch'; }
  function patchPlural(job, n) {
    const w = patchWord(job);
    return n === 1 ? w : (w === 'patch' ? 'patches' : 'areas');
  }

  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return d + '/' + m + '/' + y;
  }

  // -------------------------------------------------------------------- shell
  const view = document.getElementById('view');
  const titleEl = document.getElementById('title');
  const backBtn = document.getElementById('backBtn');
  const menu = document.getElementById('menu');
  const menuBtn = document.getElementById('menuBtn');
  const importFile = document.getElementById('importFile');

  menuBtn.addEventListener('click', () => { menu.hidden = !menu.hidden; });
  document.addEventListener('click', e => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== menuBtn) menu.hidden = true;
  });
  menu.addEventListener('click', async e => {
    const a = e.target.dataset.action;
    menu.hidden = true;
    if (a === 'export') exportBackup();
    if (a === 'import') importFile.click();
    if (a === 'about') alert('Asphalt QA\n\nField QA capture for mill & fill and paving crews.\nAll data is stored on this device. Use Export backup regularly.');
  });
  importFile.addEventListener('change', () => {
    const f = importFile.files[0];
    importFile.value = '';
    if (f) importBackup(f);
  });
  backBtn.addEventListener('click', () => history.back());

  function setChrome(title, showBack) {
    titleEl.textContent = title;
    backBtn.hidden = !showBack;
  }

  // ------------------------------------------------------------------- router
  window.addEventListener('hashchange', route);

  async function route() {
    revokeUrls();
    menu.hidden = true;
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    try {
      if (parts.length === 0) return renderJobs();
      if (parts[0] === 'job-new') return renderJobForm(null);
      if (parts[0] === 'job-edit') return renderJobForm(parts[1]);
      if (parts[0] === 'job') return renderJob(parts[1]);
      if (parts[0] === 'patch') return renderPatch(parts[1], parts[2]);
      if (parts[0] === 'runsheet') return renderRunSheet(parts[1]);
      if (parts[0] === 'stringsheet') return renderStringSheet(parts[1]);
      if (parts[0] === 'check') return renderCheck(parts[1]);
      if (parts[0] === 'qareport') return renderQAReport(parts[1]);
      if (parts[0] === 'photos') return renderPhotoReport(parts[1]);
      renderJobs();
    } catch (err) {
      console.error(err);
      view.innerHTML = '<div class="empty">Something went wrong.<br>' + esc(err.message) + '</div>';
    }
  }

  // ---------------------------------------------------------------- jobs list
  async function renderJobs() {
    setChrome('Asphalt QA', false);
    const jobs = (await getAll('jobs')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
    const patches = await getAll('patches');
    const countBy = {};
    patches.forEach(p => { countBy[p.jobId] = (countBy[p.jobId] || 0) + 1; });

    let html = `
      <div class="page-head">
        <h2>Jobs</h2>
        <div class="sub">${jobs.length ? jobs.length + ' job' + (jobs.length > 1 ? 's' : '') + ' on this device' : 'Everything stays on this device'}</div>
      </div>`;
    if (!jobs.length) {
      html += '<div class="empty"><div class="empty-icon">&#128679;</div>No jobs yet.<br>Tap <b>+</b> to start your first job.</div>';
    } else {
      html += jobs.map(j => `
        <div class="card tappable" data-nav="#/job/${j.id}">
          <div class="row">
            <div class="icon-tile">&#128739;&#65039;</div>
            <div class="grow">
              <h3>${esc(j.name || j.road || 'Untitled job')}</h3>
              <div class="sub">${esc(fmtDate(j.date))} &middot; ${esc(j.client || 'No client')}${j.jobNo ? ' &middot; #' + esc(j.jobNo) : ''}</div>
              <div class="chip-row">
                <span class="badge orange">${esc((j.workType || 'Job').slice(0, 18))}</span>
                ${countBy[j.id] ? '<span class="badge grey">' + countBy[j.id] + ' ' + patchPlural(j, countBy[j.id]) + '</span>' : ''}
              </div>
            </div>
            <span class="chev">&#8250;</span>
          </div>
        </div>`).join('');
    }
    view.innerHTML = html + '<button class="fab" data-nav="#/job-new" aria-label="New job">+</button>';
    bindNav();
  }

  // ----------------------------------------------------------------- job form
  async function renderJobForm(jobId) {
    const job = jobId ? await get('jobs', jobId) : null;
    setChrome(job ? 'Edit job' : 'New job', true);
    const j = job || {
      date: todayISO(), workType: 'Mill & Fill', layout: LAYOUTS[0],
      treatment: TREATMENTS[0], density: DEFAULT_DENSITY, targetDepth: DEFAULT_TARGET,
    };
    let gpsLat = j.lat, gpsLng = j.lng;

    view.innerHTML = `
      <form id="jobForm" class="card">
        <label class="fld"><span>Job name / description</span>
          <input type="text" name="name" value="${esc(j.name)}" placeholder="e.g. High St mill &amp; fill"></label>
        <div class="grid2">
          <label class="fld"><span>Date</span>
            <input type="date" name="date" value="${esc(j.date)}"></label>
          <label class="fld"><span>Job / PO number</span>
            <input type="text" name="jobNo" value="${esc(j.jobNo)}" placeholder="e.g. 24-118"></label>
        </div>
        <label class="fld"><span>Client</span>
          <input type="text" name="client" value="${esc(j.client)}" placeholder="Client name"></label>
        <label class="fld"><span>Road / location</span>
          <input type="text" name="road" value="${esc(j.road)}" placeholder="Road name, suburb"></label>
        <div class="row" style="margin-bottom:12px">
          <input type="text" id="jobGps" class="grow" readonly value="${gpsLat ? gpsLat.toFixed(6) + ', ' + gpsLng.toFixed(6) : ''}" placeholder="Job GPS not captured">
          <button type="button" class="btn outline small" id="jobGpsBtn">&#128205; GPS</button>
        </div>
        <div class="grid2">
          <label class="fld"><span>Job type</span>
            <input type="text" name="workType" list="typeList" value="${esc(j.workType)}" placeholder="Choose or type your own">
            <datalist id="typeList">${JOB_TYPES.map(t => `<option value="${esc(t)}">`).join('')}</datalist></label>
          <label class="fld"><span>Job layout</span>
            <select name="layout">
              ${LAYOUTS.map(l => `<option${j.layout === l ? ' selected' : ''}>${l}</option>`).join('')}
            </select></label>
        </div>
        <div class="grid2">
          <label class="fld"><span>Mix type</span>
            <input type="text" name="mix" list="mixList" value="${esc(j.mix)}" placeholder="Choose or type">
            <datalist id="mixList">${MIX_TYPES.map(m => `<option value="${m}">`).join('')}</datalist></label>
          <label class="fld"><span>Tack coat / membrane</span>
            <select name="treatment">
              ${TREATMENTS.map(t => `<option${j.treatment === t ? ' selected' : ''}>${t}</option>`).join('')}
            </select></label>
        </div>
        <div class="grid2">
          <label class="fld"><span>Client target depth (mm)</span>
            <input type="number" name="targetDepth" step="5" inputmode="numeric" value="${esc(j.targetDepth != null ? j.targetDepth : DEFAULT_TARGET)}"></label>
          <label class="fld"><span>Mix ordered (t)</span>
            <input type="number" name="mixOrdered" step="0.1" inputmode="decimal" value="${esc(j.mixOrdered)}" placeholder="e.g. 42.5"></label>
        </div>
        <div class="grid2">
          <label class="fld"><span>Crew / foreman</span>
            <input type="text" name="crew" value="${esc(j.crew)}"></label>
          <label class="fld"><span>QA by</span>
            <input type="text" name="qaName" value="${esc(j.qaName)}"></label>
        </div>
        <label class="fld"><span>Compacted density (t/m&sup3;) — used for tonnage</span>
          <input type="number" name="density" step="0.01" inputmode="decimal" value="${esc(j.density || DEFAULT_DENSITY)}"></label>
        <label class="fld"><span>Notes</span>
          <textarea name="notes" placeholder="Traffic management, weather, anything else">${esc(j.notes)}</textarea></label>
        <button type="submit" class="btn primary">${job ? 'Save changes' : 'Create job'}</button>
        ${job ? '<button type="button" class="btn danger" id="delJob">Delete job</button>' : ''}
      </form>`;

    document.getElementById('jobGpsBtn').addEventListener('click', () => {
      const btn = document.getElementById('jobGpsBtn');
      btn.disabled = true; btn.textContent = '…';
      navigator.geolocation.getCurrentPosition(pos => {
        gpsLat = pos.coords.latitude; gpsLng = pos.coords.longitude;
        document.getElementById('jobGps').value = gpsLat.toFixed(6) + ', ' + gpsLng.toFixed(6);
        btn.disabled = false; btn.textContent = '📍 GPS';
      }, err => {
        alert('Could not get GPS: ' + err.message);
        btn.disabled = false; btn.textContent = '📍 GPS';
      }, { enableHighAccuracy: true, timeout: 15000 });
    });

    document.getElementById('jobForm').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const rec = job || { id: uid(), createdAt: Date.now() };
      ['name', 'date', 'jobNo', 'client', 'road', 'workType', 'layout', 'mix', 'treatment', 'crew', 'qaName', 'notes']
        .forEach(k => rec[k] = (f.get(k) || '').toString().trim());
      rec.density = num(f.get('density')) || DEFAULT_DENSITY;
      rec.targetDepth = num(f.get('targetDepth')) || DEFAULT_TARGET;
      rec.mixOrdered = f.get('mixOrdered') === '' ? '' : num(f.get('mixOrdered'));
      if (gpsLat != null) { rec.lat = gpsLat; rec.lng = gpsLng; }
      await put('jobs', rec);
      location.hash = '#/job/' + rec.id;
    });
    const delBtn = document.getElementById('delJob');
    if (delBtn) delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this job and ALL its patches and photos? This cannot be undone.')) return;
      const ps = await getAll('patches', 'jobId', jobId);
      for (const p of ps) await del('patches', p.id);
      const phs = await getAll('photos', 'jobId', jobId);
      for (const ph of phs) await del('photos', ph.id);
      await del('jobs', jobId);
      location.hash = '#/';
    });
  }

  // --------------------------------------------------------------- job detail
  async function renderJob(jobId) {
    const job = await get('jobs', jobId);
    if (!job) { location.hash = '#/'; return; }
    setChrome(job.name || job.road || 'Job', true);
    const patches = (await getAll('patches', 'jobId', jobId)).sort((a, b) => a.number - b.number);
    const photos = await getAll('photos', 'jobId', jobId);
    const generalPhotos = photos.filter(ph => ph.category === 'general').sort((a, b) => a.createdAt - b.createdAt);
    const photoCount = {};
    photos.forEach(ph => { if (ph.patchId) photoCount[ph.patchId] = (photoCount[ph.patchId] || 0) + 1; });
    const tot = jobTotals(job, patches);
    const P = pfx(job);
    const word = patchWord(job);

    view.innerHTML = `
      <div id="jobRoot">
      <div class="hero">
        <div class="row">
          <div class="grow">
            <h2>${esc(job.name || job.road || 'Untitled job')}</h2>
            <div class="hero-sub">${esc(fmtDate(job.date))} &middot; ${esc(job.client || 'No client')}${job.jobNo ? ' &middot; #' + esc(job.jobNo) : ''}</div>
          </div>
          <button class="hero-edit" data-nav="#/job-edit/${job.id}">Edit</button>
        </div>
        <div class="chip-row">
          <span class="chip">${esc(job.workType || 'Job')}</span>
          <span class="chip">${esc(job.layout || LAYOUTS[0])}</span>
          ${job.mix ? '<span class="chip">' + esc(job.mix) + '</span>' : ''}
          <span class="chip">Target ${esc(job.targetDepth || DEFAULT_TARGET)} mm</span>
          ${job.treatment && job.treatment !== 'None' ? '<span class="chip">' + esc(job.treatment) + '</span>' : ''}
          ${job.mixOrdered !== '' && job.mixOrdered != null ? '<span class="chip">Ordered ' + esc(job.mixOrdered) + ' t</span>' : ''}
        </div>
      </div>
      <div class="stats">
        <div class="stat s-orange"><b>${fmt(tot.area, 1)}</b><span>m&sup2; total</span></div>
        <div class="stat s-blue"><b>${fmt(tot.tonnes, 1)}</b><span>est. tonnes</span></div>
        <div class="stat s-green"><b>${patches.length}</b><span>${word === 'area' ? 'areas' : 'patches'}</span></div>
        <div class="stat s-purple"><b>${photos.length}</b><span>photos</span></div>
      </div>
      <button class="btn primary" data-nav="#/check/${job.id}">Generate QA report</button>
      <div class="linkrow">
        <button class="linkbtn" data-nav="#/runsheet/${job.id}">Run sheet for the crew &#8250;</button>
      </div>
      <div class="section-title">${word === 'area' ? 'Areas' : 'Patches'} (${patches.length})</div>
      ${patches.length ? patches.map(p => {
        const avg = patchAvgDepth(p);
        return `
        <div class="card tappable" data-nav="#/patch/${job.id}/${p.id}">
          <div class="row">
            <span class="num-tile">${P}${p.number}</span>
            <div class="grow">
              <h3>${esc(p.location || 'No location')} ${p.deepLift ? '<span class="badge purple">DEEP LIFT</span>' : ''}</h3>
              <div class="sub">${num(p.length) ? fmt(num(p.length), 1) + ' &times; ' + fmt(num(p.width), 1) + ' m = ' + fmt(patchArea(p), 1) + ' m&sup2;' : 'No size yet'}
                ${patchTarget(p, job) ? ' &middot; target ' + fmt(patchTarget(p, job), 0) + ' mm' : ''}
                ${avg ? ' &middot; avg cut ' + fmt(avg, 0) + ' mm' : ''}</div>
              <div class="sub">${photoCount[p.id] || 0} photo${(photoCount[p.id] || 0) === 1 ? '' : 's'}${(p.readings || []).length ? ' &middot; ' + p.readings.length + ' string depth' + (p.readings.length > 1 ? 's' : '') : ''}</div>
            </div>
            <span class="chev">&#8250;</span>
          </div>
        </div>`;
      }).join('') : '<div class="empty"><div class="empty-icon">&#128736;&#65039;</div>Nothing captured yet.<br>Tap <b>+</b> to add the first ' + word + '.</div>'}
      <div class="section-title">Job photos &amp; dockets (${generalPhotos.length})</div>
      <div class="card">
        <div class="sub" style="margin-bottom:10px">Anything that belongs to the whole job — site overviews, temperature readings, delivery dockets. Add a label so it makes sense in the report.</div>
        <div class="jp-grid">
          ${generalPhotos.map(ph => `
            <div class="jp-item">
              <div class="thumb"><img src="${blobUrl(photoBlob(ph))}" alt="Job photo">
                <button class="del" data-delphoto="${ph.id}" aria-label="Delete photo">&#10005;</button></div>
              <input type="text" class="jp-label" data-labelfor="${ph.id}" value="${esc(ph.label)}" placeholder="Add label&hellip;">
            </div>`).join('')}
        </div>
        <label class="btn soft" id="addJobPhoto">&#128247; Add job photo
          <input type="file" accept="image/*" capture="environment" multiple data-jobphoto hidden>
        </label>
      </div>
      <button class="fab" id="addPatch" aria-label="Add ${word}">+</button>
      </div>`;

    bindNav();

    // job-level photos: add / label / delete / view
    const labelTimers = {};
    document.getElementById('jobRoot').addEventListener('click', e => {
      const d = e.target.closest('[data-delphoto]');
      if (d) {
        e.stopPropagation();
        if (confirm('Delete this photo?')) del('photos', d.dataset.delphoto).then(() => renderJob(jobId));
        return;
      }
      const img = e.target.closest('.jp-item img');
      if (img) openLightbox(img.src);
    });
    document.getElementById('jobRoot').addEventListener('input', e => {
      const id = e.target.dataset.labelfor;
      if (!id) return;
      const ph = generalPhotos.find(x => x.id === id);
      if (!ph) return;
      ph.label = e.target.value;
      clearTimeout(labelTimers[id]);
      labelTimers[id] = setTimeout(() => put('photos', ph), 350);
    });
    document.getElementById('jobRoot').addEventListener('change', async e => {
      const inp = e.target;
      if (!inp.matches || !inp.matches('input[type=file][data-jobphoto]')) return;
      const files = Array.from(inp.files || []);
      inp.value = '';
      if (!files.length) return;
      try {
        for (const f of files) {
          const blob = await processPhoto(f);
          await savePhoto({ id: uid(), jobId, patchId: '', category: 'general', label: '', createdAt: Date.now() }, blob);
        }
        haptic();
      } catch (err) {
        alert('Photo could not be saved: ' + (err && err.message ? err.message : err));
      }
      renderJob(jobId);
    });

    document.getElementById('addPatch').addEventListener('click', async () => {
      haptic();
      const number = patches.length ? Math.max(...patches.map(p => p.number || 0)) + 1 : 1;
      const p = {
        id: uid(), jobId, number, location: '', length: '', width: '',
        depth: job.targetDepth || DEFAULT_TARGET, deepLift: false,
        readings: [], notes: '', createdAt: Date.now(),
      };
      await put('patches', p);
      location.hash = '#/patch/' + jobId + '/' + p.id;
    });
  }

  // ------------------------------------------------------------- patch editor
  async function renderPatch(jobId, patchId) {
    const job = await get('jobs', jobId);
    const patch = await get('patches', patchId);
    if (!job || !patch) { location.hash = '#/'; return; }
    const P = pfx(job);
    const word = patchWord(job);
    setChrome(word === 'area' ? 'Area A' + patch.number : 'Patch P' + patch.number, true);
    const photos = (await getAll('photos', 'patchId', patchId)).sort((a, b) => a.createdAt - b.createdAt);

    const catBlock = cat => {
      const catPhotos = photos.filter(ph => ph.category === cat.key);
      return `
      <div class="photo-cat" data-cat="${cat.key}">
        <div class="photo-cat-head">
          <h4>${cat.label}</h4>
          <span class="badge grey">${catPhotos.length}</span>
        </div>
        <div class="photo-grid">
          ${catPhotos.map(ph => `
            <div class="thumb" data-photo="${ph.id}">
              <img src="${blobUrl(photoBlob(ph))}" alt="${cat.label} photo">
              <button class="del" data-delphoto="${ph.id}" aria-label="Delete photo">&#10005;</button>
            </div>`).join('')}
          <label class="add-photo" aria-label="Add ${cat.label} photo">&#128247;
            <input type="file" accept="image/*" capture="environment" multiple data-cat="${cat.key}" hidden>
          </label>
        </div>
      </div>`;
    };

    view.innerHTML = `
      <div id="patchRoot">
      <form id="patchForm" class="card" autocomplete="off">
        <label class="fld"><span>Location on site (chainage, house no., lane)</span>
          <input type="text" name="location" value="${esc(patch.location)}" placeholder="e.g. CH 120–135 LHS / outside #42"></label>
        <div class="row" style="margin-bottom:12px">
          <input type="text" name="gps" class="grow" readonly value="${patch.lat ? patch.lat.toFixed(6) + ', ' + patch.lng.toFixed(6) : ''}" placeholder="GPS not captured">
          <button type="button" class="btn outline small" id="gpsBtn">&#128205; GPS</button>
        </div>
        <div class="grid3">
          <label class="fld"><span>Length (m)</span>
            <input type="number" name="length" step="0.1" inputmode="decimal" value="${esc(patch.length)}"></label>
          <label class="fld"><span>Width (m)</span>
            <input type="number" name="width" step="0.1" inputmode="decimal" value="${esc(patch.width)}"></label>
          <label class="fld"><span>Design depth (mm)</span>
            <input type="number" name="depth" step="5" inputmode="numeric" value="${esc(patch.depth)}"></label>
        </div>
        <label class="check">
          <input type="checkbox" name="deepLift"${patch.deepLift ? ' checked' : ''}>
          <span><b>Deep lift</b> — deeper than the standard ${esc(job.targetDepth || DEFAULT_TARGET)} mm (set the actual design depth above)</span>
        </label>
        <div class="sub" id="areaLine" style="margin:6px 2px 10px"></div>
        <label class="fld"><span>${word === 'area' ? 'Area' : 'Patch'} notes</span>
          <textarea name="notes" placeholder="Failures, services, anything the paving crew must know">${esc(patch.notes)}</textarea></label>
      </form>

      <div class="section-title">Stringing depths (measured cut depth, mm)</div>
      <div class="card">
        <div id="readings"></div>
        <button type="button" class="btn outline" id="addReading">+ Add depth reading</button>
        <div class="sub" id="avgLine" style="margin-top:8px"></div>
        ${catBlock(STRING_CAT)}
      </div>

      <div class="section-title">${word === 'area' ? 'Area' : 'Patch'} photos</div>
      <div class="card">
        ${PHOTO_CATS.map(catBlock).join('')}
      </div>

      <button type="button" class="btn danger no-print" id="delPatch">Delete ${word} ${P}${patch.number}</button>
      </div>`;

    const form = document.getElementById('patchForm');
    const areaLine = document.getElementById('areaLine');
    const avgLine = document.getElementById('avgLine');
    const readingsEl = document.getElementById('readings');

    function refreshCalcs() {
      const a = patchArea(patch);
      areaLine.innerHTML = a ? 'Area: <b>' + fmt(a, 1) + ' m&sup2;</b> &middot; est. <b>' + fmt(patchTonnes(patch, job), 2) + ' t</b> @ ' + jobDensity(job) + ' t/m&sup3;' : '';
      const avg = patchAvgDepth(patch);
      if (!avg) {
        avgLine.innerHTML = 'No readings yet — add one per string line position.';
      } else {
        const pre = patchPrelevel(patch, job);
        avgLine.innerHTML = 'Average measured depth: <b>' + fmt(avg, 0) + ' mm</b>' +
          (patchTarget(patch, job) ? ' (target ' + fmt(patchTarget(patch, job), 0) + ' mm)' : '') +
          (pre.mm > 0 ? ' &middot; <b style="color:var(--danger)">prelevel ' + fmt(pre.mm, 0) + ' mm &asymp; ' + fmt(pre.tonnes, 2) + ' t</b>' : '');
      }
    }

    let saveTimer;
    function save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => put('patches', patch), 250);
    }
    form.addEventListener('input', e => {
      const n = e.target.name;
      if (!n || n === 'gps') return;
      patch[n] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      refreshCalcs();
      save();
    });
    form.addEventListener('submit', e => e.preventDefault());

    // GPS
    document.getElementById('gpsBtn').addEventListener('click', () => {
      const btn = document.getElementById('gpsBtn');
      btn.disabled = true; btn.textContent = '…';
      navigator.geolocation.getCurrentPosition(pos => {
        patch.lat = pos.coords.latitude; patch.lng = pos.coords.longitude;
        form.gps.value = patch.lat.toFixed(6) + ', ' + patch.lng.toFixed(6);
        btn.disabled = false; btn.textContent = '📍 GPS';
        save();
      }, err => {
        alert('Could not get GPS: ' + err.message);
        btn.disabled = false; btn.textContent = '📍 GPS';
      }, { enableHighAccuracy: true, timeout: 15000 });
    });

    // stringing readings
    function renderReadings() {
      patch.readings = patch.readings || [];
      readingsEl.innerHTML = patch.readings.map((r, i) => `
        <div class="reading-row">
          <input type="text" data-ri="${i}" data-rk="pos" value="${esc(r.pos)}" placeholder="Position (e.g. CH 122 centre)">
          <input type="number" data-ri="${i}" data-rk="depth" inputmode="numeric" value="${esc(r.depth)}" placeholder="mm">
          <button type="button" class="reading-del" data-rdel="${i}" aria-label="Remove reading">&#10005;</button>
        </div>`).join('');
      refreshCalcs();
    }
    readingsEl.addEventListener('input', e => {
      const i = e.target.dataset.ri, k = e.target.dataset.rk;
      if (i === undefined) return;
      patch.readings[i][k] = e.target.value;
      refreshCalcs();
      save();
    });
    readingsEl.addEventListener('click', e => {
      const i = e.target.dataset.rdel;
      if (i === undefined) return;
      patch.readings.splice(i, 1);
      renderReadings();
      save();
    });
    document.getElementById('addReading').addEventListener('click', () => {
      haptic();
      patch.readings = patch.readings || [];
      patch.readings.push({ pos: '', depth: '' });
      renderReadings();
      save();
      const inputs = readingsEl.querySelectorAll('input[data-rk="pos"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    renderReadings();
    refreshCalcs();

    // photos — native label-wrapped inputs (reliable on iOS camera flow)
    document.getElementById('patchRoot').addEventListener('click', e => {
      const delId = e.target.closest('[data-delphoto]');
      if (delId) {
        e.stopPropagation();
        if (confirm('Delete this photo?')) {
          del('photos', delId.dataset.delphoto).then(() => renderPatch(jobId, patchId));
        }
        return;
      }
      const th = e.target.closest('.thumb img');
      if (th) openLightbox(th.src);
    });
    document.getElementById('patchRoot').addEventListener('change', async e => {
      const inp = e.target;
      if (!inp.matches || !inp.matches('input[type=file][data-cat]')) return;
      const files = Array.from(inp.files || []);
      const cat = inp.dataset.cat;
      inp.value = '';
      if (!files.length) return;
      try {
        for (const f of files) {
          const blob = await processPhoto(f);
          await savePhoto({ id: uid(), jobId, patchId, category: cat, createdAt: Date.now() }, blob);
        }
        haptic();
      } catch (err) {
        alert('Photo could not be saved: ' + (err && err.message ? err.message : err));
      }
      renderPatch(jobId, patchId);
    });

    document.getElementById('delPatch').addEventListener('click', async () => {
      if (!confirm('Delete ' + word + ' ' + P + patch.number + ' and all its photos?')) return;
      for (const ph of photos) await del('photos', ph.id);
      await del('patches', patchId);
      location.hash = '#/job/' + jobId;
    });
  }

  function openLightbox(src) {
    const lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.innerHTML = '<img src="' + src + '" alt="Photo"><button class="close" aria-label="Close">&#10005;</button>';
    lb.addEventListener('click', () => lb.remove());
    document.body.appendChild(lb);
  }

  // ----------------------------------------------- shared report HTML blocks
  function reportHeaderHTML(job, docTitle) {
    return `
      <div class="brand-head">
        <div>
          <div class="brand-name">${esc(BRAND.name)}</div>
          <div class="brand-tag">${esc(BRAND.tagline)}</div>
        </div>
        <div class="brand-doc">
          <div class="brand-doc-title">${esc(docTitle)}</div>
          ${job.jobNo ? '<div class="brand-doc-meta">Job ' + esc(job.jobNo) + '</div>' : ''}
          <div class="brand-doc-meta">${esc(fmtDate(job.date))}</div>
        </div>
      </div>
      <div class="brand-rule"></div>
      ${job.name || job.road ? '<div class="rs-title">' + esc(job.name || job.road) + '</div>' : ''}`;
  }
  function reportFooterHTML(job) {
    return `
      <div class="brand-foot">
        <span>${esc(BRAND.name)} &bull; ${esc(BRAND.contact)}</span>
        <span>${job.jobNo ? 'Job ' + esc(job.jobNo) + ' &bull; ' : ''}${esc(fmtDate(job.date))}</span>
      </div>`;
  }
  function naVal(job, key) {
    const v = job[key];
    if (v !== '' && v != null) return esc(v);
    return (job.naFlags || {})[key] ? 'N/A' : '';
  }
  function jobMetaHTML(job) {
    return `
      <div class="rs-meta">
        <div><b>Date:</b> ${esc(fmtDate(job.date))}</div>
        <div><b>Client:</b> ${naVal(job, 'client')}</div>
        <div><b>Job #:</b> ${esc(job.jobNo)}</div>
        <div><b>Road:</b> ${esc(job.road)}${job.lat ? ' (' + job.lat.toFixed(5) + ', ' + job.lng.toFixed(5) + ')' : ''}</div>
        <div><b>Work:</b> ${naVal(job, 'workType')} — ${esc(job.layout || LAYOUTS[0])}</div>
        <div><b>Mix:</b> ${naVal(job, 'mix')}</div>
        <div><b>Tack / membrane:</b> ${esc(job.treatment || 'None')}</div>
        <div><b>Client target depth:</b> ${esc(job.targetDepth || DEFAULT_TARGET)} mm</div>
        <div><b>Crew:</b> ${naVal(job, 'crew')}</div>
        <div><b>QA by:</b> ${naVal(job, 'qaName')}</div>
      </div>`;
  }

  function runSheetTableHTML(job, patches) {
    const P = pfx(job);
    const tot = jobTotals(job, patches);
    return `
      <table class="rs">
        <thead><tr>
          <th>#</th><th>Location</th>
          <th class="num">L (m)</th><th class="num">W (m)</th><th class="num">Area (m&sup2;)</th>
          <th class="num">Design (mm)</th><th class="num">Avg cut (mm)</th>
          <th class="num">Est. tonnes</th><th class="num">Prelevel (t)</th><th>String depths / notes</th>
        </tr></thead>
        <tbody>
          ${patches.map(p => {
            const avg = patchAvgDepth(p);
            const pre = patchPrelevel(p, job);
            const readings = (p.readings || []).filter(r => r.pos || r.depth)
              .map(r => esc(r.pos || '?') + ': ' + esc(r.depth) + 'mm').join('; ');
            return `<tr>
              <td>${P}${p.number}${p.deepLift ? '<br><span class="badge purple">DEEP</span>' : ''}</td>
              <td>${esc(p.location)}${p.lat ? '<br><small>' + p.lat.toFixed(5) + ', ' + p.lng.toFixed(5) + '</small>' : ''}</td>
              <td class="num">${fmt(num(p.length), 1)}</td>
              <td class="num">${fmt(num(p.width), 1)}</td>
              <td class="num">${fmt(patchArea(p), 1)}</td>
              <td class="num">${patchTarget(p, job) ? fmt(patchTarget(p, job), 0) : ''}</td>
              <td class="num">${avg ? fmt(avg, 0) : ''}</td>
              <td class="num">${fmt(patchTonnes(p, job), 2)}</td>
              <td class="num">${pre.tonnes ? fmt(pre.tonnes, 2) : ''}</td>
              <td>${readings}${readings && p.notes ? '<br>' : ''}${esc(p.notes)}</td>
            </tr>`;
          }).join('')}
          <tr class="total">
            <td colspan="4">TOTAL — ${patches.length} ${patchPlural(job, patches.length)}</td>
            <td class="num">${fmt(tot.area, 1)}</td>
            <td></td><td></td>
            <td class="num">${fmt(tot.tonnes, 2)}</td>
            <td class="num">${tot.prelevel ? fmt(tot.prelevel, 2) : ''}</td>
            <td>@ ${jobDensity(job)} t/m&sup3;</td>
          </tr>
        </tbody>
      </table>`;
  }

  function mixSummaryHTML(job, patches, editable) {
    const tot = jobTotals(job, patches);
    const ordered = job.mixOrdered === '' || job.mixOrdered == null ? null : num(job.mixOrdered);
    const variance = ordered != null ? ordered - tot.used : null;
    return `
      <div class="mix-summary card">
        <h3>Mix &amp; prelevel summary</h3>
        <div class="mix-grid">
          <div><span>Client target depth</span><b>${esc(job.targetDepth || DEFAULT_TARGET)} mm</b></div>
          <div><span>Mix ordered</span>
            ${editable
              ? '<input type="number" id="mixOrderedInput" step="0.1" inputmode="decimal" value="' + esc(job.mixOrdered) + '" placeholder="t">'
              : '<b>' + (ordered != null ? fmt(ordered, 2) + ' t' : ((job.naFlags || {}).mixOrdered ? 'N/A' : '—')) + '</b>'}</div>
          <div><span>Mix used (from stringing)</span><b id="mixUsedCell">${fmt(tot.used, 2)} t</b></div>
          <div><span>Ordered vs used</span><b id="mixVarCell">${variance == null ? '—' : (variance >= 0 ? '+' : '') + fmt(variance, 2) + ' t ' + (variance >= 0 ? '(surplus)' : '(short)')}</b></div>
          <div><span>Prelevel required</span><b>${tot.prelevel ? fmt(tot.prelevel, 2) + ' t' : 'None'}</b></div>
          <div><span>Measured ${patchWord(job) === 'area' ? 'areas' : 'patches'}</span><b>${tot.measured} of ${patches.length}</b></div>
        </div>
        ${tot.measured < patches.length ? '<div class="sub" style="margin-top:8px">&#9888;&#65039; ' + (patches.length - tot.measured) + ' ' + patchWord(job) + '(s) have no stringing readings yet — “mix used” only counts measured ' + patchWord(job) + 's.</div>' : ''}
      </div>`;
  }

  function stringTablesHTML(job, patches) {
    const P = pfx(job);
    return patches.map(p => {
      const readings = (p.readings || []).filter(r => r.pos || r.depth);
      const avg = patchAvgDepth(p);
      const target = patchTarget(p, job);
      const pre = patchPrelevel(p, job);
      const used = patchUsedTonnes(p, job);
      return `
      <div class="string-block">
        <h3>${P}${p.number} — ${esc(p.location || 'No location')} ${p.deepLift ? '<span class="badge purple">DEEP LIFT</span>' : ''}</h3>
        <div class="sub">${num(p.length) ? fmt(num(p.length), 1) + ' × ' + fmt(num(p.width), 1) + ' m = ' + fmt(patchArea(p), 1) + ' m²' : 'No size'} · target ${fmt(target, 0)} mm</div>
        ${readings.length ? `
        <table class="rs string-table">
          <thead><tr><th>Position</th><th class="num">Depth (mm)</th><th class="num">vs target (mm)</th></tr></thead>
          <tbody>
            ${readings.map(r => {
              const d = num(r.depth);
              const diff = d && target ? d - target : null;
              return `<tr>
                <td>${esc(r.pos || '—')}</td>
                <td class="num">${esc(r.depth)}</td>
                <td class="num">${diff == null ? '' : (diff > 0 ? '+' : '') + fmt(diff, 0)}</td>
              </tr>`;
            }).join('')}
            <tr class="total">
              <td>Average (${readings.length} reading${readings.length === 1 ? '' : 's'})</td>
              <td class="num">${avg ? fmt(avg, 0) : ''}</td>
              <td class="num">${avg && target ? (avg - target > 0 ? '+' : '') + fmt(avg - target, 0) : ''}</td>
            </tr>
          </tbody>
        </table>
        <div class="sub" style="margin-top:6px">
          Mix used &asymp; <b>${fmt(used, 2)} t</b>${pre.mm > 0 ? ' · <b style="color:var(--danger)">Prelevel required: ' + fmt(pre.mm, 0) + ' mm &asymp; ' + fmt(pre.tonnes, 2) + ' t</b>' : (avg && target ? ' · no prelevel needed' : '')}
        </div>`
        : '<div class="sub" style="margin:6px 0">No stringing readings recorded.</div>'}
      </div>`;
    }).join('');
  }

  function photoSectionsHTML(job, patches, photos) {
    const P = pfx(job);
    return patches.map(p => {
      const pPhotos = photos.filter(ph => ph.patchId === p.id);
      if (!pPhotos.length) return '';
      return `
      <div class="pr-patch">
        <h3>${P}${p.number} — ${esc(p.location || 'No location')} ${p.deepLift ? '<span class="badge purple">DEEP LIFT</span>' : ''}</h3>
        <div class="sub">${num(p.length) ? fmt(num(p.length), 1) + ' × ' + fmt(num(p.width), 1) + ' m' : ''}${patchTarget(p, job) ? ' · target ' + fmt(patchTarget(p, job), 0) + ' mm' : ''}${patchAvgDepth(p) ? ' · avg cut ' + fmt(patchAvgDepth(p), 0) + ' mm' : ''}</div>
        ${ALL_CATS.map(cat => {
          const cps = pPhotos.filter(ph => ph.category === cat.key).sort((a, b) => a.createdAt - b.createdAt);
          if (!cps.length) return '';
          return `<div class="pr-cat"><h4>${cat.label} (${cps.length})</h4>
            <div class="pr-grid">${cps.map(ph => '<img src="' + blobUrl(photoBlob(ph)) + '" alt="' + cat.label + '">').join('')}</div></div>`;
        }).join('')}
      </div>`;
    }).join('');
  }

  function generalPhotosHTML(photos) {
    const gen = photos.filter(ph => ph.category === 'general').sort((a, b) => a.createdAt - b.createdAt);
    if (!gen.length) return '';
    return `
      <div class="pr-patch">
        <h3>Job photos &amp; dockets</h3>
        <div class="pr-grid">
          ${gen.map(ph => `<figure class="pr-fig"><img src="${blobUrl(photoBlob(ph))}" alt="${esc(ph.label || 'Job photo')}">${ph.label ? '<figcaption>' + esc(ph.label) + '</figcaption>' : ''}</figure>`).join('')}
        </div>
      </div>`;
  }

  function signOffHTML(job) {
    return `
      <div class="sign-row">
        <div class="sign-box">QA sign-off: ${esc(job.qaName)}</div>
        <div class="sign-box">Foreman sign-off: ${esc(job.crew)}</div>
      </div>`;
  }

  // ---------------------------------------------------------------- run sheet
  async function renderRunSheet(jobId) {
    const job = await get('jobs', jobId);
    if (!job) { location.hash = '#/'; return; }
    setChrome('Run sheet', true);
    const patches = (await getAll('patches', 'jobId', jobId)).sort((a, b) => a.number - b.number);

    view.innerHTML = `
      <div class="grid2 no-print">
        <button class="btn primary" onclick="window.print()">Print / Save PDF</button>
        <button class="btn outline" id="csvBtn">Export CSV</button>
      </div>
      <div class="runsheet">
        ${reportHeaderHTML(job, 'PAVING RUN SHEET')}
        ${jobMetaHTML(job)}
        ${runSheetTableHTML(job, patches)}
        ${job.notes ? '<div class="rs-notes"><b>Job notes:</b> ' + esc(job.notes) + '</div>' : ''}
        ${signOffHTML(job)}
        ${reportFooterHTML(job)}
      </div>`;

    document.getElementById('csvBtn').addEventListener('click', () => {
      const P = pfx(job);
      const rows = [['#', 'Location', 'Lat', 'Lng', 'Deep lift', 'Length m', 'Width m', 'Area m2', 'Design depth mm', 'Avg cut mm', 'Est tonnes', 'Prelevel t', 'String depths', 'Notes']];
      patches.forEach(p => {
        const pre = patchPrelevel(p, job);
        rows.push([P + p.number, p.location || '', p.lat || '', p.lng || '', p.deepLift ? 'YES' : '',
          num(p.length), num(p.width), fmt(patchArea(p), 2), patchTarget(p, job) || '',
          patchAvgDepth(p) ? fmt(patchAvgDepth(p), 0) : '', fmt(patchTonnes(p, job), 2),
          pre.tonnes ? fmt(pre.tonnes, 2) : '',
          (p.readings || []).map(r => (r.pos || '?') + ':' + r.depth + 'mm').join(' | '), p.notes || '']);
      });
      const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = ('runsheet-' + (job.jobNo || job.name || 'job') + '-' + (job.date || '')).replace(/[^\w.-]+/g, '_') + '.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
  }

  // ------------------------------------------------------------- string sheet
  async function renderStringSheet(jobId) {
    const job = await get('jobs', jobId);
    if (!job) { location.hash = '#/'; return; }
    setChrome('String sheet', true);
    const patches = (await getAll('patches', 'jobId', jobId)).sort((a, b) => a.number - b.number);

    view.innerHTML = `
      <button class="btn primary no-print" onclick="window.print()">Print / Save PDF</button>
      <div class="runsheet">
        ${reportHeaderHTML(job, 'STRINGING SHEET')}
        ${jobMetaHTML(job)}
        ${mixSummaryHTML(job, patches, true)}
        ${patches.length ? stringTablesHTML(job, patches) : '<div class="empty">No ' + patchWord(job) + 's in this job yet.</div>'}
        ${signOffHTML(job)}
        ${reportFooterHTML(job)}
      </div>`;

    const input = document.getElementById('mixOrderedInput');
    if (input) {
      let t;
      input.addEventListener('input', () => {
        job.mixOrdered = input.value === '' ? '' : num(input.value);
        clearTimeout(t);
        t = setTimeout(() => put('jobs', job), 300);
        const tot = jobTotals(job, patches);
        const varCell = document.getElementById('mixVarCell');
        if (job.mixOrdered === '') { varCell.textContent = '—'; return; }
        const v = num(job.mixOrdered) - tot.used;
        varCell.textContent = (v >= 0 ? '+' : '') + fmt(v, 2) + ' t ' + (v >= 0 ? '(surplus)' : '(short)');
      });
    }
  }

  // ------------------------------------------- pre-report completeness check
  const JOB_CHECK_FIELDS = [
    ['client', 'Client', 'text'],
    ['workType', 'Job type', 'text'],
    ['mix', 'Mix type', 'text'],
    ['crew', 'Crew / foreman', 'text'],
    ['qaName', 'QA name', 'text'],
    ['mixOrdered', 'Mix ordered (t)', 'number'],
  ];
  function buildChecklist(job, patches, photos) {
    const items = [];
    const jf = job.naFlags || {};
    JOB_CHECK_FIELDS.forEach(([key, label, inputType]) => {
      const v = job[key];
      if ((v === '' || v == null) && !jf[key]) items.push({ type: 'job', key, label, inputType });
    });
    const P = pfx(job);
    patches.forEach(p => {
      const pf = p.naFlags || {};
      const tag = P + p.number;
      if (!(num(p.length) && num(p.width)) && !pf.size) items.push({ type: 'patch', patch: p, key: 'size', label: tag + ' — size (length × width)' });
      if (!p.location && !pf.location) items.push({ type: 'patch', patch: p, key: 'location', label: tag + ' — location on site' });
      if (!(p.readings || []).some(r => num(r.depth) > 0) && !pf.readings) items.push({ type: 'patch', patch: p, key: 'readings', label: tag + ' — stringing depth readings' });
      PHOTO_CATS.forEach(cat => {
        const k = 'photo_' + cat.key;
        if (!photos.some(ph => ph.patchId === p.id && ph.category === cat.key) && !pf[k]) {
          items.push({ type: 'patch', patch: p, key: k, label: tag + ' — no ' + cat.label + ' photos' });
        }
      });
    });
    return items;
  }

  async function renderCheck(jobId) {
    const job = await get('jobs', jobId);
    if (!job) { location.hash = '#/'; return; }
    const patches = (await getAll('patches', 'jobId', jobId)).sort((a, b) => a.number - b.number);
    const photos = await getAll('photos', 'jobId', jobId);
    const items = buildChecklist(job, patches, photos);
    if (!items.length) { location.replace('#/qareport/' + jobId); return; }
    setChrome('Report check', true);

    view.innerHTML = `
      <div id="checkRoot">
      <div class="page-head">
        <h2>Almost there</h2>
        <div class="sub">${items.length} item${items.length > 1 ? 's' : ''} still missing. Fill them in now, or mark N/A if not required for this job.</div>
      </div>
      <div class="card">
        ${items.map((it, i) => `
          <div class="check-row">
            <div class="grow">
              <div class="check-label">${esc(it.label)}</div>
              ${it.type === 'job' ? `<input type="${it.inputType}" ${it.inputType === 'number' ? 'step="0.1" inputmode="decimal"' : ''} data-jobfield="${it.key}" placeholder="Enter ${esc(it.label.toLowerCase())}">` : ''}
            </div>
            ${it.type === 'patch' ? `<button class="btn soft small" data-nav="#/patch/${jobId}/${it.patch.id}">Open</button>` : ''}
            <button class="btn soft small na-btn" data-na="${i}">N/A</button>
          </div>`).join('')}
      </div>
      <button class="btn primary" id="contBtn">Continue to QA report</button>
      <div class="sub" style="text-align:center;margin-top:10px">You can continue anyway — unresolved items just stay blank in the report.</div>
      </div>`;

    bindNav();
    const root = document.getElementById('checkRoot');
    const fieldTimers = {};
    root.addEventListener('input', e => {
      const k = e.target.dataset.jobfield;
      if (!k) return;
      job[k] = k === 'mixOrdered' ? (e.target.value === '' ? '' : num(e.target.value)) : e.target.value.trim();
      clearTimeout(fieldTimers[k]);
      fieldTimers[k] = setTimeout(() => put('jobs', job), 300);
    });
    root.addEventListener('click', async e => {
      const na = e.target.dataset.na;
      if (na === undefined) return;
      const it = items[na];
      haptic();
      if (it.type === 'job') {
        job.naFlags = job.naFlags || {};
        job.naFlags[it.key] = true;
        await put('jobs', job);
      } else {
        it.patch.naFlags = it.patch.naFlags || {};
        it.patch.naFlags[it.key] = true;
        await put('patches', it.patch);
      }
      renderCheck(jobId);
    });
    document.getElementById('contBtn').addEventListener('click', () => {
      location.hash = '#/qareport/' + jobId;
    });
  }

  // ------------------------------------------------- consolidated QA report
  async function renderQAReport(jobId) {
    const job = await get('jobs', jobId);
    if (!job) { location.hash = '#/'; return; }
    setChrome('QA report', true);
    const patches = (await getAll('patches', 'jobId', jobId)).sort((a, b) => a.number - b.number);
    const photos = await getAll('photos', 'jobId', jobId);

    view.innerHTML = `
      <button class="btn primary no-print" onclick="window.print()">Print / Save PDF</button>
      <div class="sub no-print" style="margin:0 2px 12px">Use your browser's print dialog and choose “Save as PDF” for the consolidated QA report.</div>
      <div class="runsheet">
        ${reportHeaderHTML(job, 'ASPHALT QA REPORT')}
        ${jobMetaHTML(job)}
        ${job.notes ? '<div class="rs-notes" style="margin-bottom:10px"><b>Job notes:</b> ' + esc(job.notes) + '</div>' : ''}
        <h3 class="report-h">1. Paving run sheet</h3>
        ${runSheetTableHTML(job, patches)}
        <h3 class="report-h">2. Mix &amp; prelevel summary</h3>
        ${mixSummaryHTML(job, patches, false)}
        <h3 class="report-h">3. Stringing sheets</h3>
        ${patches.length ? stringTablesHTML(job, patches) : '<div class="sub">No data.</div>'}
        <h3 class="report-h">4. Photo record</h3>
        ${(generalPhotosHTML(photos) + photoSectionsHTML(job, patches, photos)) || '<div class="sub">No photos captured.</div>'}
        <h3 class="report-h">5. QA comments</h3>
        <textarea id="qaComments" class="no-print qa-comments" placeholder="Final comments for this report — weather, hold points, anything the client should know&hellip;">${esc(job.reportComments)}</textarea>
        <div class="qa-comments-print" id="qaCommentsPrint">${esc(job.reportComments)}</div>
        ${signOffHTML(job)}
        ${reportFooterHTML(job)}
      </div>`;

    const ta = document.getElementById('qaComments');
    const printDiv = document.getElementById('qaCommentsPrint');
    let ct;
    ta.addEventListener('input', () => {
      job.reportComments = ta.value;
      printDiv.textContent = ta.value;
      clearTimeout(ct);
      ct = setTimeout(() => put('jobs', job), 300);
    });
  }

  // ------------------------------------------------------------- photo report
  async function renderPhotoReport(jobId) {
    const job = await get('jobs', jobId);
    if (!job) { location.hash = '#/'; return; }
    setChrome('Photo report', true);
    const patches = (await getAll('patches', 'jobId', jobId)).sort((a, b) => a.number - b.number);
    const photos = await getAll('photos', 'jobId', jobId);

    view.innerHTML = `
      <button class="btn primary no-print" onclick="window.print()">Print / Save PDF</button>
      <div class="runsheet">
        ${reportHeaderHTML(job, 'QA PHOTO REPORT')}
        ${(generalPhotosHTML(photos) + photoSectionsHTML(job, patches, photos)) || '<div class="empty">No photos in this job yet.</div>'}
        ${reportFooterHTML(job)}
      </div>`;
  }

  // ------------------------------------------------------------ backup import
  async function exportBackup() {
    try {
      const jobs = await getAll('jobs');
      const patches = await getAll('patches');
      const photos = await getAll('photos');
      const photosOut = [];
      for (const ph of photos) {
        photosOut.push({ ...ph, blob: undefined, bytes: undefined, data: await blobToDataURL(photoBlob(ph)) });
      }
      const payload = JSON.stringify({ app: 'asphalt-qa', version: 1, exported: new Date().toISOString(), jobs, patches, photos: photosOut });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      a.download = 'asphalt-qa-backup-' + todayISO() + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  }

  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'asphalt-qa') throw new Error('Not an Asphalt QA backup file');
      if (!confirm('Import ' + (data.jobs || []).length + ' job(s), ' + (data.patches || []).length + ' patch(es), ' + (data.photos || []).length + ' photo(s)?\n\nExisting records with the same IDs will be overwritten.')) return;
      for (const j of data.jobs || []) await put('jobs', j);
      for (const p of data.patches || []) await put('patches', p);
      for (const ph of data.photos || []) {
        const { data: durl, blob, bytes, ...rest } = ph;
        const b = dataURLToBlob(durl);
        await put('photos', { ...rest, bytes: await b.arrayBuffer(), type: b.type });
      }
      alert('Import complete.');
      route();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  }

  // --------------------------------------------------------------------- misc
  function bindNav() {
    view.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        haptic();
        location.hash = el.dataset.nav;
      });
    });
  }

  // --------------------------------------------------------------------- boot
  openDB().then(d => {
    db = d;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    route();
  }).catch(err => {
    view.innerHTML = '<div class="empty">Could not open local storage.<br>' + esc(err.message) + '</div>';
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
