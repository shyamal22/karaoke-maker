/* KCAL — brutalist calorie & weight tracker. All data in localStorage. */
"use strict";

/* ---------------- storage ---------------- */

const LS = {
  settings: "kcal_settings",
  log: "kcal_log",
  weights: "kcal_weights",
  custom: "kcal_custom",
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

let settings = load(LS.settings, { goal: 2000, goalWeight: null });
let log = load(LS.log, {});          // { "2026-08-14": [entry, ...] }
let weights = load(LS.weights, {});  // { "2026-08-14": 82.4 }
let customFoods = load(LS.custom, []); // user-saved foods

const MEALS = ["BREAKFAST", "LUNCH", "DINNER", "SNACKS"];

/* ---------------- date handling ---------------- */

let viewDate = todayISO();

function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function shiftDate(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
}
function fmtDate(iso) {
  if (iso === todayISO()) return "Today";
  if (iso === shiftDate(todayISO(), -1)) return "Yesterday";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" });
}

/* ---------------- food db ---------------- */

const DB = (typeof FOODS !== "undefined" ? FOODS : []);

function norm(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function allFoods() {
  return customFoods.map((f, i) => ({ ...f, _custom: true, _id: "c" + i })).concat(
    DB.map((f, i) => ({ ...f, _id: "d" + i }))
  );
}

function searchFoods(q) {
  const nq = norm(q);
  if (!nq) return [];
  const terms = nq.split(" ");
  const scored = [];
  for (const f of allFoods()) {
    const hay = norm(f.name + " " + (f.alias || "") + " " + (f.cat || ""));
    let score = 0;
    let ok = true;
    for (const t of terms) {
      const idx = hay.indexOf(t);
      if (idx === -1) { ok = false; break; }
      score += idx === 0 ? 30 : (hay[idx - 1] === " " ? 20 : 5);
      score -= idx * 0.1;
    }
    if (!ok) continue;
    if (f._custom) score += 25;              // user's own foods first
    score -= f.name.length * 0.05;
    scored.push([score, f]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, 30).map(x => x[1]);
}

/* ---------------- day totals ---------------- */

function dayEntries(iso) { return log[iso] || []; }

function dayTotals(iso) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const e of dayEntries(iso)) {
    t.kcal += e.kcal;
    t.p += e.p || 0;
    t.c += e.c || 0;
    t.f += e.f || 0;
  }
  return t;
}

/* ---------------- rendering: log tab ---------------- */

const $ = (sel) => document.querySelector(sel);

function renderDate() {
  $("#date-label").textContent = fmtDate(viewDate);
}

function renderSummary() {
  const t = dayTotals(viewDate);
  const goal = settings.goal || 2000;
  const left = goal - t.kcal;
  $("#sum-eaten").textContent = Math.round(t.kcal);
  $("#sum-goal").textContent = goal;
  $("#sum-left").textContent = Math.abs(Math.round(left));
  $("#sum-left-label").textContent = left >= 0 ? "Left" : "Over";
  $("#sum-left").parentElement.classList.toggle("over", left < 0);
  const fill = $("#meter-fill");
  fill.style.width = Math.min(100, (t.kcal / goal) * 100) + "%";
  fill.classList.toggle("over", left < 0);
  $("#mac-p").textContent = Math.round(t.p);
  $("#mac-c").textContent = Math.round(t.c);
  $("#mac-f").textContent = Math.round(t.f);
}

function renderMeals() {
  const wrap = $("#meals");
  wrap.innerHTML = "";
  const entries = dayEntries(viewDate);
  for (const meal of MEALS) {
    const items = entries.filter(e => e.meal === meal);
    const kcal = Math.round(items.reduce((s, e) => s + e.kcal, 0));
    const box = document.createElement("section");
    box.className = "meal";
    const head = document.createElement("div");
    head.className = "meal-head";
    head.innerHTML = `<span>${meal}</span><span>${kcal} kcal</span>`;
    box.appendChild(head);
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "meal-empty";
      empty.textContent = "— nothing logged —";
      box.appendChild(empty);
    }
    for (const e of items) {
      const row = document.createElement("div");
      row.className = "entry";
      const qty = e.qty && e.qty !== 1 ? `${e.qty} × ` : "";
      row.innerHTML =
        `<div class="entry-name"><b></b><span class="entry-sub"></span></div>
         <div class="entry-kcal">${Math.round(e.kcal)}</div>
         <button class="entry-del" aria-label="Delete">✕</button>`;
      row.querySelector("b").textContent = e.name;
      row.querySelector(".entry-sub").textContent = qty + (e.serving || "");
      row.querySelector(".entry-del").addEventListener("click", () => {
        log[viewDate] = dayEntries(viewDate).filter(x => x.id !== e.id);
        if (!log[viewDate].length) delete log[viewDate];
        save(LS.log, log);
        renderAll();
      });
      box.appendChild(row);
    }
    wrap.appendChild(box);
  }
}

/* frequent foods (last 30 days) as one-tap chips */
function renderFreq() {
  const counts = new Map();
  let d = todayISO();
  for (let i = 0; i < 30; i++) {
    for (const e of dayEntries(d)) {
      if (e.foodKey == null) continue;
      const c = counts.get(e.foodKey) || { n: 0, e };
      c.n++;
      counts.set(e.foodKey, c);
    }
    d = shiftDate(d, -1);
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  const wrap = $("#freq-foods");
  wrap.innerHTML = "";
  for (const { e } of top) {
    const food = findFoodByKey(e.foodKey);
    if (!food) continue;
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = "↺ " + food.name;
    chip.addEventListener("click", () => openPortion(food));
    wrap.appendChild(chip);
  }
}

function findFoodByKey(key) {
  return allFoods().find(f => foodKey(f) === key) || null;
}
function foodKey(f) { return norm(f.name); }

/* ---------------- search UI ---------------- */

const searchInput = $("#food-search");
const resultsBox = $("#search-results");

searchInput.addEventListener("input", () => {
  const q = searchInput.value;
  if (!q.trim()) { resultsBox.hidden = true; resultsBox.innerHTML = ""; return; }
  const hits = searchFoods(q);
  resultsBox.innerHTML = "";
  if (!hits.length) {
    const none = document.createElement("div");
    none.className = "result-none";
    none.textContent = "Not in the database.";
    const btn = document.createElement("button");
    btn.className = "btn btn-small";
    btn.textContent = "+ Quick add “" + q.trim() + "”";
    btn.addEventListener("click", () => { openQuick(q.trim()); });
    none.appendChild(document.createElement("br"));
    none.appendChild(btn);
    resultsBox.appendChild(none);
  }
  for (const f of hits) {
    const row = document.createElement("div");
    row.className = "result";
    row.innerHTML =
      `<div><div class="result-name"></div><div class="result-sub"></div></div>
       <div class="result-kcal">${f.kcal} kcal</div>`;
    row.querySelector(".result-name").textContent = (f._custom ? "★ " : "") + f.name;
    row.querySelector(".result-sub").textContent = f.serving + (f.cat ? " · " + f.cat : "");
    row.addEventListener("click", () => openPortion(f));
    resultsBox.appendChild(row);
  }
  resultsBox.hidden = false;
});

/* ---------------- portion dialog ---------------- */

const dlgPortion = $("#dlg-portion");
let portionFood = null;
let portionQty = 1;
let portionMeal = guessMeal();

function guessMeal() {
  const h = new Date().getHours();
  if (h < 11) return "BREAKFAST";
  if (h < 15) return "LUNCH";
  if (h < 18) return "SNACKS";
  return "DINNER";
}

function fmtMeal(m) { return m.charAt(0) + m.slice(1).toLowerCase(); }

function buildMealBtns(container, selected, onPick) {
  container.innerHTML = "";
  for (const m of MEALS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mealbtn" + (m === selected ? " sel" : "");
    b.textContent = fmtMeal(m);
    b.addEventListener("click", () => {
      onPick(m);
      [...container.children].forEach(c => c.classList.toggle("sel", c === b));
    });
    container.appendChild(b);
  }
}

function openPortion(food) {
  portionFood = food;
  portionQty = 1;
  portionMeal = guessMeal();
  $("#portion-name").textContent = food.name;
  $("#portion-serving").textContent = `1 serving = ${food.serving}`;
  $("#portion-qty").value = "1";
  document.querySelectorAll(".qty").forEach(b => b.classList.toggle("sel", b.dataset.q === "1"));
  buildMealBtns($("#portion-meals"), portionMeal, m => portionMeal = m);
  updatePortionKcal();
  dlgPortion.showModal();
}

function updatePortionKcal() {
  $("#portion-kcal").textContent = Math.round(portionFood.kcal * portionQty) + " kcal";
}

document.querySelectorAll(".qty").forEach(b => {
  b.addEventListener("click", () => {
    portionQty = parseFloat(b.dataset.q);
    $("#portion-qty").value = portionQty;
    document.querySelectorAll(".qty").forEach(x => x.classList.toggle("sel", x === b));
    updatePortionKcal();
  });
});
$("#portion-qty").addEventListener("input", () => {
  const v = parseFloat($("#portion-qty").value);
  if (v > 0) { portionQty = v; updatePortionKcal(); }
  document.querySelectorAll(".qty").forEach(x => x.classList.remove("sel"));
});

dlgPortion.addEventListener("close", () => {
  if (dlgPortion.returnValue !== "ok" || !portionFood) return;
  addEntry({
    name: portionFood.name,
    kcal: portionFood.kcal * portionQty,
    p: (portionFood.p || 0) * portionQty,
    c: (portionFood.c || 0) * portionQty,
    f: (portionFood.f || 0) * portionQty,
    qty: portionQty,
    serving: portionFood.serving,
    meal: portionMeal,
    foodKey: foodKey(portionFood),
  });
  searchInput.value = "";
  resultsBox.hidden = true;
});

function addEntry(e) {
  e.id = Date.now() + "" + Math.floor(Math.random() * 1e6);
  if (!log[viewDate]) log[viewDate] = [];
  log[viewDate].push(e);
  save(LS.log, log);
  renderAll();
}

/* ---------------- quick add dialog ---------------- */

const dlgQuick = $("#dlg-quick");
let quickMeal = guessMeal();

function openQuick(prefillName) {
  $("#quick-name").value = prefillName || "";
  $("#quick-kcal").value = "";
  $("#quick-save").checked = false;
  quickMeal = guessMeal();
  buildMealBtns($("#quick-meals"), quickMeal, m => quickMeal = m);
  dlgQuick.showModal();
  setTimeout(() => $("#quick-kcal").focus(), 50);
}

$("#btn-quickadd").addEventListener("click", () => openQuick(searchInput.value.trim()));

dlgQuick.addEventListener("close", () => {
  if (dlgQuick.returnValue !== "ok") return;
  const kcal = parseFloat($("#quick-kcal").value);
  if (!(kcal > 0)) return;
  const name = $("#quick-name").value.trim() || "Quick add";
  if ($("#quick-save").checked) {
    customFoods.push({ name, alias: null, cat: "My Foods", serving: "1 serving", grams: null, kcal: Math.round(kcal), p: null, c: null, f: null });
    save(LS.custom, customFoods);
  }
  addEntry({ name, kcal, p: 0, c: 0, f: 0, qty: 1, serving: "quick add", meal: quickMeal, foodKey: $("#quick-save").checked ? norm(name) : null });
  searchInput.value = "";
  resultsBox.hidden = true;
});

/* ---------------- weight tab ---------------- */

function weightSeries() {
  return Object.entries(weights)
    .map(([date, kg]) => ({ date, kg }))
    .sort((a, b) => a.date < b.date ? -1 : 1);
}

$("#btn-weight-save").addEventListener("click", () => {
  const v = parseFloat($("#weight-input").value);
  if (!(v >= 20 && v <= 400)) return;
  weights[todayISO()] = Math.round(v * 10) / 10;
  save(LS.weights, weights);
  $("#weight-input").value = "";
  renderWeight();
});

function renderWeightStats() {
  const s = weightSeries();
  const box = $("#weight-stats");
  box.innerHTML = "";
  if (!s.length) { box.innerHTML = `<div class="chart-empty">No entries yet — log today's weight above.</div>`; return; }
  const cur = s[s.length - 1];
  const first = s[0];
  const diff = Math.round((cur.kg - first.kg) * 10) / 10;
  const stats = [
    ["Current", cur.kg + " kg", ""],
    ["Change", (diff > 0 ? "+" : "") + diff + " kg", diff < 0 ? "down" : diff > 0 ? "up" : ""],
  ];
  if (settings.goalWeight) {
    const togo = Math.round((cur.kg - settings.goalWeight) * 10) / 10;
    stats.push(["To goal " + settings.goalWeight + " kg", (togo > 0 ? togo + " kg to go" : togo < 0 ? Math.abs(togo) + " kg under" : "at goal"), ""]);
  }
  for (const [label, val, cls] of stats) {
    const el = document.createElement("div");
    el.className = "wstat";
    el.innerHTML = `<b class="${cls}"></b>${label}`;
    el.querySelector("b").textContent = val;
    box.appendChild(el);
  }
}

/* single-series line chart, plain SVG, hover tooltip */
function renderWeightChart() {
  const wrap = $("#weight-chart");
  const tip = $("#weight-tip");
  const all = weightSeries();
  const s = all.slice(-90);
  $("#chart-range-note").textContent = s.length ? `· last ${s.length} entries` : "";
  if (s.length < 2) {
    wrap.innerHTML = `<div class="chart-empty">Need at least 2 weigh-ins to draw a trend.</div>`;
    return;
  }

  const W = 600, H = 260, padL = 44, padR = 12, padT = 14, padB = 26;
  let min = Math.min(...s.map(p => p.kg));
  let max = Math.max(...s.map(p => p.kg));
  if (settings.goalWeight) { min = Math.min(min, settings.goalWeight); max = Math.max(max, settings.goalWeight); }
  const span = Math.max(1, max - min);
  min -= span * 0.1; max += span * 0.1;

  const x = i => padL + (i / (s.length - 1)) * (W - padL - padR);
  const y = v => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  let grid = "", labels = "";
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = min + (i / ticks) * (max - min);
    const yy = y(v);
    grid += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="#ece5d8" stroke-width="1"/>`;
    labels += `<text x="${padL - 6}" y="${yy + 4}" text-anchor="end" font-size="15" fill="#8a8377" font-family="inherit">${v.toFixed(1)}</text>`;
  }
  // x labels: first and last date
  const dlab = iso => iso.slice(5).replace("-", "/");
  labels += `<text x="${padL}" y="${H - 8}" font-size="15" fill="#8a8377">${dlab(s[0].date)}</text>`;
  labels += `<text x="${W - padR}" y="${H - 8}" text-anchor="end" font-size="15" fill="#8a8377">${dlab(s[s.length - 1].date)}</text>`;

  const path = s.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.kg).toFixed(1)).join(" ");

  let goalLine = "";
  if (settings.goalWeight) {
    const gy = y(settings.goalWeight);
    goalLine = `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="#d97a4a" stroke-width="1.5" stroke-dasharray="6 5"/>
      <text x="${W - padR}" y="${gy - 5}" text-anchor="end" font-size="15" font-weight="bold" fill="#d97a4a">Goal ${settings.goalWeight}</text>`;
  }

  const last = s[s.length - 1];
  wrap.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Body weight trend chart">
      ${grid}${labels}${goalLine}
      <path d="${path}" fill="none" stroke="#33302b" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle id="chart-dot" cx="${x(s.length - 1)}" cy="${y(last.kg)}" r="4.5" fill="#d97a4a" stroke="#fff" stroke-width="1.5"/>
      <text x="${Math.min(x(s.length - 1), W - padR - 4)}" y="${Math.max(12, y(last.kg) - 10)}" text-anchor="end" font-size="16" font-weight="bold" fill="#33302b">${last.kg} kg</text>
      <rect id="chart-hit" x="${padL}" y="0" width="${W - padL - padR}" height="${H}" fill="transparent"/>
    </svg>`;

  const svg = wrap.querySelector("svg");
  const dot = wrap.querySelector("#chart-dot");
  const hit = wrap.querySelector("#chart-hit");

  function onMove(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    const px = (clientX - rect.left) / rect.width * W;
    const i = Math.max(0, Math.min(s.length - 1, Math.round((px - padL) / (W - padL - padR) * (s.length - 1))));
    const p = s[i];
    dot.setAttribute("cx", x(i));
    dot.setAttribute("cy", y(p.kg));
    tip.hidden = false;
    tip.textContent = `${p.date} · ${p.kg} kg`;
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, clientX + 12) + "px";
    tip.style.top = (clientY - 34) + "px";
  }
  hit.addEventListener("mousemove", e => onMove(e.clientX, e.clientY));
  hit.addEventListener("touchstart", e => { onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  hit.addEventListener("touchmove", e => { onMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  hit.addEventListener("mouseleave", () => {
    tip.hidden = true;
    dot.setAttribute("cx", x(s.length - 1));
    dot.setAttribute("cy", y(last.kg));
  });
  hit.addEventListener("touchend", () => { tip.hidden = true; });
}

function renderWeightHistory() {
  const box = $("#weight-history");
  const s = weightSeries().slice().reverse().slice(0, 60);
  box.innerHTML = "";
  if (!s.length) { box.innerHTML = `<div class="chart-empty">Nothing yet.</div>`; return; }
  s.forEach((p, idx) => {
    const prev = s[idx + 1];
    const diff = prev ? Math.round((p.kg - prev.kg) * 10) / 10 : null;
    const row = document.createElement("div");
    row.className = "whist-row";
    row.innerHTML =
      `<span>${fmtDate(p.date)}</span>
       <span class="whist-kg">${p.kg} kg</span>
       <span class="whist-diff ${diff < 0 ? "down" : diff > 0 ? "up" : ""}">${diff == null ? "" : (diff > 0 ? "+" : "") + diff}</span>
       <button class="entry-del" aria-label="Delete">✕</button>`;
    row.querySelector(".entry-del").addEventListener("click", () => {
      delete weights[p.date];
      save(LS.weights, weights);
      renderWeight();
    });
    box.appendChild(row);
  });
}

function renderWeight() {
  renderWeightStats();
  renderWeightChart();
  renderWeightHistory();
}

/* ---------------- settings ---------------- */

const dlgSettings = $("#dlg-settings");

$("#btn-settings").addEventListener("click", () => {
  $("#set-goal").value = settings.goal;
  $("#set-goal-weight").value = settings.goalWeight ?? "";
  $("#db-count").textContent = `Food database: ${DB.length} items · My foods: ${customFoods.length}`;
  dlgSettings.showModal();
});

dlgSettings.addEventListener("close", () => {
  const g = parseInt($("#set-goal").value, 10);
  if (g >= 800 && g <= 8000) settings.goal = g;
  const gw = parseFloat($("#set-goal-weight").value);
  settings.goalWeight = (gw >= 20 && gw <= 400) ? gw : null;
  save(LS.settings, settings);
  renderAll();
  renderWeight();
});

$("#btn-export").addEventListener("click", () => {
  const data = { exported: new Date().toISOString(), settings, log, weights, customFoods };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kcal-backup-" + todayISO() + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#btn-import").addEventListener("click", () => $("#import-file").click());
$("#import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== "object" || (!data.log && !data.weights)) throw new Error("bad file");
    if (!confirm("Import backup? This REPLACES current data.")) return;
    settings = data.settings || settings;
    log = data.log || {};
    weights = data.weights || {};
    customFoods = data.customFoods || [];
    save(LS.settings, settings); save(LS.log, log); save(LS.weights, weights); save(LS.custom, customFoods);
    renderAll(); renderWeight();
    alert("Imported.");
  } catch {
    alert("Could not read that file.");
  }
  e.target.value = "";
});

$("#btn-wipe").addEventListener("click", () => {
  if (!confirm("Erase ALL logs, weights and settings? This cannot be undone.")) return;
  if (!confirm("Really sure?")) return;
  localStorage.removeItem(LS.settings);
  localStorage.removeItem(LS.log);
  localStorage.removeItem(LS.weights);
  localStorage.removeItem(LS.custom);
  location.reload();
});

/* ---------------- tabs & date nav ---------------- */

document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === t));
    $("#tab-log").hidden = t.dataset.tab !== "log";
    $("#tab-weight").hidden = t.dataset.tab !== "weight";
    if (t.dataset.tab === "weight") renderWeight();
  });
});

$("#date-prev").addEventListener("click", () => { viewDate = shiftDate(viewDate, -1); renderAll(); });
$("#date-next").addEventListener("click", () => {
  if (viewDate === todayISO()) return;
  viewDate = shiftDate(viewDate, 1);
  renderAll();
});
$("#date-label").addEventListener("click", () => { viewDate = todayISO(); renderAll(); });

/* ---------------- boot ---------------- */

function renderAll() {
  renderDate();
  renderSummary();
  renderMeals();
  renderFreq();
}

renderAll();
renderWeight();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
