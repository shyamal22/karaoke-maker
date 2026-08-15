/* Minimal PDF writer — no libraries, no CDN, works offline.
   Produces a real .pdf file (base-14 Helvetica, no embedding) so reports can be
   emailed straight from the tablet without going through a print dialog.

   Pdf.build({ title, subtitle, meta: [[label, value], ...],
               sections: [{ heading, note, table: {cols, rows}, lines: [] }] },
             { landscape: false })  ->  Blob */
(function () {
  'use strict';

  const A4 = { w: 595.28, h: 841.89 };
  const MARGIN = 36;
  const INK = '0.06 0.09 0.16';        // near-black body text
  const MUTED = '0.42 0.46 0.53';
  const ACCENT = '1 0.35 0.12';        // RCK orange

  // Rough Helvetica advance widths (fraction of font size). Good enough for
  // column fitting and right-alignment; nothing here needs typographic precision.
  function charWidth(ch, bold) {
    const c = ch.charCodeAt(0);
    let w;
    if (ch === ' ') w = 0.278;
    else if (ch >= '0' && ch <= '9') w = 0.556;
    else if ('iljt.,:;|!\'`'.indexOf(ch) >= 0) w = 0.26;
    else if ('fr()[]{}/\\-'.indexOf(ch) >= 0) w = 0.34;
    else if (ch >= 'a' && ch <= 'z') w = ch === 'm' || ch === 'w' ? 0.83 : 0.556;
    else if (ch >= 'A' && ch <= 'Z') w = ch === 'M' || ch === 'W' ? 0.86 : (ch === 'I' ? 0.28 : 0.7);
    else if (c > 126) w = 0.556;
    else w = 0.5;
    return bold ? w * 1.06 : w;
  }

  function textWidth(s, size, bold) {
    let w = 0;
    s = String(s == null ? '' : s);
    for (let i = 0; i < s.length; i++) w += charWidth(s[i], bold);
    return w * size;
  }

  function fit(s, maxW, size, bold) {
    s = String(s == null ? '' : s);
    if (textWidth(s, size, bold) <= maxW) return s;
    let out = '';
    for (let i = 0; i < s.length; i++) {
      if (textWidth(out + s[i] + '..', size, bold) > maxW) break;
      out += s[i];
    }
    return out.replace(/\s+$/, '') + '..';
  }

  function wrap(s, maxW, size, bold) {
    const words = String(s == null ? '' : s).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(word => {
      const test = line ? line + ' ' + word : word;
      if (textWidth(test, size, bold) > maxW && line) { lines.push(line); line = word; }
      else line = test;
    });
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  // Latin-1 only: swap the typographic characters we actually emit, drop the rest.
  function clean(s) {
    return String(s == null ? '' : s)
      .replace(/[‘’‛]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/…/g, '...')
      .replace(/ /g, ' ')
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
  }

  function esc(s) {
    return clean(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function latin1(str) {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xFF;
    return out;
  }

  // ------------------------------------------------------------------ canvas
  function Page(w, h) {
    this.w = w; this.h = h;
    this.ops = [];
  }
  Page.prototype.text = function (s, x, y, size, opts) {
    opts = opts || {};
    const str = esc(s);
    if (!str) return;
    this.ops.push('BT /' + (opts.bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' +
      (opts.color || INK) + ' rg 1 0 0 1 ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Tm (' + str + ') Tj ET');
  };
  Page.prototype.textRight = function (s, xRight, y, size, opts) {
    const w = textWidth(clean(s), size, opts && opts.bold);
    this.text(s, xRight - w, y, size, opts);
  };
  Page.prototype.rect = function (x, y, w, h, color) {
    this.ops.push((color || '0.9 0.9 0.9') + ' rg ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re f');
  };
  Page.prototype.line = function (x1, y1, x2, y2, color, width) {
    this.ops.push((color || '0.8 0.82 0.86') + ' RG ' + (width || 0.6) + ' w ' +
      x1.toFixed(2) + ' ' + y1.toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' l S');
  };
  Page.prototype.stream = function () { return this.ops.join('\n'); };

  // -------------------------------------------------------------------- build
  function build(doc, opts) {
    opts = opts || {};
    const pw = opts.landscape ? A4.h : A4.w;
    const ph = opts.landscape ? A4.w : A4.h;
    const contentW = pw - MARGIN * 2;
    const pages = [];
    let page, y;

    function newPage(first) {
      page = new Page(pw, ph);
      pages.push(page);
      // Letterhead band
      page.rect(0, ph - 54, pw, 54, '0.04 0.05 0.07');
      page.rect(0, ph - 58, pw, 4, ACCENT);
      page.text('RCK NZ', MARGIN, ph - 32, 15, { bold: true, color: '1 1 1' });
      page.text('Asphalt & Civil Contracting', MARGIN + 74, ph - 32, 8.5, { color: '0.65 0.68 0.74' });
      page.textRight(doc.title || 'Report', pw - MARGIN, ph - 32, 10.5, { bold: true, color: '1 1 1' });
      if (doc.subtitle) page.textRight(doc.subtitle, pw - MARGIN, ph - 44, 8, { color: '0.65 0.68 0.74' });
      y = ph - 82;
      if (first && doc.meta && doc.meta.length) {
        const perCol = Math.ceil(doc.meta.length / 2);
        doc.meta.forEach((m, i) => {
          const col = Math.floor(i / perCol);
          const row = i % perCol;
          const x = MARGIN + col * (contentW / 2);
          page.text(String(m[0]).toUpperCase(), x, y - row * 13, 7.2, { color: MUTED, bold: true });
          page.text(m[1], x + 92, y - row * 13, 9, {});
        });
        y -= perCol * 13 + 12;
        page.line(MARGIN, y, pw - MARGIN, y, '0.85 0.87 0.9', 0.8);
        y -= 18;
      }
    }

    function space(need) {
      if (y - need < MARGIN + 26) newPage(false);
    }

    newPage(true);

    (doc.sections || []).forEach(sec => {
      space(60);
      if (sec.heading) {
        page.rect(MARGIN, y - 3, 3, 12, ACCENT);
        page.text(sec.heading.toUpperCase(), MARGIN + 9, y, 10, { bold: true });
        y -= 15;
      }
      if (sec.note) {
        wrap(sec.note, contentW, 8.5, false).forEach(l => { page.text(l, MARGIN, y, 8.5, { color: MUTED }); y -= 11; });
        y -= 3;
      }
      (sec.lines || []).forEach(l => {
        space(16);
        page.text(l, MARGIN, y, 9.5, {});
        y -= 13;
      });

      if (sec.table && sec.table.rows) {
        const cols = sec.table.cols;
        const totalUnits = cols.reduce((n, c) => n + (c.width || 1), 0);
        const xs = [];
        let acc = MARGIN;
        cols.forEach(c => { xs.push(acc); acc += (c.width || 1) / totalUnits * contentW; });
        const widths = cols.map((c, i) => ((c.width || 1) / totalUnits) * contentW);

        const header = () => {
          page.rect(MARGIN, y - 4, contentW, 16, '0.93 0.94 0.96');
          cols.forEach((c, i) => {
            const pad = 4;
            if (c.align === 'right') page.textRight(c.label, xs[i] + widths[i] - pad, y, 7.6, { bold: true, color: '0.25 0.28 0.34' });
            else page.text(fit(c.label, widths[i] - pad * 2, 7.6, true), xs[i] + pad, y, 7.6, { bold: true, color: '0.25 0.28 0.34' });
          });
          y -= 18;
        };

        space(40);
        header();

        sec.table.rows.forEach((row, ri) => {
          if (y - 14 < MARGIN + 26) { newPage(false); header(); }
          const bold = !!row.__total;
          if (bold) page.line(MARGIN, y + 11, pw - MARGIN, y + 11, '0.55 0.58 0.63', 0.8);
          else if (ri % 2 === 1) page.rect(MARGIN, y - 4, contentW, 14, '0.975 0.978 0.985');
          cols.forEach((c, i) => {
            const v = row[i];
            const pad = 4;
            const str = v == null ? '' : String(v);
            if (c.align === 'right') page.textRight(str, xs[i] + widths[i] - pad, y, 8.4, { bold });
            else page.text(fit(str, widths[i] - pad * 2, 8.4, bold), xs[i] + pad, y, 8.4, { bold });
          });
          y -= 14;
        });
        y -= 12;
      }
      y -= 8;
    });

    // Footers
    const stamp = doc.footer || '';
    pages.forEach((p, i) => {
      p.line(MARGIN, MARGIN + 16, pw - MARGIN, MARGIN + 16, '0.85 0.87 0.9', 0.6);
      p.text(stamp, MARGIN, MARGIN + 5, 7.5, { color: MUTED });
      p.textRight('Page ' + (i + 1) + ' of ' + pages.length, pw - MARGIN, MARGIN + 5, 7.5, { color: MUTED });
    });

    // ------------------------------------------------------------ serialise
    const objects = [];
    const nPages = pages.length;
    const pageIds = pages.map((p, i) => 5 + i * 2);

    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = '<< /Type /Pages /Count ' + nPages + ' /Kids [' + pageIds.map(id => id + ' 0 R').join(' ') + '] >>';
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

    pages.forEach((p, i) => {
      const pid = pageIds[i], cid = pid + 1;
      objects[pid] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw.toFixed(2) + ' ' + ph.toFixed(2) + '] ' +
        '/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + cid + ' 0 R >>';
      const s = p.stream();
      objects[cid] = '<< /Length ' + latin1(s).length + ' >>\nstream\n' + s + '\nendstream';
    });

    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [];
    const maxId = 4 + nPages * 2;
    for (let id = 1; id <= maxId; id++) {
      offsets[id] = latin1(out).length;
      out += id + ' 0 obj\n' + objects[id] + '\nendobj\n';
    }
    const xrefAt = latin1(out).length;
    out += 'xref\n0 ' + (maxId + 1) + '\n0000000000 65535 f \n';
    for (let id = 1; id <= maxId; id++) {
      out += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
    }
    out += 'trailer\n<< /Size ' + (maxId + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF';

    return new Blob([latin1(out)], { type: 'application/pdf' });
  }

  window.Pdf = { build };
})();
