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
  { k:'fac_sellin',     t:'🧾 Facturas Sell-In' },
  { k:'fac_compras',    t:'📥 Facturas de Compra' },
  { k:'oc',             t:'📦 Órdenes de Compra' },
  { k:'otros',          t:'📎 Otros' },
  { k:'carga_cencosud', t:'🛒 Cargas Cencosud' },
  { k:'carga_clientes', t:'📊 Reportes clientes' }
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
   Sub-pestaña DATOS: edición en línea de las tablas
   Los cambios se guardan en data.json del repo (saveData); el Excel
   de la base NO se modifica (para eso está la sub-pestaña Archivos).
   ============================================================ */
var bdSub   = 'archivos';   // sub-pestaña activa: archivos | datos
var bdTabla = null;         // sección desplegada en Datos
var bdEdit  = null;         // { sec, rows } edición en curso

var BD_TABLAS = [
  { sec:'clientes',   t:'👥 Clientes' },
  { sec:'pdv',        t:'📍 Puntos de venta' },
  { sec:'sku',        t:'🏷️ Productos (SKU)' },
  { sec:'sellin',     t:'🧾 Sell-In (ventas)' },
  { sec:'pedidos',    t:'📦 Pedidos / OC' },
  { sec:'decisiones', t:'✅ Decisiones' },
  { sec:'sellout',    t:'📤 Sell-Out' }
];

function bdSubGo(k){ bdSub = k; render(); }

/* esc() no escapa comillas — para value="..." hace falta */
function bdVal(v){ return esc(v == null ? '' : v).replace(/"/g, '&quot;'); }

function bdCopiaSeccion(sec){
  var D = (typeof window !== 'undefined' && window.NUVA_DATA) || {};
  return JSON.parse(JSON.stringify(D[sec] || []));
}
function bdTablaGo(sec){
  if (bdTabla === sec){ bdTabla = null; bdEdit = null; render(); return; }   // colapsar
  bdTabla = sec;
  bdEdit = { sec: sec, rows: bdCopiaSeccion(sec) };
  render();
}
/* celda editada: actualiza el estado al tipear (sin re-render → no pierde el foco) */
function bdCelda(inp){
  if (!bdEdit) return;
  var r = Number(inp.getAttribute('data-r')), c = inp.getAttribute('data-c');
  if (bdEdit.rows[r]) bdEdit.rows[r][c] = inp.value;
}
function bdFilaAgregar(){
  if (!bdEdit) return;
  var o = {}; BD_COLS[bdEdit.sec].forEach(function(c){ o[c] = ''; });
  bdEdit.rows.push(o); render();
}
function bdFilaEliminar(i){
  if (!bdEdit) return;
  bdEdit.rows.splice(i, 1); render();
}
function bdDescartarEdicion(){
  if (!bdTabla) return;
  bdEdit = { sec: bdTabla, rows: bdCopiaSeccion(bdTabla) };
  bdAviso('warn', 'Cambios descartados — se restauró la tabla.');
  render();
}
/* '12' / '12,5' / '12.5' -> Number; el resto queda como texto */
function bdCoerce(v){
  if (typeof v !== 'string') return v;
  var s = v.trim();
  if (s === '') return '';
  if (/^-?\d+([.,]\d+)?$/.test(s)) return Number(s.replace(',', '.'));
  return s;
}
async function bdGuardarTabla(){
  if (!bdEdit || !bdConectado()) return;
  var sec = bdEdit.sec;
  var rows = bdEdit.rows
    .map(function(r){ var o = {}; BD_COLS[sec].forEach(function(c){ o[c] = bdCoerce(r[c]); }); return o; })
    .filter(function(r){ return BD_COLS[sec].some(function(c){ return r[c] !== '' && r[c] != null; }); });   // fuera filas 100% vacías
  if (sec === 'sellout') rows = rows.map(function(r){ r.Uds = Number(r.Uds_Vendidas) || 0; return r; });
  var antes = (bdCopiaSeccion(sec)).length;
  var tb = BD_TABLAS.filter(function(t){ return t.sec === sec; })[0] || { t: sec };
  if (!confirm('Guardar ' + tb.t + ': ' + rows.length + ' fila(s) (antes: ' + antes + ').\nActualiza los datos de la web (data.json del repo GitHub).')) return;
  var sections = {}; sections[sec] = rows;
  if (sec === 'sellin') sections.finanzas = finanzasDesde(rows);   // P&L consistente
  try{
    bdAviso('warn', 'Guardando cambios…'); render();
    await bdPost({ action:'saveData', sections: sections });
    try { sessionStorage.setItem('nuva_bd_pendiente', JSON.stringify(sections)); } catch (e) {}
    bdAviso('ok', 'Datos guardados ✔ recargando…'); render();
    setTimeout(function(){ location.reload(); }, 900);
  }catch(e){
    bdAviso('bad', 'Error al guardar: ' + e.message); render();
  }
}

/* ============================================================
   Cargas de SELL-OUT (portal Cencosud / reportes de clientes)
   Al subir: el archivo crudo queda en la carpeta del repo que lee el
   Power Query local, y las filas nuevas se agregan al sellout de la web.
   ============================================================ */
var bdCarga = null;   // { tipo, filename, b64, nuevas, dupes, malas }

var BD_CARGAS = {
  cencosud: { cat:'carga_cencosud', fuente:'Portal Cencosud', t:'🛒 Carga Cencosud' },
  clientes: { cat:'carga_clientes', fuente:'Reporte Cliente', t:'📊 Reporte de cliente' }
};

/* semana ISO 8601 de una fecha 'yyyy-mm-dd' */
function bdSemanaISO(iso){
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));           // jueves de esa semana
  var y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - y0) / 864e5 + 1) / 7);
}

/* encabezados tolerantes: 'Uds_Vendidas', 'Unidades', 'Cantidad', 'Local', 'Código'… */
var BD_CARGA_SINONIMOS = {
  Fecha:        ['fecha','dia','date','fechaventa'],
  ID_PDV:       ['idpdv','pdv','local','tienda','sucursal','idlocal','puntodeventa'],
  SKU:          ['sku','codigo','codigoproducto','producto','ean','idproducto'],
  Uds_Vendidas: ['udsvendidas','uds','unidades','cantidad','qty','unidadesvendidas','ventaunidades','ventauds'],
  PVP_Salida:   ['pvpsalida','pvp','precio','preciounitario','preciosalida','precioventa']
};
function bdNormHeader(h){
  return String(h == null ? '' : h).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

/* parsea un Excel de carga -> { nuevas, dupes, malas, warnings } (D inyectable para tests) */
function parseCargaSellOut(wb, tipo, D){
  var XL = xlsxLib();
  var cfg = BD_CARGAS[tipo] || BD_CARGAS.clientes;
  D = bdDatos(D);
  var res = { nuevas: [], dupes: 0, malas: 0, warnings: [] };

  /* buscar la primera hoja con encabezados reconocibles */
  var hoja = null, mapa = null;
  (wb.SheetNames || []).some(function(n){
    var filas = XL.utils.sheet_to_json(wb.Sheets[n], { header: 1, blankrows: false });
    for (var i = 0; i < Math.min(filas.length, 8); i++){
      var m = {};
      (filas[i] || []).forEach(function(h, col){
        var nh = bdNormHeader(h);
        for (var campo in BD_CARGA_SINONIMOS){
          if (m[campo] === undefined && BD_CARGA_SINONIMOS[campo].indexOf(nh) >= 0) m[campo] = col;
        }
      });
      if (m.ID_PDV !== undefined && m.SKU !== undefined && m.Uds_Vendidas !== undefined){
        hoja = { nombre: n, filas: filas, headerFila: i }; mapa = m; return true;
      }
    }
    return false;
  });
  if (!hoja){
    res.warnings.push('No se encontró ninguna hoja con columnas reconocibles (se esperan al menos PDV/Local, SKU/Código y Unidades).');
    return res;
  }

  /* claves ya existentes en el sellout actual (para no importar dos veces) */
  var existentes = {};
  (D.sellout || []).forEach(function(s){
    existentes[[s.Fecha, s.ID_PDV, s.SKU, s.Uds_Vendidas !== undefined ? s.Uds_Vendidas : s.Uds, s.PVP_Salida].join('|')] = true;
  });

  var hoy = new Date().toISOString().slice(0, 10);
  for (var r = hoja.headerFila + 1; r < hoja.filas.length; r++){
    var f = hoja.filas[r] || [];
    var pdv = String(f[mapa.ID_PDV] == null ? '' : f[mapa.ID_PDV]).trim();
    var sku = String(f[mapa.SKU] == null ? '' : f[mapa.SKU]).trim();
    var uds = Number(f[mapa.Uds_Vendidas]);
    if (!pdv || !sku || !isFinite(uds) || uds <= 0){ res.malas++; continue; }
    var fecha = mapa.Fecha !== undefined ? oa2iso(f[mapa.Fecha]) : '';
    var pvp = mapa.PVP_Salida !== undefined ? Number(f[mapa.PVP_Salida]) : NaN;
    var fila = {
      Fecha: fecha, Semana_ISO: bdSemanaISO(fecha),
      ID_Cliente: (((D.pdv || []).filter(function(p){ return p.ID_PDV === pdv; })[0]) || {}).ID_Cliente || '',
      ID_PDV: pdv, SKU: sku,
      Uds_Vendidas: uds, PVP_Salida: isFinite(pvp) ? pvp : '',
      Fuente: cfg.fuente, Stock_Observado: '', Resp: '',
      Notas: 'carga web ' + hoy,
      Uds: uds
    };
    var clave = [fila.Fecha, fila.ID_PDV, fila.SKU, fila.Uds_Vendidas, fila.PVP_Salida].join('|');
    if (existentes[clave]){ res.dupes++; continue; }
    existentes[clave] = true;   // también dedup dentro del mismo archivo
    res.nuevas.push(fila);
  }
  if (res.nuevas.length && res.nuevas.some(function(x){ return !x.ID_Cliente; }))
    res.warnings.push('Algunas filas tienen un PDV que no está en el maestro (quedan sin ID_Cliente).');
  res.warnings.push('Hoja usada: "' + hoja.nombre + '".');
  return res;
}

function bdSubirCarga(tipo){
  if (!bdConectado()) return;
  var cfg = BD_CARGAS[tipo]; if (!cfg) return;
  var inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv';
  inp.onchange = async function(){
    var f = inp.files[0]; if (!f) return;
    if (f.size > 3 * 1024 * 1024){
      bdAviso('bad', 'El archivo supera 3 MB (límite de subida web).'); render(); return;
    }
    try{
      var buf = await f.arrayBuffer();
      var wb  = xlsxLib().read(new Uint8Array(buf), { type: 'array' });
      var res = parseCargaSellOut(wb, tipo);
      bdCarga = { tipo: tipo, filename: f.name, b64: ab2b64(buf),
                  nuevas: res.nuevas, dupes: res.dupes, malas: res.malas, warnings: res.warnings };
      bdMsg = null; bdPendiente = null;
    }catch(e){
      bdAviso('bad', 'No se pudo leer el archivo: ' + e.message);
      bdCarga = null;
    }
    render();
  };
  inp.click();
}
function bdCancelarCarga(){ bdCarga = null; bdMsg = null; render(); }

async function bdConfirmarCarga(){
  if (!bdCarga || !bdCarga.nuevas.length) return;
  var c = bdCarga, cfg = BD_CARGAS[c.tipo];
  try{
    bdAviso('warn', 'Guardando archivo y actualizando sell-out…'); render();
    /* 1) archivo crudo a la carpeta del repo (la misma que lee el PQ local) */
    await bdPost({ action:'uploadDoc', cat: cfg.cat, filename: c.filename, b64: c.b64 });
    /* 2) filas nuevas al sellout de la web */
    var sellout = bdCopiaSeccion('sellout').concat(c.nuevas);
    await bdPost({ action:'saveData', sections: { sellout: sellout } });
    try { sessionStorage.setItem('nuva_bd_pendiente', JSON.stringify({ sellout: sellout })); } catch (e) {}
    bdCarga = null;
    bdAviso('ok', 'Sell-out actualizado ✔ (' + c.nuevas.length + ' fila(s) nuevas) — recargando…'); render();
    setTimeout(function(){ location.reload(); }, 900);
  }catch(e){
    bdAviso('bad', 'Error en la carga: ' + e.message); render();
  }
}

function bdPanelCarga(){
  if (!bdCarga) return '';
  var cfg = BD_CARGAS[bdCarga.tipo] || {};
  var tot = bdCarga.nuevas.reduce(function(a, x){ return a + (Number(x.Uds_Vendidas) || 0); }, 0);
  var porPdv = {};
  bdCarga.nuevas.forEach(function(x){ porPdv[x.ID_PDV] = (porPdv[x.ID_PDV] || 0) + (Number(x.Uds_Vendidas) || 0); });
  var det = Object.keys(porPdv).map(function(p){ return '<li><b>' + esc(p) + '</b>: ' + porPdv[p] + ' uds</li>'; }).join('');
  var warns = (bdCarga.warnings || []).map(function(w){ return '<div class="alert warn">⚠️ ' + esc(w) + '</div>'; }).join('');
  return '<div class="panel" style="border-left:4px solid var(--amber)">'
    + '<h2>📋 Confirmar carga · ' + esc(cfg.t || '') + '</h2>'
    + '<p class="hint">Archivo: <b>' + esc(bdCarga.filename) + '</b> · <b>' + bdCarga.nuevas.length + '</b> fila(s) nuevas (' + tot + ' uds)'
    + (bdCarga.dupes ? ' · ' + bdCarga.dupes + ' duplicada(s) omitida(s)' : '')
    + (bdCarga.malas ? ' · ' + bdCarga.malas + ' fila(s) inválida(s) descartada(s)' : '')
    + '. Al confirmar: el archivo se guarda en el repo (misma carpeta que lee tu Excel local) y el sell-out de la web se actualiza.</p>'
    + (det ? '<ul class="dims">' + det + '</ul>' : '')
    + warns
    + (bdCarga.nuevas.length ? '' : '<div class="alert bad">No hay filas nuevas que importar (todo duplicado o inválido).</div>')
    + '<div class="repbtns" style="margin-top:12px">'
    + (bdCarga.nuevas.length ? '<button class="btnrep xls" onclick="bdConfirmarCarga()">✔ Confirmar carga</button>' : '')
    + '<button class="btnrep pdf" onclick="bdCancelarCarga()">✖ Cancelar</button>'
    + '</div></div>';
}

/* ============================================================
   Detalle de productos vendidos (para las tablas Clientes y PDV)
   Agrupa el sell-in por cliente/PDV y SKU; en PDV suma también el
   sell-out por producto. Solo lectura (se calcula de las ventas).
   ============================================================ */
function bdDetalleVentas(campo){
  var D = bdDatos();
  var grupos = {};   // id -> { id, nombre, uds, venta, skus: { sku: {uds, venta, so} } }
  (D.sellin || []).forEach(function(v){
    var id = v[campo]; if (!id) return;
    var g = grupos[id] = grupos[id] || { id: id, uds: 0, venta: 0, skus: {} };
    var s = g.skus[v.SKU] = g.skus[v.SKU] || { uds: 0, venta: 0, so: 0 };
    var u = Number(v.Uds) || 0, vn = Number(v.Venta_Neta) || 0;
    s.uds += u; s.venta += vn; g.uds += u; g.venta += vn;
  });
  if (campo === 'ID_PDV'){
    (D.sellout || []).forEach(function(so){
      var g = grupos[so.ID_PDV]; if (!g) return;
      var sku = so.SKU || '(sin SKU)';
      var s = g.skus[sku] = g.skus[sku] || { uds: 0, venta: 0, so: 0 };
      s.so += Number(so.Uds !== undefined ? so.Uds : so.Uds_Vendidas) || 0;
    });
  }
  Object.keys(grupos).forEach(function(id){
    var g = grupos[id];
    if (campo === 'ID_Cliente'){
      var c = (D.clientes || []).filter(function(x){ return x.ID_Cliente === id; })[0];
      g.nombre = (c && c.Cadena) || id;
    } else {
      var p = (D.pdv || []).filter(function(x){ return x.ID_PDV === id; })[0];
      g.nombre = (p && p.Nombre_PDV) || id;
    }
  });
  return Object.keys(grupos).map(function(id){ return grupos[id]; })
    .sort(function(a, b){ return b.venta - a.venta; });
}

function bdHtmlDetalle(sec){
  if (sec !== 'clientes' && sec !== 'pdv') return '';
  var esPdv = (sec === 'pdv');
  var grupos = bdDetalleVentas(esPdv ? 'ID_PDV' : 'ID_Cliente');
  var titulo = esPdv ? '🍫 Detalle por producto en cada punto de venta' : '🍫 Detalle de productos vendidos a cada cliente';
  if (!grupos.length)
    return '<div class="panel"><h2>' + titulo + '</h2><p class="hint">Sin ventas registradas en el sell-in.</p></div>';
  var D = bdDatos();
  var descSku = function(sku){ var s = (D.sku || []).filter(function(x){ return x.SKU === sku; })[0]; return (s && s.Descripcion) || ''; };
  var th = '<tr>'
    + '<th>' + (esPdv ? 'Punto de venta' : 'Cliente') + '</th><th>SKU</th><th>Producto</th>'
    + '<th class="num">' + (esPdv ? 'Sell-In (u)' : 'Uds') + '</th>'
    + (esPdv ? '<th class="num">Sell-Out (u)</th>' : '')
    + '<th class="num">Venta Neta</th><th class="num">% del total</th></tr>';
  var totVenta = grupos.reduce(function(a, g){ return a + g.venta; }, 0) || 1;
  var body = '';
  grupos.forEach(function(g){
    var skus = Object.keys(g.skus).map(function(k){ return { sku: k, d: g.skus[k] }; })
      .sort(function(a, b){ return b.d.venta - a.d.venta; });
    skus.forEach(function(s, i){
      body += '<tr>'
        + '<td>' + (i === 0 ? '<b>' + esc(g.nombre) + '</b>' : '') + '</td>'
        + '<td>' + esc(s.sku) + '</td><td>' + esc(descSku(s.sku)) + '</td>'
        + '<td class="num">' + s.d.uds + '</td>'
        + (esPdv ? '<td class="num">' + (s.d.so || '—') + '</td>' : '')
        + '<td class="num">' + clp(s.d.venta) + '</td>'
        + '<td class="num">' + pct(s.d.venta / totVenta) + '</td></tr>';
    });
    var soTot = esPdv ? skus.reduce(function(a, s){ return a + s.d.so; }, 0) : 0;
    body += '<tr style="background:#e8f2ec;font-weight:700">'
      + '<td>Subtotal ' + esc(g.nombre) + '</td><td></td><td></td>'
      + '<td class="num">' + g.uds + '</td>'
      + (esPdv ? '<td class="num">' + (soTot || '—') + '</td>' : '')
      + '<td class="num">' + clp(g.venta) + '</td>'
      + '<td class="num">' + pct(g.venta / totVenta) + '</td></tr>';
  });
  return '<div class="panel"><h2>' + titulo + '</h2>'
    + '<p class="hint" style="margin:0 0 8px">Calculado desde el <b>Sell-In</b>' + (esPdv ? ' y el <b>Sell-Out</b>' : '') + ' — solo lectura (para modificarlo, edita esas tablas).</p>'
    + '<div class="tablewrap"><table><thead>' + th + '</thead><tbody>' + body + '</tbody></table></div></div>';
}

/* Ver documento en el navegador (PDF/imagen) sin descargarlo */
function bdDocEsVisible(nombre){ return /\.(pdf|jpe?g|png)$/i.test(String(nombre || '')); }
async function bdDocVer(id, nombre){
  var w = window.open('', '_blank');   // abrir YA (si no, el popup blocker lo mata)
  try{
    var r = await bdGet({ action:'file', kind:'doc', id:id });
    var bin = atob(r.b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var url = URL.createObjectURL(new Blob([bytes], { type: r.mime || 'application/octet-stream' }));
    if (w) w.location = url; else window.open(url, '_blank');
  }catch(e){
    if (w) try { w.close(); } catch (e2) {}
    bdAviso('bad', 'No se pudo abrir "' + nombre + '": ' + e.message); render();
  }
}

/* ============================================================
   Reportería: Excel del Dashboard (espejo de la vista dashboard)
   Usa los MISMOS agregados globales de app.js (K, rotacion, porCanal,
   porCliente, porSKU, porCxC, cobertura…) => mismos números que la web.
   Requiere xlsx-js-style (vendor) para los colores/estilos.
   ============================================================ */
var BD_XC = {   // paleta de la app (styles.css :root), sin '#'
  verdeD:'14503B', verde:'1F7A5A', verdeL:'2FA377', vinoD:'4A1E3F', vino:'7A2E5C',
  ambar:'E8A33D', rojo:'D9534F', azul:'3A7BD5', tinta:'1C2B26', gris:'6B7D76',
  linea:'D5DED8', panelV:'E8F2EC', avisoW:'FDF3E0', avisoB:'FBEAEA', blanco:'FFFFFF'
};
function bdXb(){ var b={style:'thin',color:{rgb:BD_XC.linea}}; return {top:b,bottom:b,left:b,right:b}; }
/* celda con estilo: bdX(valor, {b:negrita, sz, color, fill, fmt, al, wrap}) */
function bdX(v, o){
  o = o || {};
  var s = {
    font: { sz: o.sz || 10, bold: !!o.b, color: { rgb: o.color || BD_XC.tinta } },
    alignment: { horizontal: o.al || (typeof v === 'number' ? 'right' : 'left'), vertical: 'center', wrapText: !!o.wrap },
    border: o.noBorde ? undefined : bdXb()
  };
  if (o.fill) s.fill = { patternType: 'solid', fgColor: { rgb: o.fill } };
  if (o.fmt)  s.numFmt = o.fmt;
  return { v: (v === undefined || v === null) ? '' : v, t: (typeof v === 'number' ? 'n' : 's'), s: s };
}
var BD_FMT_CLP = '"$"#,##0';
var BD_FMT_PCT = '0%';

function buildReporteDashboard(){
  var XL = xlsxLib();
  var D2 = bdDatos();
  var mesAct = mesesVenta().slice(-1)[0] || 'Todo';
  var cob = coberturaPeriodo(mesAct);
  var fz = D2.finanzas || {};
  var filas = [], merges = [], alturas = {};
  var NCOL = 6;
  function fila(arr){ while (arr.length < NCOL) arr.push(bdX('', { noBorde:true })); filas.push(arr); return filas.length - 1; }
  function vacia(){ fila([bdX('', { noBorde:true })]); }
  function seccion(txt){
    var r = fila([bdX(txt, { b:true, sz:12, color:BD_XC.blanco, fill:BD_XC.verdeD })]);
    for (var i = 1; i < NCOL; i++) filas[r][i] = bdX('', { fill:BD_XC.verdeD });
    merges.push({ s:{ r:r, c:0 }, e:{ r:r, c:NCOL-1 } });
    alturas[r] = 20;
  }
  function avisoFila(txt, tipo){
    var fill = tipo === 'bad' ? BD_XC.avisoB : BD_XC.avisoW;
    var col  = tipo === 'bad' ? '8A2A27' : '8A6D3B';
    var r = fila([bdX(txt, { color:col, fill:fill, wrap:true })]);
    for (var i = 1; i < NCOL; i++) filas[r][i] = bdX('', { fill:fill });
    merges.push({ s:{ r:r, c:0 }, e:{ r:r, c:NCOL-1 } });
    alturas[r] = 30;
  }
  function th(cols){ fila(cols.map(function(t, i){ return bdX(t, { b:true, color:BD_XC.verdeD, fill:BD_XC.panelV, al: i ? 'right' : 'left' }); })); }

  /* --- título --- */
  var r0 = fila([bdX('NUVA OXI · Dashboard Comercial', { b:true, sz:16, color:BD_XC.blanco, fill:BD_XC.vinoD, noBorde:true })]);
  for (var i = 1; i < NCOL; i++) filas[r0][i] = bdX('', { fill:BD_XC.vinoD });
  merges.push({ s:{ r:r0, c:0 }, e:{ r:r0, c:NCOL-1 } });
  alturas[r0] = 30;
  var r1 = fila([bdX('Generado ' + (D2.generado || '') + ' · Piloto comercial · 🔒 Confidencial — uso interno', { sz:9, color:'D9C7D2', fill:BD_XC.vinoD, noBorde:true })]);
  for (i = 1; i < NCOL; i++) filas[r1][i] = bdX('', { fill:BD_XC.vinoD });
  merges.push({ s:{ r:r1, c:0 }, e:{ r:r1, c:NCOL-1 } });
  vacia();

  /* --- KPIs (los 5 del dashboard) --- */
  var rot = K.uds ? K.selloutTot / K.uds : 0;
  fila([
    bdX('VENTA NETA (SELL-IN)', { b:true, sz:9, color:BD_XC.gris }),
    bdX('MARGEN BRUTO',         { b:true, sz:9, color:BD_XC.gris }),
    bdX('CxC PENDIENTE',        { b:true, sz:9, color:BD_XC.gris }),
    bdX('COBERTURA ' + (mesAct === 'Todo' ? '(ACUM.)' : '(' + mesAct + ')'), { b:true, sz:9, color:BD_XC.gris }),
    bdX('SELL-OUT TOTAL',       { b:true, sz:9, color:BD_XC.gris })
  ]);
  var rV = fila([
    bdX(K.venta,  { b:true, sz:14, color:BD_XC.verdeD, fmt:BD_FMT_CLP }),
    bdX(K.margen, { b:true, sz:14, color:BD_XC.azul,   fmt:BD_FMT_CLP }),
    bdX(K.cxc,    { b:true, sz:14, color:BD_XC.rojo,   fmt:BD_FMT_CLP }),
    bdX(cob.pdvCon + '/' + cob.pdvTot + ' PDV · ' + pct(cob.pctPdv), { b:true, sz:12, color:BD_XC.verdeD, al:'right' }),
    bdX(K.selloutTot + ' u', { b:true, sz:14, color:BD_XC.ambar, al:'right' })
  ]);
  alturas[rV] = 24;
  fila([
    bdX(K.uds + ' u · bruto c/IVA ' + clp(K.venta * 1.19), { sz:8, color:BD_XC.gris }),
    bdX('costo $250/u (no validado)',                      { sz:8, color:BD_XC.gris }),
    bdX('facturas emitidas',                               { sz:8, color:BD_XC.gris }),
    bdX(cob.cliCon + '/' + cob.cliTot + ' clientes con venta', { sz:8, color:BD_XC.gris }),
    bdX('rotación global ' + pct(rot),                     { sz:8, color:BD_XC.gris })
  ]);
  vacia();

  /* --- Sell-In vs Sell-Out por PDV --- */
  seccion('🔄 Sell-In vs Sell-Out por punto de venta');
  th(['PDV', 'Sell-In (u)', 'Sell-Out (u)', 'Rotación', 'Venta Neta', '']);
  rotacion.forEach(function(r){
    fila([
      bdX(namePDV(r.pdv)),
      bdX(r.si), bdX(r.so),
      bdX(r.si ? r.so / r.si : 0, { fmt:BD_FMT_PCT, color: (r.si && r.rot < 0.35) ? BD_XC.rojo : BD_XC.tinta }),
      bdX(r.vn, { fmt:BD_FMT_CLP }),
      bdX('')
    ]);
  });
  fila([
    bdX('TOTAL', { b:true, fill:BD_XC.panelV }),
    bdX(K.uds, { b:true, fill:BD_XC.panelV }), bdX(K.selloutTot, { b:true, fill:BD_XC.panelV }),
    bdX(rot, { b:true, fill:BD_XC.panelV, fmt:BD_FMT_PCT }),
    bdX(K.venta, { b:true, fill:BD_XC.panelV, fmt:BD_FMT_CLP }),
    bdX('', { fill:BD_XC.panelV })
  ]);
  vacia();

  /* --- Alertas del piloto (las mismas de la vista) --- */
  seccion('🚨 Alertas del piloto');
  rotacion.filter(function(r){ return r.si > 0 && r.rot < 0.35; }).forEach(function(r){
    avisoFila('⚠️ ' + namePDV(r.pdv) + ': rotación ' + pct(r.rot) + ' (sell-in ' + r.si + ' / sell-out ' + r.so + ') — posible sobre-stock en tienda.', 'warn');
  });
  if (porCxC.length){
    var t = porCxC[0], totCxC = 0, nDocs = 0;
    porCxC.forEach(function(x){ totCxC += x.monto; nDocs += x.docs; });
    avisoFila('💸 Factura por cobrar: ' + clp(totCxC) + ' en ' + nDocs + ' factura(s) emitida(s). Mayor: ' + nameCliente(t.cli) + ' ' + clp(t.monto) + ' (plazo ' + t.plazo + 'd) — gestionar cobranza antes del vencimiento.', 'bad');
  }
  var mkt = D2.marketing || [];
  avisoFila(mkt.length
    ? '📣 Marketing: ' + mkt.length + ' acción(es) planificada(s) — verificar ejecución y su efecto en sell-out.'
    : '📣 Marketing sin plan: no hay campañas ni activaciones cargadas — crear activaciones en PDV y campañas de redes para empujar el sell-out.', 'warn');
  avisoFila('📸 Instagram @nuva_oxi: dar protagonismo a la fundadora para hacer la cuenta más auténtica. Sumar rostro, relato y detrás de escena.', 'warn');
  fila([bdX('Resultado operativo estimado: ' + clp(fz.resultado || 0) + ' · caja hoy ' + clp(fz.cobrado || 0) + ' (falta cobrar ' + clp(fz.cxc || 0) + ')', { sz:9, color:BD_XC.gris, noBorde:true })]);
  merges.push({ s:{ r:filas.length - 1, c:0 }, e:{ r:filas.length - 1, c:NCOL - 1 } });
  vacia();

  /* --- Resumen por canal --- */
  seccion('🏷️ Resumen por canal de venta');
  th(['Canal', 'Clientes', 'PDV', 'Uds', 'Venta Neta', '% Venta']);
  porCanal.forEach(function(c){
    fila([bdX(c.canal), bdX(c.cli), bdX(c.pdv), bdX(c.uds), bdX(c.venta, { fmt:BD_FMT_CLP }), bdX(c.venta / (K.venta || 1), { fmt:BD_FMT_PCT })]);
  });
  fila([bdX('TOTAL', { b:true, fill:BD_XC.panelV }), bdX('', { fill:BD_XC.panelV }), bdX('', { fill:BD_XC.panelV }),
        bdX(K.uds, { b:true, fill:BD_XC.panelV }), bdX(K.venta, { b:true, fill:BD_XC.panelV, fmt:BD_FMT_CLP }), bdX(1, { b:true, fill:BD_XC.panelV, fmt:BD_FMT_PCT })]);
  vacia();

  /* --- Top SKU --- */
  seccion('🍫 Top SKU · venta neta');
  th(['SKU', 'Producto', 'Uds', 'Venta', '% Part.', '']);
  porSKU.slice(0, 6).forEach(function(s){
    fila([bdX(s.sku), bdX(skuInfo(s.sku).Descripcion || ''), bdX(s.uds), bdX(s.venta, { fmt:BD_FMT_CLP }), bdX(s.part, { fmt:BD_FMT_PCT }), bdX('')]);
  });
  vacia();

  /* --- Participación por cliente --- */
  seccion('🥇 Participación por cliente (share)');
  th(['Cliente', 'Uds', '% Uds', 'Venta Neta', '% $', '']);
  porCliente.forEach(function(c){
    fila([bdX(nameCliente(c.cli)), bdX(c.uds), bdX(c.shareU, { fmt:BD_FMT_PCT }), bdX(c.venta, { fmt:BD_FMT_CLP }), bdX(c.shareV, { fmt:BD_FMT_PCT }), bdX('')]);
  });
  fila([bdX('TOTAL', { b:true, fill:BD_XC.panelV }), bdX(K.uds, { b:true, fill:BD_XC.panelV }), bdX(1, { b:true, fill:BD_XC.panelV, fmt:BD_FMT_PCT }),
        bdX(K.venta, { b:true, fill:BD_XC.panelV, fmt:BD_FMT_CLP }), bdX(1, { b:true, fill:BD_XC.panelV, fmt:BD_FMT_PCT }), bdX('', { fill:BD_XC.panelV })]);
  vacia();

  /* --- Crecimiento por período (si hay datos en extra.js) --- */
  var per = D2.periodos || [];
  if (per.length){
    seccion('📈 Crecimiento por período (montos de ejemplo)');
    th(['Período', 'Uds', 'Venta', 'Var. $', '', '']);
    per.forEach(function(p, i){
      var pv = per[i - 1];
      var varV = (pv && pv.Venta) ? (p.Venta - pv.Venta) / pv.Venta : null;
      fila([bdX(p.Periodo), bdX(p.Uds), bdX(p.Venta, { fmt:BD_FMT_CLP }),
            varV == null ? bdX('—', { al:'right' }) : bdX(varV, { fmt:'+0%;-0%', color: varV >= 0 ? BD_XC.verde : BD_XC.rojo, b:true }),
            bdX(''), bdX('')]);
    });
  }

  /* --- armar hoja --- */
  var ws = XL.utils.aoa_to_sheet(filas);
  ws['!merges'] = merges;
  ws['!cols'] = [{ wch:30 }, { wch:17 }, { wch:15 }, { wch:17 }, { wch:17 }, { wch:14 }];
  ws['!rows'] = filas.map(function(_, r){ return alturas[r] ? { hpt: alturas[r] } : { hpt: 15 }; });
  var wb = XL.utils.book_new();
  XL.utils.book_append_sheet(wb, ws, 'Dashboard');
  return wb;
}

function bdDescargarDashboard(){
  try{
    var f = 'Dashboard_NUVA_OXI_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    xlsxLib().writeFile(buildReporteDashboard(), f);
  }catch(e){
    bdAviso('bad', 'No se pudo generar el reporte: ' + e.message); render();
  }
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

/* ---- sub-pestaña ARCHIVOS: bases Excel + documentos (ver/descargar/eliminar) ---- */
function bdVistaArchivos(){
  var conectado = bdConectado();
  var basesMeta = window.NUVA_BASES || {};
  var docs = window.NUVA_DOCS || {};
  var disAttr = conectado ? '' : ' disabled title="Sin conexión al backend"';

  /* tabla de bases (reusa table() de app.js) */
  var rows = BASES.map(function(b){ return { b:b, m:basesMeta[b.id] }; });
  var cols = [
    { k:'base', t:'Base', render:function(r){
        return r.b.icon + ' <b>' + esc(r.b.label) + '</b><div class="hint" style="margin:2px 0 0;white-space:normal;max-width:340px">' + esc(r.b.desc) + '</div>'; } },
    { k:'file', t:'Archivo', render:function(r){ return esc(r.b.filename); } },
    { k:'upd', t:'Últ. actualización', render:function(r){
        return (r.m && r.m.updatedAt) ? esc(bdFecha(r.m.updatedAt)) + (r.m.size ? ' · ' + esc(bdBytes(r.m.size)) : '') : '—'; } },
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
        var ver = bdDocEsVisible(r.name)
          ? '<button class="btnrep xls" onclick="bdDocVer(\'' + bdAttr(r.id) + '\',\'' + bdAttr(r.name) + '\')"' + disAttr + '>👁 Ver</button> ' : '';
        return ver
             + '<button class="btnrep xls" onclick="bdDocDescargar(\'' + bdAttr(r.id) + '\',\'' + bdAttr(r.name) + '\')"' + disAttr + '>⬇ Descargar</button> '
             + '<button class="btnrep pdf" onclick="bdDocEliminar(\'' + bdCat + '\',\'' + bdAttr(r.id) + '\',\'' + bdAttr(r.name) + '\')"' + disAttr + '>🗑 Eliminar</button>'; } }
  ];
  var dTabla = dRows.length
    ? table(dCols, dRows)
    : '<p class="hint">Sin documentos en esta categoría' + (conectado ? ' — usa ⬆ Subir documento.' : '.') + '</p>';

  return ''
    + '<div class="panel" style="border-left:4px solid var(--blue)"><h2>🔁 Cómo se trabaja</h2>'
    + '<p class="hint" style="margin:0">1) <b>Descarga</b> la base Excel · 2) <b>Trabaja</b> en tu computador manteniendo hojas y columnas · '
    + '3) <b>Sube</b> el archivo: la web lo valida, muestra un resumen y al confirmar reemplaza la base en el repo GitHub y refresca los datos. '
    + 'Para cambios rápidos sin Excel, usa la sub-pestaña <b>📝 Datos</b>.</p></div>'
    + '<div class="panel"><h2>🗄️ Bases de datos (Excel)</h2>' + table(cols, rows) + '</div>'
    + '<div class="panel" style="border-left:4px solid var(--wine,#7a2e5c)"><h2>📊 Reportería</h2>'
    + '<p class="hint" style="margin:0 0 10px">Descarga el <b>Dashboard en Excel</b>: una réplica con formato de lo que muestra la portada de la web '
    + '(KPIs, sell-in vs sell-out por PDV, alertas, resumen por canal, top SKU, participación por cliente y crecimiento), con los mismos números y colores. '
    + 'Ideal para enviar por correo o presentar sin dar acceso a la web.</p>'
    + '<div class="repbtns"><button class="btnrep xls" onclick="bdDescargarDashboard()">⬇ Descargar Dashboard (Excel)</button></div></div>'
    + '<div class="panel" style="border-left:4px solid var(--green,#2e7d52)"><h2>📥 Cargas de Sell-Out</h2>'
    + '<p class="hint" style="margin:0 0 10px">Sube aquí los Excel de ventas de tu producto que te llegan de afuera: el portal B2B de Cencosud o los reportes de tus clientes. '
    + 'La web valida el archivo, agrega las filas nuevas al <b>Sell-Out</b> (rotación, inventario y dashboard se actualizan) y guarda el archivo crudo en el repo, '
    + 'en la misma carpeta que lee tu Excel local (<i>cargas cencosud</i> / <i>reportes clientes</i>). Las filas repetidas se omiten solas.</p>'
    + '<div class="repbtns">'
    + '<button class="btnrep xls" onclick="bdSubirCarga(\'cencosud\')"' + disAttr + '>🛒 Subir carga Cencosud</button> '
    + '<button class="btnrep xls" onclick="bdSubirCarga(\'clientes\')"' + disAttr + '>📊 Subir reporte de cliente</button>'
    + '</div></div>'
    + '<div class="panel"><h2>📁 Documentos (facturas, OC, cargas y otros)</h2>'
    + '<div class="subtabs">' + tabs + '</div>'
    + '<div class="filterbar"><p class="hint" style="margin:0">' + dRows.length + ' documento(s) en <b>' + esc(catAct.t) + '</b>.</p>'
    + '<div class="repbtns"><button class="btnrep xls" onclick="bdSubirDoc(\'' + bdCat + '\')"' + disAttr + '>⬆ Subir documento</button></div></div>'
    + dTabla
    + '</div>';
}

/* ---- sub-pestaña DATOS: acordeón de tablas editables ---- */
function bdVistaDatos(){
  var conectado = bdConectado();
  var D = window.NUVA_DATA || {};
  var disAttr = conectado ? '' : ' disabled title="Sin conexión al backend — solo lectura"';
  var html = '<div class="panel" style="border-left:4px solid var(--blue)"><h2>📝 Edición de datos por tabla</h2>'
    + '<p class="hint" style="margin:0">Despliega una tabla, edita las celdas directamente, agrega (➕) o elimina (🗑) filas y pulsa <b>💾 Guardar</b>. '
    + 'Los cambios actualizan al instante los datos que muestra la web. El Excel de la base NO se modifica: si después subes o regeneras el CRM, '
    + 'sus tablas vuelven a mandar — para cambios permanentes replícalos también en tu Excel.</p></div>'
    + '<div class="panel"><h2>🗂️ Tablas</h2>';
  BD_TABLAS.forEach(function(tb){
    var abierta = (bdTabla === tb.sec);
    var n = (D[tb.sec] || []).length;
    html += '<div class="bd-acord' + (abierta ? ' abierta' : '') + '">'
      + '<button class="bd-acord-h" onclick="bdTablaGo(\'' + tb.sec + '\')">'
      + (abierta ? '▾ ' : '▸ ') + tb.t
      + ' <span class="badge b-gray">' + n + ' fila(s)</span></button>';
    if (abierta && bdEdit && bdEdit.sec === tb.sec){
      var cols = BD_COLS[tb.sec];
      var th = cols.map(function(c){ return '<th>' + esc(c) + '</th>'; }).join('') + '<th></th>';
      var body = bdEdit.rows.map(function(r, i){
        return '<tr>' + cols.map(function(c){
          return '<td><input data-r="' + i + '" data-c="' + bdVal(c) + '" value="' + bdVal(r[c]) + '" oninput="bdCelda(this)"' + (conectado ? '' : ' readonly') + '></td>';
        }).join('')
        + '<td><button class="btnrep pdf" onclick="bdFilaEliminar(' + i + ')"' + disAttr + ' title="Eliminar esta fila">🗑</button></td></tr>';
      }).join('');
      if (!bdEdit.rows.length) body = '<tr><td colspan="' + (cols.length + 1) + '" style="text-align:center;color:#888;padding:10px">Sin filas — usa ➕ Agregar fila.</td></tr>';
      html += '<div class="tablewrap bd-editwrap"><table class="bd-edit"><thead><tr>' + th + '</tr></thead><tbody>' + body + '</tbody></table></div>'
        + '<div class="repbtns bd-editbtns">'
        + '<button class="btnrep xls" onclick="bdFilaAgregar()"' + disAttr + '>➕ Agregar fila</button> '
        + '<button class="btnrep xls" onclick="bdGuardarTabla()"' + disAttr + '>💾 Guardar cambios</button> '
        + '<button class="btnrep pdf" onclick="bdDescartarEdicion()">↩ Descartar</button>'
        + '</div>';
      /* detalle de productos vendidos (solo Clientes y PDV) */
      html += bdHtmlDetalle(tb.sec);
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function bdVista(){
  var conectado = bdConectado();
  var badgeSt = conectado
    ? '<span class="badge b-green">Conectado a GitHub ✔</span>'
    : '<span class="badge b-red">Sin conexión — modo local (solo descarga)</span>';
  var gen = (window.NUVA_REMOTE && window.NUVA_REMOTE.generado)
    ? ' <span class="hint" style="margin:0">· datos remotos generados ' + esc(window.NUVA_REMOTE.generado) + '</span>' : '';
  var msg = bdMsg
    ? '<div class="alert ' + (bdMsg.cls === 'ok' ? 'ok' : bdMsg.cls) + '">' + esc(bdMsg.txt) + '</div>' : '';

  var subtabs = '<div class="subtabs">'
    + '<button class="subtab ' + (bdSub === 'archivos' ? 'active' : '') + '" onclick="bdSubGo(\'archivos\')">📁 Archivos</button>'
    + '<button class="subtab ' + (bdSub === 'datos' ? 'active' : '') + '" onclick="bdSubGo(\'datos\')">📝 Datos</button>'
    + '</div>';

  return ''
    + '<div class="filterbar"><div>' + badgeSt + gen + '</div></div>'
    + (conectado ? '' : '<p class="hint">Para habilitar subidas y edición se necesita el backend <b>/api/bd</b> (GITHUB_TOKEN y BD_WRITE_KEY en Vercel). En modo local solo funciona la descarga generada.</p>')
    + msg
    + bdPanelConfirmar()
    + bdPanelCarga()
    + subtabs
    + (bdSub === 'datos' ? bdVistaDatos() : bdVistaArchivos());
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
                     + '.btnrep[disabled]{opacity:.45;cursor:not-allowed}'
                     + '.bd-acord{border:1px solid #dfe7e2;border-radius:8px;margin:8px 0;overflow:hidden;background:#fff}'
                     + '.bd-acord-h{display:block;width:100%;text-align:left;padding:10px 12px;background:#f4f8f5;border:0;cursor:pointer;font:inherit;font-weight:600;color:inherit}'
                     + '.bd-acord.abierta .bd-acord-h{background:#e8f2ec}'
                     + '.bd-acord-h:hover{background:#edf5f0}'
                     + '.bd-editwrap{max-height:440px;overflow:auto;margin:0;padding:8px}'
                     + '.bd-edit{width:100%;border-collapse:collapse}'
                     + '.bd-edit th{position:sticky;top:0;background:#eef4f0;font-size:11.5px;padding:6px;text-align:left;white-space:nowrap}'
                     + '.bd-edit td{padding:3px 4px}'
                     + '.bd-edit input{width:100%;min-width:84px;box-sizing:border-box;border:1px solid #d5ded8;border-radius:4px;padding:4px 6px;font:inherit;font-size:12.5px;background:#fff}'
                     + '.bd-edit input:focus{outline:2px solid #9cc7ae;border-color:#9cc7ae}'
                     + '.bd-edit input[readonly]{background:#f5f5f5;color:#777}'
                     + '.bd-editbtns{margin:4px 8px 10px}';
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
    parseCargaSellOut: parseCargaSellOut, bdSemanaISO: bdSemanaISO, bdNormHeader: bdNormHeader,
    BASES: BASES
  };
}
