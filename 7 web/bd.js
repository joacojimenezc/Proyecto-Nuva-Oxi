/* ============================================================
   NUVA OXI · Módulo "Base de datos" (bd.js)
   Se carga DESPUÉS de app.js (lo inyecta bd-boot.js), por lo que puede
   usar sus globals: esc(), clp(), table(), views, titles, render(), go().
   - Descarga / subida de las 6 bases Excel (backend: repo GitHub vía /api/bd)
   - Parseo client-side con SheetJS al subir CRM / Sell-In / Sell-Out
   - Documentos de respaldo por categoría (facturas, OC, otros)
   ============================================================ */

/* XLSX: en el navegador el global de SheetJS; en Node (tests) require('xlsx') */
function xlsxLib(){
  if (typeof window === 'undefined'){
    try { return require('xlsx'); }
    catch (e){ return require(require.resolve('xlsx', { paths: [process.cwd()] })); }   // node_modules del test
  }
  if (!window.XLSX) throw new Error('SheetJS (XLSX) no está cargado en la página');
  return window.XLSX;
}

var MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/* datos de la app (window.NUVA_DATA); el parámetro permite testear en Node */
function bdDatos(d){ return d || (typeof window !== 'undefined' ? (window.NUVA_DATA || {}) : {}); }

/* ============================================================
   Parseo de Excel subidos (equivalente al refresh PowerShell)
   ============================================================ */

/* serial Excel -> 'yyyy-mm-dd'; si ya viene string se respeta */
var oa2iso = function(v){
  var n = Number(v);
  if (v !== '' && v != null && isFinite(n) && n > 20000 && n < 80000)
    return new Date(Math.round((n - 25569) * 864e5)).toISOString().slice(0, 10);
  return (v == null) ? '' : v;
};

/* columnas que se extraen por sección (mismas del refresh actual) */
var BD_COLS = {
  clientes:  ['ID_Cliente','Cadena','Segmento','SubCanal','Plazo_Pago','Condicion','Contacto','Resp','Estado'],
  pdv:       ['ID_PDV','ID_Cliente','Nombre_PDV','Comuna','Resp','Estado','Formato_Recom','Frecuencia_Visita'],
  sku:       ['SKU','Descripcion','Sabor','Formato','PVP_cIVA','PVP_Neto','Costo_Unit'],
  sellin:    ['ID_Venta','Fecha','ID_Cliente','ID_PDV','SKU','Uds','Venta_Neta','Margen','Estado_Factura','Fecha_Venc'],
  pedidos:   ['ID_Pedido','ID_Cliente','Fecha_OC','N_OC','Monto_OC','Estado'],
  decisiones:['Tema','Decision','Responsable','Estado'],
  sellout:   ['Fecha','Semana_ISO','ID_Cliente','ID_PDV','SKU','Uds_Vendidas','PVP_Salida','Fuente','Stock_Observado','Resp','Notas']
};
var BD_FECHAS = {
  sellin:  ['Fecha','Fecha_Venc'],
  pedidos: ['Fecha_OC'],
  sellout: ['Fecha']
};

/* busca hoja por nombre exacto y, si no está, por token (regex) */
function hojaDe(wb, exacto, regex){
  if (wb.Sheets && wb.Sheets[exacto]) return wb.Sheets[exacto];
  var n = (wb.SheetNames || []).find(function(x){ return regex.test(x); });
  return n ? wb.Sheets[n] : null;
}

/* extrae SOLO las columnas indicadas; descarta filas con la col. clave vacía
   (keyCol opcional; por defecto la 1ª columna) */
function extraerHoja(ws, cols, fechas, keyCol){
  var XL = xlsxLib();
  fechas = fechas || [];
  var key = keyCol || cols[0];
  return XL.utils.sheet_to_json(ws, { defval: '' })
    .filter(function(r){ return String(r[key] == null ? '' : r[key]).trim() !== ''; })
    .map(function(r){
      var o = {};
      cols.forEach(function(c){ o[c] = fechas.indexOf(c) >= 0 ? oa2iso(r[c]) : r[c]; });
      return o;
    });
}

/* recalcula el objeto finanzas desde un sell-in (misma fórmula del refresh) */
function finanzasDesde(sellin){
  var ingresos = 0, margen = 0, cobrado = 0, cxc = 0;
  (sellin || []).forEach(function(v){
    var vn = Number(v.Venta_Neta) || 0;
    ingresos += vn;
    margen   += Number(v.Margen) || 0;
    if (v.Estado_Factura === 'Pagada')  cobrado += vn;
    if (v.Estado_Factura === 'Emitida') cxc     += vn;
  });
  var gastos = 275000;
  return {
    ingresos: Math.round(ingresos), costo: Math.round(ingresos - margen),
    margen_bruto: Math.round(margen), gastos: gastos,
    resultado: Math.round(margen - gastos), cobrado: Math.round(cobrado), cxc: Math.round(cxc)
  };
}

/* solo ventas de producto real (filtro del refresh actual) */
function filtroSKU(rows){ return rows.filter(function(v){ return String(v.SKU || '').indexOf('SKU-') === 0; }); }

/* -- parser CRM_NUVA_OXI.xlsx -- */
function parseCRM(wb){
  var s = {}, w = [], res = {};
  var mapa = [
    { sec:'clientes',   hoja:'01_Maestro_Clientes',   rx:/cliente/i },
    { sec:'pdv',        hoja:'02_Maestro_PDV',        rx:/pdv/i },
    { sec:'sku',        hoja:'03_Maestro_SKU',        rx:/sku/i },
    { sec:'pedidos',    hoja:'08_Pedidos_OC',         rx:/pedido/i },
    { sec:'sellin',     hoja:'09_Sell_In',            rx:/sell.?in/i },
    { sec:'decisiones', hoja:'11_Tareas_Decisiones',  rx:/decision|tarea/i }
  ];
  mapa.forEach(function(m){
    var h = hojaDe(wb, m.hoja, m.rx);
    if (!h){ w.push('Falta la hoja "' + m.hoja + '" — se omite la sección ' + m.sec + '.'); return; }
    var rows = extraerHoja(h, BD_COLS[m.sec], BD_FECHAS[m.sec]);
    if (m.sec === 'sellin') rows = filtroSKU(rows);
    s[m.sec] = rows;
    res[m.sec] = rows.length + ' fila(s)';
  });
  if (s.sellin){ s.finanzas = finanzasDesde(s.sellin); res.finanzas = 'recalculada desde el sell-in'; }
  return { sections: s, warnings: w, resumen: res };
}

/* -- parser BD_SELL_IN_NUVA.xlsx -- */
function parseSellIn(wb){
  var s = {}, w = [], res = {};
  var hv = hojaDe(wb, 'VENTAS', /ventas|sell.?in/i);
  if (hv){
    s.sellin = filtroSKU(extraerHoja(hv, BD_COLS.sellin, BD_FECHAS.sellin));
    res.sellin = s.sellin.length + ' fila(s)';
  } else w.push('Falta la hoja "VENTAS" — se omite la sección sellin.');
  var hp = hojaDe(wb, 'GESTION_PEDIDOS', /pedido/i);
  if (hp){
    s.pedidos = extraerHoja(hp, BD_COLS.pedidos, BD_FECHAS.pedidos);
    res.pedidos = s.pedidos.length + ' fila(s)';
  } else w.push('Falta la hoja "GESTION_PEDIDOS" — se omite la sección pedidos.');
  if (s.sellin){ s.finanzas = finanzasDesde(s.sellin); res.finanzas = 'recalculada desde el sell-in'; }
  return { sections: s, warnings: w, resumen: res };
}

/* -- parser BD_SELL_OUT_NUVA.xlsx -- */
function parseSellOut(wb){
  var s = {}, w = [], res = {};
  var h = hojaDe(wb, 'SELL_OUT', /sell.?out/i);
  if (h){
    /* clave = ID_PDV (no Fecha): hay filas válidas sin fecha (p.ej. demo/migradas) */
    s.sellout = extraerHoja(h, BD_COLS.sellout, BD_FECHAS.sellout, 'ID_PDV')
      .map(function(r){ r.Uds = Number(r.Uds_Vendidas) || 0; return r; });   // alias para app.js
    res.sellout = s.sellout.length + ' fila(s)';
  } else w.push('Falta la hoja "SELL_OUT" — no hay nada que actualizar.');
  return { sections: s, warnings: w, resumen: res };
}

/* ============================================================
   Builders: generan cada Excel desde window.NUVA_DATA
   (para descargar cuando el backend aún no tiene archivo)
   ============================================================ */

/* hoja desde filas tomando SOLO los encabezados indicados (orden estable) */
function wsDe(rows, headers){
  var XL = xlsxLib();
  rows = rows || [];
  if (!rows.length) return XL.utils.aoa_to_sheet([headers]);   // plantilla vacía
  var limpio = rows.map(function(r){
    var o = {};
    headers.forEach(function(h){ o[h] = (r[h] === undefined || r[h] === null) ? '' : r[h]; });
    return o;
  });
  return XL.utils.json_to_sheet(limpio, { header: headers });
}
function udsSellOut(s){ return Number(s.Uds !== undefined ? s.Uds : s.Uds_Vendidas) || 0; }

function buildCRM(data){
  var D2 = bdDatos(data), XL = xlsxLib(), wb = XL.utils.book_new();
  XL.utils.book_append_sheet(wb, wsDe(D2.clientes,   BD_COLS.clientes),   '01_Maestro_Clientes');
  XL.utils.book_append_sheet(wb, wsDe(D2.pdv,        BD_COLS.pdv),        '02_Maestro_PDV');
  XL.utils.book_append_sheet(wb, wsDe(D2.sku,        BD_COLS.sku),        '03_Maestro_SKU');
  XL.utils.book_append_sheet(wb, wsDe(D2.pedidos,    BD_COLS.pedidos),    '08_Pedidos_OC');
  XL.utils.book_append_sheet(wb, wsDe(D2.sellin,     BD_COLS.sellin),     '09_Sell_In');
  XL.utils.book_append_sheet(wb, wsDe(D2.decisiones, BD_COLS.decisiones), '11_Tareas_Decisiones');
  return wb;
}
function buildSellIn(data){
  var D2 = bdDatos(data), XL = xlsxLib(), wb = XL.utils.book_new();
  XL.utils.book_append_sheet(wb, wsDe(D2.sellin,  BD_COLS.sellin),  'VENTAS');
  XL.utils.book_append_sheet(wb, wsDe(D2.pedidos, BD_COLS.pedidos), 'GESTION_PEDIDOS');
  return wb;
}
function buildSellOut(data){
  var D2 = bdDatos(data), XL = xlsxLib(), wb = XL.utils.book_new();
  var rows = (D2.sellout || []).map(function(s){
    var o = {}; Object.keys(s).forEach(function(k){ o[k] = s[k]; });
    if (o.Uds_Vendidas === undefined) o.Uds_Vendidas = udsSellOut(s);   // demo trae solo Uds
    return o;
  });
  XL.utils.book_append_sheet(wb, wsDe(rows, BD_COLS.sellout), 'SELL_OUT');
  return wb;
}
function buildInventario(data){
  var D2 = bdDatos(data), XL = xlsxLib(), wb = XL.utils.book_new();
  var m = {};
  (D2.sellin  || []).forEach(function(v){ var k = v.ID_PDV; (m[k] = m[k] || { si:0, so:0 }).si += Number(v.Uds) || 0; });
  (D2.sellout || []).forEach(function(s){ var k = s.ID_PDV; (m[k] = m[k] || { si:0, so:0 }).so += udsSellOut(s); });
  var rows = Object.keys(m).map(function(k){
    var p = (D2.pdv || []).find(function(x){ return x.ID_PDV === k; }) || {};
    return { ID_PDV: k, Nombre_PDV: p.Nombre_PDV || '', Sell_In: m[k].si, Sell_Out: m[k].so, Disponible: m[k].si - m[k].so };
  });
  XL.utils.book_append_sheet(wb, wsDe(rows, ['ID_PDV','Nombre_PDV','Sell_In','Sell_Out','Disponible']), 'INVENTARIO_PDV');
  return wb;
}
function buildFinanzas(data){
  var D2 = bdDatos(data), XL = xlsxLib(), wb = XL.utils.book_new();
  var f = D2.finanzas || {};
  var aoa = [
    ['Concepto', 'Monto'],
    ['Ingresos por ventas (neto)', f.ingresos || 0],
    ['(-) Costo de ventas',        f.costo || 0],
    ['= Margen de explotación',    f.margen_bruto || 0],
    ['(-) Gastos operativos',      f.gastos || 0],
    ['= Resultado operativo',      f.resultado || 0],
    ['Cobrado (facturas pagadas)', f.cobrado || 0],
    ['Cuentas por cobrar (CxC)',   f.cxc || 0]
  ];
  XL.utils.book_append_sheet(wb, XL.utils.aoa_to_sheet(aoa), 'ESTADO_RESULTADOS');
  return wb;
}
function buildConsolidado(data){
  var D2 = bdDatos(data), XL = xlsxLib(), wb = XL.utils.book_new();
  XL.utils.book_append_sheet(wb, wsDe(D2.sellin, BD_COLS.sellin), 'sell_in');
  var soRows = (D2.sellout || []).map(function(s){
    var o = {}; Object.keys(s).forEach(function(k){ o[k] = s[k]; });
    if (o.Uds_Vendidas === undefined) o.Uds_Vendidas = udsSellOut(s);
    return o;
  });
  XL.utils.book_append_sheet(wb, wsDe(soRows, BD_COLS.sellout), 'sell_out');
  var m = {};
  (D2.sellin  || []).forEach(function(v){ var k = v.ID_PDV; (m[k] = m[k] || { si:0, so:0, vn:0 }); m[k].si += Number(v.Uds) || 0; m[k].vn += Number(v.Venta_Neta) || 0; });
  (D2.sellout || []).forEach(function(s){ var k = s.ID_PDV; (m[k] = m[k] || { si:0, so:0, vn:0 }); m[k].so += udsSellOut(s); });
  var ana = Object.keys(m).map(function(k){
    return { ID_PDV: k, Sell_In: m[k].si, Sell_Out: m[k].so,
             Rotacion_pct: m[k].si ? Math.round(m[k].so / m[k].si * 100) : 0,
             Venta_Neta: Math.round(m[k].vn) };
  });
  XL.utils.book_append_sheet(wb, wsDe(ana, ['ID_PDV','Sell_In','Sell_Out','Rotacion_pct','Venta_Neta']), 'ANALISIS');
  return wb;
}

/* ============================================================
   Registro de las 6 bases
   ============================================================ */
var BASES = [
  { id:'crm',         icon:'🗂️', label:'CRM maestro',            filename:'CRM_NUVA_OXI.xlsx',
    desc:'Clientes, PDV, SKU, ventas, pedidos y decisiones — fuente principal de la web',
    parse: parseCRM,     build: buildCRM },
  { id:'sellin',      icon:'🧾', label:'Sell-In',                filename:'BD_SELL_IN_NUVA.xlsx',
    desc:'Ventas al canal (VENTAS) + gestión de pedidos y OC',
    parse: parseSellIn,  build: buildSellIn },
  { id:'sellout',     icon:'📤', label:'Sell-Out',               filename:'BD_SELL_OUT_NUVA.xlsx',
    desc:'Venta al consumidor final por PDV — alimenta rotación e inventario',
    parse: parseSellOut, build: buildSellOut },
  { id:'inventario',  icon:'📦', label:'Inventario',             filename:'BD_INVENTARIO_NUVA.xlsx',
    desc:'Solo respaldo de archivo; la web calcula el stock desde sell-in/sell-out',
    parse: null,         build: buildInventario },
  { id:'finanzas',    icon:'💰', label:'Finanzas',               filename:'BD_FINANZAS_NUVA.xlsx',
    desc:'Solo respaldo de archivo; la web recalcula el P&L desde el sell-in',
    parse: null,         build: buildFinanzas },
  { id:'consolidado', icon:'📊', label:'Consolidado comercial',  filename:'CONSOLIDADO_COMERCIAL_NUVA.xlsx',
    desc:'Sell-in + sell-out + análisis de rotación por PDV',
    parse: null,         build: buildConsolidado }
];
function baseDe(id){ return BASES.filter(function(b){ return b.id === id; })[0]; }

/* ============================================================
   Cliente API (Apps Script Web App) — solo navegador
   ============================================================ */
function bdCfg(){ return (typeof window !== 'undefined' && window.NUVA_BD_CFG) || { api:'', key:'' }; }
function bdConectado(){ return !!(bdCfg().api && window.NUVA_REMOTE && window.NUVA_REMOTE.ok); }

/* tope del body de una función Vercel: 4.5 MB — se valida el payload REAL */
var BD_MAX_BODY = 4.2 * 1024 * 1024;

/* Clave de EDICIÓN: no viaja en el código público; se pide una vez y queda
   en localStorage de este navegador. El backend la valida (env BD_WRITE_KEY). */
function bdWriteKey(){
  var wk = localStorage.getItem('nuva_bd_wk');
  if (!wk){
    wk = (prompt('Clave de edición de la Base de datos\n(la que configuraste como BD_WRITE_KEY en Vercel):') || '').trim();
    if (wk) localStorage.setItem('nuva_bd_wk', wk);
  }
  return wk;
}

/* respuesta robusta: un 413 del edge de Vercel llega SIN JSON */
async function bdRespuesta(r){
  if (r.status === 413) throw new Error('el archivo es demasiado grande para subirlo por la web (~3 MB máx) — déjalo en tu carpeta local y el auto-sync lo llevará al repo');
  var j;
  try { j = await r.json(); }
  catch (e) { throw new Error('respuesta inválida del servidor (HTTP ' + r.status + ')'); }
  if (!j.ok){
    if (/clave de edicion/i.test(j.error || '')) localStorage.removeItem('nuva_bd_wk');   // re-preguntar la próxima vez
    throw new Error(j.error || 'error del servidor');
  }
  return j;
}

async function bdGet(params){
  var cfg = bdCfg();
  if (!cfg.api) throw new Error('sin backend configurado (bd-config.js)');
  var qs = Object.keys(params).map(function(k){ return k + '=' + encodeURIComponent(params[k]); }).join('&');
  var r = await fetch(cfg.api + '?' + qs + '&k=' + encodeURIComponent(cfg.key), { cache: 'no-store' });
  return bdRespuesta(r);
}
/* POST text/plain (simple request, sin preflight); incluye la clave de edición */
async function bdPost(body){
  var cfg = bdCfg();
  if (!cfg.api) throw new Error('sin backend configurado (bd-config.js)');
  body.k = cfg.key;
  body.wk = bdWriteKey();
  if (!body.wk) throw new Error('sin clave de edición — no se puede escribir');
  var payload = JSON.stringify(body);
  if (payload.length > BD_MAX_BODY) throw new Error('la subida supera el límite de la web (~3 MB de archivo) — usa tu carpeta local (auto-sync)');
  var r = await fetch(cfg.api, { method:'POST', headers:{ 'Content-Type':'text/plain' }, body: payload });
  return bdRespuesta(r);
}

/* ---- base64 <-> binario (en trozos para no reventar la pila) ---- */
function ab2b64(buf){
  var bytes = new Uint8Array(buf), bin = '', CH = 0x8000;
  for (var i = 0; i < bytes.length; i += CH)
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}
function dlB64(nombre, mime, b64){
  var bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  var blob = new Blob([bytes], { type: mime || MIME_XLSX });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}

/* ---- formato ---- */
function bdFecha(iso){
  var s = String(iso || '').slice(0, 10).split('-');
  return s.length === 3 ? s[2] + '-' + s[1] + '-' + s[0] : (iso || '—');
}
function bdBytes(n){
  n = Number(n) || 0;
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024)    return Math.round(n / 1024) + ' KB';
  return n + ' B';
}
/* escape para valores dentro de onclick="fn('...')": & PRIMERO (evita
   contrabando de entidades tipo &#39; que el parser HTML decodifica antes
   de ejecutar el JS), luego JS-string y delimitadores de atributo/HTML */
function bdAttr(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/\\/g, '\\\\').replace(/'/g, "\\'")
    .replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ============================================================
   Estado UI + acciones (funciones globales para los onclick)
   ============================================================ */
var bdMsg = null;         // {cls:'ok'|'warn'|'bad', txt}
var bdPendiente = null;   // subida de base esperando confirmación
var bdCat = 'fac_sellin'; // sub-pestaña de documentos activa

var DOC_CATS = [
  { k:'fac_sellin',  t:'🧾 Facturas Sell-In' },
  { k:'fac_compras', t:'📥 Facturas de Compra' },
  { k:'oc',          t:'📦 Órdenes de Compra' },
  { k:'otros',       t:'📎 Otros' }
];

function bdAviso(cls, txt){ bdMsg = { cls: cls, txt: txt }; }
function bdCatGo(k){ bdCat = k; render(); }

/* Descargar base: del backend si existe archivo; si no, se genera local */
async function bdDescargar(id){
  var B = baseDe(id); if (!B) return;
  var meta = (window.NUVA_BASES || {})[id];
  if (meta && bdCfg().api){
    try{
      bdAviso('warn', 'Descargando ' + B.filename + ' desde GitHub…'); render();
      var r = await bdGet({ action:'file', kind:'base', id:id });
      dlB64(r.filename || B.filename, r.mime || MIME_XLSX, r.b64);
      bdMsg = null; render();
      return;
    }catch(e){
      bdAviso('warn', 'No se pudo bajar del repo (' + e.message + ') — se genera una copia local.'); render();
    }
  }
  try{
    xlsxLib().writeFile(B.build(), B.filename);   // generado desde los datos de la web
  }catch(e){
    bdAviso('bad', 'No se pudo generar el Excel: ' + e.message); render();
  }
}

/* Subir base: parsea (si corresponde) y pide confirmación inline */
function bdSubirBase(id){
  var B = baseDe(id); if (!B || !bdConectado()) return;
  var inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.xlsx,.xls';
  inp.onchange = async function(){
    var f = inp.files[0]; if (!f) return;
    if (f.size > 3 * 1024 * 1024){
      bdAviso('bad', 'El archivo supera 3 MB (límite de subida web). Déjalo en tu carpeta local y el auto-sync lo llevará al repo.');
      render(); return;
    }
    try{
      var buf = await f.arrayBuffer();
      var b64 = ab2b64(buf);
      if (B.parse){
        var wb  = xlsxLib().read(new Uint8Array(buf), { type:'array' });
        var res = B.parse(wb) || { sections:{}, warnings:['El archivo no se pudo interpretar.'], resumen:{} };
        bdPendiente = { id:id, filename:f.name, b64:b64, sections:res.sections, warnings:res.warnings, resumen:res.resumen };
        bdMsg = null;
      } else {
        /* bases sin parseo: solo se reemplaza el archivo (sin sections, sin reload) */
        bdAviso('warn', 'Subiendo "' + f.name + '"…'); render();
        var r = await bdPost({ action:'uploadBase', id:id, filename:f.name, b64:b64 });
        window.NUVA_BASES = window.NUVA_BASES || {};
        window.NUVA_BASES[id] = { filename:f.name, updatedAt:(r.updatedAt || new Date().toISOString()), size:f.size };
        bdAviso('ok', B.label + ': archivo actualizado en el repo ✔ (solo respaldo, no cambia los datos de la web)');
      }
    }catch(e){
      bdAviso('bad', 'No se pudo leer/subir el archivo: ' + e.message);
      bdPendiente = null;
    }
    render();
  };
  inp.click();
}

async function bdConfirmarSubida(){
  if (!bdPendiente) return;
  var p = bdPendiente;
  try{
    bdAviso('warn', 'Subiendo base y actualizando datos…'); render();
    await bdPost({ action:'uploadBase', id:p.id, filename:p.filename, b64:p.b64, sections:p.sections });
    /* red de seguridad para la recarga: si la lectura post-commit llega rezagada
       (lag de GitHub) o falla, bd-boot aplica estas secciones igual (una vez) */
    try { sessionStorage.setItem('nuva_bd_pendiente', JSON.stringify(p.sections || {})); } catch (e) {}
    bdPendiente = null;
    bdAviso('ok', 'Base actualizada ✔ recargando…'); render();
    setTimeout(function(){ location.reload(); }, 900);
  }catch(e){
    bdAviso('bad', 'Error al subir: ' + e.message); render();
  }
}
function bdCancelarSubida(){ bdPendiente = null; bdMsg = null; render(); }

/* ---- documentos ---- */
function bdSubirDoc(cat){
  if (!bdConectado()) return;
  var inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.pdf,.xlsx,.xls,.csv,.docx,.jpg,.jpeg,.png';
  inp.onchange = async function(){
    var f = inp.files[0]; if (!f) return;
    if (f.size > 3 * 1024 * 1024){
      bdAviso('bad', 'El documento supera 3 MB (límite de subida web). Déjalo en tu carpeta local y el auto-sync lo llevará al repo.');
      render(); return;
    }
    try{
      bdAviso('warn', 'Subiendo "' + f.name + '"…'); render();
      var b64 = ab2b64(await f.arrayBuffer());
      var r = await bdPost({ action:'uploadDoc', cat:cat, filename:f.name, b64:b64 });
      var docs = window.NUVA_DOCS = window.NUVA_DOCS || {};
      (docs[cat] = docs[cat] || []).push({ id:r.id, name:(r.name || f.name), size:f.size, updatedAt:new Date().toISOString() });
      bdAviso('ok', 'Documento subido ✔');
    }catch(e){
      bdAviso('bad', 'Error al subir el documento: ' + e.message);
    }
    render();
  };
  inp.click();
}
async function bdDocDescargar(id, nombre){
  try{
    var r = await bdGet({ action:'file', kind:'doc', id:id });
    dlB64(r.filename || nombre || 'documento', r.mime || 'application/octet-stream', r.b64);
  }catch(e){
    bdAviso('bad', 'Error al descargar: ' + e.message); render();
  }
}
async function bdDocEliminar(cat, id, nombre){
  if (!confirm('¿Eliminar "' + nombre + '"?\nSe elimina del repo (queda recuperable en el historial git).')) return;
  try{
    await bdPost({ action:'deleteDoc', id:id });
    var lista = (window.NUVA_DOCS || {})[cat] || [];
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id){ lista.splice(i, 1); break; }
    bdAviso('ok', 'Documento eliminado del repo (recuperable en el historial git).');
  }catch(e){
    bdAviso('bad', 'Error al eliminar: ' + e.message);
  }
  render();
}

/* ============================================================
   Vista "Base de datos"
   ============================================================ */
function bdPanelConfirmar(){
  if (!bdPendiente) return '';
  var B = baseDe(bdPendiente.id) || {};
  var res = bdPendiente.resumen || {};
  var filas = Object.keys(res).map(function(k){ return '<li><b>' + esc(k) + '</b>: ' + esc(res[k]) + '</li>'; }).join('');
  var warns = (bdPendiente.warnings || []).map(function(w){ return '<div class="alert warn">⚠️ ' + esc(w) + '</div>'; }).join('');
  var haySec = Object.keys(bdPendiente.sections || {}).length > 0;
  return '<div class="panel" style="border-left:4px solid var(--amber)">'
    + '<h2>📋 Confirmar actualización · ' + esc(B.label || bdPendiente.id) + '</h2>'
    + '<p class="hint">Archivo: <b>' + esc(bdPendiente.filename) + '</b>. Al confirmar se reemplaza el Excel en el repo GitHub y se actualizan los datos de la web (la página se recarga).</p>'
    + (filas ? '<ul class="dims">' + filas + '</ul>' : '')
    + warns
    + (haySec ? '' : '<div class="alert bad">No se reconoció ninguna sección en el archivo — revisa las hojas y vuelve a intentarlo.</div>')
    + '<div class="repbtns" style="margin-top:12px">'
    + (haySec ? '<button class="btnrep xls" onclick="bdConfirmarSubida()">✔ Confirmar y subir</button>' : '')
    + '<button class="btnrep pdf" onclick="bdCancelarSubida()">✖ Cancelar</button>'
    + '</div></div>';
}

function bdVista(){
  var conectado = bdConectado();
  var basesMeta = window.NUVA_BASES || {};
  var docs = window.NUVA_DOCS || {};
  var disAttr = conectado ? '' : ' disabled title="Sin conexión al backend — configura la URL del Web App en bd-config.js"';

  var badgeSt = conectado
    ? '<span class="badge b-green">Conectado a GitHub ✔</span>'
    : '<span class="badge b-red">Sin conexión — modo local (solo descarga)</span>';
  var gen = (window.NUVA_REMOTE && window.NUVA_REMOTE.generado)
    ? ' <span class="hint" style="margin:0">· datos remotos generados ' + esc(window.NUVA_REMOTE.generado) + '</span>' : '';

  var msg = bdMsg
    ? '<div class="alert ' + (bdMsg.cls === 'ok' ? 'ok' : bdMsg.cls) + '">' + esc(bdMsg.txt) + '</div>' : '';

  /* tabla de bases (reusa table() de app.js) */
  var rows = BASES.map(function(b){ return { b:b, m:basesMeta[b.id] }; });
  var cols = [
    { k:'base', t:'Base', render:function(r){
        return r.b.icon + ' <b>' + esc(r.b.label) + '</b><div class="hint" style="margin:2px 0 0;white-space:normal;max-width:340px">' + esc(r.b.desc) + '</div>'; } },
    { k:'file', t:'Archivo', render:function(r){ return esc(r.b.filename); } },
    { k:'upd', t:'Últ. actualización', render:function(r){
        return r.m ? esc(bdFecha(r.m.updatedAt)) + (r.m.size ? ' · ' + esc(bdBytes(r.m.size)) : '') : '—'; } },
    { k:'sec', t:'Al subir', render:function(r){
        return r.b.parse ? '<span class="badge b-green">Actualiza la web</span>' : '<span class="badge b-gray">Solo archivo</span>'; } },
    { k:'acc', t:'Acciones', render:function(r){
        return '<button class="btnrep xls" onclick="bdDescargar(\'' + r.b.id + '\')">⬇ Descargar</button> '
             + '<button class="btnrep pdf" onclick="bdSubirBase(\'' + r.b.id + '\')"' + disAttr + '>⬆ Subir</button>'; } }
  ];

  /* documentos: sub-pestañas por categoría (mismo patrón que contaTabs) */
  var tabs = DOC_CATS.map(function(c){
    return '<button class="subtab ' + (bdCat === c.k ? 'active' : '') + '" onclick="bdCatGo(\'' + c.k + '\')">' + c.t + '</button>';
  }).join('');
  var catAct = DOC_CATS.filter(function(c){ return c.k === bdCat; })[0] || DOC_CATS[0];
  var dRows = docs[bdCat] || [];
  var dCols = [
    { k:'name', t:'Documento', render:function(r){ return '📄 ' + esc(r.name); } },
    { k:'size', t:'Tamaño', num:1, render:function(r){ return esc(bdBytes(r.size)); } },
    { k:'acc', t:'Acciones', render:function(r){
        return '<button class="btnrep xls" onclick="bdDocDescargar(\'' + bdAttr(r.id) + '\',\'' + bdAttr(r.name) + '\')"' + disAttr + '>⬇ Descargar</button> '
             + '<button class="btnrep pdf" onclick="bdDocEliminar(\'' + bdCat + '\',\'' + bdAttr(r.id) + '\',\'' + bdAttr(r.name) + '\')"' + disAttr + '>🗑 Eliminar</button>'; } }
  ];
  var dTabla = dRows.length
    ? table(dCols, dRows)
    : '<p class="hint">Sin documentos en esta categoría' + (conectado ? ' — usa ⬆ Subir documento.' : '.') + '</p>';

  return ''
    + '<div class="panel" style="border-left:4px solid var(--blue)"><h2>🔁 Cómo se trabaja</h2>'
    + '<p class="hint" style="margin:0">1) <b>Descarga</b> la base Excel · 2) <b>Trabaja</b> en tu computador manteniendo hojas y columnas · '
    + '3) <b>Sube</b> el archivo: la web lo valida, muestra un resumen y al confirmar reemplaza la base en el repo GitHub y refresca los datos. '
    + 'Las bases "Solo archivo" se respaldan sin recalcular la web (inventario y finanzas se calculan desde sell-in/sell-out).</p></div>'
    + '<div class="filterbar"><div>' + badgeSt + gen + '</div></div>'
    + (conectado ? '' : '<p class="hint">Para habilitar subidas se necesita el backend: en la web publicada es <b>/api/bd</b> (requiere GITHUB_TOKEN configurado en Vercel). En esta vista local solo funciona la descarga generada.</p>')
    + msg
    + bdPanelConfirmar()
    + '<div class="panel"><h2>🗄️ Bases de datos (Excel)</h2>' + table(cols, rows) + '</div>'
    + '<div class="panel"><h2>📁 Documentos de respaldo</h2>'
    + '<div class="subtabs">' + tabs + '</div>'
    + '<div class="filterbar"><p class="hint" style="margin:0">' + dRows.length + ' documento(s) en <b>' + esc(catAct.t) + '</b>.</p>'
    + '<div class="repbtns"><button class="btnrep xls" onclick="bdSubirDoc(\'' + bdCat + '\')"' + disAttr + '>⬆ Subir documento</button></div></div>'
    + dTabla
    + '</div>';
}

/* ============================================================
   Registro en la app (solo navegador) — app.js ya renderizó
   ============================================================ */
if (typeof window !== 'undefined'){
  (function(){
    if (!document.getElementById('bd-css')){
      var st = document.createElement('style');
      st.id = 'bd-css';
      st.textContent = '.alert.ok{background:#eef8f1;border-color:var(--green-l)}'
                     + '.btnrep[disabled]{opacity:.45;cursor:not-allowed}';
      document.head.appendChild(st);
    }
    titles.bd = 'Base de datos';
    views.bd = bdVista;
    /* NO se llama render(): app.js ya mostró el dashboard */
  })();
}

/* ---- exports para tests en Node (en el navegador no hay module) ---- */
if (typeof window === 'undefined' && typeof module !== 'undefined'){
  module.exports = {
    oa2iso: oa2iso, finanzasDesde: finanzasDesde,
    parseCRM: parseCRM, parseSellIn: parseSellIn, parseSellOut: parseSellOut,
    buildCRM: buildCRM, buildSellIn: buildSellIn, buildSellOut: buildSellOut,
    buildInventario: buildInventario, buildFinanzas: buildFinanzas, buildConsolidado: buildConsolidado,
    BASES: BASES
  };
}
