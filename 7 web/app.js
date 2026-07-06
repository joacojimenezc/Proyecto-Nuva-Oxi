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
  }
};

function barsChart(){
  const max = Math.max(...rotacion.map(r=>r.si), 1);
  const rows = rotacion.map(r=>`
    <div class="barrow"><span>${r.pdv}</span>
      <div class="track">
        <div class="fill si" style="width:${r.si/max*100}%"></div>
      </div><span>${r.si}</span></div>
    <div class="barrow"><span></span>
      <div class="track"><div class="fill so" style="width:${r.so/max*100}%"></div></div><span>${r.so}</span></div>`).join('');
  return `<div class="bars">${rows}</div>
    <div class="legend"><span><i style="background:var(--green-l)"></i>Sell-In</span><span><i style="background:var(--lime)"></i>Sell-Out</span></div>`;
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
const titles={dashboard:'Dashboard',rotacion:'Rotación · Sell-in vs Sell-out',clientes:'Clientes',pdv:'Puntos de venta',contabilidad:'Contabilidad',finanzas:'Finanzas',decisiones:'Decisiones pendientes'};

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
