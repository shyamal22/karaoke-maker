/* RCK Sign In — hours maths, report roll-ups and the Excel / PDF exports. */
(function () {
  'use strict';

  const MS_HOUR = 3600000;
  const pad = n => String(n).padStart(2, '0');

  // ------------------------------------------------------------------- dates
  function localDay(iso) {                    // YYYY-MM-DD in the tablet's timezone
    const d = new Date(iso);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function dayEnd(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function mondayOf(d) {
    const x = dayStart(d);
    const wd = (x.getDay() + 6) % 7;          // Monday = 0
    return addDays(x, -wd);
  }
  function fromDayKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  const fmtDateFull = iso => iso ? new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, ' ') : '';
  const fmtDateTime = iso => iso ? fmtDate(iso) + ' ' + fmtTime(iso) : '';
  const isoLocal = iso => {                   // for spreadsheets: 2026-08-15 07:04
    if (!iso) return '';
    const d = new Date(iso);
    return localDay(iso) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  function hm(hours) {
    if (!isFinite(hours) || hours <= 0) return '0h 00m';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m === 60 ? (h + 1) + 'h 00m' : h + 'h ' + pad(m) + 'm';
  }

  function elapsedSince(iso) {
    return (Date.now() - new Date(iso).getTime()) / MS_HOUR;
  }

  const PRESETS = [
    { key: 'today', label: 'Today', range: () => { const t = new Date(); return [dayStart(t), dayEnd(t)]; } },
    { key: 'yesterday', label: 'Yesterday', range: () => { const t = addDays(new Date(), -1); return [dayStart(t), dayEnd(t)]; } },
    { key: 'week', label: 'This week', range: () => { const m = mondayOf(new Date()); return [m, dayEnd(addDays(m, 6))]; } },
    { key: 'lastweek', label: 'Last week', range: () => { const m = addDays(mondayOf(new Date()), -7); return [m, dayEnd(addDays(m, 6))]; } },
    { key: 'fortnight', label: 'Last 14 days', range: () => [dayStart(addDays(new Date(), -13)), dayEnd(new Date())] },
    { key: 'month', label: 'This month', range: () => { const t = new Date(); return [new Date(t.getFullYear(), t.getMonth(), 1), dayEnd(t)]; } },
    { key: 'lastmonth', label: 'Last month', range: () => { const t = new Date(); return [new Date(t.getFullYear(), t.getMonth() - 1, 1), dayEnd(new Date(t.getFullYear(), t.getMonth(), 0))]; } },
    { key: 'all', label: 'Everything', range: () => [new Date(2000, 0, 1), dayEnd(addDays(new Date(), 3650))] },
  ];

  // ------------------------------------------------------------------ shifts
  function sitesOf(entry) {
    const list = (entry.sites && entry.sites.length ? entry.sites : [entry.siteIn])
      .map(s => String(s || '').trim()).filter(Boolean);
    return list.length ? list : ['(no job recorded)'];
  }
  const siteKey = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.,;]+$/, '');

  function hoursOf(entry) {
    if (!entry.outAt) return 0;
    const raw = (new Date(entry.outAt) - new Date(entry.inAt)) / MS_HOUR;
    const paid = raw - (entry.breakMins || 0) / 60;
    return paid > 0 ? paid : 0;
  }

  function inRange(entry, from, to) {
    const t = new Date(entry.inAt).getTime();
    return t >= from.getTime() && t <= to.getTime();
  }

  function filter(from, to) {
    return Store.entries()
      .filter(e => inRange(e, from, to))
      .sort((a, b) => a.inAt.localeCompare(b.inAt));
  }

  // ------------------------------------------------------------- roll-ups
  function summary(list) {
    const done = list.filter(e => e.outAt);
    const hours = done.reduce((n, e) => n + hoursOf(e), 0);
    const jobs = new Set();
    list.forEach(e => sitesOf(e).forEach(s => jobs.add(siteKey(s))));
    return {
      shifts: list.length,
      open: list.length - done.length,
      hours,
      people: new Set(list.map(e => e.employeeId || e.name)).size,
      crews: new Set(list.map(e => e.crew)).size,
      jobs: jobs.size,
      avg: done.length ? hours / done.length : 0,
    };
  }

  function byEmployee(list) {
    const map = new Map();
    list.forEach(e => {
      const key = e.employeeId || e.name;
      if (!map.has(key)) map.set(key, { name: e.name, crews: new Set(), days: new Set(), shifts: 0, hours: 0, open: 0, jobs: new Set(), longest: 0 });
      const r = map.get(key);
      r.shifts++;
      r.crews.add(e.crew);
      r.days.add(localDay(e.inAt));
      sitesOf(e).forEach(s => r.jobs.add(siteKey(s)));
      if (e.outAt) { const h = hoursOf(e); r.hours += h; r.longest = Math.max(r.longest, h); }
      else r.open++;
    });
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }

  function byCrew(list) {
    const map = new Map();
    list.forEach(e => {
      const key = e.crew || 'Unassigned';
      if (!map.has(key)) map.set(key, { crew: key, people: new Set(), shifts: 0, hours: 0, open: 0, jobs: new Set(), days: new Set() });
      const r = map.get(key);
      r.shifts++;
      r.people.add(e.employeeId || e.name);
      r.days.add(localDay(e.inAt));
      sitesOf(e).forEach(s => r.jobs.add(siteKey(s)));
      if (e.outAt) r.hours += hoursOf(e); else r.open++;
    });
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }

  // Cumulative job hours across everyone who worked it. Where a shift covers more
  // than one job the hours are split evenly between them.
  function byJob(list) {
    const map = new Map();
    list.forEach(e => {
      const sites = sitesOf(e);
      const share = e.outAt ? hoursOf(e) / sites.length : 0;
      sites.forEach(s => {
        const k = siteKey(s);
        if (!map.has(k)) map.set(k, { site: s, hours: 0, shifts: 0, people: new Set(), crews: new Set(), days: new Set(), first: e.inAt, last: e.inAt, split: false });
        const r = map.get(k);
        r.hours += share;
        r.shifts++;
        r.people.add(e.employeeId || e.name);
        r.crews.add(e.crew);
        r.days.add(localDay(e.inAt));
        if (e.inAt < r.first) r.first = e.inAt;
        if (e.inAt > r.last) r.last = e.inAt;
        if (sites.length > 1) r.split = true;
      });
    });
    return [...map.values()].sort((a, b) => b.hours - a.hours);
  }

  function byDay(list) {
    const map = new Map();
    list.forEach(e => {
      const k = localDay(e.inAt);
      if (!map.has(k)) map.set(k, { day: k, shifts: 0, hours: 0, people: new Set() });
      const r = map.get(k);
      r.shifts++;
      r.people.add(e.employeeId || e.name);
      if (e.outAt) r.hours += hoursOf(e);
    });
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  }

  // ------------------------------------------------------------------ alerts
  // Two things can quietly cost the company money: a shift left open, and a
  // shift so long it is either a mistake or a fatigue problem. Flag both.
  function alerts() {
    const s = Store.settings();
    const forgot = Number(s.forgotHours) || 24;
    const long = Number(s.longShiftHours) || 14;
    const out = [];

    Store.openEntries().forEach(e => {
      const h = elapsedSince(e.inAt);
      if (h >= forgot) {
        out.push({
          key: 'forgot:' + e.id + ':' + Math.floor(h / 24),
          type: 'forgot', severity: 'high', entryId: e.id, name: e.name, crew: e.crew,
          site: sitesOf(e)[0], hours: h,
          title: e.name + ' has not signed out',
          detail: 'Signed in ' + fmtDateTime(e.inAt) + ' — ' + hm(h) + ' ago (' + e.crew + ', ' + sitesOf(e)[0] + ')',
        });
      } else if (h >= long) {
        out.push({
          key: 'onsitelong:' + e.id,
          type: 'long-open', severity: 'medium', entryId: e.id, name: e.name, crew: e.crew,
          site: sitesOf(e)[0], hours: h,
          title: e.name + ' is over ' + long + ' hours and still on site',
          detail: 'Signed in ' + fmtDateTime(e.inAt) + ' — ' + hm(h) + ' so far (' + e.crew + ', ' + sitesOf(e)[0] + ')',
        });
      }
    });

    Store.entries().filter(e => e.outAt).forEach(e => {
      const h = hoursOf(e);
      if (h > long) {
        out.push({
          key: 'long:' + e.id + ':' + e.rev,
          type: 'long', severity: 'medium', entryId: e.id, name: e.name, crew: e.crew,
          site: sitesOf(e)[0], hours: h,
          title: e.name + ' worked ' + hm(h) + ' on ' + fmtDate(e.inAt),
          detail: fmtTime(e.inAt) + ' to ' + fmtTime(e.outAt) + ' (' + e.crew + ', ' + sitesOf(e).join(', ') + ')' + (e.autoClosed ? ' — auto-closed' : ''),
        });
      }
    });

    return out.sort((a, b) => (a.severity === b.severity ? b.hours - a.hours : a.severity === 'high' ? -1 : 1));
  }

  // ------------------------------------------------------------------ exports
  function rangeLabel(from, to) {
    const a = fmtDateFull(from.toISOString()), b = fmtDateFull(to.toISOString());
    return a === b ? a : a + ' – ' + b;
  }

  function fileStamp(from, to) {
    return localDay(from.toISOString()) + '_to_' + localDay(to.toISOString());
  }

  function entrySheetRows(list) {
    return list.map(e => [
      localDay(e.inAt),
      fmtDate(e.inAt),
      e.name,
      e.crew || '',
      sitesOf(e).join(' | '),
      isoLocal(e.inAt),
      isoLocal(e.outAt),
      e.breakMins || 0,
      e.outAt ? round(hoursOf(e)) : '',
      e.outAt ? '' : 'STILL SIGNED IN',
      e.autoClosed ? 'Auto-closed' : (e.editedAt ? 'Edited by office' : ''),
      e.notes || '',
    ]);
  }

  const round = n => Math.round(n * 100) / 100;

  function totalRow(cells) { cells.__total = true; return cells; }

  function workbook(list, from, to) {
    const sum = summary(list);
    const emp = byEmployee(list), crew = byCrew(list), job = byJob(list), days = byDay(list);

    const sheets = [
      {
        name: 'Summary',
        cols: [{ label: 'Measure', width: 34 }, { label: 'Value', width: 26 }],
        rows: [
          ['Report range', rangeLabel(from, to)],
          ['Generated', isoLocal(new Date().toISOString())],
          ['Total hours worked', round(sum.hours)],
          ['Shifts', sum.shifts],
          ['Shifts still open (not signed out)', sum.open],
          ['People', sum.people],
          ['Crews', sum.crews],
          ['Jobs / sites', sum.jobs],
          ['Average shift (hours)', round(sum.avg)],
        ],
      },
      {
        name: 'By employee',
        cols: [
          { label: 'Employee', width: 26 }, { label: 'Crew(s)', width: 24 }, { label: 'Days worked', width: 13 },
          { label: 'Shifts', width: 9 }, { label: 'Hours', width: 11 }, { label: 'Longest shift', width: 14 },
          { label: 'Jobs', width: 9 }, { label: 'Open shifts', width: 12 },
        ],
        rows: emp.map(r => [r.name, [...r.crews].join(', '), r.days.size, r.shifts, round(r.hours), round(r.longest), r.jobs.size, r.open])
          .concat([totalRow(['TOTAL', '', '', emp.reduce((n, r) => n + r.shifts, 0), round(sum.hours), '', '', sum.open])]),
      },
      {
        name: 'By crew',
        cols: [
          { label: 'Crew', width: 22 }, { label: 'People', width: 10 }, { label: 'Days', width: 9 },
          { label: 'Shifts', width: 9 }, { label: 'Hours', width: 11 }, { label: 'Jobs', width: 9 }, { label: 'Open shifts', width: 12 },
        ],
        rows: crew.map(r => [r.crew, r.people.size, r.days.size, r.shifts, round(r.hours), r.jobs.size, r.open])
          .concat([totalRow(['TOTAL', '', '', crew.reduce((n, r) => n + r.shifts, 0), round(sum.hours), '', sum.open])]),
      },
      {
        name: 'By job',
        cols: [
          { label: 'Job / site', width: 40 }, { label: 'Total hours (all crew)', width: 20 }, { label: 'People', width: 10 },
          { label: 'Shifts', width: 9 }, { label: 'Days on site', width: 13 }, { label: 'Crews', width: 24 },
          { label: 'First day', width: 14 }, { label: 'Last day', width: 14 }, { label: 'Note', width: 26 },
        ],
        rows: job.map(r => [r.site, round(r.hours), r.people.size, r.shifts, r.days.size, [...r.crews].join(', '),
          localDay(r.first), localDay(r.last), r.split ? 'Includes shifts split across jobs' : ''])
          .concat([totalRow(['TOTAL', round(job.reduce((n, r) => n + r.hours, 0)), '', '', '', '', '', '', ''])]),
      },
      {
        name: 'By day',
        cols: [{ label: 'Date', width: 14 }, { label: 'People', width: 10 }, { label: 'Shifts', width: 9 }, { label: 'Hours', width: 11 }],
        rows: days.map(r => [r.day, r.people.size, r.shifts, round(r.hours)]),
      },
      {
        name: 'All shifts',
        cols: [
          { label: 'Date', width: 12 }, { label: 'Day', width: 13 }, { label: 'Employee', width: 24 }, { label: 'Crew', width: 16 },
          { label: 'Job / site', width: 34 }, { label: 'Signed in', width: 18 }, { label: 'Signed out', width: 18 },
          { label: 'Break (min)', width: 12 }, { label: 'Hours', width: 10 }, { label: 'Status', width: 18 },
          { label: 'Amended', width: 18 }, { label: 'Job notes', width: 44 },
        ],
        rows: entrySheetRows(list),
      },
    ];

    const al = alerts();
    if (al.length) {
      sheets.push({
        name: 'Flags',
        cols: [{ label: 'Type', width: 16 }, { label: 'Employee', width: 24 }, { label: 'Crew', width: 16 }, { label: 'Job', width: 30 }, { label: 'Hours', width: 10 }, { label: 'Detail', width: 60 }],
        rows: al.map(a => [a.type === 'forgot' ? 'No sign-out' : 'Long shift', a.name, a.crew || '', a.site || '', round(a.hours), a.detail]),
      });
    }
    return sheets;
  }

  function pdfDoc(list, from, to, opts) {
    opts = opts || {};
    const sum = summary(list);
    const emp = byEmployee(list), crew = byCrew(list), job = byJob(list);
    const s = Store.settings();

    const sections = [
      {
        heading: 'Summary',
        table: {
          cols: [{ label: 'Measure', width: 3 }, { label: 'Value', width: 1.4, align: 'right' }],
          rows: [
            ['Total hours worked', hm(sum.hours)],
            ['Shifts', String(sum.shifts)],
            ['Shifts still open (not signed out)', String(sum.open)],
            ['People', String(sum.people)],
            ['Jobs / sites', String(sum.jobs)],
            ['Average shift', hm(sum.avg)],
          ],
        },
      },
      {
        heading: 'Employee hours',
        table: {
          cols: [
            { label: 'Employee', width: 2.4 }, { label: 'Crew', width: 2 }, { label: 'Days', width: .7, align: 'right' },
            { label: 'Shifts', width: .8, align: 'right' }, { label: 'Hours', width: 1.1, align: 'right' }, { label: 'Longest', width: 1.1, align: 'right' },
          ],
          rows: emp.map(r => [r.name, [...r.crews].join(', '), String(r.days.size), String(r.shifts), hm(r.hours), hm(r.longest)])
            .concat([totalRow(['TOTAL', '', '', String(sum.shifts), hm(sum.hours), ''])]),
        },
      },
      {
        heading: 'Crew hours',
        table: {
          cols: [
            { label: 'Crew', width: 2.4 }, { label: 'People', width: .9, align: 'right' }, { label: 'Shifts', width: .9, align: 'right' },
            { label: 'Jobs', width: .8, align: 'right' }, { label: 'Hours', width: 1.2, align: 'right' },
          ],
          rows: crew.map(r => [r.crew, String(r.people.size), String(r.shifts), String(r.jobs.size), hm(r.hours)])
            .concat([totalRow(['TOTAL', '', String(sum.shifts), '', hm(sum.hours)])]),
        },
      },
      {
        heading: 'Job hours (all crew combined)',
        note: 'Hours are the cumulative total of everyone who signed in to that job. Shifts covering more than one job are split evenly between them.',
        table: {
          cols: [
            { label: 'Job / site', width: 3.2 }, { label: 'People', width: .9, align: 'right' }, { label: 'Shifts', width: .9, align: 'right' },
            { label: 'Days', width: .8, align: 'right' }, { label: 'Total hours', width: 1.3, align: 'right' },
          ],
          rows: job.map(r => [r.site, String(r.people.size), String(r.shifts), String(r.days.size), hm(r.hours)])
            .concat([totalRow(['TOTAL', '', '', '', hm(job.reduce((n, r) => n + r.hours, 0))])]),
        },
      },
    ];

    if (opts.detail !== false) {
      sections.push({
        heading: 'Every shift',
        table: {
          cols: [
            { label: 'Date', width: 1.1 }, { label: 'Employee', width: 1.9 }, { label: 'Crew', width: 1.4 },
            { label: 'Job / site', width: 2.4 }, { label: 'In', width: .9, align: 'right' }, { label: 'Out', width: .9, align: 'right' },
            { label: 'Hours', width: 1, align: 'right' },
          ],
          rows: list.map(e => [
            fmtDate(e.inAt), e.name, e.crew || '', sitesOf(e).join(', '),
            fmtTime(e.inAt), e.outAt ? fmtTime(e.outAt) : 'OPEN', e.outAt ? hm(hoursOf(e)) : '—',
          ]),
        },
      });
    }

    const al = alerts();
    if (al.length) {
      sections.splice(1, 0, {
        heading: 'Flags needing attention',
        table: {
          cols: [{ label: 'Employee', width: 1.6 }, { label: 'Flag', width: 1.2 }, { label: 'Detail', width: 4.5 }],
          rows: al.map(a => [a.name, a.type === 'forgot' ? 'No sign-out' : 'Long shift', a.detail]),
        },
      });
    }

    return {
      title: 'Sign In / Sign Out Report',
      subtitle: rangeLabel(from, to),
      meta: [
        ['Location', s.siteName],
        ['Range', rangeLabel(from, to)],
        ['Total hours', hm(sum.hours)],
        ['Shifts', String(sum.shifts) + (sum.open ? ' (' + sum.open + ' still open)' : '')],
        ['People', String(sum.people)],
        ['Generated', fmtDateTime(new Date().toISOString())],
      ],
      footer: 'RCK NZ — sign in / sign out record. Generated ' + fmtDateTime(new Date().toISOString()) + '.',
      sections,
    };
  }

  function rollCallDoc() {
    const open = Store.openEntries();
    const s = Store.settings();
    return {
      title: 'On Site Now — Roll Call',
      subtitle: fmtDateTime(new Date().toISOString()),
      meta: [
        ['Location', s.siteName],
        ['People on site', String(open.length)],
        ['Printed', fmtDateTime(new Date().toISOString())],
      ],
      footer: 'RCK NZ roll call — check every name is accounted for at the assembly point.',
      sections: [{
        heading: 'Signed in and not yet signed out',
        note: open.length ? '' : 'Nobody is signed in on the tablet right now.',
        table: {
          cols: [
            { label: 'Name', width: 2.2 }, { label: 'Crew', width: 1.5 }, { label: 'Job / site', width: 2.6 },
            { label: 'Signed in', width: 1.3, align: 'right' }, { label: 'On site', width: 1, align: 'right' },
            { label: 'Accounted for', width: 1.2 },
          ],
          rows: open.map(e => [e.name, e.crew || '', sitesOf(e)[0], fmtDateTime(e.inAt), hm(elapsedSince(e.inAt)), '[   ]']),
        },
      }],
    };
  }

  window.Reports = {
    PRESETS, filter, summary, byEmployee, byCrew, byJob, byDay, alerts,
    hoursOf, sitesOf, siteKey, elapsedSince,
    localDay, fromDayKey, dayStart, dayEnd, addDays, mondayOf,
    fmtDate, fmtDateFull, fmtTime, fmtDateTime, isoLocal, hm, round,
    rangeLabel, fileStamp, workbook, pdfDoc, rollCallDoc,
  };
})();
