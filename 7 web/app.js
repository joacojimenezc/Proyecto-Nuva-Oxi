const EXCEL_FILE = "data/NUVA_OXI_Control_Comercial_FINAL_v2.xlsx";

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
        <h2>Condiciones activas</h2>
        <div class="summary-list">
          <div class="summary-item"><span>Venta reciente dias</span><b>${cfg.recentDays}</b></div>
          <div class="summary-item"><span>Venta baja menor a</span><b>${money(cfg.lowSale)}</b></div>
          <div class="summary-item"><span>Semanal dias</span><b>${cfg.weekly}</b></div>
          <div class="summary-item"><span>Quincenal dias</span><b>${cfg.biweekly}</b></div>
          <div class="summary-item"><span>Mensual dias</span><b>${cfg.monthly}</b></div>
          <div class="summary-item"><span>Stock critico hasta</span><b>${num(cfg.stockCritical)}</b></div>
        </div>
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
  return filteredView("Cobertura comercial", headers, coverageRows(), ["Canal","Cliente","Estado visita","Estado venta","Estado pago","Estado stock","Prioridad"]);
}
function ventasView(){
  const rows = salesRows().map(v => ({
    Fecha: v.date, Factura:first(v.raw, ["N° factura","N factura"]), PDV_ID:v.pdv, Cliente:first(v.raw, ["Cliente"]),
    Canal:first(v.raw, ["Canal"]), "Punto de venta":first(v.raw, ["Punto de venta"]), SKU:v.sku,
    Cantidad:v.qty, "Precio neto":v.price, "Venta neta":v.sale, "Monto pendiente":v.pending, "Status pago":v.status
  }));
  return filteredView("Ventas Sell-In", Object.keys(rows[0] || {}), rows, ["Cliente","Canal","Punto de venta","SKU","Status pago"]);
}
function inventarioView(){
  const rows = stockRows().map(s => ({
    Fecha:s.date, PDV_ID:s.pdv, Cliente:first(s.raw, ["Cliente"]), Canal:first(s.raw, ["Canal"]), "Punto de venta":first(s.raw, ["Punto de venta"]),
    SKU:s.sku, "Stock unidades":s.units, "Barras equivalentes":s.bars, "Estado stock":s.state
  }));
  return filteredView("Inventario por PDV", Object.keys(rows[0] || {}), rows, ["Cliente","Canal","Punto de venta","SKU","Estado stock"]);
}
function clientesView(){
  const rows = activeClients();
  return filteredView("Clientes / puntos de venta", getHeaders("Clientes_PDV").slice(0,10), rows, ["Canal","Cliente","Comuna","Estado cliente"]);
}
function productosView(){
  const rows = getRows("Maestro_SKU").filter(r => first(r, ["SKU"]));
  return filteredView("Maestro de productos", getHeaders("Maestro_SKU"), rows, ["Marca","Categoria","Categoría","Sabor","Formato","Estado"]);
}

function registryRows(sheetName){
  if (sheetName === "Cobertura") return coverageRows();
  return getRows(sheetName);
}
function registryHeaders(sheetName){
  if (sheetName === "Cobertura") return Object.keys(coverageRows()[0] || {});
  return getHeaders(sheetName);
}
function registryView(){
  const names = Object.keys(state.sheets).filter(n => getRows(n).length);
  const rows = registryRows(state.registrySheet);
  const headers = registryHeaders(state.registrySheet);
  const filterCandidates = headers.filter(h => /fecha|cliente|canal|pdv|punto|sku|estado|status|prioridad|comuna|region/i.test(h)).slice(0,8);
  setTimeout(() => {
    const sel = $("#sheetSelect");
    if (sel) sel.onchange = () => { state.registrySheet = sel.value; state.filters = {}; state.dateFrom = ""; state.dateTo = ""; render(); };
    wireFilters();
  }, 0);
  return `<div class="panel">
    <h2>Registro</h2>
    <div class="toolbar">
      <div class="field"><label>Tabla del Excel</label><select id="sheetSelect">${names.map(n => `<option value="${esc(n)}" ${n===state.registrySheet?"selected":""}>${esc(n)}</option>`).join("")}</select></div>
    </div>
    ${headers.some(h => /fecha/i.test(h)) ? dateRangeControls() : ""}
    ${filtersFor(rows, filterCandidates)}
    ${table(headers, filtered(rows))}
  </div>`;
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

const views = {
  dashboard: ["Dashboard", dashboardView],
  cobertura: ["Cobertura", coberturaView],
  ventas: ["Ventas", ventasView],
  inventario: ["Inventario", inventarioView],
  clientes: ["Clientes / PDV", clientesView],
  productos: ["Productos", productosView],
  registro: ["Registro", registryView]
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
  $("#sourceName").textContent = "NUVA_OXI_Control_Comercial_FINAL_v2.xlsx";
  render();
}
function setupGate(){
  const g = $("#gate");
  const enc = s => btoa(unescape(encodeURIComponent(String(s))));
  const FULL = "MDIwNzI1";
  if (sessionStorage.getItem("nuvaoxi_role")) { g.style.display = "none"; return; }
  const inp = $("#gateInput"), err = $("#gateErr");
  const attempt = () => {
    if (enc((inp.value || "").trim()) === FULL) {
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

document.querySelectorAll("#nav button").forEach(b => b.onclick = () => setView(b.dataset.view));
$("#globalSearch").addEventListener("input", e => { state.search = e.target.value; render(); });
setupGate();
loadWorkbook().catch(err => {
  app.innerHTML = `<div class="error"><b>Error al cargar la base.</b><br>${esc(err.message)}</div>`;
  $("#statusLine").textContent = "No se pudo cargar el Excel.";
});
