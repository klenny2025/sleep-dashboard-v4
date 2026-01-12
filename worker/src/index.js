export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // CORS preflight
      if (request.method === "OPTIONS") {
        return corsPreflight(request, env);
      }

      // Router
      if (url.pathname === "/api/entries" && request.method === "POST") {
        return withCORS(await postEntry(request, env), request, env);
      }
      if (url.pathname === "/api/entries" && request.method === "GET") {
        return withCORS(await getEntries(request, env), request, env);
      }
      if (url.pathname === "/api/ranking" && request.method === "GET") {
        return withCORS(await getRanking(request, env), request, env);
      }
      if (url.pathname === "/api/today" && request.method === "GET") {
        return withCORS(await getToday(request, env), request, env);
      }
      if (url.pathname === "/api/holidays" && request.method === "GET") {
        return withCORS(await getHolidays(request, env), request, env);
      }
      if (url.pathname === "/api/workers" && request.method === "GET") {
        return withCORS(await getWorkers(request, env), request, env);
      }

      
    // Demo helpers (admin)
    if (url.pathname === "/api/demo/seed" && request.method === "POST") {
      const unauth = requireApiKey_(request, env);
      if (unauth) return withCORS(unauth, request, env);
      const res = await demoSeed_(request, env);
      return withCORS(res, request, env);
    }
    if (url.pathname === "/api/demo/clear" && (request.method === "POST" || request.method === "DELETE")) {
      const unauth = requireApiKey_(request, env);
      if (unauth) return withCORS(unauth, request, env);
      const res = await demoClear_(env);
      return withCORS(res, request, env);
    }

if (url.pathname === "/health") {
        return withCORS(json({ ok: true, service: "sleep-dashboard-api" }), request, env);
      }

      return withCORS(json({ ok: false, error: "Not found" }, 404), request, env);
    } catch (err) {
      return withCORS(json({ ok: false, error: "Internal error", detail: String(err?.message || err) }, 500), request, env);
    }
  },
};

/* -------------------------
   CORS helpers
------------------------- */

function getAllowedOrigin(request, env) {
  const reqOrigin = request.headers.get("Origin");
  const allow = (env.ALLOWED_ORIGIN || "*").trim();

  if (allow === "*") return "*";
  if (!reqOrigin) return allow.split(",")[0].trim();

  const list = allow.split(",").map(s => s.trim()).filter(Boolean);
  return list.includes(reqOrigin) ? reqOrigin : (list[0] || reqOrigin);
}

function corsPreflight(request, env) {
  const origin = getAllowedOrigin(request, env);
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-KEY",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function withCORS(resp, request, env) {
  const origin = getAllowedOrigin(request, env);
  const h = new Headers(resp.headers);
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, X-API-KEY");
  h.set("Cache-Control", "no-store");
  return new Response(resp.body, { status: resp.status, headers: h });
}

/* -------------------------
   JSON helpers
------------------------- */

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function readJson(request) {
  const ct = request.headers.get("Content-Type") || "";
  if (!ct.includes("application/json")) return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function requireApiKey(request, env) {
  const got = request.headers.get("X-API-KEY") || "";
  const expected = env.API_KEY || "";
  if (!expected) throw new Error("API_KEY is not configured in Worker secrets");
  if (got !== expected) {
    const e = new Error("Unauthorized");
    e.status = 401;
    throw e;
  }
}

/* -------------------------
   Normalization & validation
------------------------- */

function normalizeWorkerKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function isValidMonth(month) {
  return /^\d{4}-\d{2}$/.test(month);
}

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function clampInt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.trunc(x);
}


function getMinSleepMinutes(env) {
  // Minutes required to be considered "cumple". Default: 5h45m = 345.
  const def = 345;
  const raw = env && env.MIN_SLEEP_MINUTES != null ? String(env.MIN_SLEEP_MINUTES).trim() : "";
  const x = parseInt(raw, 10);
  if (Number.isFinite(x) && x > 0 && x < 24 * 60) return x;
  return def;
}

function fmtDuration(h, m) {
  return `${h} h ${m} min`;
}

function toMinutes(h, m) {
  return (h * 60) + m;
}

function minutesToHM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return { h, m, text: fmtDuration(h, m) };
}

function monthRange(month) {
  const [yy, mm] = month.split("-").map(Number);
  const start = new Date(Date.UTC(yy, mm - 1, 1));
  const end = new Date(Date.UTC(yy, mm, 1));
  return { start, end };
}

function isoDateUTC(d) {
  return d.toISOString().slice(0, 10);
}

function addDaysUTC(d, days) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function weekdayUTC(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.getUTCDay(); // 0=Sun..6=Sat
}

function todayInTZ(tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

/* -------------------------
   DB helpers
------------------------- */

async function ensureWorker(env, worker_name, country_code) {
  const worker_key = normalizeWorkerKey(worker_name);
  if (!worker_key) throw Object.assign(new Error("worker_name is required"), { status: 400 });

  const row = await env.DB
    .prepare("SELECT * FROM workers WHERE worker_key = ? LIMIT 1")
    .bind(worker_key)
    .first();

  if (row) return row;

  const cc = (country_code || env.DEFAULT_COUNTRY || "PE").toUpperCase();
  const tz = env.DEFAULT_TIMEZONE || "America/Lima";
  const schedule = env.DEFAULT_REQUIRED_SCHEDULE || "MON_FRI";
  const excl = String(env.DEFAULT_EXCLUDE_HOLIDAYS || "1") === "1" ? 1 : 0;

  await env.DB.prepare(`
    INSERT INTO workers (worker_name, worker_key, country_code, timezone, required_schedule, exclude_holidays, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).bind(worker_name.trim(), worker_key, cc, tz, schedule, excl).run();

  const created = await env.DB
    .prepare("SELECT * FROM workers WHERE worker_key = ? LIMIT 1")
    .bind(worker_key)
    .first();

  return created;
}

async function listActiveWorkers(env) {
  const res = await env.DB
    .prepare("SELECT * FROM workers WHERE is_active = 1 ORDER BY worker_name ASC")
    .all();
  return res.results || [];
}

async function loadHolidaysForRange(env, startDateStr, endDateStr) {
  const res = await env.DB.prepare(`
    SELECT date, country_code, name, is_required
    FROM holidays
    WHERE date >= ? AND date < ?
  `).bind(startDateStr, endDateStr).all();

  const out = new Map(); // cc -> Map(date -> obj)
  for (const r of (res.results || [])) {
    const cc = String(r.country_code || "").toUpperCase();
    if (!out.has(cc)) out.set(cc, new Map());
    out.get(cc).set(r.date, { name: r.name, is_required: Number(r.is_required) || 0 });
  }
  return out;
}

function isRequiredForWorkerOnDate(worker, dateStr, holidayByCountry) {
  const schedule = worker.required_schedule || "MON_FRI";
  const cc = String(worker.country_code || "PE").toUpperCase();
  const exclH = Number(worker.exclude_holidays) === 1;

  const hmap = holidayByCountry.get(cc);
  const h = hmap ? hmap.get(dateStr) : null;
  const isHoliday = !!h;

  if (isHoliday && exclH && Number(h.is_required) === 0) {
    return { required: false, isHoliday: true, holidayName: h.name, holidayRequired: false };
  }

  const dow = weekdayUTC(dateStr); // 0 Sun .. 6 Sat
  const isMonFri = (dow >= 1 && dow <= 5);
  const isMonSat = (dow >= 1 && dow <= 6);

  if (schedule === "ALL_DAYS") {
    return { required: true, isHoliday, holidayName: h?.name || null, holidayRequired: !!h && Number(h.is_required) === 1 };
  }
  if (schedule === "MON_SAT") {
    return { required: isMonSat, isHoliday, holidayName: h?.name || null, holidayRequired: !!h && Number(h.is_required) === 1 };
  }
  return { required: isMonFri, isHoliday, holidayName: h?.name || null, holidayRequired: !!h && Number(h.is_required) === 1 };
}

/* -------------------------
   Consolidation
------------------------- */

function consolidateEntries(rows) {
  // key = worker_key|date => choose max duration, tie-breaker latest created_at
  const best = new Map();
  const rawCountByWorker = new Map();

  for (const r of rows) {
    const wk = r.worker_key;
    rawCountByWorker.set(wk, (rawCountByWorker.get(wk) || 0) + 1);

    const key = `${r.worker_key}|${r.date}`;
    const curr = best.get(key);
    if (!curr) {
      best.set(key, r);
      continue;
    }
    const d1 = Number(r.duration_min) || 0;
    const d0 = Number(curr.duration_min) || 0;

    if (d1 > d0) {
      best.set(key, r);
      continue;
    }
    if (d1 === d0) {
      const t1 = String(r.created_at || "");
      const t0 = String(curr.created_at || "");
      if (t1 > t0) best.set(key, r);
    }
  }

  const consolidated = Array.from(best.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.worker_name !== b.worker_name) return a.worker_name.localeCompare(b.worker_name);
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  });

  return { consolidated, rawCountByWorker };
}

/* -------------------------
   Handlers
------------------------- */

async function postEntry(request, env) {
  try {
    requireApiKey(request, env);
  } catch (e) {
    return json({ ok: false, error: "Unauthorized" }, e.status || 401);
  }

  const body = await readJson(request);
  if (!body) return json({ ok: false, error: "Invalid JSON body" }, 400);

  const worker_name = String(body.worker_name || "").trim();
  const date = String(body.date || "").trim();
  const source = String(body.source || "manual").trim();
  const chat_id = body.chat_id != null ? String(body.chat_id) : null;
  const file_id = body.file_id != null ? String(body.file_id) : null;

  const sleep_h = clampInt(body.sleep_h);
  const sleep_m = clampInt(body.sleep_m);

  const notes = body.notes != null ? String(body.notes) : null;
  const raw_text = body.raw_text != null ? String(body.raw_text) : null;
  const image_url = body.image_url != null ? String(body.image_url) : null;
  const pdf_url = body.pdf_url != null ? String(body.pdf_url) : null;
  const country_code = body.country_code != null ? String(body.country_code) : null;

  if (!worker_name) return json({ ok: false, error: "worker_name is required" }, 400);
  if (!isValidDate(date)) return json({ ok: false, error: "date must be YYYY-MM-DD" }, 400);

  if (sleep_h == null || sleep_h < 0 || sleep_h > 24) {
    return json({ ok: false, error: "sleep_h must be an integer between 0 and 24" }, 400);
  }
  if (sleep_m == null || sleep_m < 0 || sleep_m > 59) {
    return json({ ok: false, error: "sleep_m must be an integer between 0 and 59" }, 400);
  }

  const worker = await ensureWorker(env, worker_name, country_code);
  const worker_key = worker.worker_key;
  const worker_id = worker.id;

  const duration_min = toMinutes(sleep_h, sleep_m);
  const sleep_text = fmtDuration(sleep_h, sleep_m);
  const id = crypto.randomUUID();

  await env.DB.prepare(`
    INSERT INTO workers_sleep_entries
      (id, worker_id, worker_name, worker_key, date, sleep_h, sleep_m, sleep_text, duration_min, source, chat_id, file_id, notes, raw_text, image_url, pdf_url)
    VALUES
      (?,  ?,        ?,          ?,         ?,    ?,       ?,       ?,          ?,           ?,      ?,       ?,       ?,     ?,        ?,         ?)
  `).bind(
    id,
    worker_id,
    worker_name,
    worker_key,
    date,
    sleep_h,
    sleep_m,
    sleep_text,
    duration_min,
    source || "manual",
    chat_id,
    file_id,
    notes,
    raw_text,
    image_url,
    pdf_url
  ).run();

  return json({
    ok: true,
    id,
    worker_name,
    worker_key,
    date,
    sleep_h,
    sleep_m,
    sleep_text,
    duration_min,
    source,
  }, 201);
}

async function getEntries(request, env) {
  const url = new URL(request.url);
  const month = String(url.searchParams.get("month") || "").trim();
  if (!isValidMonth(month)) return json({ ok: false, error: "month must be YYYY-MM" }, 400);

  const { start, end } = monthRange(month);
  const startStr = isoDateUTC(start);
  const endStr = isoDateUTC(end);

  const res = await env.DB.prepare(`
    SELECT
      id, worker_id, worker_name, worker_key, date,
      sleep_h, sleep_m, sleep_text, duration_min,
      source, chat_id, file_id, notes, raw_text, image_url, pdf_url, created_at
    FROM workers_sleep_entries
    WHERE date >= ? AND date < ?
    ORDER BY date ASC, worker_name ASC, created_at ASC
  `).bind(startStr, endStr).all();

  const rows = res.results || [];
  const { consolidated } = consolidateEntries(rows);

  return json({
    ok: true,
    month,
    range: { start: startStr, end_exclusive: endStr },
    raw_count: rows.length,
    consolidated_count: consolidated.length,
    entries: consolidated,
  });
}

async function getRanking(request, env) {
  const url = new URL(request.url);
  const month = String(url.searchParams.get("month") || "").trim();
  if (!isValidMonth(month)) return json({ ok: false, error: "month must be YYYY-MM" }, 400);

  const { start, end } = monthRange(month);
  const startStr = isoDateUTC(start);
  const endStr = isoDateUTC(end);

  const workers = await listActiveWorkers(env);
  const minSleepMinutes = getMinSleepMinutes(env);
  const holidayByCountry = await loadHolidaysForRange(env, startStr, endStr);

  const res = await env.DB.prepare(`
    SELECT
      id, worker_name, worker_key, date,
      sleep_text, duration_min, source, created_at
    FROM workers_sleep_entries
    WHERE date >= ? AND date < ?
    ORDER BY created_at ASC
  `).bind(startStr, endStr).all();
  const rows = res.results || [];

  const { consolidated, rawCountByWorker } = consolidateEntries(rows);

  const byWorker = new Map();
  for (const e of consolidated) {
    if (!byWorker.has(e.worker_key)) byWorker.set(e.worker_key, []);
    byWorker.get(e.worker_key).push(e);
  }

  const allDates = [];
  for (let d = new Date(start.getTime()); d < end; d = addDaysUTC(d, 1)) {
    allDates.push(isoDateUTC(d));
  }

  const ranking = [];
  for (const w of workers) {
    const wk = w.worker_key;
    const entries = byWorker.get(wk) || [];

    let days_required = 0;
    for (const ds of allDates) {
      const r = isRequiredForWorkerOnDate(w, ds, holidayByCountry);
      if (r.required) days_required++;
    }

    const days_with_record = entries.length;
    const durations = entries.map(x => Number(x.duration_min) || 0);
    const total_registros = rawCountByWorker.get(wk) || 0;

    let avgMin = null, maxMin = null, minMin = null;
    if (durations.length > 0) {
      const sum = durations.reduce((a, b) => a + b, 0);
      avgMin = Math.round(sum / durations.length);
      maxMin = Math.max(...durations);
      minMin = Math.min(...durations);
    }

    const cumplimiento_pct = days_required > 0
      ? Math.round((days_with_record / days_required) * 1000) / 10
      : null;

    ranking.push({
      worker_name: w.worker_name,
      worker_key: wk,
      country_code: w.country_code,
      required_schedule: w.required_schedule,
      exclude_holidays: Number(w.exclude_holidays) === 1,

      dias_con_registro: days_with_record,
      dias_requeridos: days_required,
      cumplimiento_pct,

      promedio_sueno: avgMin == null ? null : minutesToHM(avgMin).text,
      max_sueno: maxMin == null ? null : minutesToHM(maxMin).text,
      min_sueno: minMin == null ? null : minutesToHM(minMin).text,

      total_registros,
    });
  }

  const complianceVals = ranking
    .map(r => (typeof r.cumplimiento_pct === "number" ? r.cumplimiento_pct : null))
    .filter(v => v != null);

  const avgCompliance = complianceVals.length
    ? Math.round((complianceVals.reduce((a,b)=>a+b,0)/complianceVals.length) * 10) / 10
    : null;

  const avgSleepMins = ranking
    .map(r => r.promedio_sueno)
    .filter(Boolean)
    .map(txt => {
      const m = /(\d+)\s*h\s*(\d+)\s*min/.exec(txt);
      if (!m) return null;
      return Number(m[1]) * 60 + Number(m[2]);
    })
    .filter(v => v != null);

  const avgSleep = avgSleepMins.length
    ? minutesToHM(Math.round(avgSleepMins.reduce((a,b)=>a+b,0) / avgSleepMins.length)).text
    : null;

  const sorted = [...ranking].sort((a, b) => {
    const av = (typeof a.cumplimiento_pct === "number") ? a.cumplimiento_pct : -1;
    const bv = (typeof b.cumplimiento_pct === "number") ? b.cumplimiento_pct : -1;
    return bv - av;
  });

  const top3 = sorted.slice(0, 3).map(r => ({ worker_name: r.worker_name, cumplimiento_pct: r.cumplimiento_pct }));
  const bottom3 = sorted.slice(-3).reverse().map(r => ({ worker_name: r.worker_name, cumplimiento_pct: r.cumplimiento_pct }));

  return json({
    ok: true,
    month,
    range: { start: startStr, end_exclusive: endStr },
    kpi: {
      cumplimiento_promedio_pct: avgCompliance,
      promedio_sueno_mes: avgSleep,
      top3,
      bottom3,
    },
    ranking,
  });
}

async function getToday(request, env) {
  const url = new URL(request.url);
  let date = String(url.searchParams.get("date") || "").trim();

  if (!date) {
    date = todayInTZ(env.DEFAULT_TIMEZONE || "America/Lima");
  }
  if (!isValidDate(date)) return json({ ok: false, error: "date must be YYYY-MM-DD" }, 400);

  const workers = await listActiveWorkers(env);
  const minSleepMinutes = getMinSleepMinutes(env);

  const d0 = date;
  const d1 = isoDateUTC(addDaysUTC(new Date(`${date}T00:00:00Z`), 1));
  const holidayByCountry = await loadHolidaysForRange(env, d0, d1);

  const res = await env.DB.prepare(`
    SELECT id, worker_name, worker_key, date, sleep_text, duration_min, source, created_at, image_url, pdf_url
    FROM workers_sleep_entries
    WHERE date = ?
    ORDER BY created_at ASC
  `).bind(date).all();

  const rows = res.results || [];
  const { consolidated } = consolidateEntries(rows);

  const registeredMap = new Map();
  for (const e of consolidated) registeredMap.set(e.worker_key, e);

  const registered = [];
  const pending = [];
  const notRequired = [];

  for (const w of workers) {
    const req = isRequiredForWorkerOnDate(w, date, holidayByCountry);
    const e = registeredMap.get(w.worker_key);

    if (e) {
      const item = {
        worker_name: w.worker_name,
        worker_key: w.worker_key,
        sleep_text: e.sleep_text,
        duration_min: e.duration_min,
        min_sleep_minutes: minSleepMinutes,
        meets_min: e.duration_min != null ? (e.duration_min >= minSleepMinutes) : null,
        source: e.source,
        created_at: e.created_at,
        image_url: e.image_url,
        pdf_url: e.pdf_url,
        required_today: req.required,
        is_holiday: req.isHoliday,
        holiday_name: req.holidayName,
      };
      registered.push(item);
      if (!req.required) notRequired.push(item);
    } else {
      if (req.required) {
        pending.push({
          worker_name: w.worker_name,
          worker_key: w.worker_key,
          required_today: true,
          is_holiday: req.isHoliday,
          holiday_name: req.holidayName,
        });
      }
    }
  }

  const holidaySummary = [];
  for (const w of workers) {
    const cc = String(w.country_code || "PE").toUpperCase();
    const h = holidayByCountry.get(cc)?.get(date);
    if (h) holidaySummary.push({ country_code: cc, name: h.name, is_required: !!Number(h.is_required) });
  }

  return json({
    ok: true,
    date,
    registered_count: registered.length,
    pending_count: pending.length,
    registered,
    pending,
    registered_not_required: notRequired,
    holiday_summary: dedupeHolidaySummary(holidaySummary),
  });
}

function dedupeHolidaySummary(list) {
  const seen = new Set();
  const out = [];
  for (const x of list) {
    const k = `${x.country_code}|${x.name}|${x.is_required ? 1 : 0}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}

async function getHolidays(request, env) {
  const url = new URL(request.url);
  const year = String(url.searchParams.get("year") || "").trim();
  const country = String(url.searchParams.get("country") || "").trim().toUpperCase();

  if (!/^\d{4}$/.test(year)) return json({ ok: false, error: "year must be YYYY" }, 400);

  const start = `${year}-01-01`;
  const end = `${Number(year) + 1}-01-01`;

  let q = `
    SELECT date, country_code, name, is_required
    FROM holidays
    WHERE date >= ? AND date < ?
  `;
  const binds = [start, end];

  if (country) {
    q += " AND country_code = ? ";
    binds.push(country);
  }
  q += " ORDER BY date ASC, country_code ASC";

  const res = await env.DB.prepare(q).bind(...binds).all();
  return json({ ok: true, year, country: country || null, holidays: res.results || [] });
}

async function getWorkers(request, env) {
  const workers = await listActiveWorkers(env);
  const minSleepMinutes = getMinSleepMinutes(env);
  return json({
    ok: true,
    workers: workers.map(w => ({
      worker_name: w.worker_name,
      worker_key: w.worker_key,
      country_code: w.country_code,
      timezone: w.timezone,
      required_schedule: w.required_schedule,
      exclude_holidays: Number(w.exclude_holidays) === 1,
      is_active: Number(w.is_active) === 1,
    })),
  });
}


function requireApiKey_(request, env){
  const expected = (env.API_KEY || "").toString().trim();
  if (!expected) return null; // API key not configured => do not block
  const got = (request.headers.get("X-API-KEY") || "").toString().trim();
  if (!got || got !== expected){
    return json({ ok:false, error:"Unauthorized", detail:"Missing/invalid X-API-KEY" }, { status: 401 });
  }
  return null;
}

async function demoClear_(env){
  await env.DB.prepare("DELETE FROM workers_sleep_entries").run();
  await env.DB.prepare("DELETE FROM workers").run();
  return json({ ok:true, cleared:true });
}

async function demoSeed_(request, env){
  const url = new URL(request.url);
  const date = (url.searchParams.get("date") || todayInTZ(env.DEFAULT_TIMEZONE || "UTC")).slice(0,10);
  // Reset current demo data (workers + entries)
  await demoClear_(env);

  const origin = ((env.DASHBOARD_ORIGIN || env.ALLOWED_ORIGIN || "") + "").replace(/\/$/, "");
  const img = origin ? `${origin}/assets/demo-image.png` : null;
  const pdf = origin ? `${origin}/assets/demo.pdf` : null;

  const workers = [
    { key: "carlos_diaz", name: "Carlos D\u00EDaz", schedule: "MON_FRI" },
    { key: "juan_perez",  name: "Juan P\u00E9rez",  schedule: "MON_FRI" },
    { key: "luis_gomez",  name: "Luis G\u00F3mez",  schedule: "MON_FRI" },
  ];

  const now = new Date().toISOString();

  for (const w of workers){
    await env.DB.prepare(
      "INSERT INTO workers (worker_key, worker_name, required_schedule, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(w.key, w.name, w.schedule, now, now).run();
  }

  const entries = [
    { key: "carlos_diaz", minutes: 0,   text: "0 h 0 min"   },
    { key: "juan_perez",  minutes: 450, text: "7 h 30 min"  },
    { key: "luis_gomez",  minutes: 255, text: "4 h 15 min"  },
  ];

  for (const e of entries){
    await env.DB.prepare(
      "INSERT INTO workers_sleep_entries (worker_key, entry_date, sleep_minutes, sleep_text, source, image_url, pdf_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(e.key, date, e.minutes, e.text, "demo", img, pdf, now, now).run();
  }

  return json({ ok:true, seeded:true, date, workers: workers.length, entries: entries.length, image_url: img, pdf_url: pdf });
}
