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
    const cols=[
      {k:'ID_PDV',t:'ID'},{k:'Nombre_PDV',t:'Punto de venta'},{k:'ID_Cliente',t:'Cliente',render:r=>nameCliente(r.ID_Cliente)},
      {k:'Comuna',t:'Comuna'},{k:'Formato_Recom',t:'Formato'},{k:'Frecuencia_Visita',t:'Frecuencia'},
      {k:'Resp',t:'Resp'},{k:'Estado',t:'Estado',render:r=>badge(r.Estado)}];
    return table(cols, D.pdv);
  },
  sellin(){
    const cols=[
      {k:'ID_Venta',t:'#'},{k:'Fecha',t:'Fecha'},{k:'ID_Cliente',t:'Cliente',render:r=>nameCliente(r.ID_Cliente)},
      {k:'ID_PDV',t:'PDV',render:r=>namePDV(r.ID_PDV)},{k:'SKU',t:'SKU'},{k:'Uds',t:'Uds',num:1},
      {k:'Venta_Neta',t:'Venta Neta',num:1,render:r=>clp(r.Venta_Neta)},
      {k:'Margen',t:'Margen',num:1,render:r=>clp(r.Margen)},
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
    const row=(l,v,cls='')=>`<div class="stmt-row ${cls}"><span>${l}</span><span>${clp(v)}</span></div>`;
    return `
      <div class="kpis">
        <div class="kpi"><div class="lbl">Ingresos</div><div class="val">${clp(f.ingresos)}</div></div>
        <div class="kpi blue"><div class="lbl">Margen bruto</div><div class="val">${clp(f.margen_bruto)}</div></div>
        <div class="kpi"><div class="lbl">Resultado operativo</div><div class="val">${clp(f.resultado)}</div></div>
        <div class="kpi red"><div class="lbl">CxC por cobrar</div><div class="val">${clp(f.cxc)}</div></div>
      </div>
      <div class="grid2">
        <div class="panel statement"><h2>📄 Estado de Resultados</h2>
          ${row('Ingresos por ventas (neto)', f.ingresos)}
          ${row('(-) Costo de ventas', -f.costo, 'neg')}
          ${row('= Margen bruto', f.margen_bruto, 'total')}
          ${row('(-) Gastos operativos', -f.gastos, 'neg')}
          ${row('= Resultado operativo', f.resultado, 'total')}
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
      ${card('ventas')}${card('compras')}${card('rcv')}`;
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
  }
};

function dlFile(name, mime, content){
  const blob = new Blob([content], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1500);
}

function repExcel(id){
  const R = REPORTES[id]; const rows = R.rows();
  const th = R.cols.map(c=>`<th>${esc(c.t)}</th>`).join('');
  const body = rows.map(r=>'<tr>'+R.cols.map(c=>`<td>${esc(cellRaw(c,r))}</td>`).join('')+'</tr>').join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></body></html>`;
  dlFile(`${id}_nuvaoxi_${stamp()}.xls`, 'application/vnd.ms-excel', '﻿'+html);
}

function repPdf(id){
  const R = REPORTES[id]; const rows = R.rows();
  const th = R.cols.map(c=>`<th class="${c.num?'num':''}">${esc(c.t)}</th>`).join('');
  const body = rows.length
    ? rows.map(r=>'<tr>'+R.cols.map(c=>`<td class="${c.num?'num':''}">${esc(cellWeb(c,r))}</td>`).join('')+'</tr>').join('')
    : `<tr><td colspan="${R.cols.length}" style="text-align:center;color:#888">Sin registros</td></tr>`;
  const w = window.open('', '_blank');
  if(!w){ alert('Permite las ventanas emergentes para generar el PDF.'); return; }
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${esc(R.titulo)}</title>
    <style>body{font-family:'Segoe UI',system-ui,sans-serif;color:#1c2b26;padding:26px}
    h1{color:#14503b;font-size:18px;margin:0 0 3px} .meta{color:#6b7d76;font-size:11px;margin-bottom:14px}
    table{width:100%;border-collapse:collapse;font-size:11.5px} th,td{border:1px solid #cfdad4;padding:6px 8px;text-align:left}
    th{background:#eef4f0;color:#14503b} td.num,th.num{text-align:right}
    @media print{@page{size:landscape;margin:12mm}}</style></head>
    <body><h1>NUVA OXI · ${esc(R.titulo)}</h1>
    <div class="meta">Generado ${esc(stamp())} · ${rows.length} registro(s)</div>
    <table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>
    <scr`+`ipt>window.onload=function(){setTimeout(function(){window.print();},250);};<\/scr`+`ipt></body></html>`);
  w.document.close();
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
const titles={dashboard:'Dashboard',rotacion:'Rotación · Sell-in vs Sell-out',clientes:'Clientes',pdv:'Puntos de venta',contabilidad:'Contabilidad',finanzas:'Finanzas',reportes:'Reportes',decisiones:'Decisiones pendientes'};

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
