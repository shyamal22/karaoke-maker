/* Asphalt QA — field capture app for mill & fill / paving QA
   Plain JS, IndexedDB storage, works fully offline. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  const PHOTO_CATS = [
    { key: 'before', label: 'Before' },
    { key: 'milled', label: 'Milled' },
    { key: 'spray',  label: 'Spray / Membrane' },
    { key: 'finish', label: 'Finish' },
  ];
  const STRING_CAT = { key: 'stringing', label: 'Stringing / Depth' };
  const ALL_CATS = PHOTO_CATS.concat([STRING_CAT]);
  const DEFAULT_DENSITY = 2.4; // t/m3 compacted asphalt
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

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width: w, height: h } = img;
        const scale = Math.min(1, MAX_PHOTO_PX / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        c.toBlob(b => b ? resolve(b) : reject(new Error('compress failed')), 'image/jpeg', JPEG_Q);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }
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

  // ------------------------------------------------------------------ helpers
  function patchAvgDepth(p) {
    const rs = (p.readings || []).map(r => num(r.depth)).filter(d => d > 0);
    if (!rs.length) return 0;
    return rs.reduce((a, b) => a + b, 0) / rs.length;
  }
  function patchArea(p) { return num(p.length) * num(p.width); }
  function patchTonnes(p, density) {
    const depth = patchAvgDepth(p) || num(p.depth); // measured beats design
    return patchArea(p) * (depth / 1000) * (density || DEFAULT_DENSITY);
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

    let html = '';
    if (!jobs.length) {
      html = '<div class="empty">No jobs yet.<br>Tap <b>+</b> to start your first job.</div>';
    } else {
      html = jobs.map(j => `
        <div class="card tappable" data-nav="#/job/${j.id}">
          <div class="row">
            <div class="grow">
              <h3>${esc(j.name || j.road || 'Untitled job')}</h3>
              <div class="sub">${esc(fmtDate(j.date))} &middot; ${esc(j.client || 'No client')}${j.jobNo ? ' &middot; #' + esc(j.jobNo) : ''}</div>
              <div class="sub">${esc(j.workType || '')}${countBy[j.id] ? ' &middot; ' + countBy[j.id] + ' patch' + (countBy[j.id] > 1 ? 'es' : '') : ''}</div>
            </div>
            <span class="badge ${j.workType === 'Paving only' ? 'green' : 'orange'}">${j.workType === 'Paving only' ? 'PAVE' : 'M&amp;F'}</span>
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
    const j = job || { date: todayISO(), workType: 'Mill & Fill', density: DEFAULT_DENSITY };
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
        <div class="grid2">
          <label class="fld"><span>Work type</span>
            <select name="workType">
              <option${j.workType === 'Mill & Fill' ? ' selected' : ''}>Mill &amp; Fill</option>
              <option${j.workType === 'Paving only' ? ' selected' : ''}>Paving only</option>
            </select></label>
          <label class="fld"><span>Mix type</span>
            <input type="text" name="mix" value="${esc(j.mix)}" placeholder="e.g. AC10"></label>
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

    document.getElementById('jobForm').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const rec = job || { id: uid(), createdAt: Date.now() };
      ['name', 'date', 'jobNo', 'client', 'road', 'workType', 'mix', 'crew', 'qaName', 'notes'].forEach(k => rec[k] = (f.get(k) || '').toString().trim());
      rec.density = num(f.get('density')) || DEFAULT_DENSITY;
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
    const photoCount = {};
    photos.forEach(ph => { photoCount[ph.patchId] = (photoCount[ph.patchId] || 0) + 1; });

    const totArea = patches.reduce((a, p) => a + patchArea(p), 0);
    const totTonnes = patches.reduce((a, p) => a + patchTonnes(p, job.density), 0);

    view.innerHTML = `
      <div class="card">
        <div class="row">
          <div class="grow">
            <h3>${esc(job.name || job.road || 'Untitled job')}</h3>
            <div class="sub">${esc(fmtDate(job.date))} &middot; ${esc(job.client || 'No client')}${job.jobNo ? ' &middot; #' + esc(job.jobNo) : ''}</div>
            <div class="sub">${esc(job.workType)}${job.mix ? ' &middot; ' + esc(job.mix) : ''}${job.road ? ' &middot; ' + esc(job.road) : ''}</div>
          </div>
          <button class="btn outline small" data-nav="#/job-edit/${job.id}">Edit</button>
        </div>
      </div>
      <div class="grid2">
        <button class="btn dark" data-nav="#/runsheet/${job.id}">Run sheet</button>
        <button class="btn outline" data-nav="#/photos/${job.id}">Photo report</button>
      </div>
      <div class="section-title">Patches (${patches.length})${patches.length ? ' &middot; ' + fmt(totArea, 1) + ' m&sup2; &middot; ~' + fmt(totTonnes, 1) + ' t' : ''}</div>
      ${patches.length ? patches.map(p => {
        const avg = patchAvgDepth(p);
        return `
        <div class="card tappable" data-nav="#/patch/${job.id}/${p.id}">
          <div class="row">
            <span class="badge">P${p.number}</span>
            <div class="grow">
              <h3>${esc(p.location || 'No location')}</h3>
              <div class="sub">${num(p.length) ? fmt(num(p.length), 1) + ' &times; ' + fmt(num(p.width), 1) + ' m = ' + fmt(patchArea(p), 1) + ' m&sup2;' : 'No size yet'}
                ${num(p.depth) ? ' &middot; design ' + fmt(num(p.depth), 0) + ' mm' : ''}
                ${avg ? ' &middot; avg cut ' + fmt(avg, 0) + ' mm' : ''}</div>
              <div class="sub">${photoCount[p.id] || 0} photo${(photoCount[p.id] || 0) === 1 ? '' : 's'}${(p.readings || []).length ? ' &middot; ' + p.readings.length + ' string depth' + (p.readings.length > 1 ? 's' : '') : ''}</div>
            </div>
          </div>
        </div>`;
      }).join('') : '<div class="empty">No patches yet.<br>Tap <b>+</b> to add the first patch.</div>'}
      <button class="fab" id="addPatch" aria-label="Add patch">+</button>`;

    bindNav();
    document.getElementById('addPatch').addEventListener('click', async () => {
      const number = patches.length ? Math.max(...patches.map(p => p.number || 0)) + 1 : 1;
      const p = { id: uid(), jobId, number, location: '', length: '', width: '', depth: '', readings: [], notes: '', createdAt: Date.now() };
      await put('patches', p);
      location.hash = '#/patch/' + jobId + '/' + p.id;
    });
  }

  // ------------------------------------------------------------- patch editor
  async function renderPatch(jobId, patchId) {
    const job = await get('jobs', jobId);
    const patch = await get('patches', patchId);
    if (!job || !patch) { location.hash = '#/'; return; }
    setChrome('Patch P' + patch.number, true);
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
              <img src="${blobUrl(ph.blob)}" alt="${cat.label} photo">
              <button class="del" data-delphoto="${ph.id}" aria-label="Delete photo">&#10005;</button>
            </div>`).join('')}
          <button class="add-photo" data-addphoto="${cat.key}" aria-label="Add ${cat.label} photo">&#128247;</button>
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
        <div class="sub" id="areaLine" style="margin:-4px 2px 10px"></div>
        <label class="fld"><span>Patch notes</span>
          <textarea name="notes" placeholder="Failures, services, anything the paving crew must know">${esc(patch.notes)}</textarea></label>
      </form>

      <div class="section-title">Stringing depths (measured cut depth, mm)</div>
      <div class="card">
        <div id="readings"></div>
        <button type="button" class="btn outline" id="addReading">+ Add depth reading</button>
        <div class="sub" id="avgLine" style="margin-top:8px"></div>
        ${catBlock(STRING_CAT)}
      </div>

      <div class="section-title">Patch photos</div>
      <div class="card">
        ${PHOTO_CATS.map(catBlock).join('')}
      </div>

      <button type="button" class="btn danger no-print" id="delPatch">Delete patch P${patch.number}</button>
      <input type="file" id="photoInput" accept="image/*" capture="environment" multiple hidden>
      </div>`;

    const form = document.getElementById('patchForm');
    const areaLine = document.getElementById('areaLine');
    const avgLine = document.getElementById('avgLine');
    const readingsEl = document.getElementById('readings');

    function refreshCalcs() {
      const a = patchArea(patch);
      areaLine.innerHTML = a ? 'Area: <b>' + fmt(a, 1) + ' m&sup2;</b> &middot; est. <b>' + fmt(patchTonnes(patch, job.density), 2) + ' t</b> @ ' + (job.density || DEFAULT_DENSITY) + ' t/m&sup3;' : '';
      const avg = patchAvgDepth(patch);
      avgLine.innerHTML = avg ? 'Average measured depth: <b>' + fmt(avg, 0) + ' mm</b>' + (num(patch.depth) ? ' (design ' + fmt(num(patch.depth), 0) + ' mm)' : '') : 'No readings yet — add one per string line position.';
    }

    let saveTimer;
    function save() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => put('patches', patch), 250);
    }
    form.addEventListener('input', e => {
      const n = e.target.name;
      if (!n || n === 'gps') return;
      patch[n] = e.target.value;
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
      patch.readings = patch.readings || [];
      patch.readings.push({ pos: '', depth: '' });
      renderReadings();
      save();
      const inputs = readingsEl.querySelectorAll('input[data-rk="pos"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    renderReadings();
    refreshCalcs();

    // photos
    const photoInput = document.getElementById('photoInput');
    let pendingCat = null;
    document.getElementById('patchRoot').addEventListener('click', e => {
      const addCat = e.target.closest('[data-addphoto]');
      if (addCat) {
        pendingCat = addCat.dataset.addphoto;
        photoInput.click();
        return;
      }
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
    photoInput.addEventListener('change', async () => {
      const files = Array.from(photoInput.files || []);
      photoInput.value = '';
      if (!files.length || !pendingCat) return;
      const cat = pendingCat;
      for (const f of files) {
        try {
          const blob = await compressImage(f);
          await put('photos', { id: uid(), jobId, patchId, category: cat, blob, createdAt: Date.now() });
        } catch (err) {
          alert('Could not add a photo: ' + err.message);
        }
      }
      renderPatch(jobId, patchId);
    });

    document.getElementById('delPatch').addEventListener('click', async () => {
      if (!confirm('Delete patch P' + patch.number + ' and all its photos?')) return;
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

  // ---------------------------------------------------------------- run sheet
  async function renderRunSheet(jobId) {
    const job = await get('jobs', jobId);
    if (!job) { location.hash = '#/'; return; }
    setChrome('Run sheet', true);
    const patches = (await getAll('patches', 'jobId', jobId)).sort((a, b) => a.number - b.number);
    const density = job.density || DEFAULT_DENSITY;

    const totArea = patches.reduce((a, p) => a + patchArea(p), 0);
    const totTonnes = patches.reduce((a, p) => a + patchTonnes(p, density), 0);

    view.innerHTML = `
      <div class="grid2 no-print">
        <button class="btn primary" onclick="window.print()">Print / Save PDF</button>
        <button class="btn outline" id="csvBtn">Export CSV</button>
      </div>
      <div class="runsheet">
        <div class="rs-head">
          <h2>Paving Run Sheet</h2>
          <div class="sub">${esc(job.name || '')}</div>
        </div>
        <div class="rs-meta">
          <div><b>Date:</b> ${esc(fmtDate(job.date))}</div>
          <div><b>Client:</b> ${esc(job.client)}</div>
          <div><b>Job #:</b> ${esc(job.jobNo)}</div>
          <div><b>Road:</b> ${esc(job.road)}</div>
          <div><b>Work:</b> ${esc(job.workType)}</div>
          <div><b>Mix:</b> ${esc(job.mix)}</div>
          <div><b>Crew:</b> ${esc(job.crew)}</div>
          <div><b>QA by:</b> ${esc(job.qaName)}</div>
        </div>
        <table class="rs">
          <thead><tr>
            <th>#</th><th>Location</th>
            <th class="num">L (m)</th><th class="num">W (m)</th><th class="num">Area (m&sup2;)</th>
            <th class="num">Design (mm)</th><th class="num">Avg cut (mm)</th>
            <th class="num">Est. tonnes</th><th>String depths / notes</th>
          </tr></thead>
          <tbody>
            ${patches.map(p => {
              const avg = patchAvgDepth(p);
              const readings = (p.readings || []).filter(r => r.pos || r.depth)
                .map(r => esc(r.pos || '?') + ': ' + esc(r.depth) + 'mm').join('; ');
              return `<tr>
                <td>P${p.number}</td>
                <td>${esc(p.location)}${p.lat ? '<br><small>' + p.lat.toFixed(5) + ', ' + p.lng.toFixed(5) + '</small>' : ''}</td>
                <td class="num">${fmt(num(p.length), 1)}</td>
                <td class="num">${fmt(num(p.width), 1)}</td>
                <td class="num">${fmt(patchArea(p), 1)}</td>
                <td class="num">${num(p.depth) ? fmt(num(p.depth), 0) : ''}</td>
                <td class="num">${avg ? fmt(avg, 0) : ''}</td>
                <td class="num">${fmt(patchTonnes(p, density), 2)}</td>
                <td>${readings}${readings && p.notes ? '<br>' : ''}${esc(p.notes)}</td>
              </tr>`;
            }).join('')}
            <tr class="total">
              <td colspan="4">TOTAL — ${patches.length} patch${patches.length === 1 ? '' : 'es'}</td>
              <td class="num">${fmt(totArea, 1)}</td>
              <td></td><td></td>
              <td class="num">${fmt(totTonnes, 2)}</td>
              <td>@ ${density} t/m&sup3;</td>
            </tr>
          </tbody>
        </table>
        ${job.notes ? '<div class="rs-notes"><b>Job notes:</b> ' + esc(job.notes) + '</div>' : ''}
        <div class="sign-row">
          <div class="sign-box">QA sign-off: ${esc(job.qaName)}</div>
          <div class="sign-box">Foreman sign-off: ${esc(job.crew)}</div>
        </div>
      </div>`;

    document.getElementById('csvBtn').addEventListener('click', () => {
      const rows = [['Patch', 'Location', 'Lat', 'Lng', 'Length m', 'Width m', 'Area m2', 'Design depth mm', 'Avg cut mm', 'Est tonnes', 'String depths', 'Notes']];
      patches.forEach(p => {
        rows.push(['P' + p.number, p.location || '', p.lat || '', p.lng || '',
          num(p.length), num(p.width), fmt(patchArea(p), 2), num(p.depth) || '',
          patchAvgDepth(p) ? fmt(patchAvgDepth(p), 0) : '', fmt(patchTonnes(p, density), 2),
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

  // ------------------------------------------------------------- photo report
  async function renderPhotoReport(jobId) {
    const job = await get('jobs', jobId);
    if (!job) { location.hash = '#/'; return; }
    setChrome('Photo report', true);
    const patches = (await getAll('patches', 'jobId', jobId)).sort((a, b) => a.number - b.number);
    const photos = await getAll('photos', 'jobId', jobId);

    view.innerHTML = `
      <button class="btn primary no-print" onclick="window.print()">Print / Save PDF</button>
      <div class="card">
        <div class="rs-head">
          <h2>QA Photo Report</h2>
          <div class="sub">${esc(job.name || '')} &middot; ${esc(fmtDate(job.date))} &middot; ${esc(job.client)}${job.jobNo ? ' &middot; #' + esc(job.jobNo) : ''}</div>
        </div>
        ${patches.map(p => {
          const pPhotos = photos.filter(ph => ph.patchId === p.id);
          if (!pPhotos.length) return '';
          return `
          <div class="pr-patch">
            <h3>P${p.number} — ${esc(p.location || 'No location')}</h3>
            <div class="sub">${num(p.length) ? fmt(num(p.length), 1) + ' × ' + fmt(num(p.width), 1) + ' m' : ''}${num(p.depth) ? ' · design ' + fmt(num(p.depth), 0) + ' mm' : ''}${patchAvgDepth(p) ? ' · avg cut ' + fmt(patchAvgDepth(p), 0) + ' mm' : ''}</div>
            ${ALL_CATS.map(cat => {
              const cps = pPhotos.filter(ph => ph.category === cat.key).sort((a, b) => a.createdAt - b.createdAt);
              if (!cps.length) return '';
              return `<div class="pr-cat"><h4>${cat.label} (${cps.length})</h4>
                <div class="pr-grid">${cps.map(ph => '<img src="' + blobUrl(ph.blob) + '" alt="' + cat.label + '">').join('')}</div></div>`;
            }).join('')}
          </div>`;
        }).join('') || '<div class="empty">No photos in this job yet.</div>'}
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
        photosOut.push({ ...ph, blob: undefined, data: await blobToDataURL(ph.blob) });
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
        const { data: durl, ...rest } = ph;
        await put('photos', { ...rest, blob: dataURLToBlob(durl) });
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
