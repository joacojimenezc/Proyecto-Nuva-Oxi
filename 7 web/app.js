/* CRM NUVA OXI - front-end (lee window.NUVA_DATA) */
const D = window.NUVA_DATA || {};
D.sku = (D.sku || []).filter(s => String(s.SKU || '').startsWith('SKU-'));
const $ = s => document.querySelector(s);

const clp = n => (n == null || n === '') ? '' : '$' + Math.round(Number(n)).toLocaleString('es-CL');
const num = n => (n == null || n === '') ? '' : Number(n).toLocaleString('es-CL');
const pct = n => (Math.round(Number(n) * 100)) + '%';
const nameCliente = id => (D.clientes.find(c => c.ID_Cliente === id) || {}).Cadena || id;
const namePDV = id => (D.pdv.find(p => p.ID_PDV === id) || {}).Nombre_PDV || id;

/* ---- Facturas PDF: emparejamiento automatico por cliente ----
   Lee window.NUVA_FACTURAS (generado por gen-facturas.ps1) y asocia
   cada venta con las facturas cuyo nombre contiene el nombre o el
   codigo del cliente. Si no hay coincidencia, no muestra boton. */
const FACTURAS = window.NUVA_FACTURAS || [];
const FAC_BASE = '../4 finanzas/contabilidad/1 facturas sell in/';
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g,'');
function facturasDe(idCliente){
  const c = D.clientes.find(x => x.ID_Cliente === idCliente) || {};
  const keys = new Set([norm(idCliente), norm(c.Cadena)]);
  const fw = norm(String(c.Cadena||'').split(' ')[0]);   // primera palabra del nombre (ej. "Pirque")
  if(fw.length >= 4) keys.add(fw);
  const ks = [...keys].filter(Boolean);
  return FACTURAS.filter(f => { const nf = norm(f); return ks.some(k => nf.includes(k)); });
}
function pdfBtns(idCliente){
  const fs = facturasDe(idCliente);
  if(!fs.length) return '';
  return fs.map(f => `<a class="btnpdf" href="${encodeURI(FAC_BASE + f)}" target="_blank" rel="noopener" title="${f}">📄 Ver / Descargar</a>`).join(' ');
}

function badge(estado){
  const e = String(estado || '').toLowerCase();
  let cls = 'b-gray';
  if(/activo|pagad|cerrado|aprobado|entregad/.test(e)) cls='b-green';
  else if(/emitida|seguimiento|negociac|facturado|despach|transito/.test(e)) cls='b-blue';
  else if(/vencid|quiebre|perdid|abierta|reponer/.test(e)) cls='b-red';
  else if(/prospecto|stand|pendiente|contactado|borrador|preparac/.test(e)) cls='b-amber';
  return `<span class="badge ${cls}">${estado||''}</span>`;
}

/* ---- KPIs ---- */
const sum = (arr, f) => arr.reduce((a,x)=>a + (Number(f(x))||0), 0);
const K = {
  uds: sum(D.sellin,x=>x.Uds),
  venta: sum(D.sellin,x=>x.Venta_Neta),
  margen: sum(D.sellin,x=>x.Margen),
  cxc: sum(D.sellin.filter(x=>x.Estado_Factura==='Emitida'),x=>x.Venta_Neta),
  pdvAct: D.pdv.filter(p=>p.Estado==='Activo').length,
  pdvTot: D.pdv.length,
  cli: D.clientes.length,
  selloutTot: sum(D.sellout,x=>x.Uds)
};

/* ---- Cobertura por periodo (mes YYYY-MM) ---- */
function mesesVenta(){ return [...new Set((D.sellin||[]).map(v=>String(v.Fecha||'').slice(0,7)).filter(Boolean))].sort(); }
function coberturaPeriodo(mes){
  const ven = (D.sellin||[]).filter(v=> mes==='Todo' || String(v.Fecha||'').slice(0,7)===mes);
  const cliSet = new Set(ven.map(v=>v.ID_Cliente));
  const pdvSet = new Set(ven.map(v=>v.ID_PDV));
  const cliTot = (D.clientes||[]).length, pdvTot = (D.pdv||[]).length;
  return { mes, cliCon:cliSet.size, cliTot, pdvCon:pdvSet.size, pdvTot, cliSet, pdvSet,
           pctCli: cliTot? cliSet.size/cliTot : 0, pctPdv: pdvTot? pdvSet.size/pdvTot : 0 };
}

/* ---- rotación por PDV ---- */
const rotacion = (() => {
  const map = {};
  D.sellin.forEach(v=>{ map[v.ID_PDV]=map[v.ID_PDV]||{pdv:v.ID_PDV,si:0,vn:0,so:0}; map[v.ID_PDV].si+=Number(v.Uds)||0; map[v.ID_PDV].vn+=Number(v.Venta_Neta)||0; });
  (D.sellout||[]).forEach(s=>{ map[s.ID_PDV]=map[s.ID_PDV]||{pdv:s.ID_PDV,si:0,vn:0,so:0}; map[s.ID_PDV].so+=Number(s.Uds)||0; });
  return Object.values(map).map(r=>({...r, rot: r.si? r.so/r.si : 0})).sort((a,b)=>b.vn-a.vn);
})();

/* ---- resumen por canal de venta (Segmento del cliente) ---- */
const segCliente = id => (D.clientes.find(c=>c.ID_Cliente===id)||{}).Segmento || 'Sin canal';
const porCanal = (()=>{
  const m={};
  (D.sellin||[]).forEach(v=>{
    const seg=segCliente(v.ID_Cliente);
    m[seg]=m[seg]||{canal:seg,uds:0,venta:0,margen:0,cli:new Set(),pdv:new Set()};
    m[seg].uds+=Number(v.Uds)||0; m[seg].venta+=Number(v.Venta_Neta)||0; m[seg].margen+=Number(v.Margen)||0;
    m[seg].cli.add(v.ID_Cliente); m[seg].pdv.add(v.ID_PDV);
  });
  return Object.values(m).map(x=>({...x, cli:x.cli.size, pdv:x.pdv.size})).sort((a,b)=>b.venta-a.venta);
})();

/* ---- share (participacion) por cliente: unidades y pesos ---- */
const porCliente = (()=>{
  const m={};
  (D.sellin||[]).forEach(v=>{ m[v.ID_Cliente]=m[v.ID_Cliente]||{cli:v.ID_Cliente,uds:0,venta:0}; m[v.ID_Cliente].uds+=Number(v.Uds)||0; m[v.ID_Cliente].venta+=Number(v.Venta_Neta)||0; });
  const tu=sum(Object.values(m),x=>x.uds)||1, tv=sum(Object.values(m),x=>x.venta)||1;
  return Object.values(m).map(x=>({...x, shareU:x.uds/tu, shareV:x.venta/tv})).sort((a,b)=>b.venta-a.venta);
})();

/* ---- analitica por SKU (incluye SKU sin ventas) ---- */
const porSKU = (()=>{
  const m={};
  (D.sellin||[]).forEach(v=>{
    m[v.SKU]=m[v.SKU]||{sku:v.SKU,uds:0,venta:0,margen:0};
    m[v.SKU].uds+=Number(v.Uds)||0; m[v.SKU].venta+=Number(v.Venta_Neta)||0; m[v.SKU].margen+=Number(v.Margen)||0;
  });
  (D.sku||[]).forEach(s=>{ if(!m[s.SKU]) m[s.SKU]={sku:s.SKU,uds:0,venta:0,margen:0}; });
  const tot = sum(Object.values(m),x=>x.venta) || 1;
  return Object.values(m).map(x=>({...x, part:x.venta/tot})).sort((a,b)=>b.venta-a.venta);
})();
const skuInfo = sku => D.sku.find(s=>s.SKU===sku) || {};

/* ---- cuentas por cobrar (facturas emitidas sin pagar) por cliente ---- */
const porCxC = (()=>{
  const m={};
  (D.sellin||[]).filter(v=>v.Estado_Factura==='Emitida').forEach(v=>{
    m[v.ID_Cliente]=m[v.ID_Cliente]||{cli:v.ID_Cliente,monto:0,docs:0,vence:''};
    m[v.ID_Cliente].monto+=Number(v.Venta_Neta)||0; m[v.ID_Cliente].docs++;
    if(v.Fecha_Venc && (!m[v.ID_Cliente].vence || v.Fecha_Venc < m[v.ID_Cliente].vence)) m[v.ID_Cliente].vence = v.Fecha_Venc;
  });
  return Object.values(m).map(x=>{
    const c=D.clientes.find(k=>k.ID_Cliente===x.cli)||{};
    return {...x, plazo:c.Plazo_Pago||0};
  }).sort((a,b)=>b.monto-a.monto);
})();

/* ---- N° OC (cruce con pedidos) y N° factura (del PDF) por cliente ---- */
const ocDe = idCliente => (D.pedidos||[]).filter(p=>p.ID_Cliente===idCliente).map(p=>p.N_OC).filter(Boolean);
const facturaNumDe = idCliente => facturasDe(idCliente)
  .map(f=>{ const m=String(f).match(/(\d{2,})/); return m?m[1]:''; }).filter(Boolean);

/* ---- control de inventario por PDV ----
   Stock teorico en tienda = Sell-In - Sell-Out (unidades despachadas menos vendidas al
   consumidor). Es una ESTIMACION de gestion; el stock real requiere conteo fisico.
   El sell-out es confiable en Jumbo; en otros PDV puede ser parcial (soKnown=false). */
const soKnownSet = new Set((D.sellout||[]).map(s=>s.ID_PDV));
const cliDePDV = idPDV => (D.pdv.find(p=>p.ID_PDV===idPDV)||{}).ID_Cliente;
// Parametros de reposicion (par-level) por PDV. Override en data.js -> "asignacion";
// si no, default sugerido: Max = sell-in del PDV, Min (reorden) = 30% del Max (minimo 2).
function asignacionDe(pdv, si){
  const c = (D.asignacion||[]).find(a=>a.ID_PDV===pdv);
  if(c && c.Stock_Max!=null){
    const max=Number(c.Stock_Max);
    return {max, min:(c.Stock_Min!=null?Number(c.Stock_Min):Math.max(2,Math.ceil(max*0.3))), fuente:'config'};
  }
  const max=Math.max(si,1);
  return {max, min:Math.max(2,Math.ceil(max*0.3)), fuente:'sugerido'};
}
const inventarioPDV = rotacion.map(r=>{
  const stock = Math.max(r.si - r.so, 0);
  const known = soKnownSet.has(r.pdv);
  const a = asignacionDe(r.pdv, r.si);
  const reponer = stock <= a.min ? Math.max(a.max - stock, 0) : 0;
  let estado='Equilibrado', cls='b-green';
  if(!known){ estado='Sin sell-out'; cls='b-gray'; }
  else if(stock <= a.min){ estado='Reponer'; cls='b-red'; }
  else if(r.rot<0.35){ estado='Sobre-stock'; cls='b-amber'; }
  return {...r, stock, known, max:a.max, min:a.min, reponer, fuente:a.fuente, estado, cls};
}).sort((x,y)=> y.reponer-x.reponer || y.stock-x.stock);

/* ---- render helpers ---- */
function table(cols, rows, foot){
  const th = cols.map(c=>`<th class="${c.num?'num':''}" data-k="${c.k}">${c.t}</th>`).join('');
  const body = rows.map(r=>'<tr>'+cols.map(c=>{
    let v = c.render ? c.render(r) : (r[c.k]??'');
    return `<td class="${c.num?'num':''}">${v}</td>`;
  }).join('')+'</tr>').join('');
  const tf = foot ? '<tfoot><tr>'+cols.map(c=>`<td class="${c.num?'num':''}">${foot[c.k]??''}</td>`).join('')+'</tr></tfoot>' : '';
  return `<div class="tablewrap"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody>${tf}</table></div>`;
}

/* ---- views ---- */
const views = {
  dashboard(){
    const _mesAct = mesesVenta().slice(-1)[0] || 'Todo';
    const cobD = coberturaPeriodo(_mesAct);
    const al=[];
    // 1) Rotación / sobre-stock
    rotacion.filter(r=>r.si>0 && r.rot<0.35).forEach(r=>
      al.push(`<div class="alert warn">⚠️ <b>${namePDV(r.pdv)}</b>: rotación ${pct(r.rot)} (sell-in ${r.si} / sell-out ${r.so}) — posible sobre-stock en tienda.</div>`));
    // 2) Cuentas por cobrar / factura por vencer
    if(porCxC.length){ const t=porCxC[0], tot=sum(porCxC,x=>x.monto), n=sum(porCxC,x=>x.docs);
      al.push(`<div class="alert bad">💸 <b>Factura por cobrar</b>: ${clp(tot)} en ${n} factura(s) emitida(s). Mayor: <b>${nameCliente(t.cli)}</b> ${clp(t.monto)} (plazo ${t.plazo}d) — gestionar cobranza antes del vencimiento.</div>`); }
    // 3) Marketing / activaciones
    const mkt=(D.marketing||[]);
    if(!mkt.length) al.push(`<div class="alert warn">📣 <b>Marketing sin plan</b>: no hay campañas ni activaciones cargadas — crear activaciones en PDV y campañas de redes para empujar el sell-out.</div>`);
    else al.push(`<div class="alert warn">📣 <b>Marketing</b>: ${mkt.length} acción(es) planificada(s) — verificar ejecución y su efecto en sell-out.</div>`);
    // 4) Redes / autenticidad de marca
    al.push(`<div class="alert warn">📸 <b>Instagram @nuva_oxi</b>: dar protagonismo a la fundadora para hacer la cuenta más auténtica (las imágenes se notan generadas por IA). Sumar rostro, relato y detrás de escena.</div>`);
    const alerts = al.join('');
    return `
      <div class="kpis">
        <div class="kpi"><div class="lbl">Venta neta (sell-in)</div><div class="val">${clp(K.venta)}</div><div class="sub">${K.uds} u · <b>bruto c/IVA ${clp(K.venta*1.19)}</b></div></div>
        <div class="kpi blue"><div class="lbl">Margen bruto</div><div class="val">${clp(K.margen)}</div><div class="sub">costo $250/u (no validado)</div></div>
        <div class="kpi red"><div class="lbl">CxC pendiente</div><div class="val">${clp(K.cxc)}</div><div class="sub">facturas emitidas</div></div>
        <div class="kpi"><div class="lbl">Cobertura PDV</div><div class="val">${K.pdvAct}/${K.pdvTot}</div><div class="sub">${K.cli} clientes</div></div>
        <div class="kpi amber"><div class="lbl">Sell-out total</div><div class="val">${K.selloutTot} u</div><div class="sub">rotación global ${pct(K.selloutTot/K.uds)}</div></div>
      </div>
      <div class="grid2">
        <div class="panel"><h2>🔄 Sell-In vs Sell-Out por PDV</h2>${barsChart()}</div>
        <div class="panel"><h2>🚨 Alertas del piloto</h2>${alerts||'<p class="hint">Sin alertas.</p>'}
          <p class="hint" style="margin-top:14px">Resultado operativo estimado: <b>${clp(D.finanzas.resultado)}</b> · caja hoy ${clp(D.finanzas.cobrado)} (falta cobrar ${clp(D.finanzas.cxc)}).</p>
        </div>
      </div>
      <div class="grid2">
        <div class="panel"><h2>🏷️ Resumen por canal de venta</h2>${table([
          {k:'canal',t:'Canal'},
          {k:'cli',t:'Clientes',num:1},
          {k:'pdv',t:'PDV',num:1},
          {k:'uds',t:'Uds',num:1},
          {k:'venta',t:'Venta Neta',num:1,render:r=>clp(r.venta)},
          {k:'part',t:'% Venta',num:1,render:r=>pct(r.venta/(K.venta||1))}
        ], porCanal, {canal:'TOTAL',cli:'',pdv:'',uds:K.uds,venta:clp(K.venta),part:'100%'})}</div>
        <div class="panel"><h2>🍫 Top SKU · venta neta</h2>${table([
          {k:'sku',t:'SKU'},
          {k:'desc',t:'Producto',render:r=>skuInfo(r.sku).Descripcion||''},
          {k:'uds',t:'Uds',num:1},
          {k:'venta',t:'Venta',num:1,render:r=>clp(r.venta)},
          {k:'part',t:'% Part.',num:1,render:r=>pct(r.part)}
        ], porSKU.slice(0,6))}
          <p class="hint" style="margin-top:10px">Detalle completo en la sección <b>🍫 Productos</b>.</p></div>
      </div>
      <div class="grid2">
        <div class="panel"><h2>🥇 Participación por cliente (share)</h2>${table([
          {k:'cli',t:'Cliente',render:r=>nameCliente(r.cli)},
          {k:'uds',t:'Uds',num:1},
          {k:'shareU',t:'% Uds',num:1,render:r=>pct(r.shareU)},
          {k:'venta',t:'Venta Neta',num:1,render:r=>clp(r.venta)},
          {k:'shareV',t:'% $',num:1,render:r=>pct(r.shareV)}
        ], porCliente, {cli:'TOTAL',uds:K.uds,shareU:'100%',venta:clp(K.venta),shareV:'100%'})}</div>
        <div class="panel"><h2>📈 Crecimiento por período <span class="tag-ej">ejemplo</span></h2>
          ${(()=>{ const per=D.periodos||[]; if(!per.length) return '<p class="hint">Carga períodos en extra.js → "periodos".</p>';
            const pr=per.map((p,i)=>{ const pv=per[i-1]; return {...p, varV:(pv&&pv.Venta)?(p.Venta-pv.Venta)/pv.Venta:null}; });
            return miniBars(per)+table([
              {k:'Periodo',t:'Período'},
              {k:'Uds',t:'Uds',num:1},
              {k:'Venta',t:'Venta',num:1,render:r=>clp(r.Venta)},
              {k:'varV',t:'Var. $',num:1,render:r=> r.varV==null?'—':`<span style="color:${r.varV>=0?'var(--green)':'var(--red)'};font-weight:700">${r.varV>=0?'▲':'▼'} ${pct(Math.abs(r.varV))}</span>`}
            ], pr); })()}
          <p class="hint" style="margin-top:6px">Montos de <b>ejemplo</b> — reemplazar por venta real en <b>extra.js → "periodos"</b>.</p>
        </div>
      </div>`;
  },
  rotacion(){
    const cols=[
      {k:'pdv',t:'PDV',render:r=>namePDV(r.pdv)},
      {k:'si',t:'Sell-In',num:1},
      {k:'so',t:'Sell-Out',num:1},
      {k:'rot',t:'Rotación',num:1,render:r=>pct(r.rot)},
      {k:'vn',t:'Venta Neta',num:1,render:r=>clp(r.vn)},
    ];
    const foot={pdv:'TOTAL',si:K.uds,so:K.selloutTot,rot:pct(K.selloutTot/K.uds),vn:clp(K.venta)};
    return `<p class="hint">Rotación = sell-out ÷ sell-in. Rojo = &lt;35% (producto que entra al canal pero no rota al consumidor).</p>
      <div class="panel"><h2>Comparativo por punto de venta</h2>${barsChart()}</div>${table(cols,rotacion,foot)}`;
  },
  clientes(){
    const cols=[
      {k:'ID_Cliente',t:'ID'},{k:'Cadena',t:'Cliente'},{k:'Segmento',t:'Segmento'},
      {k:'Condicion',t:'Condición'},{k:'Plazo_Pago',t:'Plazo (d)',num:1},{k:'Resp',t:'Responsable'},
      {k:'Estado',t:'Estado',render:r=>badge(r.Estado)}];
    const meses = ['Todo', ...mesesVenta()];
    const chips = meses.map(m=>`<button class="chip ${cobMes===m?'active':''}" onclick="cobFiltro('${m}')">${m==='Todo'?'Acumulado':m}</button>`).join('');
    const cob = coberturaPeriodo(cobMes);
    const covRows = (D.clientes||[]).map(c=>{
      const ven = (D.sellin||[]).filter(v=> (cobMes==='Todo'||String(v.Fecha||'').slice(0,7)===cobMes) && v.ID_Cliente===c.ID_Cliente);
      return { Cadena:c.Cadena, Segmento:c.Segmento, con:cob.cliSet.has(c.ID_Cliente),
               pdvs:new Set(ven.map(x=>x.ID_PDV)).size, uds:sum(ven,x=>x.Uds), venta:sum(ven,x=>x.Venta_Neta) };
    }).sort((a,b)=> (b.con-a.con) || (b.venta-a.venta));
    const covCols=[
      {k:'Cadena',t:'Cliente'},{k:'Segmento',t:'Segmento'},
      {k:'con',t:'¿Con venta?',render:r=> r.con?'<span class="badge b-green">Con venta</span>':'<span class="badge b-red">Sin venta</span>'},
      {k:'pdvs',t:'Locales',num:1},{k:'uds',t:'Uds',num:1},
      {k:'venta',t:'Venta Neta',num:1,render:r=>clp(r.venta)}
    ];
    return `
      <div class="panel"><h2>📊 Cobertura comercial del período</h2>
        <div class="filterbar"><div class="chips">${chips}</div>
          <p class="hint" style="margin:0"><b>${pct(cob.pctCli)}</b> clientes con venta (${cob.cliCon}/${cob.cliTot}) · <b>${pct(cob.pctPdv)}</b> PDV (${cob.pdvCon}/${cob.pdvTot})</p></div>
        ${table(covCols, covRows)}
        <p class="hint" style="margin-top:6px">Cobertura = clientes/PDV a los que se les vendió en el período. Cambia el mes con los filtros.</p></div>
      <div class="panel"><h2>🤝 Ficha de clientes</h2>${table(cols, D.clientes)}</div>`;
  },
  pdv(){
    const segs = ['Todos', ...new Set((D.pdv||[]).map(p=>segCliente(p.ID_Cliente)))];
    const chips = segs.map(s=>`<button class="chip ${pdvSeg===s?'active':''}" onclick="pdvFiltro('${s}')">${s}</button>`).join('');
    const rows = pdvFiltrados();
    const cols=[
      {k:'ID_PDV',t:'ID'},{k:'Nombre_PDV',t:'Punto de venta'},{k:'ID_Cliente',t:'Cliente',render:r=>nameCliente(r.ID_Cliente)},
      {k:'Segmento',t:'Segmento',render:r=>segCliente(r.ID_Cliente)},
      {k:'Comuna',t:'Comuna'},{k:'Formato_Recom',t:'Formato'},{k:'Frecuencia_Visita',t:'Frecuencia'},
      {k:'Resp',t:'Resp'},{k:'Estado',t:'Estado',render:r=>badge(r.Estado)}];
    return `<div class="filterbar">
        <div class="chips">${chips}</div>
        <div class="repbtns"><button class="btnrep xls" onclick="exportarPdv('xls')">⬇ Excel</button><button class="btnrep pdf" onclick="exportarPdv('pdf')">⬇ PDF</button></div>
      </div>
      <p class="hint">${rows.length} punto(s) de venta${pdvSeg==='Todos'?'':' · '+pdvSeg}.</p>
      <div class="panel"><h2>🗺️ Mapa de puntos de venta</h2>${mapaPDV(rows)}</div>
      ${table(cols, rows)}`;
  },
  sellin(){
    const cols=[
      {k:'ID_Venta',t:'#'},{k:'Fecha',t:'Fecha'},{k:'ID_Cliente',t:'Cliente',render:r=>nameCliente(r.ID_Cliente)},
      {k:'ID_PDV',t:'PDV',render:r=>namePDV(r.ID_PDV)},{k:'SKU',t:'SKU'},{k:'Uds',t:'Uds',num:1},
      {k:'Venta_Neta',t:'Venta Neta',num:1,render:r=>clp(r.Venta_Neta)},
      {k:'Margen',t:'Margen',num:1,render:r=>clp(r.Margen)},
      {k:'NFactura',t:'N° Factura',render:r=> facturaNumDe(r.ID_Cliente).join(', ')||'—'},
      {k:'NOC',t:'N° OC',render:r=> ocDe(r.ID_Cliente).join(', ')||'—'},
      {k:'Estado_Factura',t:'Factura',render:r=>badge(r.Estado_Factura)},
      {k:'PDF',t:'Factura PDF',render:r=> pdfBtns(r.ID_Cliente)}];
    const foot={ID_Venta:'',Fecha:'',ID_Cliente:'',ID_PDV:'',SKU:'TOTAL',Uds:K.uds,Venta_Neta:clp(K.venta),Margen:clp(K.margen),Estado_Factura:'',PDF:''};
    return table(cols, D.sellin, foot);
  },
  pedidos(){
    const cols=[
      {k:'ID_Pedido',t:'ID Pedido'},{k:'ID_Cliente',t:'Cliente',render:r=>nameCliente(r.ID_Cliente)},
      {k:'N_OC',t:'N° OC'},{k:'Monto_OC',t:'Monto OC',num:1,render:r=>clp(r.Monto_OC)},
      {k:'Estado',t:'Estado OC',render:r=>badge(r.Estado)},
      {k:'Estado_Despacho',t:'Status Despacho',render:r=>badge(r.Estado_Despacho)}];
    return `<p class="hint">Pedidos y Órdenes de Compra (OC) con su estado y seguimiento de despacho.</p>${table(cols, D.pedidos)}`;
  },
  sellout(){
    const rows = (D.sellout||[]).map(s=>{
      const p = D.pdv.find(x=>x.ID_PDV===s.ID_PDV) || {};
      return {...s, ID_Cliente: p.ID_Cliente};
    });
    const cols=[
      {k:'ID_PDV',t:'PDV',render:r=>namePDV(r.ID_PDV)},
      {k:'ID_Cliente',t:'Cliente',render:r=>nameCliente(r.ID_Cliente)},
      {k:'Uds',t:'Uds Sell-Out',num:1}];
    const foot={ID_PDV:'TOTAL',ID_Cliente:'',Uds:K.selloutTot};
    return `<p class="hint">Sell-Out = unidades vendidas al consumidor final por punto de venta.</p>${table(cols, rows, foot)}`;
  },
  contabilidad(){
    const bar = contaTabs.map(t=>
      `<button class="subtab ${contaSub===t.k?'active':''}" onclick="contaGo('${t.k}')">${t.t}</button>`
    ).join('');
    return `<div class="subtabs">${bar}</div>${views[contaSub]()}`;
  },
  finanzas(){
    const f=D.finanzas;
    const mExpl = f.ingresos ? f.margen_bruto/f.ingresos : 0;   // margen de explotacion
    const mOper = f.ingresos ? f.resultado/f.ingresos : 0;      // margen operacional
    const row=(l,v,cls='')=>`<div class="stmt-row ${cls}"><span>${l}</span><span>${clp(v)}</span></div>`;
    const cxcTot = sum(porCxC, x=>x.monto);
    const cxcRows = porCxC.map(x=>({...x, cliente:nameCliente(x.cli)}));
    const cxcCols=[
      {k:'cliente',t:'Cliente'},
      {k:'docs',t:'Facturas',num:1},
      {k:'plazo',t:'Plazo (días)',num:1},
      {k:'monto',t:'Por cobrar',num:1,render:r=>clp(r.monto)}
    ];
    const cxcFoot={cliente:'TOTAL',docs:sum(porCxC,x=>x.docs),plazo:'',monto:clp(cxcTot)};
    return `
      <div class="kpis">
        <div class="kpi"><div class="lbl">Ingresos (neto)</div><div class="val">${clp(f.ingresos)}</div></div>
        <div class="kpi blue"><div class="lbl">Margen de explotación</div><div class="val">${clp(f.margen_bruto)}</div><div class="sub">${pct(mExpl)} sobre ventas</div></div>
        <div class="kpi"><div class="lbl">Resultado · margen operacional</div><div class="val">${clp(f.resultado)}</div><div class="sub">${pct(mOper)} sobre ventas</div></div>
        <div class="kpi red"><div class="lbl">Cuentas por cobrar</div><div class="val">${clp(f.cxc)}</div><div class="sub">${porCxC.length} cliente(s)</div></div>
      </div>
      <div class="panel" style="border-left:4px solid var(--red)">
        <h2>💳 Gestión de Cuentas por Cobrar</h2>
        <p class="hint">Facturas emitidas pendientes de pago — foco de cobranza. Total por cobrar: <b>${clp(cxcTot)}</b> · caja cobrada a hoy ${clp(f.cobrado)}.</p>
        ${porCxC.length ? table(cxcCols, cxcRows, cxcFoot) : '<p class="hint">Sin cuentas por cobrar pendientes 🎉</p>'}
      </div>
      <div class="grid2">
        <div class="panel statement"><h2>📄 Estado de Resultados</h2>
          ${row('Ingresos por ventas (neto)', f.ingresos)}
          ${row('(-) Costo de ventas', -f.costo, 'neg')}
          ${row('= Margen de explotación', f.margen_bruto, 'total')}
          ${row('(-) Gastos operativos', -f.gastos, 'neg')}
          ${row('= Resultado operativo', f.resultado, 'total')}
          <p class="hint" style="margin-top:8px">Margen de explotación <b>${pct(mExpl)}</b> · Margen operacional <b>${pct(mOper)}</b>.</p>
        </div>
        <div class="panel statement"><h2>💵 Flujo de Caja</h2>
          ${row('Cobrado (facturas pagadas)', f.cobrado)}
          ${row('CxC por cobrar (emitidas)', f.cxc)}
          <p class="hint" style="margin-top:12px">Detalle completo (Estado de Resultados, Flujo de Caja y Balance) en <b>4 finanzas / BD_FINANZAS_NUVA.xlsx</b>, alimentado por el CRM.</p>
        </div>
      </div>`;
  },
  decisiones(){
    const cols=[
      {k:'Tema',t:'Tema'},{k:'Decision',t:'Decisión / acción'},{k:'Responsable',t:'Responsable'},
      {k:'Estado',t:'Estado',render:r=>badge(r.Estado)}];
    return table(cols, D.decisiones);
  },
  reportes(){
    const card = id => {
      const R = REPORTES[id]; const rows = R.rows(); const n = rows.length;
      const prevCols = R.cols.map(c=>({k:c.t, t:c.t, num:c.num, render:r=>cellWeb(c,r)}));
      const prev = n ? table(prevCols, rows.slice(0,5))
                     : '<p class="hint">Sin registros aún — el archivo se descargará como plantilla con solo los encabezados.</p>';
      return `<div class="panel repcard">
        <div class="rephead">
          <h2>${R.icon} ${R.titulo}</h2>
          <div class="repbtns">
            <button class="btnrep xls" onclick="repExcel('${id}')">⬇ Excel</button>
            <button class="btnrep pdf" onclick="repPdf('${id}')">⬇ PDF</button>
          </div>
        </div>
        <p class="hint">${R.desc} · <b>${n}</b> registro(s).</p>
        ${prev}
      </div>`;
    };
    return `<p class="hint">Descarga cada reporte en Excel (.xls) o PDF. La vista previa muestra las primeras filas.</p>
      ${Object.keys(REPORTES).map(card).join('')}`;
  },
  productos(){
    const cols=[
      {k:'sku',t:'SKU'},
      {k:'desc',t:'Producto',render:r=>skuInfo(r.sku).Descripcion||''},
      {k:'sabor',t:'Sabor',render:r=>skuInfo(r.sku).Sabor||''},
      {k:'formato',t:'Formato',render:r=>skuInfo(r.sku).Formato||''},
      {k:'pvp',t:'PVP c/IVA',num:1,render:r=>clp(skuInfo(r.sku).PVP_cIVA)},
      {k:'costo',t:'Costo Unit',num:1,render:r=>clp(skuInfo(r.sku).Costo_Unit)},
      {k:'uds',t:'Uds vend.',num:1},
      {k:'venta',t:'Venta Neta',num:1,render:r=>clp(r.venta)},
      {k:'margen',t:'Margen',num:1,render:r=>clp(r.margen)},
      {k:'part',t:'% Venta',num:1,render:r=>pct(r.part)},
      {k:'estado',t:'Estado',render:r=>badge(r.uds>0?'Activo':'Sin ventas')}
    ];
    const foot={sku:'TOTAL',desc:'',sabor:'',formato:'',pvp:'',costo:'',uds:sum(porSKU,x=>x.uds),venta:clp(sum(porSKU,x=>x.venta)),margen:clp(sum(porSKU,x=>x.margen)),part:'100%',estado:''};
    return `<p class="hint">Analítica por producto (SKU): ventas, margen, participación y estado — base para decisiones de surtido y precio.</p>
      <div class="grid2">
        <div class="panel"><h2>🍫 Los productos</h2>
          <div class="imgslot"><img src="img/productos.jpg" alt="productos NUVA OXI" onerror="this.parentElement.classList.add('empty');this.remove();"><span class="imgslot-hint">🖼️ Espacio para la imagen de los 2 productos — guarda <b>img/productos.jpg</b> en <b>7 web</b>.</span></div>
        </div>
        <div class="panel"><h2>🏷️ Precios y formatos</h2>
          <ul class="dims">
            <li><b>Barra unitaria 35g</b> — PVP c/IVA <b>$1.990</b> · precio premium <b>$2.190</b></li>
            <li><b>Estuche 4×35g</b> — PVP c/IVA <b>$5.990</b> · precio premium <b>$6.490</b></li>
            <li>3 sabores: <b>Cacao · Maní · Frutal</b> (a base de orujo de uva)</li>
          </ul>
          <p class="hint">El <b>precio premium</b> aplica a clientes donde se puede vender más caro. Estos valores se versionan en el maestro de SKU (CRM).</p></div>
      </div>
      ${table(cols, porSKU, foot)}`;
  },
  logistica(){
    const pend = (D.pedidos||[]).filter(p=> String(p.Estado_Despacho||'').toLowerCase() !== 'entregado');
    const pcols=[
      {k:'ID_Pedido',t:'Pedido'},{k:'ID_Cliente',t:'Cliente',render:r=>nameCliente(r.ID_Cliente)},
      {k:'N_OC',t:'N° OC'},{k:'Estado',t:'Estado OC',render:r=>badge(r.Estado)},
      {k:'Estado_Despacho',t:'Despacho',render:r=>badge(r.Estado_Despacho)}];
    const lrows = (D.logistica||[]).map(l=>({...l, cliente:nameCliente(l.ID_Cliente)}));
    const lcols=[
      {k:'cliente',t:'Cliente'},{k:'Dias_Recepcion',t:'Días recepción'},{k:'Horario',t:'Horario'},
      {k:'Direccion_Entrega',t:'Dirección entrega'},{k:'Contacto',t:'Contacto'},{k:'Notas',t:'Notas'}];
    return `<p class="hint">Seguimiento de despachos y ventanas horarias de entrega por cliente.</p>
      <div class="panel"><h2>🚚 Despachos pendientes</h2>
        ${pend.length ? table(pcols, pend) : '<p class="hint">Sin despachos pendientes.</p>'}</div>
      <div class="panel"><h2>🕒 Ventanas de despacho / recepción por cliente</h2>
        <p class="hint">Días, horario, dirección y contacto de recepción de cada cliente. Se llena en <b>data.js → "logistica"</b>.</p>
        ${lrows.length ? table(lcols, lrows) : '<p class="hint">Aún sin horarios registrados — agrégalos en data.js → "logistica".</p>'}</div>`;
  },
  marketing(){
    const al=[];
    rotacion.filter(r=>r.si>0 && r.rot<0.35).forEach(r=>al.push({t:'Baja rotación',ref:namePDV(r.pdv),cls:'warn',msg:`Rotación ${pct(r.rot)} (sell-in ${r.si} / sell-out ${r.so}) — evaluar degustación o promoción para acelerar salida.`}));
    (D.pdv||[]).filter(p=>p.Estado==='Activo' && !(D.sellout||[]).some(s=>s.ID_PDV===p.ID_PDV))
      .forEach(p=>al.push({t:'Sin sell-out',ref:p.Nombre_PDV,cls:'warn',msg:'PDV activo sin registro de sell-out — visitar y activar el punto.'}));
    porSKU.filter(s=>s.uds===0).forEach(s=>al.push({t:'SKU sin ventas',ref:skuInfo(s.sku).Descripcion||s.sku,cls:'bad',msg:'Producto sin ventas — considerar campaña o material POP.'}));
    (D.clientes||[]).filter(c=>/prospecto|contactado/i.test(c.Estado)).forEach(c=>al.push({t:'Oportunidad cliente',ref:c.Cadena,cls:'warn',msg:`Cliente en estado "${c.Estado}" — apoyar cierre con propuesta de activación.`}));
    const alerts = al.length ? al.map(a=>`<div class="alert ${a.cls}"><b>${a.t} · ${a.ref}</b> — ${a.msg}</div>`).join('') : '<p class="hint">Sin alertas.</p>';
    const m = D.marca || {};
    const vid = m.Youtube || '';
    const vidId = (vid.match(/[?&]v=([\w-]+)/)||[])[1] || (vid.match(/youtu\.be\/([\w-]+)/)||[])[1] || '';
    const mrows=(D.marketing||[]).map(x=>({...x, cliente: x.ID_Cliente?nameCliente(x.ID_Cliente):'', pdv: x.ID_PDV?namePDV(x.ID_PDV):''}));
    const mcols=[
      {k:'Fecha',t:'Fecha'},{k:'Tipo',t:'Tipo',render:r=>badge(r.Tipo)},{k:'cliente',t:'Cliente'},{k:'pdv',t:'PDV'},
      {k:'Descripcion',t:'Descripción'},{k:'Costo',t:'Costo',num:1,render:r=>clp(r.Costo)},{k:'Estado',t:'Estado',render:r=>badge(r.Estado)}];
    const foco = rotacion.filter(r=>r.si>0 && r.rot<0.5).sort((a,b)=>a.rot-b.rot).slice(0,5);
    const redes = [
      'Dar PROTAGONISMO a la fundadora: rostro, historia y voz propia — autenticidad &gt; imágenes con look de IA.',
      'Educar sobre antioxidantes: crear la categoría (el gran reto), en lenguaje simple y con beneficios reales.',
      'Contar el relato del orujo de uva y la economía circular con Concha y Toro (diferenciador único).',
      'Mostrar detrás de escena, degustaciones y PDV — contenido real y cercano.',
      'Segmentar por sabor: Maní (energía/saciedad), Cacao (indulgencia consciente), Frutal (ligero/antiox).'
    ];
    return `<p class="hint">Marketing <b>alineado a la venta</b>: dónde activar, cómo comunicar y qué está planificado.</p>
      <div class="grid2">
        <div class="panel"><h2>🎯 Foco: dónde activar (alineado a venta)</h2>
          <p class="hint">PDV con menor rotación = prioridad para degustación/activación que empuje el sell-out.</p>
          ${foco.length? table([
            {k:'pdv',t:'PDV',render:r=>namePDV(r.pdv)},
            {k:'si',t:'Sell-In',num:1},{k:'so',t:'Sell-Out',num:1},
            {k:'rot',t:'Rotación',num:1,render:r=>pct(r.rot)}
          ], foco) : '<p class="hint">Sin PDV prioritarios.</p>'}</div>
        <div class="panel"><h2>📸 Redes sociales &amp; autenticidad</h2>
          <a class="iglanding" href="${m.Instagram||'#'}" target="_blank" rel="noopener"><span class="iglogo">📷</span><span><b>@nuva_oxi</b><br><span class="hint" style="margin:0">Abrir Instagram ↗</span></span></a>
          <div class="imgslot" style="margin:10px 0"><img src="img/instagram.jpg" alt="preview instagram" onerror="this.parentElement.classList.add('empty');this.remove();"><span class="imgslot-hint">🖼️ Vista previa del landing de IG — guarda un screenshot como <b>img/instagram.jpg</b> en <b>7 web</b>.</span></div>
          ${vidId?`<a class="ytcard" href="${vid}" target="_blank" rel="noopener" title="Ver en YouTube"><img src="https://img.youtube.com/vi/${vidId}/hqdefault.jpg" alt="Video NUVA OXI" loading="lazy" onerror="this.style.display='none'"/><span class="ytplay">▶ Ver video</span></a>`:''}
          <ul class="dims" style="margin-top:10px">${redes.map(t=>`<li>${t}</li>`).join('')}</ul></div>
      </div>
      <div class="panel"><h2>🚨 Alertas de trade marketing</h2>${alerts}</div>
      <div class="panel"><h2>📣 Plan de acciones</h2>
        <p class="hint">Registra degustaciones, promociones, activaciones y campañas en <b>extra.js → "marketing"</b>.</p>
        ${mrows.length ? table(mcols, mrows) : '<p class="hint">Aún sin acciones registradas.</p>'}</div>`;
  },
  inventario(){
    const cols=[
      {k:'pdv',t:'PDV',render:r=>namePDV(r.pdv)},
      {k:'cli',t:'Cliente',render:r=>nameCliente(cliDePDV(r.pdv))},
      {k:'si',t:'Sell-In',num:1},
      {k:'so',t:'Sell-Out',num:1},
      {k:'stock',t:'Stock teórico',num:1},
      {k:'max',t:'Objetivo (máx)',num:1},
      {k:'min',t:'Reorden (mín)',num:1},
      {k:'reponer',t:'Reponer',num:1,render:r=> r.reponer>0?`<b style="color:var(--red)">${r.reponer} u</b>`:'—'},
      {k:'rot',t:'Rotación',num:1,render:r=>pct(r.rot)},
      {k:'estado',t:'Estado',render:r=>`<span class="badge ${r.cls}">${r.estado}</span>`}
    ];
    const segs=['Todos', ...new Set(inventarioPDV.map(r=>segCliente(cliDePDV(r.pdv))))];
    const rows=inventarioPDV.filter(r=> invSeg==='Todos' || segCliente(cliDePDV(r.pdv))===invSeg);
    const chips=segs.map(s=>`<button class="chip ${invSeg===s?'active':''}" onclick="invFiltro('${s}')">${s}</button>`).join('');
    const totSi=sum(rows,x=>x.si), totSo=sum(rows,x=>x.so), totStock=sum(rows,x=>x.stock);
    const aRep=rows.filter(r=>r.reponer>0);
    const totRep=sum(aRep,x=>x.reponer);
    const sobre=rows.filter(r=>r.estado==='Sobre-stock');
    const foot={pdv:'TOTAL',cli:'',si:totSi,so:totSo,stock:totStock,max:sum(inventarioPDV,x=>x.max),min:'',reponer:totRep,rot:pct(totSi?totSo/totSi:0),estado:''};
    const alerts=[
      ...aRep.map(r=>`<div class="alert bad">🔴 <b>${namePDV(r.pdv)}</b>: bajo mínimo — stock ${r.stock}u ≤ reorden ${r.min}u. <b>Reponer ${r.reponer}u</b> (hasta objetivo ${r.max}u).</div>`),
      ...sobre.map(r=>`<div class="alert warn">🟠 <b>${namePDV(r.pdv)}</b>: sobre-stock — ${r.stock}u en tienda, rotación ${pct(r.rot)}. Frenar reposición / activar salida.</div>`)
    ].join('');
    return `<p class="hint">Modelo de <b>ruta propia</b>: stock teórico = Sell-In − Sell-Out. Cuando cae al <b>reorden (mín)</b>, se sugiere reponer hasta el <b>objetivo (máx)</b>. Es una estimación; el stock real requiere conteo físico.</p>
      <div class="filterbar"><div class="chips">${chips}</div><p class="hint" style="margin:0">${rows.length} PDV${invSeg==='Todos'?'':' · '+invSeg}</p></div>
      <div class="kpis">
        <div class="kpi"><div class="lbl">Stock teórico en canal</div><div class="val">${totStock} u</div><div class="sub">de ${totSi}u despachadas</div></div>
        <div class="kpi red"><div class="lbl">Unidades a reponer</div><div class="val">${totRep} u</div><div class="sub">${aRep.length} PDV bajo mínimo</div></div>
        <div class="kpi amber"><div class="lbl">PDV con sobre-stock</div><div class="val">${sobre.length}</div></div>
      </div>
      ${alerts?`<div class="panel"><h2>🚚 Sugerencia de reposición (ruta)</h2>${alerts}</div>`:''}
      <div class="panel"><h2>📦 Stock y reposición por punto de venta</h2>${table(cols, rows, foot)}
        <p class="hint" style="margin-top:8px">Objetivo/reorden por defecto son <b>sugeridos</b> (máx = sell-in del PDV, mín = 30%). Ajústalos por PDV en <b>data.js → "asignacion"</b>. "Sin sell-out" = sin venta al consumidor registrada (fuera de Jumbo es parcial).</p></div>`;
  },
  mercado(){
    const m = D.marca || {};
    const vid = m.Youtube || '';
    const vidId = (vid.match(/[?&]v=([\w-]+)/)||[])[1] || (vid.match(/youtu\.be\/([\w-]+)/)||[])[1] || '';
    const comp = D.competencia || [];
    const buscar = marca => `https://www.google.com/search?q=${encodeURIComponent(marca+' marca chile pricing formatos instagram')}`;
    const ccols=[
      {k:'Marca',t:'Marca'},
      {k:'Categoria',t:'Categoría / relato'},
      {k:'Formatos',t:'Formatos',render:r=>r.Formatos||'—'},
      {k:'Pricing',t:'Pricing ref.',render:r=>r.Pricing||'—'},
      {k:'Instagram',t:'Redes',render:r=> r.Instagram?`<a class="lnk" href="${r.Instagram}" target="_blank" rel="noopener">Instagram</a>`:'—'},
      {k:'Notas',t:'Notas / a analizar'},
      {k:'_a',t:'',render:r=>`<a class="btnrep xls" style="text-decoration:none" href="${buscar(r.Marca)}" target="_blank" rel="noopener">🔎 Analizar</a>`}
    ];
    const dims = ['Línea de producto','Formatos y gramajes','Pricing y promociones','Redes sociales y contenido','Relato / historia de marca','Benchmark funcional: antioxidantes ↔ proteína'];
    const nx = D.nuvaoxi || {}, ind = D.industria || {};
    const tendHtml = (ind.tendencias||[]).map(t=>`<div class="alert" style="border-color:var(--green-l);background:#f1f8f4"><b>${t.titulo}</b><br><span class="hint" style="margin:2px 0 0">${t.detalle}</span></div>`).join('');
    const desaf = h => (ind.desafios||[]).filter(d=>d.horizonte===h).map(d=>`<div class="alert ${h==='actual'?'warn':'bad'}"><b>${d.titulo}</b><br><span class="hint" style="margin:4px 0">${d.detalle}</span>${d.respuesta_nuvaoxi?`<div style="margin-top:6px"><span class="badge b-green">✅ Cómo lo aborda la plataforma</span> <span class="hint" style="margin:2px 0 0">${d.respuesta_nuvaoxi}</span></div>`:''}</div>`).join('');
    const oport = (ind.oportunidades||[]).map(o=>`<div class="alert" style="border-color:var(--lime);background:#f7faef"><b>${o.titulo}</b><br><span class="hint" style="margin:2px 0 0">${o.detalle}</span></div>`).join('');
    const fuentes = (ind.fuentes||[]).map(u=>`<a class="lnk" href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//,'').split('/')[0]}</a>`).join(' · ');
    return `
      <div class="panel"><h2>🧭 Posicionamiento</h2><p class="hint">${m.Posicionamiento||''}</p></div>
      <div class="grid2">
        <div class="panel"><h2>📋 Dimensiones a comparar</h2>
          <ul class="dims">${dims.map(d=>`<li>${d}</li>`).join('')}</ul>
          <p class="hint">Guía para el benchmark de cada competidor.</p></div>
        <div class="panel"><h2>🖼️ Referencia visual del mercado</h2>
          <div class="imgslot"><img src="img/benchmark.jpg" alt="benchmark mercado" onerror="this.parentElement.classList.add('empty');this.remove();"><span class="imgslot-hint">🖼️ Espacio para imagen — guarda <b>img/benchmark.jpg</b> en la carpeta <b>7 web</b> y aparece aquí.</span></div>
        </div>
      </div>
      <div class="panel"><h2>🔍 Benchmark de competencia</h2>
        <p class="hint">Barrido 2026 de referentes en Chile (Jumbo/Líder). Editable en <b>industria.js → "competencia"</b>; usa <b>🔎 Analizar</b> para profundizar cada marca.</p>
        ${comp.length? table(ccols, comp) : '<p class="hint">Sin competidores cargados.</p>'}</div>
      ${nx.resumen?`<div class="panel" style="border-left:4px solid var(--green-l)"><h2>🎯 Nuestra posición · el "espacio blanco"</h2>
        <p class="hint">${nx.resumen}</p>
        ${nx.diferenciadores?`<ul class="dims">${nx.diferenciadores.map(d=>`<li>${d}</li>`).join('')}</ul>`:''}</div>`:''}
      ${tendHtml?`<div class="panel"><h2>📈 Tendencias de la industria</h2>${tendHtml}</div>`:''}
      ${(ind.desafios&&ind.desafios.length)?`<div class="grid2">
        <div class="panel"><h2>⚠️ Desafíos actuales</h2>${desaf('actual')||'<p class="hint">—</p>'}</div>
        <div class="panel"><h2>🔮 Desafíos futuros</h2>${desaf('futuro')||'<p class="hint">—</p>'}</div>
      </div>`:''}
      ${oport?`<div class="panel"><h2>🚀 Oportunidades para NUVA OXI</h2>${oport}</div>`:''}
      ${(ind.historias&&ind.historias.length)?`<div class="panel"><h2>💡 Historias que inspiran · casos de éxito a estudiar</h2>
        <p class="hint">Referentes dignos de estudio para el enfoque de marca, el relato y el crecimiento.</p>
        <div class="imgslot"><img src="img/inspiracion.jpg" alt="historias que inspiran" onerror="this.parentElement.classList.add('empty');this.remove();"><span class="imgslot-hint">🖼️ Espacio para imagen — guarda <b>img/inspiracion.jpg</b> en <b>7 web</b>.</span></div>
        ${ind.historias.map(h=>`<div class="alert" style="border-color:var(--blue);background:#eef3fb"><b>${h.nombre}</b> — ${h.detalle} ${h.url?`<a class="lnk" href="${h.url}" target="_blank" rel="noopener">${/youtube|youtu\.be/.test(h.url)?'▶ ver video':'ver más'} ↗</a>`:''}</div>`).join('')}</div>`:''}
      ${fuentes?`<div class="panel"><h2>🔗 Fuentes del barrido</h2><p class="hint" style="line-height:1.9">${fuentes}</p></div>`:''}`;
  },
  planning(){
    const rows = D.planning || [];
    const cols=[
      {k:'Iniciativa',t:'Iniciativa'},
      {k:'Area',t:'Área'},
      {k:'Responsable',t:'Responsable'},
      {k:'Periodo',t:'Período'},
      {k:'Prioridad',t:'Prioridad',render:r=>badge(r.Prioridad)},
      {k:'Estado',t:'Estado',render:r=>badge(r.Estado)}
    ];
    const pilares=[
      {ic:'🎯',t:'Planificación Estratégica',def:'Define metas y objetivos, alineando recursos y esfuerzos con la visión del negocio.',
       sug:['Meta del piloto (ago–oct): validar rotación y elegir 2 canales ganadores con <b>datos</b>, no intuición.','Norte de marca: ser el referente de <b>wellness funcional con antioxidantes</b> — el espacio blanco frente a Wild (proteína) y Mizos (familia).','3 KPIs de éxito: rotación (sell-out/sell-in), cobertura con venta y margen por canal.']},
      {ic:'🗺️',t:'Distribución de Espacios',def:'Optimiza la distribución de tiendas y productos para mejorar la experiencia del cliente y la rentabilidad.',
       sug:['Priorizar PDV por score (calce + rotación + margen); no robar el stock de seguridad de Jumbo.','Góndola: buscar el pasillo "Mundo Saludable" y el punto de caja para el formato unitario (impulso).','Multicanal: Jumbo (volumen) + HORECA / tiendas saludables / universidades (margen y menor competencia).']},
      {ic:'📦',t:'Planificación de Mercancías',def:'Asegura que los productos estén disponibles en la cantidad y momento adecuados, minimizando costos y maximizando ventas.',
       sug:['Par-level por PDV (máx/mín) para reponer antes del quiebre — ya modelado en <b>Inventario</b>.','Mix por sabor y formato según rotación real: frenar el que no rota, empujar el que sí.','Sincronizar producción con la demanda del piloto para no sobre-stockear ni quebrar.']}
    ];
    const cards = pilares.map(p=>`<div class="panel"><h2>${p.ic} ${p.t}</h2>
      <p class="hint">${p.def}</p>
      <ul class="dims">${p.sug.map(s=>`<li>${s}</li>`).join('')}</ul></div>`).join('');
    return `<p class="hint">Planificación estratégica del piloto: hacia dónde vamos, cómo distribuimos el espacio y cómo aseguramos producto disponible.</p>
      ${cards}
      <div class="panel"><h2>🗓️ Roadmap de iniciativas</h2>
        <p class="hint">Iniciativas por área, responsable, período y estado. Edita en <b>extra.js → "planning"</b>.</p>
        ${rows.length ? table(cols, rows) : '<p class="hint">Sin iniciativas cargadas aún.</p>'}</div>`;
  },
  pnl(){
    const f = D.finanzas || {};
    const gastos = D.pnl_gastos || [];
    const ing = f.ingresos || 0;
    const costo = f.costo || 0;
    const mb = f.margen_bruto != null ? f.margen_bruto : (ing - costo);
    const totG = gastos.length ? sum(gastos, x=>x.Monto) : (f.gastos || 0);
    const res = mb - totG;
    const p = v => ing ? pct(v/ing) : '—';
    const line = (l,v,cls='',showP=true)=>`<div class="stmt-row ${cls}"><span>${l}</span><span>${clp(v)}${showP&&ing?` · <span class="pct">${p(Math.abs(v))}</span>`:''}</span></div>`;
    return `
      <div class="kpis">
        <div class="kpi"><div class="lbl">Ingresos (neto)</div><div class="val">${clp(ing)}</div></div>
        <div class="kpi blue"><div class="lbl">Margen bruto</div><div class="val">${clp(mb)}</div><div class="sub">${p(mb)} de ventas</div></div>
        <div class="kpi"><div class="lbl">Resultado operativo</div><div class="val">${clp(res)}</div><div class="sub">${p(res)} de ventas</div></div>
      </div>
      <div class="panel statement" style="max-width:660px"><h2>📄 Estado de Resultados · P&amp;L (piloto)</h2>
        ${line('Ingresos por ventas (neto)', ing, '', false)}
        ${line('(-) Costo de ventas', -costo, 'neg')}
        ${line('= Margen bruto', mb, 'total')}
        ${gastos.map(g=>line('(-) '+g.Concepto, -g.Monto, 'neg')).join('')}
        ${line('= Resultado operativo (EBITDA)', res, 'total')}
        <p class="hint" style="margin-top:8px">Costo unitario $250/u es <b>supuesto</b> (a validar). Desglose de gastos de <b>ejemplo</b> en <b>extra.js → "pnl_gastos"</b>. Los % son sobre ventas.</p>
      </div>`;
  },
  flujo(){
    const b=(x,y,t,s,fill)=>`<rect x="${x}" y="${y}" width="155" height="58" rx="10" fill="${fill||'var(--green)'}" stroke="#fff" stroke-width="1.5"/><text x="${x+77}" y="${y+27}" class="fx-t">${t}</text><text x="${x+77}" y="${y+43}" class="fx-s">${s}</text>`;
    const ar=(x1,y1,x2,y2,d)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#7fae9c" stroke-width="2" marker-end="url(#ar)" ${d?'stroke-dasharray="4 4"':''}/>`;
    return `<p class="hint">Flujo de control del negocio: del plan a la reposición, con la dirección comercial y el CRM como centro de datos y decisiones. Simplificado.</p>
      <div class="panel"><div class="fxwrap"><svg viewBox="0 0 960 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Flujo operacional">
        <defs><marker id="ar" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#7fae9c"/></marker></defs>
        ${b(18,54,'Planificación','y compras')}
        ${b(205,54,'Inventario','bodega')}
        ${b(392,54,'Despacho','ruta propia')}
        ${b(579,54,'Punto de venta','sell-in')}
        ${b(766,54,'Consumidor','sell-out','var(--green-l)')}
        ${ar(173,83,204,83)}${ar(360,83,391,83)}${ar(547,83,578,83)}${ar(734,83,765,83)}
        <path d="M 843 54 C 843 16, 95 16, 95 52" fill="none" stroke="var(--amber)" stroke-width="2" marker-end="url(#ar)"/>
        <text x="469" y="12" class="fx-lbl">Reposición: cuando el stock cae al mínimo, se repone hasta el objetivo</text>
        ${b(18,205,'Finanzas','cobranza · P&amp;L','#2b6b52')}
        <rect x="300" y="200" width="360" height="66" rx="12" fill="var(--green-d)" stroke="var(--lime)" stroke-width="2.5"/><text x="480" y="228" class="fx-t">Dirección comercial (tú) · CRM</text><text x="480" y="246" class="fx-s">datos → control, alertas y decisiones</text>
        ${b(766,205,'Marketing y trade','alineado a la venta','#2b6b52')}
        ${ar(400,200,300,113,1)}${ar(480,200,470,113,1)}${ar(560,200,650,113,1)}
        ${ar(173,235,299,235)}${ar(765,235,661,235)}
        ${ar(830,205,845,113,1)}<text x="808" y="160" class="fx-lbl">empuja venta</text>
        <rect x="300" y="320" width="360" height="54" rx="12" fill="#8a5a1c" stroke="#fff" stroke-width="1.5"/><text x="480" y="343" class="fx-t">Estudio permanente de industria</text><text x="480" y="360" class="fx-s">oportunidades · riesgos · amenazas</text>
        ${ar(480,320,480,267,1)}
      </svg></div>
      <p class="hint" style="margin-top:6px">🟢 cadena física · 🟠 reposición · punteadas = control/estudio del CRM · <b>Marketing empuja la venta</b> y estudiamos la industria de forma <b>permanente</b> para detectar oportunidades, riesgos y amenazas.</p></div>`;
  },
  calendario(){
    const g = (D.google)||{}, tz = g.tz || 'America/Santiago';
    const src = String(g.calendar_src || g.cuenta || '').trim();
    const acct = String(g.cuenta||'').trim();
    const openCal = acct ? `https://calendar.google.com/calendar/r?authuser=${encodeURIComponent(acct)}` : 'https://calendar.google.com/calendar/r';
    const embed = src ? `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(src)}&ctz=${encodeURIComponent(tz)}&hl=es` : '';
    return `
      <div class="gmtoolbar">
        <div class="gm-acct"><span class="gchip">📅 Google Calendar</span>${src?` <span class="hint" style="margin:0">${src}</span>`:''}</div>
        <div class="repbtns">
          <a class="btnrep pdf" href="${openCal}" target="_blank" rel="noopener">↗ Abrir completo</a>
          <a class="btnrep xls" href="https://calendar.google.com/calendar/u/0/r/eventedit" target="_blank" rel="noopener">➕ Nuevo evento</a>
        </div>
      </div>
      ${embed
        ? `<div class="gframe-wrap"><iframe class="gframe" src="${embed}" frameborder="0" scrolling="no" title="Google Calendar"></iframe></div>
           <p class="hint">Iframe del calendario <b>público</b> de <b>${src}</b>. Si aparece vacío, publícalo: Google Calendar → Configuración → tu calendario → <b>Permisos de acceso a eventos → "Hacer disponible de forma pública"</b>.</p>`
        : `<div class="glaunch"><div class="glaunch-ico">📅</div><h2>Conecta tu Google Calendar</h2>
             <p class="hint" style="max-width:520px">Para verlo embebido aquí, pon tu correo o ID de calendario en <b>extra.js → "google" → "calendar_src"</b>. Mientras tanto, ábrelo directo e inicia sesión:</p>
             <a class="btn-google" href="${openCal}" target="_blank" rel="noopener">Abrir Google Calendar →</a></div>`}`;
  },
  correo(){ return (typeof gmailView==='function') ? gmailView() : '<p class="hint">Cargando módulo de correo…</p>'; },
  gerencia(){
    const meses = mesesVenta();
    const mesAct = meses.length ? meses[meses.length-1] : 'Todo';
    const cob = coberturaPeriodo(mesAct);
    const cxcTot = sum(porCxC||[], x=>x.monto);
    const proxVence = (porCxC||[]).map(x=>x.vence).filter(Boolean).sort()[0] || '—';
    const f = D.finanzas || {};
    const canalCols=[
      {k:'canal',t:'Canal'},{k:'uds',t:'Uds',num:1},
      {k:'venta',t:'Venta Neta',num:1,render:r=>clp(r.venta)},
      {k:'part',t:'% $',num:1,render:r=>pct(r.venta/(K.venta||1))}
    ];
    const cliAgg={}; (D.sellin||[]).forEach(v=>{ const k=v.ID_Cliente; (cliAgg[k]=cliAgg[k]||{cli:k,venta:0,pdvs:new Set()}); cliAgg[k].venta+=Number(v.Venta_Neta)||0; cliAgg[k].pdvs.add(v.ID_PDV); });
    const topCli=Object.values(cliAgg).map(x=>({cli:x.cli,venta:x.venta,pdvs:x.pdvs.size})).sort((a,b)=>b.venta-a.venta).slice(0,5);
    const topCliCols=[
      {k:'cli',t:'Cliente',render:r=>nameCliente(r.cli)},
      {k:'pdvs',t:'Locales',num:1},
      {k:'venta',t:'Venta Neta',num:1,render:r=>clp(r.venta)},
      {k:'part',t:'% $',num:1,render:r=>pct(r.venta/(K.venta||1))}
    ];
    const alertas=[];
    if(cxcTot>0){ const t=porCxC[0]; alertas.push(`<div class="alert bad">💸 <b>Cobranza</b>: ${clp(cxcTot)} por cobrar · mayor ${nameCliente(t.cli)} (${clp(t.monto)}${t.vence?', vence '+t.vence:''}).</div>`); }
    const rep=(inventarioPDV||[]).filter(r=>r.reponer>0);
    if(rep.length){ const tot=sum(rep,x=>x.reponer); alertas.push(`<div class="alert warn">🚚 <b>Reposición</b>: ${rep.length} PDV bajo mínimo (${tot}u a reponer).</div>`); }
    const sinSo=(D.pdv||[]).filter(p=>p.Estado==='Activo' && !(D.sellout||[]).some(s=>s.ID_PDV===p.ID_PDV)).length;
    if(sinSo){ alertas.push(`<div class="alert warn">📉 <b>${sinSo} PDV activo(s) sin sell-out</b> — riesgo de baja rotación / sobre-stock.</div>`); }
    return `
      <div class="filterbar">
        <p class="hint" style="margin:0">Vista ejecutiva · solo lo esencial · Gerencia · piloto NUVA OXI · período ${mesAct==='Todo'?'acumulado':mesAct}.</p>
        <div class="repbtns"><button class="btnrep xls" onclick="gerenciaExcel()">⬇ Excel</button><button class="btnrep pdf" onclick="gerenciaPdf()">⬇ PDF</button></div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="lbl">Venta Sell-In (neto)</div><div class="val">${clp(K.venta)}</div><div class="sub">${K.uds} u · bruto c/IVA ${clp(K.venta*1.19)}</div></div>
        <div class="kpi blue"><div class="lbl">Margen bruto</div><div class="val">${clp(K.margen)}</div><div class="sub">${pct(K.margen/(K.venta||1))} s/ venta</div></div>
        <div class="kpi"><div class="lbl">Resultado operativo</div><div class="val">${clp(f.resultado||0)}</div><div class="sub">${f.ingresos?pct((f.resultado||0)/f.ingresos):'—'} s/ ventas</div></div>
        <div class="kpi red"><div class="lbl">Cobranzas pendientes</div><div class="val">${clp(cxcTot)}</div><div class="sub">${(porCxC||[]).length} cliente(s) · próx. vence ${proxVence}</div></div>
        <div class="kpi amber"><div class="lbl">Cobertura (${mesAct==='Todo'?'acum.':mesAct})</div><div class="val">${cob.pdvCon}/${cob.pdvTot} · ${pct(cob.pctPdv)}</div><div class="sub">${cob.cliCon}/${cob.cliTot} clientes con venta</div></div>
      </div>
      <div class="grid2">
        <div class="panel"><h2>🏷️ Venta por canal</h2>${table(canalCols, porCanal, {canal:'TOTAL',uds:K.uds,venta:clp(K.venta),part:'100%'})}</div>
        <div class="panel"><h2>🏢 Top 5 clientes (suma de locales)</h2>${table(topCliCols, topCli)}</div>
      </div>
      <div class="panel"><h2>🚨 Alertas clave</h2>${alertas.length?alertas.join(''):'<p class="hint">Sin alertas críticas.</p>'}</div>
      <p class="hint">El detalle operativo (sell-in por SKU, órdenes de compra, inventario y clientes) vive en sus secciones: <b>Contabilidad</b>, <b>Inventario</b> y <b>Clientes</b>. El botón Excel/PDF descarga el informe completo.</p>`;
  }
};

function barsChart(){
  const max = Math.max(...rotacion.map(r=>r.si), 1);
  const rows = rotacion.map(r=>`
    <div class="barrow"><span class="barlbl" title="${namePDV(r.pdv)}">${namePDV(r.pdv)}</span>
      <div class="track">
        <div class="fill si" style="width:${r.si/max*100}%"></div>
      </div><span>${r.si}</span></div>
    <div class="barrow"><span></span>
      <div class="track"><div class="fill so" style="width:${r.so/max*100}%"></div></div><span>${r.so}</span></div>`).join('');
  return `<div class="bars">${rows}</div>
    <div class="legend"><span><i style="background:var(--green-l)"></i>Sell-In</span><span><i style="background:var(--lime)"></i>Sell-Out</span></div>`;
}

/* barras simples de una serie de periodos (venta) */
function miniBars(per){
  const max = Math.max(...per.map(p=>Number(p.Venta)||0), 1);
  return `<div class="bars">${per.map(p=>`<div class="barrow"><span class="barlbl" title="${p.Periodo}">${p.Periodo}</span><div class="track"><div class="fill si" style="width:${(Number(p.Venta)||0)/max*100}%"></div></div><span>${clp(p.Venta)}</span></div>`).join('')}</div>`;
}

/* ---- Mapa simple de PDV (SVG offline, sin librerias ni internet) ----
   Ubica cada PDV por el centroide aprox. de su comuna (Region Metropolitana).
   Las comunas en data.js vienen sin tildes/ñ, asi que basta lowercase+trim. */
const cnorm = s => String(s||'').toLowerCase().trim();
const COMUNA_COORD = {
  'las condes':[-33.409,-70.567], 'providencia':[-33.430,-70.617], 'vitacura':[-33.380,-70.575],
  'la reina':[-33.443,-70.535], 'la florida':[-33.522,-70.599], 'maipu':[-33.510,-70.758],
  'penalolen':[-33.487,-70.545], 'nunoa':[-33.456,-70.597], 'puente alto':[-33.611,-70.575],
  'san bernardo':[-33.592,-70.700], 'pirque':[-33.663,-70.548]
};
function mapaSVG(rows){
  const W=660, H=460, pad=50;
  const pts = rows.map(p=>{ const c=COMUNA_COORD[cnorm(p.Comuna)]; return c?{p,lat:c[0],lng:c[1]}:null; }).filter(Boolean);
  const sinCoord = rows.length - pts.length;
  if(!pts.length) return '<p class="hint">Sin comunas mapeables para este filtro.</p>';
  const lats=pts.map(x=>x.lat), lngs=pts.map(x=>x.lng);
  const latMin=Math.min(...lats), latMax=Math.max(...lats), lngMin=Math.min(...lngs), lngMax=Math.max(...lngs);
  const spanLat=(latMax-latMin)||0.02, spanLng=(lngMax-lngMin)||0.02;
  const X=lng=> pad + (lng-lngMin)/spanLng*(W-2*pad);
  const Y=lat=> pad + (latMax-lat)/spanLat*(H-2*pad);   // norte arriba
  const byComuna={};
  pts.forEach(x=>{ const k=cnorm(x.p.Comuna); (byComuna[k]=byComuna[k]||[]).push(x); });
  let dots='', labels='';
  Object.values(byComuna).forEach(arr=>{
    const cx=X(arr[0].lng), cy=Y(arr[0].lat);
    labels+=`<text x="${cx.toFixed(0)}" y="${(cy-13).toFixed(0)}" class="mp-lbl">${arr[0].p.Comuna} (${arr.length})</text>`;
    const r = arr.length>1 ? Math.min(9+arr.length*1.4, 24) : 0;
    arr.forEach((x,i)=>{
      const ang=i/arr.length*2*Math.PI;
      const dx=cx+Math.cos(ang)*r, dy=cy+Math.sin(ang)*r;
      const activo = x.p.Estado==='Activo';
      dots+=`<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="5" fill="${activo?'var(--green-l)':'var(--amber)'}" stroke="#fff" stroke-width="1.3"><title>${x.p.Nombre_PDV} — ${nameCliente(x.p.ID_Cliente)} · ${x.p.Comuna} (${x.p.Estado})</title></circle>`;
    });
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="mapa" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mapa de puntos de venta">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#eef4f0" rx="12"/>
    <text x="${pad}" y="26" class="mp-cardinal">N ↑</text>
    ${labels}${dots}
  </svg>
  <div class="legend"><span><i style="background:var(--green-l)"></i>Activo</span><span><i style="background:var(--amber)"></i>Otro estado</span><span class="mp-hint">Posición geográfica aproximada por comuna (RM). Pasa el cursor sobre un punto para ver el PDV.${sinCoord?` · ${sinCoord} PDV sin comuna mapeable.`:''}</span></div>`;
}

/* mapaPDV: usa Leaflet (mapa real con calles) si está disponible (hay internet);
   si no, cae al mapa esquemático SVG offline. */
function mapaPDV(rows){
  if(window.L) return `<div id="mapaLeaflet" class="mapa-real"></div>
    <div class="legend"><span><i style="background:#2fa377"></i>Activo</span><span><i style="background:#e8a33d"></i>Otro estado</span><span class="mp-hint">Mapa OpenStreetMap · clic en un punto para ver el PDV · rueda+Ctrl o botones para zoom.</span></div>`;
  return mapaSVG(rows);
}
let _leafMap=null;
function initLeafletMap(){
  const el=document.getElementById('mapaLeaflet');
  if(!el || !window.L) return;
  if(_leafMap){ try{ _leafMap.remove(); }catch(e){} _leafMap=null; }
  const map=L.map(el,{scrollWheelZoom:false});
  _leafMap=map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18, attribution:'© OpenStreetMap'}).addTo(map);
  const rows=pdvFiltrados(), byC={};
  rows.forEach(p=>{ const c=COMUNA_COORD[cnorm(p.Comuna)]; if(c){ (byC[cnorm(p.Comuna)]=byC[cnorm(p.Comuna)]||[]).push({p,c}); } });
  const markers=[];
  Object.values(byC).forEach(arr=>{
    arr.forEach((x,i)=>{
      const ang = arr.length>1 ? i/arr.length*2*Math.PI : 0;
      const jr = arr.length>1 ? 0.007 : 0;   // separa los del mismo comuna (~0.7km)
      const lat=x.c[0]+Math.sin(ang)*jr, lng=x.c[1]+Math.cos(ang)*jr;
      const activo = x.p.Estado==='Activo';
      const m=L.circleMarker([lat,lng],{radius:7,color:'#fff',weight:1.6,fillColor:activo?'#2fa377':'#e8a33d',fillOpacity:.95});
      m.bindPopup(`<b>${x.p.Nombre_PDV}</b><br>${nameCliente(x.p.ID_Cliente)} · ${x.p.Comuna}<br>Estado: ${x.p.Estado}`);
      m.addTo(map); markers.push(m);
    });
  });
  if(markers.length){ map.fitBounds(L.featureGroup(markers).getBounds().pad(0.25)); }
  else { map.setView([-33.45,-70.62],10); }
  setTimeout(()=>map.invalidateSize(),120);
}

/* ---- Reportes descargables (Excel .xls y PDF via impresion del navegador) ----
   Cada columna: {t:titulo, num:bool, raw:(r)=>valor crudo (Excel), web:(r)=>texto formateado (web/PDF)} */
const IVA = 0.19;
const ivaDe = n => Math.round(Number(n||0) * IVA);
const totDe = n => Math.round(Number(n||0) * (1 + IVA));
const descSKU = sku => (D.sku.find(s => s.SKU === sku) || {}).Descripcion || '';
const cellWeb = (c, r) => c.web ? c.web(r) : (c.raw(r) ?? '');
const cellRaw = (c, r) => { const v = c.raw(r); return v == null ? '' : v; };
const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const stamp = () => new Date().toLocaleDateString('es-CL');

/* ---- Facturas de COMPRA: manifiesto NUVA_COMPRAS (generado por gen-facturas.ps1) ----
   Convencion de nombre: COMPRA-<folio>-<Proveedor>.pdf (ASCII, proveedor en un token). */
const COMPRAS_PDF = window.NUVA_COMPRAS || [];
const COMP_BASE = '../4 finanzas/contabilidad/2 facturas compras/';
function parseCompra(file){
  const base = String(file).replace(/\.pdf$/i,'');
  const parts = base.split('-');
  if(parts[0] && parts[0].toUpperCase()==='COMPRA' && parts.length>=3)
    return { Folio: parts[1], Proveedor: parts.slice(2).join(' ') };
  return { Folio:'', Proveedor: base };
}
function comprasPdfDe(row){
  const keys = [String(row.Folio||''), row.Proveedor].filter(Boolean).map(norm).filter(Boolean);
  return COMPRAS_PDF.filter(f => { const nf = norm(f); return keys.some(k => nf.includes(k)); });
}
function compraBtns(files){
  if(!files || !files.length) return '';
  return files.map(f => `<a class="btnpdf" href="${encodeURI(COMP_BASE + f)}" target="_blank" rel="noopener" title="${f}">📄 Ver / Descargar</a>`).join(' ');
}

const REPORTES = {
  ventas: {
    icon:'🧾', titulo:'Reporte de Ventas — Detalle de Facturación',
    desc:'Cada venta (sell-in) con neto, IVA (19%), total, margen y estado de factura.',
    cols:[
      {t:'Fecha', raw:r=>r.Fecha},
      {t:'Cliente', raw:r=>nameCliente(r.ID_Cliente)},
      {t:'PDV', raw:r=>namePDV(r.ID_PDV)},
      {t:'SKU', raw:r=>r.SKU},
      {t:'Descripción', raw:r=>descSKU(r.SKU)},
      {t:'Uds', num:1, raw:r=>r.Uds},
      {t:'Neto', num:1, raw:r=>r.Venta_Neta, web:r=>clp(r.Venta_Neta)},
      {t:'IVA', num:1, raw:r=>ivaDe(r.Venta_Neta), web:r=>clp(ivaDe(r.Venta_Neta))},
      {t:'Total', num:1, raw:r=>totDe(r.Venta_Neta), web:r=>clp(totDe(r.Venta_Neta))},
      {t:'Margen', num:1, raw:r=>r.Margen, web:r=>clp(r.Margen)},
      {t:'Estado Factura', raw:r=>r.Estado_Factura}
    ],
    rows:()=> D.sellin || []
  },
  compras: {
    icon:'📥', titulo:'Reporte de Compras',
    desc:'Facturas de compra a proveedores. Se alimenta de los PDFs en "2 facturas compras" (y de la base "compras" en data.js si registras montos).',
    cols:[
      {t:'Fecha', raw:r=>r.Fecha},
      {t:'Proveedor', raw:r=>r.Proveedor},
      {t:'RUT', raw:r=>r.RUT},
      {t:'Tipo Doc', raw:r=>r.Tipo_Doc},
      {t:'Folio', raw:r=>r.Folio},
      {t:'Neto', num:1, raw:r=>r.Neto, web:r=>clp(r.Neto)},
      {t:'IVA', num:1, raw:r=>r.IVA, web:r=>clp(r.IVA)},
      {t:'Total', num:1, raw:r=>r.Total, web:r=>clp(r.Total)},
      {t:'Estado', raw:r=>r.Estado},
      {t:'Factura PDF', raw:r=>(r._pdf||[]).join(', '), web:r=>compraBtns(r._pdf)}
    ],
    rows:()=>{
      // 1) Filas registradas en data.js (con sus PDFs emparejados por folio/proveedor)
      const structured = (D.compras||[]).map(r => ({ ...r, _pdf: comprasPdfDe(r) }));
      const usados = new Set(structured.flatMap(r => r._pdf));
      // 2) PDFs de compra que aún no están registrados en data.js -> se muestran solos
      const orphans = COMPRAS_PDF.filter(f => !usados.has(f)).map(f => {
        const m = parseCompra(f);
        return { Fecha:'', Proveedor:m.Proveedor, RUT:'', Tipo_Doc:'Factura', Folio:m.Folio,
                 Neto:'', IVA:'', Total:'', Estado:'Sin registrar', _pdf:[f] };
      });
      return [...structured, ...orphans];
    }
  },
  rcv: {
    icon:'📚', titulo:'Registro de Compras y Ventas',
    desc:'Registro tipo SII: documentos de venta y de compra con neto, IVA y total.',
    cols:[
      {t:'Tipo', raw:r=>r.Tipo},
      {t:'Fecha', raw:r=>r.Fecha},
      {t:'Documento', raw:r=>r.Doc},
      {t:'Contraparte', raw:r=>r.Parte},
      {t:'Neto', num:1, raw:r=>r.Neto, web:r=>clp(r.Neto)},
      {t:'IVA', num:1, raw:r=>r.IVA, web:r=>clp(r.IVA)},
      {t:'Total', num:1, raw:r=>r.Total, web:r=>clp(r.Total)}
    ],
    rows:()=> [
      ...(D.sellin||[]).map(s=>({Tipo:'Venta', Fecha:s.Fecha, Doc:'Factura venta', Parte:nameCliente(s.ID_Cliente), Neto:s.Venta_Neta, IVA:ivaDe(s.Venta_Neta), Total:totDe(s.Venta_Neta)})),
      ...(D.compras||[]).map(c=>({Tipo:'Compra', Fecha:c.Fecha, Doc:(c.Tipo_Doc||'Factura')+' compra', Parte:c.Proveedor, Neto:c.Neto, IVA:c.IVA, Total:c.Total}))
    ].sort((a,b)=> String(a.Fecha).localeCompare(String(b.Fecha)))
  },
  canal: {
    icon:'🏷️', titulo:'Reporte de Ventas por Canal',
    desc:'Ventas agrupadas por canal (segmento del cliente): clientes, PDV, unidades, venta y margen.',
    cols:[
      {t:'Canal', raw:r=>r.canal},
      {t:'Clientes', num:1, raw:r=>r.cli},
      {t:'PDV', num:1, raw:r=>r.pdv},
      {t:'Uds', num:1, raw:r=>r.uds},
      {t:'Venta Neta', num:1, raw:r=>r.venta, web:r=>clp(r.venta)},
      {t:'Margen', num:1, raw:r=>r.margen, web:r=>clp(r.margen)},
      {t:'% Venta', num:1, raw:r=>Math.round(r.venta/(K.venta||1)*100), web:r=>pct(r.venta/(K.venta||1))}
    ],
    rows:()=> porCanal
  },
  cxc: {
    icon:'💳', titulo:'Reporte de Cuentas por Cobrar',
    desc:'Facturas emitidas pendientes de pago, por cliente.',
    cols:[
      {t:'Cliente', raw:r=>nameCliente(r.cli)},
      {t:'Facturas', num:1, raw:r=>r.docs},
      {t:'Plazo (d)', num:1, raw:r=>r.plazo},
      {t:'Por cobrar', num:1, raw:r=>r.monto, web:r=>clp(r.monto)}
    ],
    rows:()=> porCxC
  },
  productos: {
    icon:'🍫', titulo:'Reporte de Productos (SKU)',
    desc:'Unidades, venta, margen y participación por SKU.',
    cols:[
      {t:'SKU', raw:r=>r.sku},
      {t:'Producto', raw:r=>skuInfo(r.sku).Descripcion||''},
      {t:'Sabor', raw:r=>skuInfo(r.sku).Sabor||''},
      {t:'Formato', raw:r=>skuInfo(r.sku).Formato||''},
      {t:'PVP c/IVA', num:1, raw:r=>skuInfo(r.sku).PVP_cIVA, web:r=>clp(skuInfo(r.sku).PVP_cIVA)},
      {t:'Uds', num:1, raw:r=>r.uds},
      {t:'Venta Neta', num:1, raw:r=>r.venta, web:r=>clp(r.venta)},
      {t:'Margen', num:1, raw:r=>r.margen, web:r=>clp(r.margen)},
      {t:'% Venta', num:1, raw:r=>Math.round(r.part*100), web:r=>pct(r.part)}
    ],
    rows:()=> porSKU
  },
  reposicion: {
    icon:'🚚', titulo:'Reporte de Reposición (Ruta)',
    desc:'PDV bajo mínimo con unidades sugeridas a reponer, para la ruta de distribución.',
    cols:[
      {t:'PDV', raw:r=>namePDV(r.pdv)},
      {t:'Cliente', raw:r=>nameCliente(cliDePDV(r.pdv))},
      {t:'Stock teórico', num:1, raw:r=>r.stock},
      {t:'Reorden (mín)', num:1, raw:r=>r.min},
      {t:'Objetivo (máx)', num:1, raw:r=>r.max},
      {t:'Reponer', num:1, raw:r=>r.reponer}
    ],
    rows:()=> inventarioPDV.filter(r=>r.reponer>0)
  }
};

function dlFile(name, mime, content){
  const blob = new Blob([content], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1500);
}

// Exportadores genericos: cols = [{t, num, raw:(r)=>valor, web?:(r)=>texto}]
function expExcel(fname, cols, rows){
  const th = cols.map(c=>`<th>${esc(c.t)}</th>`).join('');
  const body = rows.map(r=>'<tr>'+cols.map(c=>`<td>${esc(cellRaw(c,r))}</td>`).join('')+'</tr>').join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  dlFile(fname, 'application/vnd.ms-excel', '﻿'+html);
}
function expPdf(titulo, cols, rows){
  const th = cols.map(c=>`<th class="${c.num?'num':''}">${esc(c.t)}</th>`).join('');
  const body = rows.length
    ? rows.map(r=>'<tr>'+cols.map(c=>`<td class="${c.num?'num':''}">${esc(cellWeb(c,r))}</td>`).join('')+'</tr>').join('')
    : `<tr><td colspan="${cols.length}" style="text-align:center;color:#888">Sin registros</td></tr>`;
  const w = window.open('', '_blank');
  if(!w){ alert('Permite las ventanas emergentes para generar el PDF.'); return; }
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${esc(titulo)}</title>
    <style>body{font-family:'Segoe UI',system-ui,sans-serif;color:#1c2b26;padding:26px}
    h1{color:#14503b;font-size:18px;margin:0 0 3px} .meta{color:#6b7d76;font-size:11px;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;font-size:11.5px} th,td{border:1px solid #cfdad4;padding:6px 8px;text-align:left}
    th{background:#eef4f0;color:#14503b} td.num,th.num{text-align:right}
    @media print{@page{size:landscape;margin:12mm}}</style></head>
    <body><h1>NUVA OXI · ${esc(titulo)}</h1>
    <div class="meta">Generado ${esc(stamp())} · ${rows.length} registro(s)</div>
    <table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>
    <scr`+`ipt>window.onload=function(){setTimeout(function(){window.print();},250);};<\/scr`+`ipt></body></html>`);
  w.document.close();
}
function repExcel(id){ const R=REPORTES[id]; expExcel(`${id}_nuvaoxi_${stamp()}.xls`, R.cols, R.rows()); }
function repPdf(id){ const R=REPORTES[id]; expPdf(R.titulo, R.cols, R.rows()); }

/* ---- Exportación de la vista GERENCIA (todas las secciones, Excel y PDF) ---- */
function gerenciaSecciones(){
  const pdvRec = id => (D.pdv||[]).find(p=>p.ID_PDV===id) || {};
  const agg = {};
  (D.sellin||[]).forEach(v=>{ const k=v.ID_PDV; (agg[k]=agg[k]||{pdv:k,uds:0,venta:0,margen:0}); agg[k].uds+=Number(v.Uds)||0; agg[k].venta+=Number(v.Venta_Neta)||0; agg[k].margen+=Number(v.Margen)||0; });
  const pdvRows = Object.values(agg).sort((a,b)=>b.venta-a.venta);
  return [
    { titulo:'Puntos de venta · Venta Sell-In (pesos y unidades)', rows: pdvRows, cols:[
      {t:'Punto de venta', raw:r=>namePDV(r.pdv)},
      {t:'Cliente', raw:r=>nameCliente(pdvRec(r.pdv).ID_Cliente)},
      {t:'Segmento', raw:r=>segCliente(pdvRec(r.pdv).ID_Cliente)},
      {t:'Unidades', num:1, raw:r=>r.uds},
      {t:'Venta Sell-In ($)', num:1, raw:r=>Math.round(r.venta), web:r=>clp(r.venta)},
      {t:'Margen ($)', num:1, raw:r=>Math.round(r.margen), web:r=>clp(r.margen)}
    ]},
    { titulo:'Detalle Sell-In por SKU · status de facturación', rows: D.sellin||[], cols:[
      {t:'Fecha', raw:r=>r.Fecha}, {t:'Cliente', raw:r=>nameCliente(r.ID_Cliente)}, {t:'PDV', raw:r=>namePDV(r.ID_PDV)},
      {t:'SKU', raw:r=>r.SKU}, {t:'Descripción', raw:r=>skuInfo(r.SKU).Descripcion||''},
      {t:'Uds', num:1, raw:r=>r.Uds},
      {t:'Venta Neta ($)', num:1, raw:r=>Math.round(r.Venta_Neta), web:r=>clp(r.Venta_Neta)},
      {t:'Margen ($)', num:1, raw:r=>Math.round(r.Margen), web:r=>clp(r.Margen)},
      {t:'Status Factura', raw:r=>r.Estado_Factura}
    ]},
    { titulo:'Órdenes de compra', rows: D.pedidos||[], cols:[
      {t:'Pedido', raw:r=>r.ID_Pedido}, {t:'Fecha OC', raw:r=>r.Fecha_OC}, {t:'Cliente', raw:r=>nameCliente(r.ID_Cliente)}, {t:'N° OC', raw:r=>r.N_OC},
      {t:'Monto OC ($)', num:1, raw:r=>Math.round(r.Monto_OC||0), web:r=>clp(r.Monto_OC)},
      {t:'Estado OC', raw:r=>r.Estado}
    ]},
    { titulo:'Inventario por punto de venta', rows: inventarioPDV, cols:[
      {t:'PDV', raw:r=>namePDV(r.pdv)},
      {t:'Cliente', raw:r=>nameCliente(((D.pdv||[]).find(p=>p.ID_PDV===r.pdv)||{}).ID_Cliente)},
      {t:'Sell-In', num:1, raw:r=>r.si}, {t:'Sell-Out', num:1, raw:r=>r.so},
      {t:'Stock teórico', num:1, raw:r=>r.stock}, {t:'Rotación', num:1, raw:r=>Math.round((r.rot||0)*100)+'%', web:r=>pct(r.rot)},
      {t:'Estado', raw:r=>r.estado}
    ]},
    { titulo:'Cobranzas (cuentas por cobrar)', rows: porCxC||[], cols:[
      {t:'Cliente', raw:r=>nameCliente(r.cli)}, {t:'Facturas', num:1, raw:r=>r.docs}, {t:'Vence (próx.)', raw:r=>r.vence},
      {t:'Plazo (días)', num:1, raw:r=>r.plazo}, {t:'Por cobrar ($)', num:1, raw:r=>Math.round(r.monto||0), web:r=>clp(r.monto)}
    ]},
    { titulo:'Estado de clientes', rows: D.clientes||[], cols:[
      {t:'ID', raw:r=>r.ID_Cliente}, {t:'Cliente', raw:r=>r.Cadena}, {t:'Segmento', raw:r=>r.Segmento},
      {t:'Condición', raw:r=>r.Condicion}, {t:'Responsable', raw:r=>r.Resp}, {t:'Estado', raw:r=>r.Estado}
    ]}
  ];
}
function gerenciaExcel(){
  const secs = gerenciaSecciones();
  let out = '';
  secs.forEach(s=>{
    const th = s.cols.map(c=>`<th>${esc(c.t)}</th>`).join('');
    const body = s.rows.length ? s.rows.map(r=>'<tr>'+s.cols.map(c=>`<td>${esc(cellRaw(c,r))}</td>`).join('')+'</tr>').join('') : `<tr><td>Sin registros</td></tr>`;
    out += `<h3 style="color:#14503b">${esc(s.titulo)}</h3><table border="1"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table><br>`;
  });
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body><h1>NUVA OXI · Resumen Gerencia</h1><div>Generado ${esc(stamp())} · confidencial</div>${out}</body></html>`;
  dlFile(`gerencia_nuvaoxi_${stamp()}.xls`, 'application/vnd.ms-excel', '﻿'+html);
}
function gerenciaPdf(){
  const secs = gerenciaSecciones();
  const w = window.open('', '_blank');
  if(!w){ alert('Permite las ventanas emergentes para generar el PDF.'); return; }
  let out = '';
  secs.forEach(s=>{
    const th = s.cols.map(c=>`<th class="${c.num?'num':''}">${esc(c.t)}</th>`).join('');
    const body = s.rows.length ? s.rows.map(r=>'<tr>'+s.cols.map(c=>`<td class="${c.num?'num':''}">${esc(cellWeb(c,r))}</td>`).join('')+'</tr>').join('') : `<tr><td colspan="${s.cols.length}" style="text-align:center;color:#888">Sin registros</td></tr>`;
    out += `<h2>${esc(s.titulo)}</h2><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`;
  });
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Resumen Gerencia · NUVA OXI</title>
    <style>body{font-family:'Segoe UI',system-ui,sans-serif;color:#1c2b26;padding:24px}
    h1{color:#14503b;font-size:20px;margin:0 0 2px} h2{color:#14503b;font-size:14px;margin:18px 0 6px}
    .meta{color:#6b7d76;font-size:11px;margin-bottom:10px}
    table{width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:6px} th,td{border:1px solid #cfdad4;padding:5px 7px;text-align:left} th{background:#eef4f0;color:#14503b} td.num,th.num{text-align:right}
    @media print{@page{size:landscape;margin:10mm}}</style></head>
    <body><h1>NUVA OXI · Resumen Gerencia</h1><div class="meta">Generado ${esc(stamp())} · uso interno confidencial</div>${out}
    <scr`+`ipt>window.onload=function(){setTimeout(function(){window.print();},300);};<\/scr`+`ipt></body></html>`);
  w.document.close();
}

/* ---- PDV: filtro por segmento + exportacion ---- */
let pdvSeg = 'Todos';
function pdvFiltro(s){ pdvSeg = s; render(); }
let invSeg = 'Todos';
function invFiltro(s){ invSeg = s; render(); }
const pdvExpCols = [
  {t:'ID', raw:r=>r.ID_PDV},
  {t:'Punto de venta', raw:r=>r.Nombre_PDV},
  {t:'Cliente', raw:r=>nameCliente(r.ID_Cliente)},
  {t:'Segmento', raw:r=>segCliente(r.ID_Cliente)},
  {t:'Comuna', raw:r=>r.Comuna},
  {t:'Formato', raw:r=>r.Formato_Recom},
  {t:'Frecuencia', raw:r=>r.Frecuencia_Visita},
  {t:'Responsable', raw:r=>r.Resp},
  {t:'Estado', raw:r=>r.Estado}
];
function pdvFiltrados(){ return (D.pdv||[]).filter(p => pdvSeg==='Todos' || segCliente(p.ID_Cliente)===pdvSeg); }
function exportarPdv(fmt){
  const rows = pdvFiltrados();
  const suf = pdvSeg==='Todos' ? '' : ' · '+pdvSeg;
  if(fmt==='xls') expExcel(`pdv_${stamp()}.xls`, pdvExpCols, rows);
  else expPdf('Puntos de venta'+suf, pdvExpCols, rows);
}

/* ---- Filtro de mes para cobertura (vista Clientes) ---- */
let cobMes = (mesesVenta().slice(-1)[0]) || 'Todo';
function cobFiltro(m){ cobMes = m; render(); }

/* ---- sub-pestañas de Contabilidad ---- */
const contaTabs=[
  {k:'sellin',  t:'🧾 Facturas Sell-In'},
  {k:'pedidos', t:'📦 Pedidos y OC'},
  {k:'sellout', t:'📤 Sell-Out'}
];
let contaSub='sellin';
function contaGo(s){ contaSub=s; $('#search').value=''; render(); }

/* ---- router + search + sort ---- */
let current='dashboard', sortState={};
const titles={dashboard:'Dashboard',rotacion:'Rotación · Sell-in vs Sell-out',clientes:'Clientes',pdv:'Puntos de venta',productos:'Productos · SKU',inventario:'Control de Inventario',contabilidad:'Contabilidad',logistica:'Logística y Despachos',planning:'Planificación estratégica',finanzas:'Finanzas',pnl:'P&L · Estado de Resultados',reportes:'Reportes',marketing:'Marketing y Trade',mercado:'Mercado y Competencia',flujo:'Flujo operacional',decisiones:'Decisiones pendientes',calendario:'Calendario · Google',correo:'Correo · Gmail',gerencia:'Gerencia · Resumen ejecutivo'};

function render(){
  $('#app').innerHTML = views[current]();
  $('#viewTitle').textContent = titles[current];
  applySearch();
  wireSort();
  if(current==='pdv') initLeafletMap();
}
function go(v){
  current=v;
  document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active',a.dataset.view===v));
  const act=document.querySelector('#nav a.active'); const grp=act&&act.closest('.navgroup'); if(grp) grp.classList.remove('collapsed');
  $('#search').value='';
  render();
}
function applySearch(){
  const q=$('#search').value.trim().toLowerCase();
  document.querySelectorAll('#app tbody tr').forEach(tr=>{
    tr.style.display = (!q || tr.textContent.toLowerCase().includes(q)) ? '' : 'none';
  });
}
function wireSort(){
  document.querySelectorAll('#app th[data-k]').forEach(th=>{
    th.onclick=()=>{
      const tb=th.closest('table').querySelector('tbody');
      const idx=[...th.parentNode.children].indexOf(th);
      const asc=!(sortState[current+idx]);
      sortState={}; sortState[current+idx]=asc;
      const rows=[...tb.querySelectorAll('tr')];
      rows.sort((a,b)=>{
        let x=a.children[idx].textContent.replace(/[$.\s%]/g,'').replace(',','.');
        let y=b.children[idx].textContent.replace(/[$.\s%]/g,'').replace(',','.');
        const nx=parseFloat(x),ny=parseFloat(y);
        if(!isNaN(nx)&&!isNaN(ny)) return asc?nx-ny:ny-nx;
        return asc? a.children[idx].textContent.localeCompare(b.children[idx].textContent): b.children[idx].textContent.localeCompare(a.children[idx].textContent);
      });
      rows.forEach(r=>tb.appendChild(r));
    };
  });
}

document.querySelectorAll('#nav a').forEach(a=>a.onclick=()=>go(a.dataset.view));
document.querySelectorAll('#nav .navhead').forEach(h=>h.onclick=()=>h.parentElement.classList.toggle('collapsed'));
$('#search').addEventListener('input', applySearch);
$('#genfecha').textContent = 'Generado ' + (D.generado||'');
render();

/* ---- Portada de confidencialidad con clave ----
   NOTA: es un DISUASIVO visual, no cifrado. La clave va codificada (base64),
   pero los datos siguen en data.js; cualquiera con el archivo puede leerlos.
   Para proteccion real se necesita servidor con login o cifrar los archivos. */
(function(){
  const g = document.getElementById('gate'); if(!g) return;
  const enc = s => btoa(unescape(encodeURIComponent(String(s))));
  const FULL = 'MDIwNzI1';            // 020725      -> acceso completo
  const JEFA = 'bnV2YW94aTIwMjY=';    // nuvaoxi2026 -> vista Gerencia (solo lectura)
  function applyRole(role){ if(role==='jefa'){ document.body.classList.add('role-jefa'); if(typeof go==='function') go('gerencia'); } }
  const saved = sessionStorage.getItem('nuvaoxi_role');
  if(saved){ applyRole(saved); g.style.display='none'; return; }
  const inp = document.getElementById('gateInput'), err = document.getElementById('gateErr');
  const attempt = () => {
    const v = enc((inp.value||'').trim());
    if(v===FULL){ sessionStorage.setItem('nuvaoxi_role','full'); g.style.display='none'; }
    else if(v===JEFA){ sessionStorage.setItem('nuvaoxi_role','jefa'); applyRole('jefa'); g.style.display='none'; }
    else { err.textContent = 'Clave incorrecta.'; inp.select(); }
  };
  document.getElementById('gateBtn').onclick = attempt;
  inp.addEventListener('keydown', e => { if(e.key==='Enter') attempt(); });
  inp.focus();
})();
