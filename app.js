/* ===== Forja · app.js ===== */
"use strict";
const APP_VERSION = 'v8';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const nf = n => (n === '' || n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('es-ES');
const fmtRest = s => s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const clampNum = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };
function toast(html) { const t = $("#toast"); t.innerHTML = html; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2200); }
function imgFallback(img, ic) { const d = document.createElement('div'); d.className = 'ex-thumb'; d.textContent = ic || '🏋️'; if (img.parentNode) img.replaceWith(d); }

/* ----- fechas ----- */
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoOf(new Date());
const dateFromISO = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const DOW = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function lastNDays(n) { const out = []; const t = new Date(); t.setHours(12, 0, 0, 0); for (let i = n - 1; i >= 0; i--) { const d = new Date(t); d.setDate(t.getDate() - i); out.push(d); } return out; }
function shortDate(iso) { const d = dateFromISO(iso); return `${d.getDate()} ${MES[d.getMonth()]}`; }

/* ===== CATÁLOGO ===== */
const CAT = { list: [], byId: {}, EX: [], EXMAP: {}, grupos: {}, total: 0, premium: 0 };
async function loadCatalog() {
  const raw = await fetch('catalog.json', { cache: 'force-cache' }).then(r => { if (!r.ok) throw new Error('catálogo ' + r.status); return r.json(); });
  CAT.list = raw;
  raw.forEach(x => { CAT.byId[x.id] = x; });
  CAT.EX = raw.map(x => ({ id: x.id, n: x.name, g: x.grupo, ic: x.icon, m: (x.muscles || []).join(', '), eq: x.equip, lv: x.level, me: x.mech }));
  CAT.EX.forEach(e => { CAT.EXMAP[e.id] = e; });
  CAT.grupos = {}; raw.forEach(x => { CAT.grupos[x.grupo] = (CAT.grupos[x.grupo] || 0) + 1; });
  CAT.total = raw.length;
  CAT.premium = raw.filter(x => x.guide && x.guide.tipo === 'pro').length;
}
const exOf = id => CAT.EXMAP[id] || { id, n: id, g: 'Otro', ic: '🏋️', m: '', eq: '', lv: '', me: '' };
const imgOf = id => { const x = CAT.byId[id]; return x && x.img0 ? [x.img0, x.img1] : null; };
const guideOf = id => { const x = CAT.byId[id]; return x ? x.guide : null; };
function thumb(id) { const im = imgOf(id), ic = exOf(id).ic; return im ? `<img class="ex-photo" src="${im[0]}" loading="lazy" decoding="async" alt="" onerror="imgFallback(this,'${ic}')">` : `<div class="ex-thumb">${ic}</div>`; }

/* ===== INDEXEDDB ===== */
let _db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('forja', 1);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('rutinas')) db.createObjectStore('rutinas', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('dias')) db.createObjectStore('dias', { keyPath: 'fecha' });
      if (!db.objectStoreNames.contains('sesiones')) db.createObjectStore('sesiones', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('fotos')) db.createObjectStore('fotos', { keyPath: 'id' });
    };
    r.onsuccess = () => { _db = r.result; res(); };
    r.onerror = () => rej(r.error);
  });
}
const _os = (store, mode) => _db.transaction(store, mode).objectStore(store);
const idbGet = (store, key) => new Promise((res, rej) => { const r = _os(store, 'readonly').get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idbGetAll = store => new Promise((res, rej) => { const r = _os(store, 'readonly').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); });
const idbPut = (store, val, key) => new Promise((res, rej) => { const s = _os(store, 'readwrite'); const r = key !== undefined ? s.put(val, key) : s.put(val); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
const idbDel = (store, key) => new Promise((res, rej) => { const r = _os(store, 'readwrite').delete(key); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });
const idbClear = store => new Promise((res, rej) => { const r = _os(store, 'readwrite').clear(); r.onsuccess = () => res(); r.onerror = () => rej(r.error); });

/* ===== ESTADO ===== */
let perfil = { nombre: '', sexo: '', edad: '', altura: '', objetivo: 'Recomposición' };
let ajustes = { kcalGoal: 2300, pGoal: 180, cGoal: 230, fGoal: 70, pasosGoal: 10000 };
let rutinas = [];
let activeRoutineId = null;
let dias = {};
let sesiones = [];
let fotos = [];
let session = null; // entreno en curso

const activeRoutine = () => rutinas.find(r => r.id === activeRoutineId) || rutinas[0] || { name: '—', tag: '', sub: '', ex: [] };
let _uidCounter = 0;
const uid = () => 'r' + Date.now().toString(36) + '-' + (_uidCounter++).toString(36);
const saveRoutine = r => idbPut('rutinas', r);
const saveLive = () => session ? idbPut('kv', session, 'liveSession') : idbDel('kv', 'liveSession');
const saveDia = d => idbPut('dias', d);
const saveKV = (k, v) => idbPut('kv', v, k);

async function loadState() {
  perfil = await idbGet('kv', 'perfil') || perfil;
  ajustes = Object.assign(ajustes, await idbGet('kv', 'ajustes') || {});
  activeRoutineId = await idbGet('kv', 'activeRoutineId') || null;
  rutinas = await idbGetAll('rutinas');
  const dl = await idbGetAll('dias'); dias = {}; dl.forEach(d => dias[d.fecha] = d);
  sesiones = (await idbGetAll('sesiones')).sort((a, b) => a.id - b.id);
  fotos = (await idbGetAll('fotos')).sort((a, b) => b.id - a.id);
  session = await idbGet('kv', 'liveSession') || null;
}

async function seedRutinas() {
  const seed = [
    { name: 'Torso A', tag: 'Empuje', sub: 'Pecho · Hombro · Tríceps', ex: [
      { id: 'Barbell_Bench_Press_-_Medium_Grip', rest: 270, target: [[60, 8], [60, 8], [55, 10], [55, 10]] },
      { id: 'Barbell_Shoulder_Press', rest: 270, target: [[35, 8], [35, 8], [30, 10]] },
      { id: 'Side_Lateral_Raise', rest: 150, target: [[10, 15], [10, 15], [8, 17]] },
      { id: 'Cable_Incline_Triceps_Extension', rest: 150, target: [[20, 12], [20, 12], [17.5, 14]] } ] },
    { name: 'Tirón A', tag: 'Espalda · Bíceps', sub: 'Espalda · Bíceps', ex: [
      { id: 'Chin-Up', rest: 270, target: [[0, 8], [0, 8], [0, 10]] },
      { id: 'Bent_Over_Barbell_Row', rest: 270, target: [[50, 10], [50, 10], [45, 12]] },
      { id: 'Close-Grip_Front_Lat_Pulldown', rest: 150, target: [[50, 12], [50, 12], [45, 14]] },
      { id: 'Barbell_Curl', rest: 150, target: [[25, 10], [25, 10], [22.5, 12]] },
      { id: 'Alternate_Hammer_Curl', rest: 150, target: [[12, 12], [12, 12], [10, 14]] } ] },
    { name: 'Pierna A', tag: 'Pierna', sub: 'Cuádriceps · Glúteo · Femoral', ex: [
      { id: 'Barbell_Full_Squat', rest: 270, target: [[70, 8], [70, 8], [65, 10], [65, 10]] },
      { id: 'Leg_Press', rest: 270, target: [[140, 10], [140, 10], [130, 12]] },
      { id: 'Romanian_Deadlift', rest: 270, target: [[70, 10], [70, 10], [65, 12]] },
      { id: 'Barbell_Hip_Thrust', rest: 270, target: [[80, 10], [80, 10], [70, 12]] },
      { id: 'Lying_Leg_Curls', rest: 150, target: [[35, 12], [35, 12], [30, 14]] },
      { id: 'Barbell_Seated_Calf_Raise', rest: 150, target: [[40, 15], [40, 15], [40, 15]] } ] },
  ];
  rutinas = seed.map(r => ({ id: uid(), ...r }));
  for (const r of rutinas) await saveRoutine(r);
  activeRoutineId = rutinas[0].id;
  await saveKV('activeRoutineId', activeRoutineId);
}

/* ===== BOOT ===== */
(async function boot() {
  try {
    await openDB();
    await loadCatalog();
    await loadState();
    if (!rutinas.length) await seedRutinas();
    if (!activeRoutineId || !rutinas.find(r => r.id === activeRoutineId)) { activeRoutineId = rutinas[0].id; await saveKV('activeRoutineId', activeRoutineId); }
    wireStatic();
    renderAll();
    $("#loading").style.display = 'none';
    registerSW();
    initInstall();
  } catch (e) {
    console.error(e);
    $("#loading").innerHTML = `<div style="padding:24px;text-align:center;max-width:280px">No se pudo iniciar Forja.<br><span style="color:var(--clay)">${(e && e.message) || e}</span><br><br>Recarga la página.</div>`;
  }
})();

function renderAll() { renderHoy(); renderOverview(); renderMisRutinas(); renderFotos(); refreshExport(); }

/* ===== NAV ===== */
const screens = { hoy: "#s-hoy", entreno: "#s-entreno", progreso: "#s-progreso", exportar: "#s-exportar" };
let cur = "hoy";
function go(tab) {
  cur = tab;
  hideRest();
  $$(".screen").forEach(s => s.classList.remove("is-active"));
  $(screens[tab]).classList.add("is-active");
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  if (tab === "progreso") requestAnimationFrame(drawCharts);
  if (tab === "exportar") refreshExport();
}

/* ===== HOY ===== */
function ring(pct, color, size) { const r = size / 2 - 4, c = 2 * Math.PI * r, off = c * (1 - Math.min(pct || 0, 1)); return `<svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="5"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg>`; }
const dHoy = () => dias[todayISO()] || {};
function renderHoy() {
  const now = new Date();
  const wd = now.toLocaleDateString('es-ES', { weekday: 'long' });
  $("#hoy-date").innerHTML = `<b>${wd.charAt(0).toUpperCase() + wd.slice(1)}</b>${now.getDate()} ${now.toLocaleDateString('es-ES', { month: 'long' })}`;
  // week strip
  const days = lastNDays(7), tIso = todayISO();
  $("#weekstrip").innerHTML = days.map(d => {
    const iso = isoOf(d), trained = sesiones.some(s => s.fecha === iso), today = iso === tIso;
    return `<div class="day ${today ? 'today' : ''}"><div class="dn">${DOW[d.getDay()]}</div><div class="dd">${d.getDate()}</div><div class="dots"><span class="dot ${trained ? 'on' : ''}"></span></div></div>`;
  }).join("");
  const d = dHoy();
  // peso
  $("#peso-val").innerHTML = d.peso != null ? `${nf(d.peso)} <small>kg</small>` : '—';
  const wl = weightSeries();
  const tr = $("#peso-trend");
  if (wl.length >= 2) { const delta = +(wl[wl.length - 1].v - wl[wl.length - 2].v).toFixed(1); tr.textContent = (delta > 0 ? '+' : '') + nf(delta) + ' kg'; tr.className = 'trend ' + (delta <= 0 ? 'dn' : 'up'); }
  else tr.textContent = '';
  drawSpark($("#spark-peso"), wl.map(x => x.v));
  // nutri
  $("#kcal-val").innerHTML = d.kcal != null ? `${nf(d.kcal)} <small style="font-size:14px;color:var(--muted);font-weight:600">kcal</small>` : '—';
  $("#kcal-goal").textContent = 'objetivo ' + nf(ajustes.kcalGoal);
  $("#kcal-bar").style.width = Math.min(100, (d.kcal || 0) / ajustes.kcalGoal * 100) + '%';
  const macs = [["Prot", d.prot, ajustes.pGoal, "var(--ember)"], ["Carb", d.carb, ajustes.cGoal, "var(--gold)"], ["Grasa", d.fat, ajustes.fGoal, "var(--teal)"]];
  $("#macros").innerHTML = macs.map(([l, v, g, c]) => `<div class="macro"><div class="ring">${ring((v || 0) / g, c, 58)}<span class="rc" style="color:${c}">${v != null ? v : '—'}</span></div><div class="ml">${l}</div><div class="mv" style="color:var(--muted);font-weight:600;font-size:11px">/ ${g} g</div></div>`).join("");
  // sueño
  $("#sueno-val").textContent = d.suenoMin ? `${Math.floor(d.suenoMin / 60)} h ${pad(d.suenoMin % 60)}` : '—';
  $("#sueno-sub").textContent = (d.bed && d.wake) ? `${d.bed} → ${d.wake}` : 'Sin registrar';
  // pasos
  $("#pasos-val").textContent = d.pasos != null ? nf(d.pasos) : '—';
  $("#pasos-goal").textContent = 'objetivo ' + nf(ajustes.pasosGoal);
  $("#avatar-ini").textContent = (perfil.nombre || 'F').charAt(0).toUpperCase();
  { const av = $("#app-ver"); if (av) av.textContent = 'Forja ' + APP_VERSION + ' · funciona sin conexión'; }
  updateHero();
}
function weightSeries() { return Object.values(dias).filter(x => x.peso != null).sort((a, b) => a.fecha < b.fecha ? -1 : 1).map(x => ({ f: x.fecha, v: x.peso })).slice(-21); }
function drawSpark(cv, data) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 300, h = 34; cv.width = w * dpr; cv.height = h * dpr; const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  const mn = Math.min(...data) - .1, mx = Math.max(...data) + .1, pad = 3, rng = (mx - mn) || 1;
  const px = i => pad + i * (w - 2 * pad) / (data.length - 1), py = v => h - pad - (v - mn) / rng * (h - 2 * pad);
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "rgba(255,122,26,.28)"); g.addColorStop(1, "rgba(255,122,26,0)");
  x.beginPath(); x.moveTo(px(0), py(data[0])); data.forEach((v, i) => x.lineTo(px(i), py(v))); x.lineTo(px(data.length - 1), h); x.lineTo(px(0), h); x.closePath(); x.fillStyle = g; x.fill();
  x.beginPath(); data.forEach((v, i) => i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v))); x.strokeStyle = "#FF9E42"; x.lineWidth = 2; x.lineJoin = "round"; x.stroke();
  x.beginPath(); x.arc(px(data.length - 1), py(data[data.length - 1]), 3, 0, 7); x.fillStyle = "#FF9E42"; x.fill();
}

/* ===== ENTRENO: overview ===== */
function estMin(exArr) { return Math.round(exArr.reduce((a, e) => a + (e.target || e.sets).length * (e.rest + 45), 0) / 60); }
function updateHero() {
  const R = activeRoutine();
  $("#hero-name").textContent = R.name; $("#hero-tag").textContent = R.tag || 'Rutina'; $("#hero-sub").textContent = R.sub || '';
  const ns = R.ex.reduce((a, e) => a + e.target.length, 0);
  $("#hero-nex").textContent = R.ex.length; $("#hero-nseries").textContent = ns; $("#hero-min").textContent = '~' + estMin(R.ex);
  $("#start-wk").textContent = session ? '▶ Reanudar entreno' : 'Empezar entreno';
  $("#hoy-rt-name").textContent = R.name;
  $("#hoy-rt-sub").textContent = session ? 'entreno en curso' : `${R.ex.length} ejercicios · pendiente`;
  $("#aw-name").textContent = session ? session.name : R.name;
}
function lastFor(id) {
  for (let i = sesiones.length - 1; i >= 0; i--) { const ex = sesiones[i].ejercicios.find(e => e.id === id); if (ex && ex.sets.length) { const s = ex.sets[ex.sets.length - 1]; return `${nf(s.peso)} kg × ${s.reps}`; } }
  return null;
}
function renderOverview() {
  const R = activeRoutine();
  $("#ov-list").innerHTML = R.ex.map(e => { const L = exOf(e.id), lf = lastFor(e.id); return `<button class="ex-row" data-detail="${e.id}">${thumb(e.id)}<div class="ex-meta"><div class="n">${L.n}</div><div class="d"><span class="g">${e.target.length} series</span>${lf ? ' · últ. ' + lf : ''}</div></div><div class="ex-info">?</div></button>`; }).join("") || `<div class="empty"><b>Rutina vacía</b>Añade ejercicios desde la biblioteca.</div>`;
  updateHero();
}
function renderMisRutinas() {
  $("#mis-rutinas").innerHTML = rutinas.map(r => `<div class="ex-row" data-rutina="${r.id}"><div class="ex-thumb">${r.id === activeRoutineId ? '🔥' : (exOf(r.ex[0] ? r.ex[0].id : '').ic)}</div><div class="ex-meta"><div class="n">${r.name}${r.id === activeRoutineId ? ' · activa' : ''}</div><div class="d">${r.sub || r.tag} · ${r.ex.length} ejercicios</div></div><button class="rowmenu" data-rtmenu="${r.id}" aria-label="Opciones">⋯</button></div>`).join("");
}
async function setActiveRoutine(id) { activeRoutineId = id; await saveKV('activeRoutineId', id); renderOverview(); renderMisRutinas(); $("#s-entreno .scroll").scrollTop = 0; toast(`Rutina activa: <b>${activeRoutine().name}</b>`); }

/* ===== ENTRENO: sesión en vivo ===== */
let wkTimer = null;
function buildSession(R) { return { routineId: R.id, name: R.name, startTs: Date.now(), ex: R.ex.map(e => ({ id: e.id, rest: e.rest, last: lastFor(e.id), sets: e.target.map(([p, r]) => ({ peso: p, reps: r, rir: 2, done: false, drop: false })) })) }; }
function startWorkout() {
  if (!session) { session = buildSession(activeRoutine()); saveLive(); }
  $("#wk-overview").style.display = "none"; $("#wk-active").style.display = "flex";
  $("#aw-name").textContent = session.name;
  clearInterval(wkTimer); wkTimer = setInterval(tickClock, 1000); tickClock(); renderSession();
}
function tickClock() { const s = Math.max(0, Math.floor((Date.now() - session.startTs) / 1000)); $("#wk-clock").textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; }
const firstUndone = ex => ex.sets.findIndex(s => !s.done);
const curExIdx = () => session.ex.findIndex(e => firstUndone(e) !== -1);
function renderSession() {
  const host = $("#wk-scroll");
  host.innerHTML = session.ex.map((e, ei) => {
    const L = exOf(e.id), nextI = firstUndone(e), allDone = nextI === -1;
    const rows = e.sets.map((s, si) => { const cls = s.done ? "done" : (si === nextI ? "next" : ""); return `<div class="setrow ${s.drop ? 'drop' : ''} ${cls}" data-set="${ei}-${si}"><div class="sn">${s.drop ? 'DROP' : si + 1}</div><div class="val">${nf(s.peso)}<u>kg</u><span class="x">×</span>${s.reps}<u>reps</u></div><div class="rir">RIR ${s.rir}</div><div class="ck">${s.done ? '✓' : (si === nextI ? '▸' : '')}</div></div>`; }).join("");
    return `<div class="exblock ${!allDone && ei === curExIdx() ? 'active' : ''}"><div class="exhead">${thumb(e.id)}<div class="nm"><div class="n">${L.n}</div><div class="l"><b>${L.g}</b>${e.last ? ' · última vez ' + e.last : ''}</div></div><button class="guidebtn" data-detail="${e.id}">Guía</button></div><div class="exctrl"><button class="restchip" data-rest="${ei}">⏱ Descanso ${fmtRest(e.rest)}</button></div>${rows}<div class="setadd"><button data-add="${ei}">+ Serie</button><button data-drop="${ei}">+ Drop set</button></div></div>`;
  }).join("");
  const total = session.ex.reduce((a, e) => a + e.sets.length, 0), done = session.ex.reduce((a, e) => a + e.sets.filter(s => s.done).length, 0);
  $("#wk-prog").style.width = (total ? done / total * 100 : 0) + "%";
  host.insertAdjacentHTML('beforeend', `<div class="finishrow"><button class="btn btn-finish" id="wk-finish">Terminar entreno</button></div><button class="link dangerlink" id="wk-discard" style="display:block;margin:16px auto 4px;background:none;font-size:13px">Descartar entreno</button>`);
  $("#wk-finish").onclick = finishWorkout; $("#wk-discard").onclick = discardWorkout;
}
async function finishWorkout() {
  const done = session.ex.map(e => ({ id: e.id, sets: e.sets.filter(s => s.done).map(s => ({ peso: s.peso, reps: s.reps, rir: s.rir, drop: s.drop })) })).filter(e => e.sets.length);
  if (!done.length) { toast('Registra al menos una serie'); return; }
  const ses = { id: Date.now(), fecha: todayISO(), routineName: session.name, dur: Math.floor((Date.now() - session.startTs) / 1000), ejercicios: done };
  await idbPut('sesiones', ses); sesiones.push(ses); sesiones.sort((a, b) => a.id - b.id);
  session = null; await saveLive(); clearInterval(wkTimer);
  $("#wk-active").style.display = "none"; $("#wk-overview").style.display = "flex"; hideRest();
  renderOverview(); renderHoy();
  toast(`<b>Entreno guardado</b> · ${done.reduce((a, e) => a + e.sets.length, 0)} series`);
}
function discardWorkout() {
  openSheet(`<h3>¿Descartar el entreno?</h3><p class="sub">Se perderá lo registrado en esta sesión. No se puede deshacer.</p><button class="btn btn-primary" style="background:linear-gradient(180deg,#e2643f,#b64327);color:#fff" id="disc-yes">Sí, descartar</button><button class="link" id="disc-no" style="display:block;margin:14px auto 2px;background:none;font-size:14px;color:var(--muted)">Cancelar</button>`);
  $("#disc-yes").onclick = async () => { session = null; await saveLive(); clearInterval(wkTimer); closeSheet(); $("#wk-active").style.display = "none"; $("#wk-overview").style.display = "flex"; hideRest(); renderOverview(); toast('Entreno descartado'); };
  $("#disc-no").onclick = closeSheet;
}

/* ----- rest timer ----- */
let restI = null, restTotal = 90, restLeft = 0; const ARC = 119.4;
function startRest(sec, txt) { restTotal = sec; restLeft = sec; $("#rt-next").textContent = txt; $("#restbar").classList.add("show"); updRest(); clearInterval(restI); restI = setInterval(() => { restLeft--; updRest(); if (restLeft <= 0) { clearInterval(restI); hideRest(); toast("<b>¡A por la siguiente!</b> Descanso listo"); } }, 1000); }
function updRest() { $("#rt-num").textContent = restLeft; $("#rt-arc").style.strokeDashoffset = (ARC * (1 - restLeft / restTotal)).toFixed(1); }
function hideRest() { $("#restbar").classList.remove("show"); clearInterval(restI); }

/* ===== SHEETS ===== */
const sheetRoot = () => $("#sheetRoot"), sheetEl = () => $("#sheet");
let animT = null;
function stopAnim() { if (animT) { clearInterval(animT); animT = null; } }
function openSheet(html) { stopAnim(); sheetEl().scrollTop = 0; sheetEl().innerHTML = '<button class="sheet-close" id="sheet-close" aria-label="Cerrar">✕</button><div class="grab"></div>' + html; sheetRoot().classList.add("open"); const c = $("#sheet-close"); if (c) c.onclick = closeSheet; }
function closeSheet() { sheetRoot().classList.remove("open"); stopAnim(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); document.documentElement.style.setProperty('--kb', '0px'); }

function openSetSheet(ei, si) {
  const S = session.ex[ei].sets[si], L = exOf(session.ex[ei].id), d = Object.assign({}, S);
  openSheet(`<h3>${L.n}</h3><p class="sub">Serie ${si + 1}${S.drop ? ' · drop set' : ''}${session.ex[ei].last ? ' · última vez ' + session.ex[ei].last : ''}</p>
    <div class="stepwrap">
      <div style="position:relative"><span class="lab">Peso</span><div class="stepper"><button class="sbtn" data-s="peso" data-d="-2.5">−</button><div class="sval"><b id="d-peso">${nf(d.peso)}</b><span>kg · ±2,5</span></div><button class="sbtn" data-s="peso" data-d="2.5">+</button></div></div>
      <div style="position:relative"><span class="lab">Repeticiones</span><div class="stepper"><button class="sbtn" data-s="reps" data-d="-1">−</button><div class="sval"><b id="d-reps">${d.reps}</b><span>reps</span></div><button class="sbtn" data-s="reps" data-d="1">+</button></div></div>
    </div>
    <div style="position:relative;margin-bottom:16px"><span class="lab" style="position:static;display:block;margin-bottom:8px">Reps en reserva (RIR)</span><div class="rirsel" id="rirsel">${[0, 1, 2, 3, 4].map(r => `<button data-rir="${r}" class="${r === d.rir ? 'on' : ''}">${r}</button>`).join("")}</div></div>
    <div class="droptoggle"><div class="tt">Drop set<span>Encadena una serie descendente</span></div><div class="toggle ${d.drop ? 'on' : ''}" id="droptg"></div></div>
    <button class="btn btn-primary" id="save-set">${S.done ? 'Guardar cambios' : 'Registrar serie y descansar'}</button>`);
  sheetEl().querySelectorAll("[data-s]").forEach(b => b.onclick = () => { const k = b.dataset.s; d[k] = Math.max(0, Math.round((d[k] + parseFloat(b.dataset.d)) * 10) / 10); $("#d-" + k).textContent = nf(d[k]); });
  sheetEl().querySelectorAll("[data-rir]").forEach(b => b.onclick = () => { d.rir = +b.dataset.rir; sheetEl().querySelectorAll("[data-rir]").forEach(x => x.classList.toggle("on", x === b)); });
  $("#droptg").onclick = e => { d.drop = !d.drop; e.currentTarget.classList.toggle("on", d.drop); };
  $("#save-set").onclick = () => {
    Object.assign(S, d, { done: true }); saveLive(); closeSheet(); renderSession();
    const ex = session.ex[ei], L2 = exOf(ex.id); let nxt = firstUndone(ex), txt;
    if (nxt !== -1) txt = `Sigue: ${L2.n} · serie ${nxt + 1}`; else { const ni = curExIdx(); txt = ni !== -1 ? `Sigue: ${exOf(session.ex[ni].id).n} · serie 1` : "Último ejercicio ¡bien!"; }
    startRest(S.drop ? 45 : ex.rest, txt); toast(`<b>${nf(S.peso)} kg × ${S.reps}</b> registrado`);
  };
}
function openRestSheet(ei) {
  const ex = session.ex[ei], L = exOf(ex.id), opts = [45, 60, 90, 120, 150, 180, 210, 240, 270, 300];
  openSheet(`<h3>Descanso entre series</h3><p class="sub">${L.n}</p><div class="restsel" id="restsel">${opts.map(o => `<button data-r="${o}" class="${o === ex.rest ? 'on' : ''}">${fmtRest(o)}</button>`).join('')}</div><div class="musc">El cronómetro arranca solo con este tiempo al terminar cada serie. Tu criterio: básicos pesados (sentadilla, prensa, press, peso muerto…) 4:30–5:00 · aislamiento 2:30–3:00.</div><button class="btn btn-primary" id="rest-save">Hecho</button>`);
  sheetEl().querySelectorAll('[data-r]').forEach(b => b.onclick = () => { ex.rest = +b.dataset.r; sheetEl().querySelectorAll('[data-r]').forEach(x => x.classList.toggle('on', x === b)); });
  $("#rest-save").onclick = async () => { saveLive(); const R = rutinas.find(r => r.id === session.routineId); if (R) { const re = R.ex.find(x => x.id === ex.id); if (re) { re.rest = ex.rest; await saveRoutine(R); } } closeSheet(); renderSession(); toast(`Descanso: ${fmtRest(ex.rest)}`); };
}

/* ----- editores diarios ----- */
const editors = {
  peso: d => `<h3>Peso en ayunas</h3><p class="sub">A primera hora, en ayunas.</p><div class="field"><label>Peso (kg)</label><input id="i-peso" type="text" inputmode="decimal" autocomplete="off" value="${d.peso != null ? nf(d.peso) : ''}" placeholder="kg"></div><button class="btn btn-primary" data-save="peso">Guardar</button>`,
  nutri: d => `<h3>Nutrición del día</h3><p class="sub">Copia el total que ves en FatSecret.</p><div class="field"><label>Calorías (kcal)</label><input id="i-kcal" type="number" inputmode="numeric" value="${d.kcal ?? ''}" placeholder="kcal"></div><div class="two"><div class="field"><label>Prot (g)</label><input id="i-prot" type="number" value="${d.prot ?? ''}"></div><div class="field"><label>Carb (g)</label><input id="i-carb" type="number" value="${d.carb ?? ''}"></div><div class="field"><label>Grasa (g)</label><input id="i-fat" type="number" value="${d.fat ?? ''}"></div></div><button class="btn btn-primary" data-save="nutri">Guardar</button>`,
  sueno: d => `<h3>Sueño</h3><p class="sub">Hora de acostarte y levantarte.</p><div class="two"><div class="field"><label>Me acosté</label><input id="i-bed" type="time" value="${d.bed || '23:30'}"></div><div class="field"><label>Me levanté</label><input id="i-wake" type="time" value="${d.wake || '07:00'}"></div></div><button class="btn btn-primary" data-save="sueno">Guardar</button>`,
  pasos: d => `<h3>Pasos</h3><p class="sub">Del contador de tu móvil o reloj.</p><div class="field"><label>Pasos de hoy</label><input id="i-pasos" type="number" inputmode="numeric" value="${d.pasos ?? ''}" placeholder="pasos"></div><button class="btn btn-primary" data-save="pasos">Guardar</button>`,
};
async function saveDaily(kind) {
  const iso = todayISO(); const d = Object.assign({ fecha: iso }, dias[iso] || {});
  if (kind === "peso") { const v = $("#i-peso").value; d.peso = v === '' ? undefined : clampNum(v); }
  if (kind === "nutri") { ['kcal', 'prot', 'carb', 'fat'].forEach(k => { const v = $("#i-" + k).value; d[k] = v === '' ? undefined : Math.round(clampNum(v)); }); }
  if (kind === "sueno") { const b = $("#i-bed").value, w = $("#i-wake").value; d.bed = b; d.wake = w; let [bh, bm] = b.split(":").map(Number), [wh, wm] = w.split(":").map(Number); let m = (wh * 60 + wm) - (bh * 60 + bm); if (m < 0) m += 1440; d.suenoMin = m; }
  if (kind === "pasos") { const v = $("#i-pasos").value; d.pasos = v === '' ? undefined : Math.round(clampNum(v)); }
  dias[iso] = d; await saveDia(d); closeSheet(); renderHoy(); toast("Guardado ✓");
}

/* ----- ficha de ejercicio ----- */
function openDetail(id) {
  const e = exOf(id), im = imgOf(id), g = guideOf(id);
  const media = im ? `<div class="anim" id="anim"><span class="fr" id="anim-fr">Inicio</span><img id="anim-img" src="${im[0]}" alt="${e.n}" onerror="this.style.opacity=0"><button class="playbtn" id="anim-play">▶ Ver movimiento</button></div>` : `<div class="anim"><div class="noimg"><span class="bg">${e.ic}</span><span class="noimg-t">${e.g}</span><span class="noimg-s">Mira la técnica en el vídeo ↓</span></div></div>`;
  let guiaHtml = '';
  if (g && g.tipo === 'pro') guiaHtml = `<div class="gsec-h">Ejecución</div><ol class="steps">${g.ej.map(s => `<li>${s}</li>`).join("")}</ol><div class="note err"><span class="ni">⚠︎</span><div><b>Error común.</b> ${g.er}</div></div><div class="note tip"><span class="ni">✦</span><div><b>Consejo.</b> ${g.co}</div></div>`;
  else if (g && g.p && g.p.length) guiaHtml = `<div class="gsec-h">Cómo se hace</div><ol class="steps">${g.p.map(s => `<li>${s}</li>`).join("")}</ol>`;
  else guiaHtml = `<div class="musc" style="margin-top:14px">Sigue la animación de inicio a final.</div>`;
  const ytq = e.n.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim(); // quita paréntesis descriptivos para una búsqueda más robusta
  const yt = `https://www.youtube.com/results?search_query=${encodeURIComponent((ytq || e.n) + ' ejercicio')}`;
  const inRoutine = activeRoutine().ex.some(x => x.id === id);
  openSheet(`<div class="guide">${media}
    <div class="gtop" style="margin-top:14px"><div><div class="g">${e.g}</div><div class="n">${e.n}</div></div></div>
    <div class="chips"><span class="pill grp">${e.g}</span>${e.me ? `<span class="pill">${e.me}</span>` : ''}${e.eq ? `<span class="pill">${e.eq}</span>` : ''}${e.lv ? `<span class="pill">${e.lv}</span>` : ''}</div>
    <div class="musc"><b>Músculos:</b> ${e.m || '—'}</div>${guiaHtml}
    <a class="videolink" href="${yt}" target="_blank" rel="noopener">▶︎ Ver vídeo en YouTube</a>
    <div class="detail-actions"><button class="btn ${inRoutine ? 'btn-ghost' : 'btn-primary'}" id="add-rt">${inRoutine ? '✕ Quitar de la rutina' : '＋ Añadir a la rutina'}</button></div></div>`);
  if (im) {
    const pre = new Image(); pre.src = im[1]; // precarga el 2º fotograma para que la animación sea fluida
    let fr = 0; const imgEl = $("#anim-img"), frEl = $("#anim-fr"), pb = $("#anim-play");
    pb.onclick = () => { if (animT) { stopAnim(); pb.textContent = "▶ Ver movimiento"; imgEl.src = im[0]; frEl.textContent = "Inicio"; return; } pb.textContent = "⏸ Pausar"; animT = setInterval(() => { fr = fr ? 0 : 1; imgEl.src = im[fr]; frEl.textContent = fr ? "Final" : "Inicio"; }, 700); };
  }
  $("#add-rt").onclick = async () => {
    const R = activeRoutine(); const idx = R.ex.findIndex(x => x.id === id);
    if (idx >= 0) {
      R.ex.splice(idx, 1); await saveRoutine(R);
      if (session && session.routineId === R.id) { const si = session.ex.findIndex(x => x.id === id); if (si >= 0) { session.ex.splice(si, 1); saveLive(); renderSession(); } }
      renderOverview(); closeSheet(); toast(`Quitado de ${R.name}`);
    } else {
      R.ex.push({ id, rest: (e.me === 'Compuesto' ? 270 : 150), target: [[0, 10], [0, 10], [0, 10]] }); await saveRoutine(R);
      if (session && session.routineId === R.id) { session.ex.push({ id, rest: (e.me === 'Compuesto' ? 270 : 150), last: lastFor(id), sets: [0, 1, 2].map(() => ({ peso: 0, reps: 10, rir: 2, done: false, drop: false })) }); saveLive(); renderSession(); }
      renderOverview(); closeSheet(); toast(`<b>${e.n}</b> añadido a ${R.name}`);
    }
  };
}

/* ----- perfil ----- */
function openPerfil() {
  const S = perfil;
  openSheet(`<h3>Tus datos</h3><p class="sub">Para afinar los ajustes (calorías, proteína, contexto). El peso lo registras cada mañana, aquí no hace falta.</p>
    <div class="field"><label>Nombre</label><input id="p-nombre" value="${S.nombre || ''}" placeholder="Tu nombre"></div>
    <span class="flabel">Sexo</span><div class="restsel" id="p-sexo">${['Hombre', 'Mujer', 'Otro'].map(o => `<button data-v="${o}" class="${S.sexo === o ? 'on' : ''}">${o}</button>`).join('')}</div><div style="height:14px"></div>
    <div class="two"><div class="field"><label>Edad</label><input id="p-edad" type="number" inputmode="numeric" value="${S.edad || ''}" placeholder="años"></div><div class="field"><label>Altura (cm)</label><input id="p-altura" type="number" inputmode="numeric" value="${S.altura || ''}" placeholder="cm"></div></div>
    <span class="flabel">Objetivo</span><div class="restsel" id="p-obj">${['Perder grasa', 'Recomposición', 'Ganar músculo', 'Mantenimiento'].map(o => `<button data-v="${o}" class="${S.objetivo === o ? 'on' : ''}">${o}</button>`).join('')}</div><div style="height:16px"></div>
    <button class="btn btn-primary" id="p-save">Guardar</button>`);
  const pick = (sel, key) => sheetEl().querySelectorAll(sel + ' [data-v]').forEach(b => b.onclick = () => { perfil[key] = b.dataset.v; sheetEl().querySelectorAll(sel + ' [data-v]').forEach(x => x.classList.toggle('on', x === b)); });
  pick('#p-sexo', 'sexo'); pick('#p-obj', 'objetivo');
  $("#p-save").onclick = async () => { perfil.nombre = $("#p-nombre").value.trim(); perfil.edad = $("#p-edad").value; perfil.altura = $("#p-altura").value; await saveKV('perfil', perfil); $("#avatar-ini").textContent = (perfil.nombre || 'F').charAt(0).toUpperCase(); closeSheet(); toast('Datos guardados ✓'); };
}

/* ----- fotos ----- */
function renderFotos() {
  $("#fotos-grid").innerHTML = fotos.length ? fotos.map(f => `<button class="foto" data-foto="${f.id}"><img src="${f.src}" alt=""><span>${f.label}</span></button>`).join('') : `<div class="fotos-empty">Aún no hay fotos. Añade una y ve tu evolución semana a semana; podrás compartirlas con tu entrenador.</div>`;
}
function handleFoto(file) {
  if (!file) return; const rd = new FileReader();
  rd.onload = async () => { const f = { id: Date.now(), fecha: todayISO(), label: shortDate(todayISO()), src: rd.result }; fotos.unshift(f); await idbPut('fotos', f); renderFotos(); toast('Foto añadida ✓'); };
  rd.readAsDataURL(file);
}
function openFoto(id) {
  const f = fotos.find(x => x.id === id); if (!f) return;
  openSheet(`<h3>Físico · ${f.label}</h3><img src="${f.src}" style="width:100%;border-radius:14px;margin:6px 0 14px" alt=""><button class="link dangerlink" id="foto-del" style="display:block;margin:0 auto;background:none;font-size:13px">Eliminar foto</button>`);
  $("#foto-del").onclick = async () => { fotos = fotos.filter(x => x.id !== id); await idbDel('fotos', id); renderFotos(); closeSheet(); toast('Foto eliminada'); };
}

/* ===== BIBLIOTECA ===== */
const GRUPOS = ['Todos', 'Pecho', 'Espalda', 'Hombro', 'Bíceps', 'Tríceps', 'Pierna', 'Glúteo', 'Core', 'Antebrazo', 'Cuello'];
const GRP_ORDER = ['Pecho', 'Espalda', 'Hombro', 'Bíceps', 'Tríceps', 'Antebrazo', 'Pierna', 'Glúteo', 'Core', 'Cuello'];
const GRP_IC = { Pecho: '🫀', Espalda: '🔙', Hombro: '🔺', Bíceps: '💪', Tríceps: '🔨', Antebrazo: '🤝', Pierna: '🦵', Glúteo: '🍑', Core: '🎯', Cuello: '🧣' };
let bGrupo = 'Todos', bSearch = '';
function openBiblio() {
  bGrupo = 'Todos'; bSearch = ''; $("#biblio-search").value = '';
  $("#biblio-chips").innerHTML = GRUPOS.map(g => `<button class="fchip ${g === bGrupo ? 'on' : ''}" data-g="${g}">${g}</button>`).join("");
  $("#biblio").classList.add("open"); renderBiblio();
}
function renderBiblio() {
  if (bGrupo === 'Todos' && !bSearch) {
    $("#biblio-title").textContent = `${CAT.total} ejercicios`;
    $("#biblio-count").textContent = `Elige un grupo muscular · ${CAT.premium} con ficha premium`;
    $("#biblio-list").innerHTML = '<div class="grpgrid">' + GRP_ORDER.map(g => `<button class="grpcard" data-gcard="${g}"><span class="gc-ic">${GRP_IC[g] || '🏋️'}</span><span class="gc-n">${g}</span><span class="gc-c">${CAT.grupos[g] || 0} ejercicios</span></button>`).join('') + '</div>';
    $("#biblio-list").scrollTop = 0; return;
  }
  let res = CAT.EX;
  if (bGrupo !== 'Todos') res = res.filter(x => x.g === bGrupo);
  if (bSearch) { const toks = bSearch.split(/\s+/).filter(Boolean); res = res.filter(x => { const hay = norm(x.n) + ' ' + norm(x.m); return toks.every(t => hay.includes(t)); }); }
  $("#biblio-title").textContent = `${res.length} ejercicio${res.length === 1 ? '' : 's'}`;
  $("#biblio-count").textContent = `${res.length} resultado${res.length === 1 ? '' : 's'}${bGrupo !== 'Todos' ? ' · ' + bGrupo : ''}`;
  const cap = res.slice(0, 120);
  $("#biblio-list").innerHTML = (cap.map(x => `<button class="ex-row" data-detail="${x.id}">${thumb(x.id)}<div class="ex-meta"><div class="n">${x.n}</div><div class="d">${x.eq} · ${x.lv}</div></div><div class="ex-info">›</div></button>`).join("") || `<div class="empty">Sin resultados.</div>`) + (res.length > 120 ? `<div class="bmore">…y ${res.length - 120} más. Afina con el buscador.</div>` : '');
  $("#biblio-list").scrollTop = 0;
}

/* ===== PROGRESO: charts + PRs ===== */
function drawCharts() {
  const wl = weightSeries();
  const wc = $("#ch-weight");
  if (wl.length >= 2) { $("#wt-empty").innerHTML = ''; const d0 = wl[0].v, d1 = wl[wl.length - 1].v, delta = +(d1 - d0).toFixed(1); $("#wt-head").innerHTML = `${wl.length} registros · <b style="color:${delta <= 0 ? 'var(--jade)' : 'var(--clay)'}">${delta > 0 ? '+' : ''}${nf(delta)} kg</b>`; lineChart(wc, wl.map(x => x.v), wl.map(x => shortDate(x.f))); }
  else { wc.getContext('2d').clearRect(0, 0, wc.width, wc.height); $("#wt-head").textContent = 'peso en ayunas'; $("#wt-empty").innerHTML = `<div class="empty" style="margin-top:6px"><b>Aún sin datos</b>Apunta tu peso en ayunas unos días y verás la tendencia.</div>`; }
  const vw = weeklyVolume();
  const vc = $("#ch-vol");
  if (vw.some(w => w.total > 0)) { $("#vol-empty").innerHTML = ''; barChart(vc, vw.map(w => [w.Empuje, w.Tirón, w.Pierna, w.Core]), ["#FF7A1A", "#E8B23C", "#4FB4A6", "#8a7a66"], vw.map(w => w.label)); }
  else { vc.getContext('2d').clearRect(0, 0, vc.width, vc.height); $("#vol-empty").innerHTML = `<div class="empty" style="margin-top:6px"><b>Aún sin entrenos</b>Registra sesiones y verás tu volumen semanal por grupo.</div>`; }
  renderPRs();
}
const PATTERN = g => (['Pecho', 'Hombro', 'Tríceps'].includes(g) ? 'Empuje' : ['Espalda', 'Bíceps', 'Antebrazo'].includes(g) ? 'Tirón' : ['Pierna', 'Glúteo'].includes(g) ? 'Pierna' : 'Core');
function weeklyVolume() {
  const weeks = []; const today = new Date(); today.setHours(12, 0, 0, 0);
  for (let w = 5; w >= 0; w--) {
    const end = new Date(today); end.setDate(today.getDate() - w * 7); const start = new Date(end); start.setDate(end.getDate() - 6);
    const o = { label: `${start.getDate()}/${start.getMonth() + 1}`, Empuje: 0, Tirón: 0, Pierna: 0, Core: 0, total: 0 };
    sesiones.forEach(s => { const d = dateFromISO(s.fecha); if (d >= start && d <= end) s.ejercicios.forEach(e => { const p = PATTERN(exOf(e.id).g); o[p] += e.sets.length; o.total += e.sets.length; }); });
    weeks.push(o);
  }
  return weeks;
}
function renderPRs() {
  const best = {};
  sesiones.forEach(s => s.ejercicios.forEach(e => e.sets.forEach(st => { const b = best[e.id]; if (!b || st.peso > b.peso || (st.peso === b.peso && st.reps > b.reps)) best[e.id] = { peso: st.peso, reps: st.reps, fecha: s.fecha }; })));
  const arr = Object.entries(best).map(([id, b]) => ({ id, ...b })).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 6);
  $("#pr-list").innerHTML = arr.length ? arr.map((r, i) => `<div class="prcard"><div class="medal">${['🥇', '🔥', '⚡', '💪', '🏋️', '✅'][i] || '✅'}</div><div class="n">${exOf(r.id).n}<span>${shortDate(r.fecha)}</span></div><div class="val">${nf(r.peso)} × ${r.reps}</div></div>`).join('') : `<div class="empty"><b>Aún sin récords</b>Entrena y registra series para ver aquí tus mejores marcas.</div>`;
}
function lineChart(cv, data, labels) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = 150; cv.width = w * dpr; cv.height = h * dpr; const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const pl = 8, pr = 8, pt = 14, pb = 22, mn = Math.min(...data) - .3, mx = Math.max(...data) + .3, rng = (mx - mn) || 1;
  const px = i => pl + i * (w - pl - pr) / Math.max(1, data.length - 1), py = v => pt + (1 - (v - mn) / rng) * (h - pt - pb);
  x.strokeStyle = "rgba(255,255,255,.05)"; x.lineWidth = 1; for (let i = 0; i < 4; i++) { const y = pt + i * (h - pt - pb) / 3; x.beginPath(); x.moveTo(pl, y); x.lineTo(w - pr, y); x.stroke(); }
  const g = x.createLinearGradient(0, pt, 0, h - pb); g.addColorStop(0, "rgba(255,122,26,.25)"); g.addColorStop(1, "rgba(255,122,26,0)");
  x.beginPath(); data.forEach((v, i) => i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v))); x.lineTo(px(data.length - 1), h - pb); x.lineTo(px(0), h - pb); x.fillStyle = g; x.fill();
  x.beginPath(); data.forEach((v, i) => i ? x.lineTo(px(i), py(v)) : x.moveTo(px(i), py(v))); x.strokeStyle = "#FF9E42"; x.lineWidth = 2.4; x.lineJoin = "round"; x.stroke();
  data.forEach((v, i) => { x.beginPath(); x.arc(px(i), py(v), i === data.length - 1 ? 4 : 2.3, 0, 7); x.fillStyle = i === data.length - 1 ? "#FF9E42" : "#8a7a66"; x.fill(); });
  x.fillStyle = "#7C7060"; x.font = "600 10px " + getComputedStyle(document.body).fontFamily; x.textAlign = "center";
  const step = Math.ceil(labels.length / 6); labels.forEach((l, i) => { if (i % step === 0 || i === labels.length - 1) x.fillText(l, px(i), h - 6); });
}
function barChart(cv, weeks, colors, labels) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = 150; cv.width = w * dpr; cv.height = h * dpr; const x = cv.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const pt = 10, pb = 22, pl = 6, pr = 6, mx = Math.max(1, ...weeks.map(a => a.reduce((s, v) => s + v, 0))) * 1.12, gw = (w - pl - pr) / weeks.length, bw = Math.min(gw * .5, 26);
  weeks.forEach((wk, i) => { let y = h - pb; const cx = pl + i * gw + gw / 2; wk.forEach((v, j) => { if (!v) return; const bh = v / mx * (h - pt - pb); x.fillStyle = colors[j]; const yy = y - bh; rr(x, cx - bw / 2, yy, bw, bh, j === wk.length - 1 ? 4 : 0); y = yy; }); x.fillStyle = "#7C7060"; x.font = "600 10px " + getComputedStyle(document.body).fontFamily; x.textAlign = "center"; x.fillText(labels[i], cx, h - 6); });
}
function rr(x, px, py, w, h, r) { r = Math.min(r, h); x.beginPath(); x.moveTo(px, py + h); x.lineTo(px, py + r); x.arcTo(px, py, px + r, py, r); x.lineTo(px + w - r, py); x.arcTo(px + w, py, px + w, py + r, r); x.lineTo(px + w, py + h); x.closePath(); x.fill(); }

/* ===== EXPORTAR ===== */
function weekRange() { const days = lastNDays(7); return { start: isoOf(days[0]), end: isoOf(days[6]), isos: days.map(isoOf) }; }
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function buildReport() {
  const p = perfil, wr = weekRange();
  const wDias = wr.isos.map(i => dias[i]).filter(Boolean);
  const wSes = sesiones.filter(s => wr.isos.includes(s.fecha));
  const line = '════════════════════════════════';
  let R = `${line}\n  FORJA · INFORME SEMANAL\n  ${shortDate(wr.start)} – ${shortDate(wr.end)}\n${line}\n`;
  R += `\n▸ PERFIL\n  ${p.nombre || '—'} · ${p.sexo || '—'} · ${p.edad || '—'} años · ${p.altura || '—'} cm\n  Objetivo: ${p.objetivo || '—'}`;
  const wlAll = weightSeries(); const pesoAct = wlAll.length ? wlAll[wlAll.length - 1].v : (dHoy().peso ?? null);
  R += `  ·  Peso actual: ${pesoAct != null ? nf(pesoAct) + ' kg' : '—'}\n`;
  // entrenos
  const totalSeries = wSes.reduce((a, s) => a + s.ejercicios.reduce((b, e) => b + e.sets.length, 0), 0);
  R += `\n▸ ENTRENOS (${wSes.length})`;
  if (wSes.length) {
    R += `  ·  ${totalSeries} series efectivas\n`;
    const byName = {}; wSes.forEach(s => byName[s.routineName] = (byName[s.routineName] || 0) + 1);
    R += '  ' + Object.entries(byName).map(([n, c]) => `${n}${c > 1 ? ' ×' + c : ''}`).join(' · ') + '\n';
    const pat = { Empuje: 0, Tirón: 0, Pierna: 0, Core: 0 }; wSes.forEach(s => s.ejercicios.forEach(e => pat[PATTERN(exOf(e.id).g)] += e.sets.length));
    R += '  Volumen: ' + Object.entries(pat).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ') + '\n';
  } else R += `\n  Sin entrenos registrados esta semana.\n`;
  // progresión
  const bestWeek = {}, bestPrev = {};
  wSes.forEach(s => s.ejercicios.forEach(e => e.sets.forEach(st => { const b = bestWeek[e.id]; if (!b || st.peso > b.peso || (st.peso === b.peso && st.reps > b.reps)) bestWeek[e.id] = st; })));
  sesiones.filter(s => !wr.isos.includes(s.fecha)).forEach(s => s.ejercicios.forEach(e => e.sets.forEach(st => { const b = bestPrev[e.id]; if (!b || st.peso > b.peso) bestPrev[e.id] = st; })));
  const prog = Object.keys(bestWeek);
  if (prog.length) {
    R += `\n▸ PROGRESIÓN (mejor serie de la semana)\n`;
    prog.slice(0, 10).forEach(id => { const b = bestWeek[id], pv = bestPrev[id]; const up = pv && b.peso > pv.peso; R += `  ${exOf(id).n}: ${nf(b.peso)} kg × ${b.reps}${up ? '  ▲' : ''}\n`; });
  }
  // nutrición
  const kc = wDias.filter(d => d.kcal != null).map(d => d.kcal);
  R += `\n▸ NUTRICIÓN (${kc.length}/7 días)`;
  if (kc.length) { const pr = wDias.filter(d => d.prot != null).map(d => d.prot), ca = wDias.filter(d => d.carb != null).map(d => d.carb), fa = wDias.filter(d => d.fat != null).map(d => d.fat); R += `\n  Calorías media: ${nf(Math.round(avg(kc)))} kcal (obj ${nf(ajustes.kcalGoal)})\n  Prot ${pr.length ? nf(Math.round(avg(pr))) + ' g' : '—'} · Carb ${ca.length ? nf(Math.round(avg(ca))) + ' g' : '—'} · Grasa ${fa.length ? nf(Math.round(avg(fa))) + ' g' : '—'}\n`; }
  else R += `\n  Sin registros de nutrición.\n`;
  // peso semana
  const wp = wDias.filter(d => d.peso != null);
  R += `\n▸ PESO EN AYUNAS`;
  if (wp.length) { R += `\n  ` + wp.map(d => `${DOW[dateFromISO(d.fecha).getDay()]} ${nf(d.peso)}`).join('  ') + `\n  Rango semana: ${nf(wp[0].peso)} → ${nf(wp[wp.length - 1].peso)} kg (${(wp[wp.length - 1].peso - wp[0].peso) > 0 ? '+' : ''}${nf(+(wp[wp.length - 1].peso - wp[0].peso).toFixed(1))})\n`; }
  else R += `\n  Sin registros de peso.\n`;
  // sueño / pasos
  const sm = wDias.filter(d => d.suenoMin).map(d => d.suenoMin), ps = wDias.filter(d => d.pasos != null).map(d => d.pasos);
  R += `\n▸ SUEÑO Y PASOS\n  Sueño medio: ${sm.length ? Math.floor(avg(sm) / 60) + ' h ' + pad(Math.round(avg(sm) % 60)) : '—'}\n  Pasos medios: ${ps.length ? nf(Math.round(avg(ps))) + ' /día' : '—'}\n`;
  // fotos
  const wf = fotos.filter(f => wr.isos.includes(f.fecha)).length;
  R += `\n▸ FÍSICO (FOTOS)\n  ${wf} foto(s) esta semana (se adjuntan aparte)\n`;
  R += `\n▸ SENSACIONES\n  (escribe aquí cómo te has sentido)\n`;
  R += `\n${'─'.repeat(32)}\nIncluye TODOS tus datos de la semana:\nentrenos, cargas, nutrición, peso,\nsueño, pasos, perfil y fotos.\nGenerado por Forja.`;
  return R;
}
function refreshExport() {
  const wr = weekRange();
  $("#exp-week").textContent = `${shortDate(wr.start)} – ${shortDate(wr.end)}`;
  const wSes = sesiones.filter(s => wr.isos.includes(s.fecha));
  const wDias = wr.isos.map(i => dias[i]).filter(Boolean);
  const series = wSes.reduce((a, s) => a + s.ejercicios.reduce((b, e) => b + e.sets.length, 0), 0);
  const nutriDias = wDias.filter(d => d.kcal != null).length;
  const wp = wDias.filter(d => d.peso != null);
  const delta = wp.length >= 2 ? +(wp[wp.length - 1].peso - wp[0].peso).toFixed(1) : null;
  $("#exp-kpis").innerHTML = `<div class="kpi"><b>${wSes.length}</b><span>entrenos</span></div><div class="kpi"><b>${series}</b><span>series</span></div><div class="kpi"><b>${nutriDias}/7</b><span>nutrición</span></div><div class="kpi"><b>${delta != null ? (delta > 0 ? '+' : '') + nf(delta) : '—'}</b><span>peso kg</span></div>`;
  $("#export-preview").textContent = buildReport();
}

/* ----- rutinas: import / export ----- */
function encodeRoutine(r) { const p = { name: r.name, tag: r.tag || 'Rutina', sub: r.sub || '', ex: r.ex.map(e => ({ id: e.id, rest: e.rest, target: e.target })) }; return 'FORJA1:' + btoa(unescape(encodeURIComponent(JSON.stringify(p)))); }
function decodeRoutine(code) { try { if (!code || code.indexOf('FORJA1:') !== 0) return null; const r = JSON.parse(decodeURIComponent(escape(atob(code.slice(7).trim())))); if (!r || !Array.isArray(r.ex) || !r.ex.length || !r.ex.every(e => e && e.id && Array.isArray(e.target))) return null; return r; } catch (e) { return null; } }
function openImport() {
  openSheet(`<h3>Importar rutina</h3><p class="sub">Pega el código que te pasa tu entrenador y la rutina aparecerá en «Mis rutinas».</p>
    <textarea id="imp-code" class="impta" placeholder="FORJA1:…" spellcheck="false"></textarea>
    <button class="btn btn-primary" id="imp-go">Importar</button><div id="imp-msg"></div>`);
  $("#imp-go").onclick = () => {
    const r = decodeRoutine($("#imp-code").value.trim());
    if (!r) { $("#imp-msg").innerHTML = `<div class="note err" style="margin-top:12px"><span class="ni">⚠︎</span><div>Ese código no es válido. Cópialo entero (empieza por <b>FORJA1:</b>) y vuelve a pegarlo.</div></div>`; return; }
    openSheet(`<h3>${r.name}</h3><p class="sub">${r.ex.length} ejercicios · rutina de tu entrenador</p><div class="ex-list">${r.ex.map(e => `<div class="ex-row" style="cursor:default">${thumb(e.id)}<div class="ex-meta"><div class="n">${exOf(e.id).n}</div><div class="d">${e.target.length} series · descanso ${fmtRest(e.rest)}</div></div></div>`).join('')}</div><button class="btn btn-primary" id="imp-add" style="margin-top:16px">Añadir a mis rutinas</button>`);
    $("#imp-add").onclick = async () => { const nr = { id: uid(), name: r.name, tag: r.tag, sub: r.sub, ex: r.ex.map(e => ({ id: e.id, rest: e.rest, target: e.target })) }; rutinas.unshift(nr); await saveRoutine(nr); renderMisRutinas(); closeSheet(); toast(`<b>${nr.name}</b> importada ✓`); };
  };
}
function newRoutine() {
  openSheet(`<h3>Nueva rutina</h3><p class="sub">Ponle nombre y luego añade ejercicios desde la biblioteca.</p><div class="field"><label>Nombre</label><input id="nr-name" placeholder="Ej. Empuje B"></div><button class="btn btn-primary" id="nr-go">Crear</button>`);
  $("#nr-go").onclick = async () => { const name = $("#nr-name").value.trim() || 'Nueva rutina'; const nr = { id: uid(), name, tag: 'Personalizada', sub: '', ex: [] }; rutinas.unshift(nr); await saveRoutine(nr); await setActiveRoutine(nr.id); closeSheet(); toast(`<b>${name}</b> creada`); };
}
function openRoutineMenu(id) {
  const r = rutinas.find(x => x.id === id); if (!r) return;
  openSheet(`<h3>Rutina</h3><p class="sub">${r.ex.length} ejercicios${r.id === activeRoutineId ? ' · activa' : ''}</p>
    <div class="field"><label>Nombre</label><input id="rn-name" value="${(r.name || '').replace(/"/g, '&quot;')}"></div>
    <button class="btn btn-primary" id="rn-save">Guardar nombre</button>
    <div class="finishrow"><button class="btn btn-ghost" id="rn-activate">Poner como activa</button></div>
    <button class="link dangerlink" id="rn-del" style="display:block;margin:16px auto 2px;background:none;font-size:14px">Eliminar rutina</button>`);
  $("#rn-save").onclick = async () => { const nm = $("#rn-name").value.trim(); if (!nm) { toast('Ponle un nombre'); return; } r.name = nm; await saveRoutine(r); renderMisRutinas(); if (r.id === activeRoutineId) updateHero(); closeSheet(); toast('Nombre guardado ✓'); };
  $("#rn-activate").onclick = () => { closeSheet(); setActiveRoutine(id); };
  $("#rn-del").onclick = () => {
    if (rutinas.length <= 1) { toast('Debe quedar al menos una rutina'); return; }
    openSheet(`<h3>¿Eliminar «${r.name}»?</h3><p class="sub">No se puede deshacer.</p><button class="btn btn-primary" id="del-yes" style="background:linear-gradient(180deg,#e2643f,#b64327);color:#fff">Sí, eliminar</button><button class="link" id="del-no" style="display:block;margin:14px auto 2px;background:none;font-size:14px;color:var(--muted)">Cancelar</button>`);
    $("#del-no").onclick = closeSheet;
    $("#del-yes").onclick = async () => { rutinas = rutinas.filter(x => x.id !== id); await idbDel('rutinas', id); if (activeRoutineId === id) { activeRoutineId = rutinas[0].id; await saveKV('activeRoutineId', activeRoutineId); } renderOverview(); renderMisRutinas(); closeSheet(); toast('Rutina eliminada'); };
  };
}

/* ----- copia de seguridad ----- */
async function backupExport() {
  const data = { app: 'forja', v: 1, ts: Date.now(), perfil, ajustes, activeRoutineId, rutinas, dias: Object.values(dias), sesiones, fotos };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `forja-copia-${todayISO()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Copia exportada ✓');
}
function backupImport(file) {
  if (!file) return; const rd = new FileReader();
  rd.onload = () => {
    let data; try { data = JSON.parse(rd.result); } catch (e) { toast('Archivo no válido'); return; }
    if (!data || data.app !== 'forja' || !Array.isArray(data.rutinas)) { toast('No es una copia de Forja'); return; }
    openSheet(`<h3>Restaurar copia</h3><p class="sub">Se reemplazarán TODOS tus datos actuales por los de la copia (${data.rutinas.length} rutinas, ${(data.sesiones || []).length} entrenos, ${(data.dias || []).length} días). No se puede deshacer.</p><button class="btn btn-primary" id="rb-yes" style="background:linear-gradient(180deg,#e2643f,#b64327);color:#fff">Sí, restaurar</button><button class="link" id="rb-no" style="display:block;margin:14px auto 2px;background:none;font-size:14px;color:var(--muted)">Cancelar</button>`);
    $("#rb-no").onclick = closeSheet;
    $("#rb-yes").onclick = async () => {
      await Promise.all(['rutinas', 'dias', 'sesiones', 'fotos'].map(idbClear));
      for (const r of data.rutinas || []) await idbPut('rutinas', r);
      for (const d of data.dias || []) await idbPut('dias', d);
      for (const s of data.sesiones || []) await idbPut('sesiones', s);
      for (const f of data.fotos || []) await idbPut('fotos', f);
      await saveKV('perfil', data.perfil || perfil); await saveKV('ajustes', data.ajustes || ajustes); await saveKV('activeRoutineId', data.activeRoutineId || null); await idbDel('kv', 'liveSession');
      await loadState(); if (!rutinas.length) await seedRutinas(); if (!rutinas.find(r => r.id === activeRoutineId)) activeRoutineId = rutinas[0].id;
      renderAll(); closeSheet(); go('hoy'); toast('Copia restaurada ✓');
    };
  };
  rd.readAsText(file);
}

/* ===== PWA ===== */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (refreshing || !hadController) return; refreshing = true; location.reload(); });
}
let deferredPrompt = null;
function initInstall() {
  const box = $("#install-hint");
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isStandalone) return;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferredPrompt = e;
    box.innerHTML = `<div class="installhint"><span class="ii">📲</span><div class="it"><b>Instala Forja</b> en tu móvil para usarla como una app, offline.</div><button id="do-install">Instalar</button></div>`;
    $("#do-install").onclick = async () => { box.innerHTML = ''; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; };
  });
  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (iOS) box.innerHTML = `<div class="installhint"><span class="ii">📲</span><div class="it"><b>Instala Forja</b>: pulsa Compartir y luego «Añadir a pantalla de inicio».</div></div>`;
}

/* ===== EVENTOS ===== */
function wireStatic() {
  $$(".tab").forEach(t => t.addEventListener("click", () => go(t.dataset.tab)));
  $$("[data-goto]").forEach(el => el.addEventListener("click", () => go(el.dataset.goto)));
  $$("[data-edit]").forEach(el => el.addEventListener("click", () => { openSheet(editors[el.dataset.edit](dHoy())); sheetEl().querySelector("[data-save]").onclick = () => saveDaily(el.dataset.edit); }));
  $("#open-perfil").addEventListener("click", openPerfil);
  $("#open-biblio-1").addEventListener("click", openBiblio);
  $("#open-biblio-2").addEventListener("click", openBiblio);
  $("#open-import").addEventListener("click", openImport);
  $("#new-routine").addEventListener("click", newRoutine);
  $("#start-wk").addEventListener("click", startWorkout);
  $("#wk-back").addEventListener("click", () => { hideRest(); $("#wk-active").style.display = "none"; $("#wk-overview").style.display = "flex"; updateHero(); });
  $("#backdrop").addEventListener("click", closeSheet);
  $("#rt-minus").onclick = () => { restLeft = Math.max(1, restLeft - 15); restTotal = Math.max(restTotal, restLeft); updRest(); };
  $("#rt-plus").onclick = () => { restLeft += 15; restTotal = Math.max(restTotal, restLeft); updRest(); };
  $("#rt-skip").onclick = hideRest;
  // biblioteca
  $("#biblio-close").onclick = () => $("#biblio").classList.remove("open");
  $("#biblio-chips").addEventListener("click", e => { const b = e.target.closest("[data-g]"); if (!b) return; bGrupo = b.dataset.g; $$("#biblio-chips .fchip").forEach(c => c.classList.toggle("on", c.dataset.g === bGrupo)); renderBiblio(); });
  $("#biblio-search").addEventListener("input", e => { bSearch = norm(e.target.value); renderBiblio(); });
  $("#biblio-list").addEventListener("click", e => { const gc = e.target.closest("[data-gcard]"); if (gc) { bGrupo = gc.dataset.gcard; $$("#biblio-chips .fchip").forEach(c => c.classList.toggle("on", c.dataset.g === bGrupo)); renderBiblio(); return; } const b = e.target.closest("[data-detail]"); if (b) openDetail(b.dataset.detail); });
  // workout scroll delegation
  $("#wk-scroll").addEventListener("click", e => {
    const set = e.target.closest("[data-set]"), add = e.target.closest("[data-add]"), drop = e.target.closest("[data-drop]"), det = e.target.closest("[data-detail]"), rst = e.target.closest("[data-rest]");
    if (rst) { openRestSheet(+rst.dataset.rest); return; }
    if (det) { openDetail(det.dataset.detail); return; }
    if (add) { const ei = +add.dataset.add, l = session.ex[ei].sets[session.ex[ei].sets.length - 1]; session.ex[ei].sets.push({ peso: l ? l.peso : 20, reps: l ? l.reps : 10, rir: 2, done: false, drop: false }); saveLive(); renderSession(); return; }
    if (drop) { const ei = +drop.dataset.drop, l = session.ex[ei].sets[session.ex[ei].sets.length - 1]; session.ex[ei].sets.push({ peso: l ? Math.max(0, l.peso - 10) : 10, reps: 8, rir: 0, done: false, drop: true }); saveLive(); renderSession(); toast("Drop set añadido"); return; }
    if (set) { const [ei, si] = set.dataset.set.split("-").map(Number); openSetSheet(ei, si); }
  });
  // overview: exercise detail + mis rutinas
  $("#ov-list").addEventListener("click", e => { const b = e.target.closest("[data-detail]"); if (b) openDetail(b.dataset.detail); });
  $("#mis-rutinas").addEventListener("click", e => { const m = e.target.closest("[data-rtmenu]"); if (m) { openRoutineMenu(m.dataset.rtmenu); return; } const b = e.target.closest("[data-rutina]"); if (b) setActiveRoutine(b.dataset.rutina); });
  // fotos
  $("#foto-input").addEventListener("change", e => { handleFoto(e.target.files && e.target.files[0]); e.target.value = ''; });
  $("#fotos-grid").addEventListener("click", e => { const b = e.target.closest("[data-foto]"); if (b) openFoto(+b.dataset.foto); });
  // exportar
  $("#do-export").onclick = () => { refreshExport(); $("#export-preview").scrollIntoView({ behavior: "smooth", block: "center" }); toast("<b>Informe listo</b> · cópialo abajo ↓"); };
  $("#copy-export").onclick = async () => { try { await navigator.clipboard.writeText(buildReport()); toast("Copiado ✓ pégalo en el chat"); } catch (e) { selectText($("#export-preview")); toast("Selecciona y copia ↑"); } };
  $("#gen-routine").onclick = () => { const box = $("#routine-code"); box.style.display = 'block'; box.textContent = encodeRoutine(activeRoutine()); $("#copy-routine").style.display = 'block'; box.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Código de rutina generado ↓'); };
  $("#copy-routine").onclick = async () => { try { await navigator.clipboard.writeText($("#routine-code").textContent); toast('Código copiado ✓'); } catch (e) { selectText($("#routine-code")); toast('Selecciona y copia ↑'); } };
  $("#backup-export").onclick = backupExport;
  $("#backup-file").addEventListener("change", e => { backupImport(e.target.files && e.target.files[0]); e.target.value = ''; });
  window.addEventListener("resize", () => { if (cur === "progreso") drawCharts(); });
  // teclado móvil: sube la hoja por encima del teclado. Referencia = mayor altura vista del viewport visual (estable en iOS).
  if (window.visualViewport) {
    let fullVH = window.visualViewport.height || 0;
    const onVV = () => { const vv = window.visualViewport; if (vv.height > fullVH) fullVH = vv.height; const kb = Math.max(0, Math.round(fullVH - vv.height)); document.documentElement.style.setProperty('--kb', (kb > 80 ? kb : 0) + 'px'); };
    window.visualViewport.addEventListener('resize', onVV);
    window.visualViewport.addEventListener('scroll', onVV);
  }
  // red de seguridad: al enfocar un campo, si el teclado no se detectó, sube la hoja igualmente
  sheetEl().addEventListener('focusin', e => {
    const t = e.target; if (!t || !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    setTimeout(() => { const kb = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--kb')) || 0; if (kb < 80) document.documentElement.style.setProperty('--kb', '44vh'); try { t.scrollIntoView({ block: 'center' }); } catch (_) {} }, 320);
  });
}
function selectText(el) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
