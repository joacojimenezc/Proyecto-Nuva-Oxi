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
    m[v.ID_Cliente]=m[v.ID_Cliente]||{cli:v.ID_Cliente,monto:0,docs:0};
    m[v.ID_Cliente].monto+=Number(v.Venta_Neta)||0; m[v.ID_Cliente].docs++;
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
    const alerts = rotacion.filter(r=>r.si>0 && r.rot<0.35).map(r=>
      `<div class="alert warn">⚠️ <b>${namePDV(r.pdv)}</b>: rotación ${pct(r.rot)} (sell-in ${r.si} / sell-out ${r.so}) — posible sobre-stock en tienda.</div>`).join('');
    return `
      <div class="kpis">
        <div class="kpi"><div class="lbl">Venta neta (sell-in)</div><div class="val">${clp(K.venta)}</div><div class="sub">${K.uds} unidades</div></div>
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
    return table(cols, D.clientes);
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
      <p class="hint">Nota: habrá un 3er precio futuro (estuche ~$6.490) y descuentos 20–30% — a versionar con Vigente_Desde/Hasta.</p>
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
    const alerts = al.length ? al.map(a=>`<div class="alert ${a.cls}"><b>${a.t} · ${a.ref}</b> — ${a.msg}</div>`).join('') : '<p class="hint">Sin alertas de marketing.</p>';
    const mrows=(D.marketing||[]).map(m=>({...m, cliente: m.ID_Cliente?nameCliente(m.ID_Cliente):'', pdv: m.ID_PDV?namePDV(m.ID_PDV):''}));
    const mcols=[
      {k:'Fecha',t:'Fecha'},{k:'Tipo',t:'Tipo',render:r=>badge(r.Tipo)},{k:'cliente',t:'Cliente'},{k:'pdv',t:'PDV'},
      {k:'Descripcion',t:'Descripción'},{k:'Costo',t:'Costo',num:1,render:r=>clp(r.Costo)},{k:'Estado',t:'Estado',render:r=>badge(r.Estado)}];
    return `<p class="hint">Alineación con trade marketing: alertas para activar promociones, degustaciones o campañas que apoyen la venta.</p>
      <div class="panel"><h2>🎯 Alertas de trade marketing</h2>${alerts}</div>
      <div class="panel"><h2>📣 Acciones planificadas</h2>
        <p class="hint">Registra degustaciones, promociones, activaciones y campañas en <b>data.js → "marketing"</b>.</p>
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
    const totSi=sum(inventarioPDV,x=>x.si), totSo=sum(inventarioPDV,x=>x.so), totStock=sum(inventarioPDV,x=>x.stock);
    const aRep=inventarioPDV.filter(r=>r.reponer>0);
    const totRep=sum(aRep,x=>x.reponer);
    const sobre=inventarioPDV.filter(r=>r.estado==='Sobre-stock');
    const foot={pdv:'TOTAL',cli:'',si:totSi,so:totSo,stock:totStock,max:sum(inventarioPDV,x=>x.max),min:'',reponer:totRep,rot:pct(totSi?totSo/totSi:0),estado:''};
    const alerts=[
      ...aRep.map(r=>`<div class="alert bad">🔴 <b>${namePDV(r.pdv)}</b>: bajo mínimo — stock ${r.stock}u ≤ reorden ${r.min}u. <b>Reponer ${r.reponer}u</b> (hasta objetivo ${r.max}u).</div>`),
      ...sobre.map(r=>`<div class="alert warn">🟠 <b>${namePDV(r.pdv)}</b>: sobre-stock — ${r.stock}u en tienda, rotación ${pct(r.rot)}. Frenar reposición / activar salida.</div>`)
    ].join('');
    return `<p class="hint">Modelo de <b>ruta propia</b>: stock teórico = Sell-In − Sell-Out. Cuando cae al <b>reorden (mín)</b>, se sugiere reponer hasta el <b>objetivo (máx)</b>. Es una estimación; el stock real requiere conteo físico.</p>
      <div class="kpis">
        <div class="kpi"><div class="lbl">Stock teórico en canal</div><div class="val">${totStock} u</div><div class="sub">de ${totSi}u despachadas</div></div>
        <div class="kpi red"><div class="lbl">Unidades a reponer</div><div class="val">${totRep} u</div><div class="sub">${aRep.length} PDV bajo mínimo</div></div>
        <div class="kpi amber"><div class="lbl">PDV con sobre-stock</div><div class="val">${sobre.length}</div></div>
      </div>
      ${alerts?`<div class="panel"><h2>🚚 Sugerencia de reposición (ruta)</h2>${alerts}</div>`:''}
      <div class="panel"><h2>📦 Stock y reposición por punto de venta</h2>${table(cols, inventarioPDV, foot)}
        <p class="hint" style="margin-top:8px">Objetivo/reorden por defecto son <b>sugeridos</b> (máx = sell-in del PDV, mín = 30%). Ajústalos por PDV en <b>data.js → "asignacion"</b>. "Sin sell-out" = sin venta al consumidor registrada (fuera de Jumbo es parcial).</p></div>`;
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

/* ---- PDV: filtro por segmento + exportacion ---- */
let pdvSeg = 'Todos';
function pdvFiltro(s){ pdvSeg = s; render(); }
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
const titles={dashboard:'Dashboard',rotacion:'Rotación · Sell-in vs Sell-out',clientes:'Clientes',pdv:'Puntos de venta',productos:'Productos · SKU',inventario:'Control de Inventario',contabilidad:'Contabilidad',logistica:'Logística y Despachos',finanzas:'Finanzas',reportes:'Reportes',marketing:'Marketing y Trade',decisiones:'Decisiones pendientes'};

function render(){
  $('#app').innerHTML = views[current]();
  $('#viewTitle').textContent = titles[current];
  applySearch();
  wireSort();
}
function go(v){
  current=v;
  document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active',a.dataset.view===v));
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
$('#search').addEventListener('input', applySearch);
$('#genfecha').textContent = 'Generado ' + (D.generado||'');
render();
