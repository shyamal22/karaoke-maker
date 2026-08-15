/* Daily Vlog — compiler.
 *
 * Turns a day's photos and clips into a finished video, entirely on the device:
 * every frame is drawn to a <canvas>, the canvas is captured as a MediaStream,
 * clip audio and a music bed are mixed in through WebAudio, and MediaRecorder
 * writes the file. Rendering is real time (a 60s vlog takes ~60s) because that
 * is the only encoder every phone browser ships today.
 */
(function () {
  'use strict';

  const SIZES = {
    portrait: { w: 1080, h: 1920 },
    square:   { w: 1080, h: 1080 },
    wide:     { w: 1920, h: 1080 }
  };

  // mp4 first: it drops straight into Instagram/TikTok/Photos without converting.
  const MIME_CANDIDATES = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.4D401E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];

  const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif';
  const ACC = '#c8ff2f';
  const XFADE = 180;   // ms of cross-dissolve between segments
  const TAIL = 500;    // ms of fade to black at the end

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    for (const m of MIME_CANDIDATES) {
      try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* older impls throw */ }
    }
    return null;
  }

  function supported() {
    const c = document.createElement('canvas');
    return !!(pickMime() && c.captureStream && (window.AudioContext || window.webkitAudioContext));
  }

  /* ---------------- media helpers ---------------- */

  /** Items carry either a blob or a getBlob() so a day of video is fetched one clip at a time. */
  async function srcBlob(item) {
    if (!item) return null;
    if (item.blob) return item.blob;
    if (item.getBlob) { try { return await item.getBlob(); } catch (e) { return null; } }
    return null;
  }

  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => resolve({ el: img, release: () => URL.revokeObjectURL(url) });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
      img.src = url;
    });
  }

  function loadVideo(blob, { muted = false } = {}) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const v = document.createElement('video');
      v.playsInline = true;
      v.preload = 'auto';
      v.muted = muted;
      v.crossOrigin = 'anonymous';
      const done = () => resolve({ el: v, release: () => { try { v.pause(); } catch (e) {} v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); } });
      v.onloadeddata = done;
      v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read video')); };
      v.src = url;
      // Safari sometimes needs a nudge before it will decode a blob URL.
      setTimeout(() => { if (v.readyState >= 2) done(); }, 1200);
    });
  }

  /** Read duration + dimensions of a video file. */
  function probeVideo(blob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const v = document.createElement('video');
      v.playsInline = true; v.muted = true; v.preload = 'metadata';
      const finish = (out) => { URL.revokeObjectURL(url); resolve(out); };
      v.onloadedmetadata = () => finish({
        durationMs: isFinite(v.duration) ? Math.round(v.duration * 1000) : 0,
        w: v.videoWidth || 0,
        h: v.videoHeight || 0
      });
      v.onerror = () => finish({ durationMs: 0, w: 0, h: 0 });
      setTimeout(() => finish({ durationMs: 0, w: 0, h: 0 }), 6000);
      v.src = url;
    });
  }

  /** Grab a poster frame from a video, as a JPEG blob. */
  function videoThumb(blob, atMs = 300, max = 480) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const v = document.createElement('video');
      v.playsInline = true; v.muted = true; v.preload = 'auto';
      let settled = false;
      const bail = () => { if (settled) return; settled = true; URL.revokeObjectURL(url); resolve(null); };
      v.onloadeddata = () => {
        v.currentTime = Math.min(atMs / 1000, Math.max(0, (v.duration || 1) - 0.05));
      };
      v.onseeked = () => {
        if (settled) return;
        const scale = Math.min(1, max / Math.max(v.videoWidth || max, v.videoHeight || max));
        const c = document.createElement('canvas');
        c.width = Math.max(2, Math.round((v.videoWidth || max) * scale));
        c.height = Math.max(2, Math.round((v.videoHeight || max) * scale));
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => { settled = true; URL.revokeObjectURL(url); resolve(b); }, 'image/jpeg', 0.72);
      };
      v.onerror = bail;
      setTimeout(bail, 8000);
      v.src = url;
    });
  }

  /** Downscale a photo so a day of capture doesn't fill the phone. */
  function shrinkImage(blob, max = 1920, quality = 0.86) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        if (scale === 1 && blob.size < 1.6e6) { URL.revokeObjectURL(url); return resolve({ blob, w: img.width, h: img.height }); }
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const w = c.width, h = c.height;
        c.toBlob((b) => { URL.revokeObjectURL(url); resolve({ blob: b || blob, w, h }); }, 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve({ blob, w: 0, h: 0 }); };
      img.src = url;
    });
  }

  function thumbFromImage(blob, max = 400) {
    return shrinkImage(blob, max, 0.7).then((r) => r.blob);
  }

  /* ---------------- drawing ---------------- */

  function roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Draw source cropped to fill the frame, with optional Ken Burns zoom/drift. */
  function drawCover(ctx, src, sw, sh, W, H, zoom = 1, dx = 0, dy = 0) {
    if (!sw || !sh) return;
    const s = Math.max(W / sw, H / sh) * zoom;
    const w = sw * s, h = sh * s;
    ctx.drawImage(src, (W - w) / 2 + dx * (w - W) / 2, (H - h) / 2 + dy * (h - H) / 2, w, h);
  }

  /** Letterbox the source over a blurred blow-up of itself — kinder to landscape clips. */
  function drawContainBlur(ctx, src, sw, sh, W, H, zoom = 1) {
    if (!sw || !sh) return;
    ctx.save();
    try { ctx.filter = 'blur(48px) brightness(.5)'; } catch (e) {}
    drawCover(ctx, src, sw, sh, W, H, 1.25);
    ctx.restore();
    const s = Math.min(W / sw, H / sh) * zoom;
    const w = sw * s, h = sh * s;
    ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
  }

  /** Cover for close aspect ratios, contain-with-blur when the shapes really differ. */
  function drawMedia(ctx, src, sw, sh, W, H, zoom, dx, dy) {
    if (!sw || !sh) return;
    const srcAR = sw / sh, dstAR = W / H;
    const off = Math.abs(Math.log(srcAR / dstAR));
    if (off > 0.28) drawContainBlur(ctx, src, sw, sh, W, H, zoom);
    else drawCover(ctx, src, sw, sh, W, H, zoom, dx, dy);
  }

  function scrim(ctx, W, H, from = 0.55) {
    const g = ctx.createLinearGradient(0, H * from, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.82)');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * from, W, H * (1 - from));
  }

  function wrapLines(ctx, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width > maxW && line) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawCaption(ctx, text, W, H, pad) {
    if (!text) return;
    ctx.font = `800 ${Math.round(W * 0.058)}px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const lines = wrapLines(ctx, text, W - pad * 2).slice(-3);
    const lh = Math.round(W * 0.072);
    let y = H - pad - (lines.length - 1) * lh;
    ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fff';
    for (const l of lines) { ctx.fillText(l, pad, y); y += lh; }
    ctx.shadowBlur = 0;
  }

  function drawBadge(ctx, text, W, pad, y) {
    if (!text) return;
    ctx.font = `800 ${Math.round(W * 0.03)}px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const tw = ctx.measureText(text).width;
    const h = Math.round(W * 0.058), w = tw + h * 0.9;
    ctx.fillStyle = ACC;
    roundRect(ctx, pad, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#101401';
    ctx.fillText(text, pad + h * 0.45, y + h / 2 + 1);
  }

  function drawProgress(ctx, frac, W, H) {
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(0, H - 6, W, 6);
    ctx.fillStyle = ACC;
    ctx.fillRect(0, H - 6, W * Math.max(0, Math.min(1, frac)), 6);
  }

  /* ---------------- plan ---------------- */

  /**
   * Build the edit. `items` are already ordered and filtered to what's included.
   * Returns { segments, totalMs }.
   */
  function buildPlan(ctx) {
    const o = ctx.opts || {};
    const items = ctx.items || [];
    const beat = o.bpm ? 60000 / o.bpm : 0;
    const snap = (ms) => (beat ? Math.max(beat, Math.round(ms / beat) * beat) : ms);

    const photoMs = snap(o.photoMs || 2200);
    const maxClipMs = o.maxClipMs || 6000;
    const segments = [];

    if (o.intro !== false) {
      segments.push({
        type: 'title',
        ms: snap(o.titleMs || 2400),
        kicker: ctx.kicker || '',
        title: ctx.title || '',
        sub: ctx.subtitle || '',
        bg: ctx.heroItem || null
      });
    }

    for (const it of items) {
      if (it.kind === 'video') {
        const inMs = it.trimIn || 0;
        const rawOut = it.trimOut || it.durationMs || 0;
        const outMs = Math.min(rawOut, inMs + maxClipMs);
        const ms = Math.max(400, outMs - inMs);
        segments.push({ type: 'video', ms, item: it, inMs, outMs });
      } else {
        segments.push({ type: 'photo', ms: photoMs, item: it });
      }
    }

    if (o.stats !== false && ctx.stats && ctx.stats.length) {
      segments.push({ type: 'stats', ms: snap(o.statsMs || 2600), stats: ctx.stats, heading: ctx.statsHeading || 'TODAY' });
    }

    if (o.compare !== false && ctx.compare && ctx.compare.a && ctx.compare.b) {
      segments.push({ type: 'compare', ms: snap(o.compareMs || 3000), ...ctx.compare });
    }

    if (o.outro !== false && (ctx.outro || []).length) {
      segments.push({ type: 'outro', ms: snap(o.outroMs || 2400), lines: ctx.outro });
    }

    let totalMs = 0;
    for (const s of segments) { s.startMs = totalMs; totalMs += s.ms; }
    return { segments, totalMs: totalMs + TAIL };
  }

  /* ---------------- render ---------------- */

  /**
   * Render a plan to a video file.
   * opts: { size, canvas, music (Blob), musicGain, onProgress(frac, label), signal:{cancel} }
   * Resolves { blob, mime, ext, durationMs }.
   */
  async function render(plan, opts = {}) {
    const mime = pickMime();
    if (!mime) throw new Error('This browser cannot record video. Try Chrome, or Safari on iOS 15 or newer.');

    const size = SIZES[opts.size] || SIZES.portrait;
    const canvas = opts.canvas || document.createElement('canvas');
    canvas.width = size.w;
    canvas.height = size.h;
    const ctx = canvas.getContext('2d', { alpha: false });
    const W = size.w, H = size.h;
    const pad = Math.round(W * 0.075);
    const signal = opts.signal || { cancel: false };
    const total = plan.totalMs;

    // Snapshot canvas used for the cross-dissolve between segments.
    const prev = document.createElement('canvas');
    prev.width = W; prev.height = H;
    const prevCtx = prev.getContext('2d', { alpha: false });
    let hasPrev = false;

    const AC = window.AudioContext || window.webkitAudioContext;
    const audio = new AC();
    if (audio.state === 'suspended') { try { await audio.resume(); } catch (e) {} }
    const mixer = audio.createMediaStreamDestination();
    const monitor = audio.createGain();
    monitor.gain.value = 1;
    monitor.connect(audio.destination);

    // Keep a silent source running for the whole recording. With no music and no
    // clip sound, nothing ever feeds the audio track and the muxer writes a
    // truncated duration into the file — the video plays for seconds instead of
    // minutes. A constant zero keeps the track alive end to end.
    let keepAlive = null;
    try {
      keepAlive = audio.createConstantSource();
      keepAlive.offset.value = 0;
      keepAlive.connect(mixer);
      keepAlive.start();
    } catch (e) {
      try {
        const osc = audio.createOscillator();
        const g = audio.createGain();
        g.gain.value = 0;
        osc.connect(g); g.connect(mixer); osc.start();
        keepAlive = osc;
      } catch (e2) { keepAlive = null; }
    }

    // Music bed
    let musicEl = null, musicGain = null, musicUrl = null;
    if (opts.music) {
      try {
        musicUrl = URL.createObjectURL(opts.music);
        musicEl = new Audio();
        musicEl.src = musicUrl;
        musicEl.loop = true;
        musicEl.crossOrigin = 'anonymous';
        const src = audio.createMediaElementSource(musicEl);
        musicGain = audio.createGain();
        musicGain.gain.value = opts.musicGain != null ? opts.musicGain : 0.85;
        src.connect(musicGain);
        musicGain.connect(mixer);
        musicGain.connect(monitor);
      } catch (e) { musicEl = null; }
    }

    const stream = canvas.captureStream(30);
    const atrack = mixer.stream.getAudioTracks()[0];
    if (atrack) stream.addTrack(atrack);

    const chunks = [];
    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: opts.bitrate || (size.w >= 1920 ? 9e6 : 7e6),
      audioBitsPerSecond: 128000
    });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const finished = new Promise((res) => { rec.onstop = res; });

    const cleanup = () => {
      if (keepAlive) { try { keepAlive.stop(); } catch (e) {} }
      try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
      if (musicEl) { try { musicEl.pause(); } catch (e) {} }
      if (musicUrl) URL.revokeObjectURL(musicUrl);
      try { audio.close(); } catch (e) {}
    };

    const carryFade = (elapsedInSeg) => {
      if (!hasPrev || elapsedInSeg >= XFADE) return;
      ctx.save();
      ctx.globalAlpha = 1 - elapsedInSeg / XFADE;
      ctx.drawImage(prev, 0, 0);
      ctx.restore();
    };

    const stash = () => { prevCtx.drawImage(canvas, 0, 0); hasPrev = true; };

    // Draw one segment for its duration, calling draw(t, dur) each frame.
    const play = (durMs, draw) => new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        if (signal.cancel) return resolve('cancel');
        const t = Math.min(now - t0, durMs);
        draw(t, durMs);
        carryFade(t);
        if (now - t0 >= durMs) { stash(); return resolve(); }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    const report = (segStart, t, label) => {
      if (opts.onProgress) opts.onProgress(Math.min(1, (segStart + t) / total), label);
    };

    rec.start();
    if (musicEl) { try { await musicEl.play(); } catch (e) {} }

    try {
      for (let i = 0; i < plan.segments.length; i++) {
        if (signal.cancel) break;
        const seg = plan.segments[i];
        const label = `Scene ${i + 1} of ${plan.segments.length}`;
        const at = (t) => report(seg.startMs, t, label);

        if (seg.type === 'title') {
          let bg = null;
          const bgBlob = await srcBlob(seg.bg);
          if (bgBlob) { try { bg = await loadImage(bgBlob); } catch (e) {} }
          await play(seg.ms, (t, dur) => {
            ctx.fillStyle = '#0b0d0e';
            ctx.fillRect(0, 0, W, H);
            if (bg) {
              ctx.save();
              ctx.globalAlpha = 0.42;
              drawCover(ctx, bg.el, bg.el.naturalWidth, bg.el.naturalHeight, W, H, 1.04 + 0.06 * (t / dur));
              ctx.restore();
              ctx.fillStyle = 'rgba(11,13,14,.45)';
              ctx.fillRect(0, 0, W, H);
            }
            const ease = Math.min(1, t / 420);
            ctx.save();
            ctx.globalAlpha = ease;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            let y = H * 0.5;
            if (seg.kicker) {
              ctx.font = `800 ${Math.round(W * 0.036)}px ${FONT}`;
              ctx.fillStyle = ACC;
              ctx.fillText(seg.kicker.toUpperCase(), pad, y - Math.round(W * 0.15));
            }
            ctx.fillStyle = '#fff';
            ctx.font = `900 ${Math.round(W * 0.115)}px ${FONT}`;
            const lines = wrapLines(ctx, seg.title, W - pad * 2).slice(0, 3);
            for (const l of lines) { ctx.fillText(l, pad, y); y += Math.round(W * 0.125); }
            if (seg.sub) {
              ctx.font = `600 ${Math.round(W * 0.042)}px ${FONT}`;
              ctx.fillStyle = 'rgba(255,255,255,.72)';
              ctx.fillText(seg.sub, pad, y + Math.round(W * 0.02));
            }
            ctx.fillStyle = ACC;
            ctx.fillRect(pad, H * 0.5 - Math.round(W * 0.115), Math.round(W * 0.16), 8);
            ctx.restore();
            drawProgress(ctx, (seg.startMs + t) / total, W, H);
            at(t);
          });
          if (bg) bg.release();

        } else if (seg.type === 'photo') {
          let img = null;
          const pb = await srcBlob(seg.item);
          if (!pb) continue;
          try { img = await loadImage(pb); } catch (e) { continue; }
          const drift = (seg.item.id || '').length % 2 ? 1 : -1;
          await play(seg.ms, (t, dur) => {
            const p = t / dur;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);
            drawMedia(ctx, img.el, img.el.naturalWidth, img.el.naturalHeight, W, H,
              1.05 + 0.09 * p, drift * 0.28 * (p - 0.5), 0.18 * (p - 0.5));
            if (seg.item.caption) { scrim(ctx, W, H); drawCaption(ctx, seg.item.caption, W, H, pad); }
            if (seg.item.badge) drawBadge(ctx, seg.item.badge, W, pad, pad);
            drawProgress(ctx, (seg.startMs + t) / total, W, H);
            at(t);
          });
          img.release();

        } else if (seg.type === 'video') {
          let vid = null;
          const vb = await srcBlob(seg.item);
          if (!vb) continue;
          try { vid = await loadVideo(vb); } catch (e) { continue; }
          const v = vid.el;
          let srcNode = null, clipGain = null;
          try {
            srcNode = audio.createMediaElementSource(v);
            clipGain = audio.createGain();
            clipGain.gain.value = seg.item.mute ? 0 : (opts.clipGain != null ? opts.clipGain : 1);
            srcNode.connect(clipGain);
            clipGain.connect(mixer);
            clipGain.connect(monitor);
          } catch (e) { /* no audio track, or already wired */ }
          // duck the music under clip audio
          if (musicGain && !seg.item.mute) {
            try { musicGain.gain.setTargetAtTime(0.22, audio.currentTime, 0.12); } catch (e) { musicGain.gain.value = 0.22; }
          }
          try {
            v.currentTime = seg.inMs / 1000;
            await new Promise((r) => { const done = () => r(); v.onseeked = done; setTimeout(done, 900); });
            await v.play();
          } catch (e) { /* keep going; we still draw whatever frame we have */ }

          await play(seg.ms, (t, dur) => {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);
            drawMedia(ctx, v, v.videoWidth, v.videoHeight, W, H, 1, 0, 0);
            if (seg.item.caption) { scrim(ctx, W, H); drawCaption(ctx, seg.item.caption, W, H, pad); }
            if (seg.item.badge) drawBadge(ctx, seg.item.badge, W, pad, pad);
            drawProgress(ctx, (seg.startMs + t) / total, W, H);
            at(t);
          });

          try { v.pause(); } catch (e) {}
          if (clipGain) { try { clipGain.disconnect(); } catch (e) {} }
          if (srcNode) { try { srcNode.disconnect(); } catch (e) {} }
          if (musicGain) {
            const back = opts.musicGain != null ? opts.musicGain : 0.85;
            try { musicGain.gain.setTargetAtTime(back, audio.currentTime, 0.2); } catch (e) { musicGain.gain.value = back; }
          }
          vid.release();

        } else if (seg.type === 'stats') {
          await play(seg.ms, (t, dur) => {
            ctx.fillStyle = '#0b0d0e';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = ACC;
            ctx.fillRect(0, 0, W, 10);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';

            const cols = 2;
            const gut = Math.round(W * 0.045);
            const cw = (W - pad * 2 - gut) / cols;
            const shown = seg.stats.slice(0, 6);
            const rows = Math.ceil(shown.length / cols);
            const rowH = Math.round(W * 0.235);
            const top = Math.round(H / 2 - (rows * rowH) / 2 + rowH * 0.2);

            ctx.font = `800 ${Math.round(W * 0.036)}px ${FONT}`;
            ctx.fillStyle = ACC;
            ctx.fillText(String(seg.heading).toUpperCase(), pad, top - Math.round(W * 0.11));

            shown.forEach((s, i) => {
              const x = pad + (i % cols) * (cw + gut);
              const y = top + Math.floor(i / cols) * rowH;
              const appear = Math.min(1, Math.max(0, (t - i * 110) / 320));
              ctx.save();
              ctx.globalAlpha = appear;
              ctx.fillStyle = '#fff';
              // shrink long values (e.g. "10.2 km") so columns never collide
              let px = Math.round(W * 0.105);
              ctx.font = `900 ${px}px ${FONT}`;
              while (ctx.measureText(String(s.v)).width > cw && px > Math.round(W * 0.045)) {
                px -= 3;
                ctx.font = `900 ${px}px ${FONT}`;
              }
              ctx.fillText(String(s.v), x, y + Math.round(W * 0.09) * appear);
              ctx.fillStyle = 'rgba(255,255,255,.55)';
              ctx.font = `700 ${Math.round(W * 0.03)}px ${FONT}`;
              ctx.fillText(String(s.l).toUpperCase(), x, y + Math.round(W * 0.14));
              ctx.restore();
            });
            drawProgress(ctx, (seg.startMs + t) / total, W, H);
            at(t);
          });

        } else if (seg.type === 'compare') {
          let a = null, b = null;
          const [ab, bb] = [await srcBlob(seg.a), await srcBlob(seg.b)];
          try {
            if (ab) a = await loadImage(ab);
            if (bb) b = await loadImage(bb);
          } catch (e) {}
          await play(seg.ms, (t, dur) => {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, W, H);
            const half = W / 2;
            const zoom = 1.02 + 0.05 * (t / dur);
            if (a) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, half, H); ctx.clip(); drawCover(ctx, a.el, a.el.naturalWidth, a.el.naturalHeight, half, H, zoom); ctx.restore(); }
            if (b) { ctx.save(); ctx.beginPath(); ctx.rect(half, 0, half, H); ctx.clip(); ctx.translate(half, 0); drawCover(ctx, b.el, b.el.naturalWidth, b.el.naturalHeight, half, H, zoom); ctx.restore(); }
            ctx.fillStyle = ACC;
            ctx.fillRect(half - 3, 0, 6, H);
            scrim(ctx, W, H, 0.74);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.font = `900 ${Math.round(W * 0.042)}px ${FONT}`;
            ctx.fillStyle = '#fff';
            ctx.fillText(String(seg.labelA || 'BEFORE').toUpperCase(), half / 2, H - pad);
            ctx.fillText(String(seg.labelB || 'NOW').toUpperCase(), half + half / 2, H - pad);
            drawProgress(ctx, (seg.startMs + t) / total, W, H);
            at(t);
          });
          if (a) a.release();
          if (b) b.release();

        } else if (seg.type === 'outro') {
          await play(seg.ms, (t, dur) => {
            ctx.fillStyle = '#0b0d0e';
            ctx.fillRect(0, 0, W, H);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const lines = seg.lines.slice(0, 4);
            const lh = Math.round(W * 0.11);
            let y = H / 2 - ((lines.length - 1) * lh) / 2;
            lines.forEach((l, i) => {
              const appear = Math.min(1, Math.max(0, (t - i * 140) / 340));
              ctx.save();
              ctx.globalAlpha = appear;
              ctx.fillStyle = i === 0 ? ACC : '#fff';
              ctx.font = `900 ${Math.round(W * (i === 0 ? 0.095 : 0.062))}px ${FONT}`;
              ctx.fillText(String(l), W / 2, y);
              ctx.restore();
              y += lh;
            });
            drawProgress(ctx, (seg.startMs + t) / total, W, H);
            at(t);
          });
        }
      }

      // fade to black so the file doesn't end on a hard cut
      if (!signal.cancel) {
        await play(TAIL, (t, dur) => {
          ctx.drawImage(prev, 0, 0);
          ctx.fillStyle = `rgba(0,0,0,${Math.min(1, t / dur)})`;
          ctx.fillRect(0, 0, W, H);
          report(total - TAIL, t, 'Finishing');
        });
      }
    } finally {
      try { rec.stop(); } catch (e) {}
      await finished;
      cleanup();
    }

    if (signal.cancel) return null;
    const ext = mime.indexOf('mp4') > -1 ? 'mp4' : 'webm';
    const type = mime.split(';')[0];
    return { blob: new Blob(chunks, { type }), mime: type, ext, durationMs: total };
  }

  window.Vlog = {
    SIZES, pickMime, supported, buildPlan, render,
    probeVideo, videoThumb, shrinkImage, thumbFromImage
  };
})();
