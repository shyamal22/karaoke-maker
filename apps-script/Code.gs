/**
 * RCK Sign In / Sign Out — Google Sheets backend.
 *
 * What it gives you on top of the tablet:
 *   1. Every shift lands in a Google Sheet the moment it happens (a second copy
 *      of the hours, off the tablet).
 *   2. Google itself emails the flags — anyone who has not signed out after
 *      24 hours, and any shift over 14 hours — on a schedule, so it still
 *      happens when the tablet is flat, offline or sitting in a drawer.
 *
 * Setup, once:
 *   1. Make a new Google Sheet (call it "RCK Sign In").
 *   2. Extensions -> Apps Script, delete the sample code, paste this file in.
 *   3. Edit ALERT_EMAIL below.
 *   4. Run the "setup" function once and accept the permission prompts.
 *   5. Deploy -> New deployment -> Web app.
 *        Execute as: Me.     Who has access: Anyone.
 *      Copy the /exec URL.
 *   6. On the tablet: Office -> Data -> paste the URL into "Sync / alert URL",
 *      put your email in "Email for alerts", press Save settings, then Sync now.
 */

var ALERT_EMAIL = 'office@rcknz.co.nz';   // <-- who gets the flags
var FORGOT_HOURS = 24;                    // still signed in after this many hours
var LONG_HOURS = 14;                      // a shift longer than this
var SEND_DAILY_SUMMARY = true;            // yesterday's hours, emailed each morning

var SHIFTS = 'Shifts';
var PEOPLE = 'People';
var ALERTLOG = 'Alert log';

var SHIFT_HEADERS = ['id', 'Date', 'Name', 'Crew', 'Job / site', 'Signed in', 'Signed out',
  'Break (min)', 'Hours', 'Status', 'Notes', 'Tablet', 'In (ISO)', 'Out (ISO)', 'Updated'];
var PEOPLE_HEADERS = ['id', 'Name', 'Usual crew', 'Added', 'Last seen'];

// ---------------------------------------------------------------- setup
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  sheet(ss, SHIFTS, SHIFT_HEADERS);
  sheet(ss, PEOPLE, PEOPLE_HEADERS);
  sheet(ss, ALERTLOG, ['key', 'Sent at', 'Summary']);

  removeTriggers();
  ScriptApp.newTrigger('checkAlerts').timeBased().everyHours(1).create();
  if (SEND_DAILY_SUMMARY) {
    ScriptApp.newTrigger('dailySummary').timeBased().atHour(7).everyDays(1).create();
  }
  Logger.log('Setup complete. Now deploy this script as a web app.');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

function sheet(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// ---------------------------------------------------------------- web app
function doGet() {
  return ContentService.createTextOutput('RCK Sign In backend is running.');
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.type === 'alerts') {
      emailAlerts(body.alerts || [], body.email || ALERT_EMAIL, 'from the tablet');
      return ok({ emailed: (body.alerts || []).length });
    }
    var saved = saveRecords(body.records || []);
    return ok(saved);
  } catch (err) {
    return ok({ error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function ok(obj) {
  return ContentService.createTextOutput(JSON.stringify(Object.assign({ ok: true }, obj)))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- saving
function saveRecords(records) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shifts = sheet(ss, SHIFTS, SHIFT_HEADERS);
  var people = sheet(ss, PEOPLE, PEOPLE_HEADERS);
  var shiftIndex = idIndex(shifts);
  var peopleIndex = idIndex(people);
  var added = 0, updated = 0;

  records.forEach(function (r) {
    if (!r || !r.data) return;
    if (r.kind === 'entry') {
      var row = shiftRow(r.data);
      if (shiftIndex[r.data.id]) {
        shifts.getRange(shiftIndex[r.data.id], 1, 1, row.length).setValues([row]);
        updated++;
      } else {
        shifts.appendRow(row);
        shiftIndex[r.data.id] = shifts.getLastRow();
        added++;
      }
    } else if (r.kind === 'employee') {
      var prow = [r.data.id, r.data.name, r.data.crew || '', r.data.createdAt || '', r.data.lastSeen || ''];
      if (peopleIndex[r.data.id]) people.getRange(peopleIndex[r.data.id], 1, 1, prow.length).setValues([prow]);
      else { people.appendRow(prow); peopleIndex[r.data.id] = people.getLastRow(); }
    }
  });
  return { added: added, updated: updated };
}

function idIndex(sh) {
  var out = {};
  if (sh.getLastRow() < 2) return out;
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (ids[i][0]) out[ids[i][0]] = i + 2;
  return out;
}

function shiftRow(d) {
  var sites = (d.sites && d.sites.length ? d.sites : [d.siteIn]).filter(Boolean).join(' | ');
  var hours = d.outAt ? Math.round(((new Date(d.outAt) - new Date(d.inAt)) / 3600000 - (d.breakMins || 0) / 60) * 100) / 100 : '';
  var status = d.void ? 'REMOVED' : (!d.outAt ? 'STILL SIGNED IN' : (d.autoClosed ? 'Auto-closed' : (d.editedAt ? 'Amended by office' : 'Complete')));
  return [
    d.id,
    d.inAt ? Utilities.formatDate(new Date(d.inAt), tz(), 'yyyy-MM-dd') : '',
    d.name || '',
    d.crew || '',
    sites,
    d.inAt ? Utilities.formatDate(new Date(d.inAt), tz(), 'HH:mm') : '',
    d.outAt ? Utilities.formatDate(new Date(d.outAt), tz(), 'HH:mm') : '',
    d.breakMins || 0,
    hours,
    status,
    d.notes || '',
    d.device || '',
    d.inAt || '',
    d.outAt || '',
    d.updatedAt || '',
  ];
}

function tz() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'Pacific/Auckland';
}

// ---------------------------------------------------------------- alerts
/** Runs hourly whether or not the tablet is switched on. */
function checkAlerts() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = sheet(ss, SHIFTS, SHIFT_HEADERS);
  if (sh.getLastRow() < 2) return;
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, SHIFT_HEADERS.length).getValues();
  var now = new Date().getTime();
  var alerts = [];

  rows.forEach(function (r) {
    var status = r[9];
    if (status === 'REMOVED') return;
    var inISO = r[12], outISO = r[13];
    if (!inISO) return;
    var inMs = new Date(inISO).getTime();
    if (!outISO) {
      var openH = (now - inMs) / 3600000;
      if (openH >= FORGOT_HOURS) {
        alerts.push({
          key: 'forgot:' + r[0] + ':' + Math.floor(openH / 24),
          title: r[2] + ' has not signed out',
          detail: 'Signed in ' + r[1] + ' at ' + r[5] + ' (' + r[3] + ', ' + r[4] + ') — ' + hm(openH) + ' ago.',
        });
      }
    } else {
      var worked = (new Date(outISO).getTime() - inMs) / 3600000 - (Number(r[7]) || 0) / 60;
      if (worked > LONG_HOURS) {
        alerts.push({
          key: 'long:' + r[0] + ':' + r[14],
          title: r[2] + ' worked ' + hm(worked) + ' on ' + r[1],
          detail: r[5] + ' to ' + r[6] + ' (' + r[3] + ', ' + r[4] + ').',
        });
      }
    }
  });

  var fresh = filterNew(alerts);
  if (fresh.length) emailAlerts(fresh, ALERT_EMAIL, 'checked automatically');
}

function filterNew(alerts) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = sheet(ss, ALERTLOG, ['key', 'Sent at', 'Summary']);
  var seen = {};
  if (log.getLastRow() > 1) {
    log.getRange(2, 1, log.getLastRow() - 1, 1).getValues().forEach(function (r) { seen[r[0]] = true; });
  }
  var fresh = alerts.filter(function (a) { return !seen[a.key]; });
  if (fresh.length) {
    log.getRange(log.getLastRow() + 1, 1, fresh.length, 3)
      .setValues(fresh.map(function (a) { return [a.key, new Date(), a.title]; }));
  }
  return fresh;
}

function emailAlerts(alerts, to, how) {
  if (!alerts.length || !to) return;
  var subject = 'RCK sign-in: ' + alerts.length + ' thing' + (alerts.length === 1 ? '' : 's') + ' need' + (alerts.length === 1 ? 's' : '') + ' a look';
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#10162a">' +
    '<div style="background:#0b0b0d;color:#fff;padding:14px 18px"><b style="letter-spacing:.14em">RCK NZ</b> ' +
    '<span style="color:#ff5a1f">sign in / sign out</span></div>' +
    '<p style="font-size:15px">These shifts were ' + how + ':</p><ul style="font-size:15px;line-height:1.6">' +
    alerts.map(function (a) { return '<li><b>' + esc(a.title) + '</b><br><span style="color:#5f6775">' + esc(a.detail) + '</span></li>'; }).join('') +
    '</ul><p style="font-size:13px;color:#5f6775">Open the sign-in spreadsheet to fix the times: ' +
    SpreadsheetApp.getActiveSpreadsheet().getUrl() + '</p></div>';
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: html });
}

// ---------------------------------------------------------------- summary
function dailySummary() {
  if (!SEND_DAILY_SUMMARY) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = sheet(ss, SHIFTS, SHIFT_HEADERS);
  if (sh.getLastRow() < 2) return;
  var day = Utilities.formatDate(new Date(new Date().getTime() - 86400000), tz(), 'yyyy-MM-dd');
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, SHIFT_HEADERS.length).getValues()
    .filter(function (r) { return r[1] === day && r[9] !== 'REMOVED'; });
  if (!rows.length) return;

  var byJob = {}, byCrew = {}, total = 0, open = 0;
  rows.forEach(function (r) {
    var h = Number(r[8]) || 0;
    total += h;
    if (r[9] === 'STILL SIGNED IN') open++;
    byJob[r[4]] = (byJob[r[4]] || 0) + h;
    byCrew[r[3]] = (byCrew[r[3]] || 0) + h;
  });

  var list = function (obj) {
    return Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; })
      .map(function (k) { return '<li>' + esc(k || '—') + ' — <b>' + hm(obj[k]) + '</b></li>'; }).join('');
  };

  MailApp.sendEmail({
    to: ALERT_EMAIL,
    subject: 'RCK hours for ' + day + ' — ' + hm(total),
    htmlBody: '<div style="font-family:Arial,Helvetica,sans-serif;color:#10162a">' +
      '<div style="background:#0b0b0d;color:#fff;padding:14px 18px"><b style="letter-spacing:.14em">RCK NZ</b> ' +
      '<span style="color:#ff5a1f">' + day + '</span></div>' +
      '<p style="font-size:15px"><b>' + hm(total) + '</b> across ' + rows.length + ' shift' + (rows.length === 1 ? '' : 's') +
      (open ? ' — <span style="color:#c22">' + open + ' still signed in</span>' : '') + '</p>' +
      '<p style="font-size:15px"><b>By job</b></p><ul style="font-size:15px">' + list(byJob) + '</ul>' +
      '<p style="font-size:15px"><b>By crew</b></p><ul style="font-size:15px">' + list(byCrew) + '</ul>' +
      '<p style="font-size:13px;color:#5f6775">' + ss.getUrl() + '</p></div>',
  });
}

// ---------------------------------------------------------------- helpers
function hm(hours) {
  var h = Math.floor(hours);
  var m = Math.round((hours - h) * 60);
  if (m === 60) { h += 1; m = 0; }
  return h + 'h ' + (m < 10 ? '0' + m : m) + 'm';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
