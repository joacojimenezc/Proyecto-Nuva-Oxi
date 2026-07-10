// Los datos ya no se leen de un archivo publico: se piden a /api/data con la
// clave, que el servidor valida (el Excel vive en el repo privado, no se publica).
const DATA_API = "/api/data";

const state = {
  workbook: null,
  sheets: {},
  view: "dashboard",
  registrySheet: "Cobertura",
  filters: {},
  dateFrom: "",
  dateTo: "",
  search: ""
};

const $ = (sel) => document.querySelector(sel);
const app = $("#app");

function esc(v){
  return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function norm(v){
  return String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
}
function n(v){
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/\$/g,"").replace(/\./g,"").replace(",",".").trim();
  const x = Number(s);
  return Number.isFinite(x) ? x : 0;
}
function money(v){ return "$" + Math.round(n(v)).toLocaleString("es-CL"); }
function num(v){ return Math.round(n(v)).toLocaleString("es-CL"); }
function pct(v){ return Math.round(n(v) * 100) + "%"; }
function isBlank(v){ return v == null || String(v).trim() === ""; }
function excelDate(v){
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  if (typeof v === "number" && v > 20000 && v < 90000) {
    return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0,10);
  }
  const s = String(v ?? "").trim();
  if (!s) return "";
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0,10);
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  }
  return s.slice(0,10);
}
function daysSince(dateText){
  const iso = excelDate(dateText);
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 864e5);
}
function first(row, names){
  for (const name of names) {
    if (row[name] != null && row[name] !== "") return row[name];
  }
  const keys = Object.keys(row);
  for (const name of names) {
    const k = keys.find(x => norm(x) === norm(name));
    if (k && row[k] != null && row[k] !== "") return row[k];
  }
  return "";
}
function badge(text){
  const t = String(text || "");
  const x = norm(t);
  let cls = "b-gray";
  if (/alta|critico|vencida|atrasado|sin venta|reponer/.test(x)) cls = "b-red";
  else if (/media|observar|pendiente|parcial|baja|ajustado/.test(x)) cls = "b-amber";
  else if (/ok|activo|vigente|pagada|venta ok/.test(x)) cls = "b-green";
  else if (/prospecto|credito|contado/.test(x)) cls = "b-blue";
  return `<span class="badge ${cls}">${esc(t || "Sin dato")}</span>`;
}

function rowsFromSheet(ws){
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
  const headerIndex = aoa.findIndex(row => row.filter(v => !isBlank(v)).length >= 2);
  if (headerIndex < 0) return { headers: [], rows: [] };
  const headers = aoa[headerIndex].map((h, i) => String(h || `Col ${i + 1}`).trim());
  const rows = aoa.slice(headerIndex + 1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] ?? "");
    return obj;
  }).filter(row => Object.values(row).some(v => !isBlank(v)));
  return { headers, rows };
}

function getRows(name){ return state.sheets[name]?.rows || []; }
function getHeaders(name){ return state.sheets[name]?.headers || []; }

function getConfig(){
  const inicio = state.workbook.Sheets.Inicio;
  const get = (addr, fallback) => {
    const c = inicio && inicio[addr];
    return c && c.v != null && c.v !== "" ? c.v : fallback;
  };
  return {
    recentDays: n(get("B14", 30)) || 30,
    lowSale: n(get("B15", 50000)) || 50000,
    stockCritical: n(get("B16", 4)),
    stockWatch: n(get("B17", 12)),
    weekly: n(get("B24", 7)) || 7,
    biweekly: n(get("B25", 15)) || 15,
    monthly: n(get("B26", 30)) || 30
  };
}

function activeClients(){
  return getRows("Clientes_PDV").filter(r => norm(first(r, ["Estado cliente","Estado"])) !== "inactivo");
}
function recentCutoff(days){
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0,10);
}
function salesRows(){
  return getRows("Ventas_SellIn").map(r => {
    const qty = n(first(r, ["Cantidad facturada","Cantidad","Unidades"]));
    const price = n(first(r, ["Precio neto unit. facturado","Precio neto","Precio"]));
    const sale = n(first(r, ["Venta neta"])) || qty * price;
    const status = first(r, ["Status pago","Estado pago"]);
    const pending = n(first(r, ["Monto pendiente"])) || (/pagad/i.test(String(status)) ? 0 : sale);
    return { raw:r, qty, price, sale, pending, status, date:excelDate(first(r, ["Fecha factura","Fecha"])), pdv:first(r, ["PDV_ID"]), sku:first(r, ["SKU"]) };
  }).filter(r => r.pdv);
}
function selloutRows(){
  return getRows("SellOut_Jumbo").map(r => ({
    raw:r, date:excelDate(first(r, ["Fecha"])), pdv:first(r, ["PDV","Punto de venta"]), sku:first(r, ["SKU"]),
    qty:n(first(r, ["Unidades sell-out"])), sale:n(first(r, ["Venta publica bruta","Venta pública bruta"]))
  })).filter(r => r.pdv || r.sku);
}
function stockRows(){
  return getRows("Stock_PDV").map(r => ({
    raw:r, pdv:first(r, ["PDV_ID"]), sku:first(r, ["SKU"]), date:excelDate(first(r, ["Fecha conteo"])),
    units:n(first(r, ["Stock unidades"])), bars:n(first(r, ["Barras equivalentes"])) || n(first(r, ["Stock unidades"])),
    state:first(r, ["Estado stock"])
  })).filter(r => r.pdv);
}
function frequencyLimit(freq, cfg){
  const f = norm(freq);
  if (f.includes("semanal")) return cfg.weekly;
  if (f.includes("quincenal")) return cfg.biweekly;
  if (f.includes("mensual")) return cfg.monthly;
  return cfg.recentDays;
}
function coverageRows(){
  const cfg = getConfig();
  const cutoff = recentCutoff(cfg.recentDays);
  const ventas = salesRows();
  const stocks = stockRows();
  const sellouts = selloutRows();
  return activeClients().map(c => {
    const pdv = first(c, ["PDV_ID"]);
    const freq = first(c, ["Frecuencia visita"]);
    const lastVisit = excelDate(first(c, ["Ultima visita","Última visita"]));
    const noVisitDays = daysSince(lastVisit);
    const limit = frequencyLimit(freq, cfg);
    const visitState = noVisitDays == null ? "Sin visita" : (noVisitDays > limit ? "Atrasado" : "Vigente");
    const vs = ventas.filter(v => v.pdv === pdv && (!v.date || v.date >= cutoff));
    const sale30 = vs.reduce((a,x)=>a+x.sale,0);
    const pending = vs.reduce((a,x)=>a+x.pending,0);
    const unpaidDocs = vs.filter(x => x.pending > 0).length;
    const saleState = sale30 <= 0 ? "Sin venta" : (sale30 < cfg.lowSale ? "Venta baja" : "Venta OK");
    const payState = pending > 0 ? "Pendiente" : "OK";
    const latestStock = stocks.filter(s => s.pdv === pdv).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
    const stockBars = latestStock ? latestStock.bars : 0;
    const stockState = latestStock?.state || (stockBars <= cfg.stockCritical ? "Critico" : (stockBars <= cfg.stockWatch ? "Observar" : "OK"));
    const so = sellouts.filter(s => s.pdv === first(c, ["Punto de venta"]) && (!s.date || s.date >= cutoff)).reduce((a,x)=>a+x.qty,0);
    const priority = visitState !== "Vigente" || saleState !== "Venta OK" || payState !== "OK" || /crit/i.test(stockState) ? "Alta" : "Media";
    return {
      PDV_ID: pdv,
      Cliente: first(c, ["Cliente"]),
      Canal: first(c, ["Canal"]),
      "Punto de venta": first(c, ["Punto de venta"]),
      Frecuencia: freq,
      "Ultima visita": lastVisit,
      "Dias sin visita": noVisitDays == null ? "" : noVisitDays,
      "Estado visita": visitState,
      "Venta sell-in 30d neta": sale30,
      "Sell-out 30d unid. opcional": so,
      "Estado venta": saleState,
      "Facturas pendientes": unpaidDocs,
      "Monto pendiente": pending,
      "Estado pago": payState,
      "Stock PDV barras": stockBars,
      "Estado stock": stockState,
      Prioridad: priority,
      Comuna: first(c, ["Comuna"]),
      Region: first(c, ["Region","Región"])
    };
  });
}

function dashboardData(){
  const cov = coverageRows();
  const ventas = salesRows();
  const cutoff = recentCutoff(getConfig().recentDays);
  const recentSales = ventas.filter(v => !v.date || v.date >= cutoff);
  return {
    pdvActivos: activeClients().length,
    prioridadAlta: cov.filter(r => r.Prioridad === "Alta").length,
    venta30: recentSales.reduce((a,x)=>a+x.sale,0),
    pendiente: recentSales.reduce((a,x)=>a+x.pending,0),
    stockCritico: cov.filter(r => /crit/i.test(r["Estado stock"])).length,
    unidades30: recentSales.reduce((a,x)=>a+x.qty,0),
    cov
  };
}

function table(headers, rows, opts={}){
  const visible = applyTableSearch(rows);
  const body = visible.length ? visible.map(r => `<tr>${headers.map(h => {
    const v = r[h];
    const isNum = typeof v === "number" || /monto|venta|precio|cantidad|stock|unid|dias|facturas|iva|bruta|neta/i.test(h);
    const html = /estado|prioridad|status/i.test(h) ? badge(v) : (isNum ? num(v) : esc(v));
    return `<td class="${isNum ? "num" : ""}">${html}</td>`;
  }).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}" class="empty-cell">Sin registros</td></tr>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>
    <div class="muted" style="margin-top:8px">${visible.length} de ${rows.length} registros</div>`;
}
function applyTableSearch(rows){
  const q = norm(state.search);
  if (!q) return rows;
  return rows.filter(r => norm(Object.values(r).join(" ")).includes(q));
}

function dashboardView(){
  const d = dashboardData();
  const cfg = getConfig();
  const kpis = [
    ["PDV activos", d.pdvActivos, "Clientes_PDV activos"],
    ["PDV prioridad alta", d.prioridadAlta, "Segun Cobertura"],
    ["Venta sell-in 30d neta", money(d.venta30), `${num(d.unidades30)} unidades`],
    ["Monto pendiente", money(d.pendiente), "Facturas no pagadas"],
    ["PDV stock critico", d.stockCritico, "Segun Stock_PDV"],
    ["Ventana control", `${cfg.recentDays} dias`, `Venta baja < ${money(cfg.lowSale)}`]
  ].map(x => `<div class="kpi"><div class="label">${esc(x[0])}</div><div class="value">${esc(x[1])}</div><div class="sub">${esc(x[2])}</div></div>`).join("");
  const headers = ["Punto de venta","Cliente","Canal","Estado visita","Estado venta","Estado pago","Estado stock","Prioridad"];
  const priority = d.cov.slice().sort((a,b)=>String(a.Prioridad).localeCompare(String(b.Prioridad))).slice(0,60);
  return `<div class="grid kpis">${kpis}</div>
    <div class="grid panels">
      <div class="panel">
        <h2>Lista de gestion sugerida</h2>
        ${table(headers, priority)}
      </div>
      <div class="panel">
        <h2>Condiciones activas y como se calculan</h2>
        ${conditionsInner()}
      </div>
    </div>`;
}

function filtersFor(rows, fields){
  return `<div class="toolbar">${fields.map(f => {
    const vals = [...new Set(rows.map(r => String(r[f] ?? "").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const cur = state.filters[f] || "";
    return `<div class="field"><label>${esc(f)}</label><select data-filter="${esc(f)}"><option value="">Todos</option>${vals.map(v => `<option value="${esc(v)}" ${v===cur?"selected":""}>${esc(v)}</option>`).join("")}</select></div>`;
  }).join("")}</div>`;
}
function filtered(rows){
  const dateKey = Object.keys(rows[0] || {}).find(k => /fecha/i.test(k));
  return rows.filter(r => {
    const fieldsOk = Object.entries(state.filters).every(([k,v]) => !v || String(r[k] ?? "") === v);
    if (!fieldsOk) return false;
    if (!dateKey || (!state.dateFrom && !state.dateTo)) return true;
    const d = excelDate(r[dateKey]);
    if (!d) return false;
    if (state.dateFrom && d < state.dateFrom) return false;
    if (state.dateTo && d > state.dateTo) return false;
    return true;
  });
}
function filteredView(title, headers, rows, filterFields){
  const fr = filtered(rows);
  const hasDate = headers.some(h => /fecha/i.test(h));
  setTimeout(wireFilters, 0);
  return `<div class="panel"><h2>${esc(title)}</h2>
    ${hasDate ? dateRangeControls() : ""}
    ${filtersFor(rows, filterFields)}${table(headers, fr)}</div>`;
}
function coberturaView(){
  const headers = ["PDV_ID","Cliente","Canal","Punto de venta","Frecuencia","Ultima visita","Dias sin visita","Estado visita","Venta sell-in 30d neta","Estado venta","Facturas pendientes","Monto pendiente","Estado pago","Stock PDV barras","Estado stock","Prioridad"];
  return conditionsPanel(null,
      "Cada PDV cruza cuatro reglas: visita (dias vs frecuencia), venta 30d (baja/sin venta), pago (monto pendiente) y stock (barras). Prioridad Alta si cualquiera esta en rojo.")
    + filteredView("Cobertura comercial", headers, coverageRows(), ["Canal","Cliente","Estado visita","Estado venta","Estado pago","Estado stock","Prioridad"]);
}
function ventasView(){
  const rows = salesRows().map(v => ({
    Fecha: v.date, Factura:first(v.raw, ["N° factura","N factura"]), PDV_ID:v.pdv, Cliente:first(v.raw, ["Cliente"]),
    Canal:first(v.raw, ["Canal"]), "Punto de venta":first(v.raw, ["Punto de venta"]), SKU:v.sku,
    Cantidad:v.qty, "Precio neto":v.price, "Venta neta":v.sale, "Monto pendiente":v.pending, "Status pago":v.status
  }));
  return conditionsPanel(["Venta reciente","Venta baja","pendiente","vencer"],
      "Venta neta = cantidad facturada x precio neto. Monto pendiente = venta no pagada.")
    + filteredView("Ventas Sell In", Object.keys(rows[0] || {}), rows, ["Cliente","Canal","Punto de venta","SKU","Status pago"]);
}
function inventarioView(){
  const rows = stockRows().map(s => ({
    Fecha:s.date, PDV_ID:s.pdv, Cliente:first(s.raw, ["Cliente"]), Canal:first(s.raw, ["Canal"]), "Punto de venta":first(s.raw, ["Punto de venta"]),
    SKU:s.sku, "Stock unidades":s.units, "Barras equivalentes":s.bars, "Estado stock":s.state
  }));
  return conditionsPanel(["Stock"],
      "El estado de stock usa las barras equivalentes en sala: critico si esta en o bajo el minimo, observar bajo el segundo umbral, si no OK.")
    + filteredView("Inventario por PDV", Object.keys(rows[0] || {}), rows, ["Cliente","Canal","Punto de venta","SKU","Estado stock"]);
}
function clientesView(){
  const rows = activeClients();
  setTimeout(initPdvMap, 0);
  const mapPanel = `<div class="panel">
    <h2>Mapa de puntos de venta</h2>
    <div id="pdvMap" class="pdv-map"></div>
    <p id="mapNote" class="muted" style="margin-top:8px">Cargando mapa...</p>
  </div>`;
  return conditionsPanel(["Semanal","Quincenal","Mensual","Venta reciente"],
      "El color del punto usa la prioridad de Cobertura: rojo alta, ambar media, verde vigente.")
    + mapPanel
    + filteredView("Clientes / puntos de venta", getHeaders("Clientes_PDV").slice(0,10), rows, ["Canal","Cliente","Comuna","Estado cliente"]);
}
function productosView(){
  const rows = getRows("Maestro_SKU").filter(r => first(r, ["SKU"]));
  return `<div class="panel cond-panel"><h2>Condiciones activas y como se calculan</h2><p class="muted">Maestro de productos (catalogo). No aplica umbrales de gestion.</p></div>`
    + filteredView("Maestro de productos", getHeaders("Maestro_SKU"), rows, ["Marca","Categoria","Categoría","Sabor","Formato","Estado"]);
}

function dateRangeControls(){
  return `<div class="toolbar">
    <div class="field"><label>Fecha desde</label><input type="date" id="dateFrom" value="${esc(state.dateFrom)}"></div>
    <div class="field"><label>Fecha hasta</label><input type="date" id="dateTo" value="${esc(state.dateTo)}"></div>
  </div>`;
}

function wireFilters(){
  const df = $("#dateFrom"), dt = $("#dateTo");
  if (df) df.onchange = () => { state.dateFrom = df.value; render(); };
  if (dt) dt.onchange = () => { state.dateTo = dt.value; render(); };
  document.querySelectorAll("[data-filter]").forEach(el => {
    el.onchange = () => {
      const k = el.getAttribute("data-filter");
      state.filters[k] = el.value;
      render();
    };
  });
}

// ---- Condiciones activas y como se calculan (hoja Inicio, cols A/B/C) ----
function getConditions(){
  const ini = state.workbook && state.workbook.Sheets.Inicio;
  const cell = addr => { const c = ini && ini[addr]; return c && c.v != null ? c.v : ""; };
  const out = [];
  for (const r of [13,14,15,16,17,18,19,24,25,26]) {
    const label = cell("A" + r), val = cell("B" + r), how = cell("C" + r);
    if (isBlank(label) || isBlank(val) || norm(label) === "condicion") continue;
    if (norm(label).includes("iva")) continue; // el IVA no se muestra
    out.push({ label: String(label), value: val, how: String(how) });
  }
  return out;
}
function fmtCond(label, val){
  const L = norm(label);
  if (L.includes("iva")) return pct(val);
  if (/menor a|pendiente|relevante|monto/.test(L)) return money(val);
  if (/barras|stock/.test(L)) return num(val) + " barras";
  if (/dias|semanal|quincenal|mensual/.test(L)) return num(val) + " dias";
  return num(val);
}
function conditionsInner(keys){
  let conds = getConditions();
  if (keys && keys.length) {
    conds = conds.filter(c => keys.some(k => norm(c.label).includes(norm(k))));
  }
  if (!conds.length) return `<p class="muted">Sin condiciones configuradas en la hoja Inicio.</p>`;
  return `<div class="cond-grid">${conds.map(c => `
    <div class="cond-item">
      <div class="cond-top"><span>${esc(c.label)}</span><b>${esc(fmtCond(c.label, c.value))}</b></div>
      <div class="cond-how">${esc(c.how)}</div>
    </div>`).join("")}</div>`;
}
function conditionsPanel(keys, note){
  return `<div class="panel cond-panel">
    <h2>Condiciones activas y como se calculan</h2>
    ${note ? `<p class="muted" style="margin:-4px 0 10px">${esc(note)}</p>` : ""}
    ${conditionsInner(keys)}
  </div>`;
}

// ---- Ventas Sell Out (hoja SellOut_Jumbo) ----
function selloutView(){
  const rows = selloutRows().map(s => ({
    Fecha: s.date,
    Cliente: first(s.raw, ["Cliente"]),
    PDV: s.pdv,
    SKU: s.sku,
    "Descripcion SKU": first(s.raw, ["Descripción SKU","Descripcion SKU"]),
    "Unidades sell-out": s.qty,
    "Venta publica bruta": s.sale,
    "Stock informado": n(first(s.raw, ["Stock informado"])),
    Fuente: first(s.raw, ["Fuente/archivo","Fuente"])
  }));
  const totU = rows.reduce((a,r)=>a+n(r["Unidades sell-out"]),0);
  const totV = rows.reduce((a,r)=>a+n(r["Venta publica bruta"]),0);
  const kpis = `<div class="grid kpis" style="grid-template-columns:repeat(3,minmax(140px,1fr))">
    <div class="kpi"><div class="label">Registros sell-out</div><div class="value">${num(rows.length)}</div><div class="sub">venta al consumidor final</div></div>
    <div class="kpi"><div class="label">Unidades sell-out</div><div class="value">${num(totU)}</div><div class="sub">total del periodo cargado</div></div>
    <div class="kpi"><div class="label">Venta publica bruta</div><div class="value">${money(totV)}</div><div class="sub">precio de gondola</div></div>
  </div>`;
  const cfg = getConfig();
  return kpis + conditionsPanel(["Venta reciente"],
      "El sell-out es informativo (lo que el retail vende al consumidor). No cambia estados de pago ni stock; se compara con el sell-in de los ultimos " + cfg.recentDays + " dias para leer rotacion.")
    + filteredView("Ventas Sell Out", Object.keys(rows[0] || {}), rows, ["Cliente","PDV","SKU","Fuente"]);
}

// ---- Mapa de puntos de venta (por comuna; el Excel no trae coordenadas) ----
const COMUNA_LL = {
  "las condes":[-33.4085,-70.5680], "vitacura":[-33.3800,-70.5760],
  "la reina":[-33.4450,-70.5400], "providencia":[-33.4260,-70.6100],
  "nunoa":[-33.4560,-70.5970], "santiago":[-33.4470,-70.6520],
  "penalolen":[-33.4770,-70.5420], "macul":[-33.4900,-70.5980],
  "san miguel":[-33.4970,-70.6510], "maipu":[-33.5110,-70.7580],
  "la florida":[-33.5220,-70.5990], "puente alto":[-33.6110,-70.5760],
  "recoleta":[-33.4110,-70.6400], "independencia":[-33.4180,-70.6640],
  "estacion central":[-33.4600,-70.6800], "quilicura":[-33.3600,-70.7290]
};
function initPdvMap(){
  const el = document.getElementById("pdvMap");
  if (!el) return;
  if (typeof L === "undefined") { el.innerHTML = `<div class="muted" style="padding:16px">No se pudo cargar el mapa (sin conexion a internet).</div>`; return; }
  if (state.map) { state.map.remove(); state.map = null; }
  const map = L.map(el).setView([-33.42,-70.60], 11);
  state.map = map;
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, attribution:"&copy; OpenStreetMap" }).addTo(map);
  const cov = {}; coverageRows().forEach(c => { cov[c.PDV_ID] = c; });
  const perComuna = {}; const pts = []; let sinGeo = 0;
  activeClients().forEach(c => {
    const comuna = norm(first(c, ["Comuna"]));
    const base = COMUNA_LL[comuna];
    if (!base) { sinGeo++; return; }
    const idx = (perComuna[comuna] = (perComuna[comuna] || 0), perComuna[comuna]++);
    const ang = idx * 2.39996, rad = idx === 0 ? 0 : 0.006 + 0.0016 * idx;
    const lat = base[0] + Math.sin(ang) * rad, lng = base[1] + Math.cos(ang) * rad;
    const cv = cov[first(c, ["PDV_ID"])] || {};
    const pri = cv.Prioridad || "";
    const color = /alta/i.test(pri) ? "#b42318" : (/media/i.test(pri) ? "#a56700" : "#176247");
    L.circleMarker([lat,lng], { radius:9, color:"#fff", weight:2, fillColor:color, fillOpacity:.95 })
      .addTo(map)
      .bindPopup(`<b>${esc(first(c,["Punto de venta"]))}</b><br>${esc(first(c,["Cliente"]))} &middot; ${esc(first(c,["Canal"]))}<br>${esc(first(c,["Comuna"]))}, ${esc(first(c,["Región","Region"]))}<br>Prioridad: ${esc(pri || "—")}<br>Visita: ${esc(cv["Estado visita"] || "—")} &middot; Venta: ${esc(cv["Estado venta"] || "—")}<br>Stock: ${esc(cv["Estado stock"] || "—")}`);
    pts.push([lat,lng]);
  });
  if (pts.length) map.fitBounds(pts, { padding:[40,40], maxZoom:13 });
  const info = document.getElementById("mapNote");
  if (info) info.textContent = `${pts.length} punto(s) ubicado(s) por comuna` + (sinGeo ? ` · ${sinGeo} sin comuna reconocida` : "") + ". Ubicacion aproximada: el Excel no trae coordenadas por PDV.";
  setTimeout(() => map.invalidateSize(), 120);
}

const views = {
  dashboard: ["Dashboard", dashboardView],
  cobertura: ["Cobertura", coberturaView],
  ventas: ["Ventas Sell In", ventasView],
  sellout: ["Ventas Sell Out", selloutView],
  inventario: ["Inventario", inventarioView],
  clientes: ["Clientes / PDV", clientesView],
  productos: ["Productos", productosView]
};

function render(){
  const [title, fn] = views[state.view] || views.dashboard;
  $("#viewTitle").textContent = title;
  app.innerHTML = fn();
}
function setView(view){
  state.view = view;
  state.filters = {};
  state.dateFrom = "";
  state.dateTo = "";
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  render();
}
async function loadWorkbook(){
  if (!window.XLSX) throw new Error("No se pudo cargar SheetJS.");
  const res = await fetch(EXCEL_FILE, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer ${EXCEL_FILE}`);
  const buf = await res.arrayBuffer();
  state.workbook = XLSX.read(buf, { type: "array", cellDates: true });
  state.workbook.SheetNames.forEach(name => {
    state.sheets[name] = rowsFromSheet(state.workbook.Sheets[name]);
  });
  $("#statusLine").textContent = `Base: ${EXCEL_FILE} · ${state.workbook.SheetNames.length} hojas`;
  render();
}
async function sha256hex(s){
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function setupGate(){
  const g = $("#gate");
  // Solo se guarda el hash SHA-256 de la clave, no la clave. No es seguridad
  // fuerte (el gate corre en el navegador) pero evita leer la clave en el codigo.
  const HASH = "de3048f1ee2e9d1b9ea71d1bd92caad8b8669f8888a9dda867c74e6b0e9b73ea";
  if (sessionStorage.getItem("nuvaoxi_role")) { g.style.display = "none"; return; }
  const inp = $("#gateInput"), err = $("#gateErr");
  const attempt = async () => {
    if (await sha256hex((inp.value || "").trim()) === HASH) {
      sessionStorage.setItem("nuvaoxi_role", "full");
      g.style.display = "none";
    } else {
      err.textContent = "Clave incorrecta.";
      inp.select();
    }
  };
  $("#gateBtn").onclick = attempt;
  inp.addEventListener("keydown", e => { if (e.key === "Enter") attempt(); });
  inp.focus();
}

function ab2b64(buf){
  const bytes = new Uint8Array(buf); let bin = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}
function getUploadKey(force){
  let k = localStorage.getItem("nuva_upload_key"); // null = nunca respondio; "" = respondio vacio
  if (force || k === null) {
    k = (prompt("Clave para guardar el Excel para todos\n(dejar vacia si tu Vercel no pide clave):") || "").trim();
    localStorage.setItem("nuva_upload_key", k);
  }
  return k;
}
async function persistUpload(file, b64){
  $("#statusLine").textContent = `Guardando ${file.name} para todos...`;
  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: getUploadKey(false), filename: file.name, b64 })
    });
    const j = await res.json().catch(() => ({ ok: false, error: "respuesta invalida del servidor" }));
    if (!j.ok) {
      if (/clave/i.test(j.error || "")) localStorage.removeItem("nuva_upload_key");
      throw new Error(j.error || "error");
    }
    $("#statusLine").textContent = `Guardado para todos ✔ · ${file.name} · se publica para todos en ~1 minuto (recarga para verlo).`;
  } catch (err) {
    $("#statusLine").textContent = "Se actualizo en tu navegador, pero NO se guardo para todos: " + err.message;
  }
}
function handleUpload(file){
  const reader = new FileReader();
  reader.onload = e => {
    const buf = e.target.result;
    try {
      const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
      if (state.map) { try { state.map.remove(); } catch(_){} state.map = null; }
      state.workbook = wb;
      state.sheets = {};
      wb.SheetNames.forEach(nm => state.sheets[nm] = rowsFromSheet(wb.Sheets[nm]));
      state.filters = {}; state.dateFrom = ""; state.dateTo = "";
      render();
    } catch (err) {
      $("#statusLine").textContent = "No se pudo leer el Excel subido: " + err.message;
      return;
    }
    persistUpload(file, ab2b64(buf)); // guardar en el repo para que lo vea todo el mundo
  };
  reader.readAsArrayBuffer(file);
}

document.querySelectorAll("#nav button").forEach(b => b.onclick = () => setView(b.dataset.view));
$("#globalSearch").addEventListener("input", e => { state.search = e.target.value; render(); });
const upBtn = $("#uploadBtn"), upInput = $("#uploadInput");
if (upBtn && upInput) {
  upBtn.onclick = () => upInput.click();
  upInput.onchange = e => { const f = e.target.files[0]; if (f) handleUpload(f); e.target.value = ""; };
}
setupGate();
loadWorkbook().catch(err => {
  app.innerHTML = `<div class="error"><b>Error al cargar la base.</b><br>${esc(err.message)}</div>`;
  $("#statusLine").textContent = "No se pudo cargar el Excel.";
});
