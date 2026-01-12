const API_BASE = (window.__API_BASE__ || "").replace(/\/$/, "");
const page = document.body?.dataset?.page || "";
const MIN_SLEEP_MINUTES = Number(window.__MIN_SLEEP_MINUTES__ || 345); // 5h45 = 345

function $(id) { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pct(v) {
  if (v == null || Number.isNaN(v)) return "—";
  return `${Number(v).toFixed(1)}%`;
}

function isoToday() { return new Date().toISOString().slice(0, 10); }
function isoMonth() { return new Date().toISOString().slice(0, 7); }

async function apiGet(path) {
  if (!API_BASE) throw new Error("Configura window.__API_BASE__ en dashboard/*.html");
  const resp = await fetch(`${API_BASE}${path}`, { headers: { "Accept": "application/json" } });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data) throw new Error(data?.error || `HTTP ${resp.status}`);
  return data;
}

function setActiveNav() {
  const map = { home: "home", monthly: "monthly", records: "records", media: "media" };
  const key = map[page] || "home";
  qsa(".navlink").forEach(a => {
    if (a.dataset.nav === key) a.classList.add("active");
  });
}

function meetsMinSleep(obj) {
  // Prefer duration_min if present
  const dm = obj?.duration_min;
  if (typeof dm === "number" && Number.isFinite(dm)) return dm >= MIN_SLEEP_MINUTES;

  // Fallback parse from sleep_text: "X h Y min"
  const t = String(obj?.sleep_text || "");
  const m = t.match(/(\d+)\s*h\s*(\d+)\s*min/i);
  if (!m) return null;
  const h = Number(m[1]); const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  return (h * 60 + mi) >= MIN_SLEEP_MINUTES;
}

function pillMin(obj) {
  const ok = meetsMinSleep(obj);
  if (ok === null) return `<span class="pill">—</span>`;
  return ok ? `<span class="pill pill-ok">Cumple</span>` : `<span class="pill pill-bad">No cumple</span>`;
}

function fileLinks(image_url, pdf_url) {
  const parts = [];
  if (image_url) parts.push(`<a class="link" href="${escapeHtml(image_url)}" target="_blank" rel="noopener">Imagen</a>`);
  if (pdf_url) parts.push(`<a class="link" href="${escapeHtml(pdf_url)}" target="_blank" rel="noopener">PDF</a>`);
  return parts.length ? parts.join(" · ") : `<span class="muted">—</span>`;
}

/* ---------------------------
   HOME (Hoy)
--------------------------- */

function renderHome(today) {
  const meta = $("todayMeta");
  const cards = $("cardsGrid");
  const registeredBody = qs("#registeredTable tbody");
  const pendingBody = qs("#pendingTable tbody");

  const holidayInfo = (today.holiday_summary && today.holiday_summary.length)
    ? today.holiday_summary.map(h => `${h.country_code}: ${h.name}${h.is_required ? " (obligatorio)" : ""}`).join(" | ")
    : "Sin feriado configurado";

  meta.textContent = `${today.date} — ${holidayInfo}`;

  const reg = today.registered || [];
  const pend = today.pending || [];

  registeredBody.innerHTML = reg.map(r => {
    const badge = r.required_today ? `<span class="pill pill-ok">OK</span>` : `<span class="pill pill-warn">No requerido</span>`;
    return `<tr>
      <td>${escapeHtml(r.worker_name)}</td>
      <td>${escapeHtml(r.sleep_text || "—")}</td>
      <td>${badge}</td>
      <td>${pillMin(r)}</td>
      <td>${fileLinks(r.image_url, r.pdf_url)}</td>
    </tr>`;
  }).join("");
  if (!reg.length) registeredBody.innerHTML = `<tr><td colspan="5" class="muted">Sin registros</td></tr>`;

  pendingBody.innerHTML = pend.map(p => `<tr>
    <td>${escapeHtml(p.worker_name)}</td>
    <td class="muted">No registró (día requerido)</td>
  </tr>`).join("");
  if (!pend.length) pendingBody.innerHTML = `<tr><td colspan="2" class="muted">Nadie pendiente</td></tr>`;

  // Cards (entregas del día)
  const all = [...new Set([...reg.map(r => r.worker_name), ...pend.map(p => p.worker_name)])]
    .sort((a,b)=>a.localeCompare(b));

  cards.innerHTML = all.map(name => {
    const rk = reg.find(x => x.worker_name === name);
    const pk = pend.find(x => x.worker_name === name);
    let status, cls, sleep, links;

    if (rk) {
      const okMin = meetsMinSleep(rk);
      if (rk.required_today) {
        if (okMin === false) { status = "No cumple (mín 5 h 45 min)"; cls = "bad"; }
        else { status = "Cumple"; cls = "ok"; }
      } else {
        status = "No requerido"; cls = "warn";
      }
      sleep = rk.sleep_text || "—";
      links = fileLinks(rk.image_url, rk.pdf_url);
    } else if (pk) {
      status = "Pendiente";
      cls = "bad";
      sleep = "—";
      links = `<span class="muted">—</span>`;
    } else {
      status = "—";
      cls = "neutral";
      sleep = "—";
      links = `<span class="muted">—</span>`;
    }

    return `<div class="card-mini ${cls}">
      <div class="card-mini-top">
        <div class="name">${escapeHtml(name)}</div>
        <div class="status">${status}</div>
      </div>
      <div class="sleep">${escapeHtml(sleep)}</div>
      <div class="files">${links}</div>
    </div>`;
  }).join("");

  if (!all.length) {
    cards.innerHTML = `<div class="muted">Aún no hay trabajadores activos. Se crean automáticamente cuando llega el primer registro.</div>`;
  }
}

async function refreshHome() {
  const date = $("todayPicker").value;
  $("refreshBtn").disabled = true;
  $("refreshBtn").textContent = "Actualizando...";
  try {
    const data = await apiGet(`/api/today?date=${encodeURIComponent(date)}`);
    renderHome(data);
  } finally {
    $("refreshBtn").disabled = false;
    $("refreshBtn").textContent = "Actualizar";
  }
}

function initHome() {
  $("apiLabel").textContent = API_BASE || "(no configurado)";
  $("todayPicker").value = isoToday();
  $("refreshBtn").addEventListener("click", refreshHome);
  $("todayPicker").addEventListener("change", refreshHome);
  refreshHome().catch(err => alert(err.message || err));
}

/* ---------------------------
   MONTHLY
--------------------------- */

let chart = null;
let rankingData = [];

function renderMonthly(kpi, rows, month) {
  $("kpiCompliance").textContent = kpi.cumplimiento_promedio_pct == null ? "—" : pct(kpi.cumplimiento_promedio_pct);
  $("kpiSleepAvg").textContent = kpi.promedio_sueno_mes || "—";

  const top = $("kpiTop3"); top.innerHTML = "";
  (kpi.top3 || []).forEach(x => {
    const li = document.createElement("li");
    li.textContent = `${x.worker_name} — ${x.cumplimiento_pct == null ? "—" : pct(x.cumplimiento_pct)}`;
    top.appendChild(li);
  });
  if (!(kpi.top3 || []).length) top.innerHTML = "<li>—</li>";

  const bottom = $("kpiBottom3"); bottom.innerHTML = "";
  (kpi.bottom3 || []).forEach(x => {
    const li = document.createElement("li");
    li.textContent = `${x.worker_name} — ${x.cumplimiento_pct == null ? "—" : pct(x.cumplimiento_pct)}`;
    bottom.appendChild(li);
  });
  if (!(kpi.bottom3 || []).length) bottom.innerHTML = "<li>—</li>";

  $("monthMeta").textContent = `Mes: ${month} · Trabajadores: ${rows.length}`;

  if (window.Chart) {
    const labels = rows.map(r => r.worker_name);
    const values = rows.map(r => (typeof r.cumplimiento_pct === "number" ? r.cumplimiento_pct : 0));
    const ctx = $("rankChart");
    if (chart) chart.destroy();

    chart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: "Cumplimiento (%)", data: values, borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, max: 100 } },
        plugins: { legend: { display: false } }
      }
    });
  }

  renderRankingTable($("rankFilter").value);
}

function renderRankingTable(filterText = "") {
  const q = (filterText || "").trim().toLowerCase();
  const body = qs("#rankingTable tbody");

  const rows = rankingData.filter(r => r.worker_name.toLowerCase().includes(q));
  body.innerHTML = rows.map(r => {
    const compliance = r.cumplimiento_pct == null ? "—" : pct(r.cumplimiento_pct);
    const width = r.cumplimiento_pct == null ? 0 : Math.max(0, Math.min(100, r.cumplimiento_pct));
    return `<tr>
      <td>${escapeHtml(r.worker_name)}</td>
      <td class="num">${r.dias_con_registro}</td>
      <td class="num">${r.dias_requeridos}</td>
      <td>
        <div class="barrow">
          <span class="mono">${compliance}</span>
          <div class="bar"><div class="barfill" style="width:${width}%"></div></div>
        </div>
      </td>
      <td>${escapeHtml(r.promedio_sueno || "—")}</td>
      <td>${escapeHtml(r.max_sueno || "—")}</td>
      <td>${escapeHtml(r.min_sueno || "—")}</td>
    </tr>`;
  }).join("");

  if (!rows.length) body.innerHTML = `<tr><td colspan="7" class="muted">Sin resultados</td></tr>`;
}

async function refreshMonthly() {
  const month = $("monthPicker").value;
  $("refreshBtn").disabled = true;
  $("refreshBtn").textContent = "Actualizando...";
  try {
    const resp = await apiGet(`/api/ranking?month=${encodeURIComponent(month)}`);
    rankingData = (resp.ranking || []).slice().sort((a,b)=>(b.cumplimiento_pct||0)-(a.cumplimiento_pct||0));
    renderMonthly(resp.kpi || {}, rankingData, month);
  } finally {
    $("refreshBtn").disabled = false;
    $("refreshBtn").textContent = "Actualizar";
  }
}

function initMonthly() {
  $("apiLabel").textContent = API_BASE || "(no configurado)";
  $("monthPicker").value = isoMonth();
  $("refreshBtn").addEventListener("click", refreshMonthly);
  $("monthPicker").addEventListener("change", refreshMonthly);
  $("rankFilter").addEventListener("input", () => renderRankingTable($("rankFilter").value));
  refreshMonthly().catch(err => alert(err.message || err));
}

/* ---------------------------
   RECORDS
--------------------------- */

let entriesData = [];

function renderEntries(filterText = "") {
  const q = (filterText || "").trim().toLowerCase();
  const body = qs("#entriesTable tbody");

  const rows = entriesData.filter(e => e.worker_name.toLowerCase().includes(q));
  body.innerHTML = rows.map(e => `<tr>
    <td class="mono">${escapeHtml(e.date)}</td>
    <td>${escapeHtml(e.worker_name)}</td>
    <td>${escapeHtml(e.sleep_text)}</td>
    <td>${escapeHtml(e.source || "—")}</td>
    <td>${pillMin(e)}</td>
    <td>${fileLinks(e.image_url, e.pdf_url)}</td>
    <td class="mono">${escapeHtml(e.created_at || "—")}</td>
  </tr>`).join("");

  if (!rows.length) body.innerHTML = `<tr><td colspan="7" class="muted">Sin resultados</td></tr>`;
}

async function refreshRecords() {
  const month = $("monthPicker").value;
  $("refreshBtn").disabled = true;
  $("refreshBtn").textContent = "Actualizando...";
  try {
    const resp = await apiGet(`/api/entries?month=${encodeURIComponent(month)}`);
    entriesData = resp.entries || [];
    $("entriesMeta").textContent = `Mes: ${month} · Consolidados: ${resp.consolidated_count} (raw: ${resp.raw_count})`;
    renderEntries($("entryFilter").value);
  } finally {
    $("refreshBtn").disabled = false;
    $("refreshBtn").textContent = "Actualizar";
  }
}

function initRecords() {
  $("apiLabel").textContent = API_BASE || "(no configurado)";
  $("monthPicker").value = isoMonth();
  $("refreshBtn").addEventListener("click", refreshRecords);
  $("monthPicker").addEventListener("change", refreshRecords);
  $("entryFilter").addEventListener("input", () => renderEntries($("entryFilter").value));
  refreshRecords().catch(err => alert(err.message || err));
}

/* ---------------------------
   MEDIA
--------------------------- */

let workersList = [];

function renderWorkerSelect() {
  const sel = $("workerSelect");
  sel.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "Todos";
  sel.appendChild(optAll);

  for (const w of workersList) {
    const opt = document.createElement("option");
    opt.value = w.worker_key;
    opt.textContent = w.worker_name;
    sel.appendChild(opt);
  }
}

async function loadWorkers() {
  const resp = await apiGet(`/api/workers`);
  workersList = resp.workers || [];
  renderWorkerSelect();
}

function renderMediaTable(workerKeyFilter) {
  const body = qs("#mediaTable tbody");
  const rows = entriesData.filter(e => (e.image_url || e.pdf_url));
  const filtered = workerKeyFilter ? rows.filter(e => e.worker_key === workerKeyFilter) : rows;

  body.innerHTML = filtered.map(e => `<tr>
    <td class="mono">${escapeHtml(e.date)}</td>
    <td>${escapeHtml(e.worker_name)}</td>
    <td>${escapeHtml(e.sleep_text)}</td>
    <td>${pillMin(e)}</td>
    <td>${e.image_url ? `<a class="btn-mini" href="${escapeHtml(e.image_url)}" target="_blank" rel="noopener">Descargar</a>` : `<span class="muted">—</span>`}</td>
    <td>${e.pdf_url ? `<a class="btn-mini" href="${escapeHtml(e.pdf_url)}" target="_blank" rel="noopener">Descargar</a>` : `<span class="muted">—</span>`}</td>
  </tr>`).join("");

  if (!filtered.length) body.innerHTML = `<tr><td colspan="6" class="muted">No hay archivos para el filtro seleccionado</td></tr>`;
}

async function refreshMedia() {
  const month = $("monthPicker").value;
  const workerKey = $("workerSelect").value;

  $("refreshBtn").disabled = true;
  $("refreshBtn").textContent = "Actualizando...";
  try {
    const resp = await apiGet(`/api/entries?month=${encodeURIComponent(month)}`);
    entriesData = resp.entries || [];
    const totalWithFiles = entriesData.filter(e => e.image_url || e.pdf_url).length;
    $("mediaMeta").textContent = `Mes: ${month} · Con archivos: ${totalWithFiles}`;
    renderMediaTable(workerKey);
  } finally {
    $("refreshBtn").disabled = false;
    $("refreshBtn").textContent = "Actualizar";
  }
}

function initMedia() {
  $("apiLabel").textContent = API_BASE || "(no configurado)";
  $("monthPicker").value = isoMonth();

  $("refreshBtn").addEventListener("click", refreshMedia);
  $("monthPicker").addEventListener("change", refreshMedia);
  $("workerSelect").addEventListener("change", refreshMedia);

  loadWorkers()
    .then(refreshMedia)
    .catch(err => alert(err.message || err));
}

/* ---------------------------
   Init
--------------------------- */

setActiveNav();

if (page === "home") initHome();
if (page === "monthly") initMonthly();
if (page === "records") initRecords();
if (page === "media") initMedia();
