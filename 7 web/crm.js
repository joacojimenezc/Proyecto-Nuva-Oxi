/* ============================================================
   NUVA OXI · Pestaña CRM / Seguimiento comercial (crm.js)
   Se carga DESPUÉS de app.js y bd.js (la inyecta bd-boot.js): usa
   esc(), table(), badge(), views, titles, D, nameCliente, namePDV,
   crmResumen() (app.js) y bdConectado()/bdPost()/bdCoerce() (bd.js).

   EDICIÓN EN LA WEB: registrar/editar/eliminar visitas, registros de
   terreno y el seguimiento de cada cliente. Guarda con saveData al
   data.json del repo y re-renderiza al instante (sin recargar: estas
   secciones no alimentan agregados congelados de app.js).
   ============================================================ */

var crmMsg  = null;   // {cls:'ok'|'warn'|'bad', txt}
var crmForm = null;   // {tipo:'visita'|'registro'|'accion', idx:null|number|ID_Cliente, datos:{}}

function crmAviso(cls, txt){ crmMsg = { cls: cls, txt: txt }; }
function crmHoy(){ return new Date().toISOString().slice(0, 10); }

/* ---------- definición de formularios ---------- */
function crmOpcionesClientes(){
  return (D.clientes || []).map(function(c){ return { v: c.ID_Cliente, t: (c.Cadena || c.ID_Cliente) + ' (' + c.ID_Cliente + ')' }; });
}
function crmOpcionesPdv(){
  return (D.pdv || []).map(function(p){ return { v: p.ID_PDV, t: (p.Nombre_PDV || p.ID_PDV) + ' (' + p.ID_PDV + ')' }; });
}
function crmCampos(tipo){
  if (tipo === 'visita') return [
    { k:'Fecha',          t:'Fecha visita',   tipo:'date' },
    { k:'Resp',           t:'Responsable' },
    { k:'ID_Cliente',     t:'Cliente',        tipo:'select', op: crmOpcionesClientes() },
    { k:'ID_PDV',         t:'Punto de venta', tipo:'select', op: crmOpcionesPdv() },
    { k:'Motivo',         t:'Motivo' },
    { k:'Objetivo',       t:'Objetivo' },
    { k:'Estado_Visita',  t:'Estado',         tipo:'select', op: ['Planificada','Realizada','Reprogramada','Cancelada'].map(function(x){ return { v:x, t:x }; }) },
    { k:'Proxima_Accion', t:'Próxima acción' },
    { k:'Fecha_Proxima',  t:'Fecha próxima',  tipo:'date' }
  ];
  if (tipo === 'registro') return [
    { k:'Fecha',           t:'Fecha',          tipo:'date' },
    { k:'ID_PDV',          t:'Punto de venta', tipo:'select', op: crmOpcionesPdv() },
    { k:'Resp',            t:'Responsable' },
    { k:'Stock_Observado', t:'Stock observado', tipo:'number' },
    { k:'Venta_Estimada',  t:'Venta estimada (u)', tipo:'number' },
    { k:'Precio_Obs',      t:'Precio observado', tipo:'number' },
    { k:'Calidad_Exhib',   t:'Calidad exhibición', tipo:'select', op: ['Buena','Regular','Mala'].map(function(x){ return { v:x, t:x }; }) },
    { k:'Necesita_Repos',  t:'¿Necesita reponer?', tipo:'select', op: ['No','Si'].map(function(x){ return { v:x, t:x }; }) },
    { k:'Cant_Sugerida',   t:'Cant. sugerida (u)', tipo:'number' },
    { k:'Problema',        t:'Problema' },
    { k:'Comentarios',     t:'Comentarios' },
    { k:'Proxima_Accion',  t:'Próxima acción' }
  ];
  /* accion = seguimiento del cliente (campos CRM del maestro) */
  return [
    { k:'Estado',             t:'Estado del cliente' },
    { k:'Fecha_Ult_Contacto', t:'Último contacto', tipo:'date' },
    { k:'Proxima_Accion',     t:'Próxima acción' },
    { k:'Fecha_Proxima',      t:'Fecha próxima', tipo:'date' },
    { k:'Notas',              t:'Notas' }
  ];
}

/* ---------- abrir formularios ---------- */
function crmNuevaVisita(){
  if (!bdConectado()) return;
  crmForm = { tipo:'visita', idx:null, datos:{ Fecha: crmHoy(), Estado_Visita:'Realizada' } };
  crmMsg = null; render();
}
function crmEditarVisita(i){
  if (!bdConectado()) return;
  var v = (D.visitas || [])[i]; if (!v) return;
  crmForm = { tipo:'visita', idx:i, datos: JSON.parse(JSON.stringify(v)) };
  crmMsg = null; render();
}
function crmNuevoRegistro(){
  if (!bdConectado()) return;
  crmForm = { tipo:'registro', idx:null, datos:{ Fecha: crmHoy(), Necesita_Repos:'No', Calidad_Exhib:'Buena' } };
  crmMsg = null; render();
}
function crmEditarRegistro(i){
  if (!bdConectado()) return;
  var r = (D.registro || [])[i]; if (!r) return;
  crmForm = { tipo:'registro', idx:i, datos: JSON.parse(JSON.stringify(r)) };
  crmMsg = null; render();
}
function crmEditarAccion(idCliente){
  if (!bdConectado()) return;
  var c = (D.clientes || []).filter(function(x){ return x.ID_Cliente === idCliente; })[0]; if (!c) return;
  crmForm = { tipo:'accion', idx:idCliente, datos: JSON.parse(JSON.stringify(c)) };
  crmMsg = null; render();
}
function crmCancelar(){ crmForm = null; render(); }

/* lee los inputs del formulario al estado (se llama al guardar) */
function crmLeerForm(){
  if (!crmForm) return;
  crmCampos(crmForm.tipo).forEach(function(f){
    var el = document.getElementById('crmf_' + f.k);
    if (el) crmForm.datos[f.k] = el.value;
  });
}

/* ---------- guardar / eliminar (saveData por sección) ---------- */
async function crmGuardar(){
  if (!crmForm || !bdConectado()) return;
  crmLeerForm();
  var f = crmForm, sections = {};
  try{
    if (f.tipo === 'visita'){
      var visitas = JSON.parse(JSON.stringify(D.visitas || []));
      var fila = {};
      crmCampos('visita').forEach(function(c){ fila[c.k] = f.datos[c.k] == null ? '' : f.datos[c.k]; });
      if (!fila.ID_Cliente && fila.ID_PDV){
        var p = (D.pdv || []).filter(function(x){ return x.ID_PDV === fila.ID_PDV; })[0];
        if (p) fila.ID_Cliente = p.ID_Cliente || '';
      }
      if (f.idx == null){
        var max = 0;
        visitas.forEach(function(v){ var m = /(\d+)/.exec(String(v.ID_Visita || '')); if (m) max = Math.max(max, +m[1]); });
        fila.ID_Visita = 'V' + String(max + 1).padStart(3, '0');
        visitas.push(fila);
      } else {
        fila.ID_Visita = (visitas[f.idx] && visitas[f.idx].ID_Visita) || f.datos.ID_Visita || '';
        visitas[f.idx] = fila;
      }
      sections.visitas = visitas;
    } else if (f.tipo === 'registro'){
      var registro = JSON.parse(JSON.stringify(D.registro || []));
      var fr = {};
      crmCampos('registro').forEach(function(c){ fr[c.k] = bdCoerce(f.datos[c.k] == null ? '' : String(f.datos[c.k])); });
      if (f.idx == null) registro.push(fr); else registro[f.idx] = fr;
      sections.registro = registro;
    } else {
      var clientes = JSON.parse(JSON.stringify(D.clientes || []));
      var c2 = clientes.filter(function(x){ return x.ID_Cliente === f.idx; })[0];
      if (!c2) throw new Error('cliente no encontrado');
      crmCampos('accion').forEach(function(cf){ c2[cf.k] = f.datos[cf.k] == null ? '' : f.datos[cf.k]; });
      sections.clientes = clientes;
    }
    crmAviso('warn', 'Guardando…'); render();
    await bdPost({ action:'saveData', sections: sections });
    Object.keys(sections).forEach(function(k){ D[k] = sections[k]; });   // vista fresca al instante
    crmForm = null;
    crmAviso('ok', 'Guardado ✔ (queda en el repo GitHub)');
  }catch(e){
    crmAviso('bad', 'Error al guardar: ' + e.message);
  }
  render();
}

async function crmEliminar(tipo, i){
  if (!bdConectado()) return;
  var sec = tipo === 'visita' ? 'visitas' : 'registro';
  var rows = JSON.parse(JSON.stringify(D[sec] || []));
  if (!rows[i]) return;
  var etiqueta = tipo === 'visita'
    ? (rows[i].ID_Visita || '') + ' ' + (rows[i].Motivo || '')
    : String(rows[i].Fecha || '').slice(0, 10) + ' ' + (rows[i].ID_PDV || '');
  if (!confirm('¿Eliminar ' + (tipo === 'visita' ? 'la visita' : 'el registro') + ' "' + etiqueta.trim() + '"?')) return;
  rows.splice(i, 1);
  try{
    crmAviso('warn', 'Eliminando…'); render();
    var sections = {}; sections[sec] = rows;
    await bdPost({ action:'saveData', sections: sections });
    D[sec] = rows;
    crmAviso('ok', 'Eliminado ✔');
  }catch(e){
    crmAviso('bad', 'Error al eliminar: ' + e.message);
  }
  render();
}

/* ---------- formulario (panel) ---------- */
function crmFormPanel(){
  if (!crmForm) return '';
  var titulos = { visita: crmForm.idx == null ? '➕ Registrar visita' : '✏️ Editar visita ' + esc(crmForm.datos.ID_Visita || ''),
                  registro: crmForm.idx == null ? '➕ Registrar visita a PDV (terreno)' : '✏️ Editar registro de terreno',
                  accion: '✏️ Seguimiento de ' + esc(crmForm.datos.Cadena || crmForm.idx) };
  var campos = crmCampos(crmForm.tipo).map(function(f){
    var v = crmForm.datos[f.k]; v = (v == null ? '' : String(v));
    if (f.tipo === 'date') v = v.slice(0, 10);
    var inp;
    if (f.tipo === 'select'){
      inp = '<select id="crmf_' + f.k + '">'
        + '<option value=""></option>'
        + f.op.map(function(o){ return '<option value="' + esc(o.v) + '"' + (String(o.v) === v ? ' selected' : '') + '>' + esc(o.t) + '</option>'; }).join('')
        + '</select>';
    } else {
      inp = '<input id="crmf_' + f.k + '" type="' + (f.tipo === 'date' ? 'date' : (f.tipo === 'number' ? 'number' : 'text')) + '" value="' + esc(v).replace(/"/g, '&quot;') + '">';
    }
    return '<label class="crm-campo"><span>' + esc(f.t) + '</span>' + inp + '</label>';
  }).join('');
  return '<div class="panel" style="border-left:4px solid var(--amber)">'
    + '<h2>' + titulos[crmForm.tipo] + '</h2>'
    + '<div class="crm-form">' + campos + '</div>'
    + '<div class="repbtns" style="margin-top:12px">'
    + '<button class="btnrep xls" onclick="crmGuardar()">💾 Guardar</button> '
    + '<button class="btnrep pdf" onclick="crmCancelar()">✖ Cancelar</button>'
    + '</div></div>';
}

/* ---------- vista ---------- */
function crmBadgeVisita(v){
  if (v.realizada) return '<span class="badge b-green">Realizada</span>';
  if (v.vencida)   return '<span class="badge b-red">Atrasada</span>';
  return '<span class="badge b-amber">' + esc(v.Estado_Visita || 'Planificada') + '</span>';
}

function crmVista(){
  var cr = crmResumen();
  var conectado = bdConectado();
  var dis = conectado ? '' : ' disabled title="Sin conexión al backend — solo lectura"';

  var msg = crmMsg
    ? '<div class="alert ' + (crmMsg.cls === 'ok' ? 'ok' : crmMsg.cls) + '">' + esc(crmMsg.txt) + '</div>' : '';

  var kpis = '<div class="kpis">'
    + '<div class="kpi ' + (cr.accVencidas ? 'red' : '') + '"><div class="lbl">Acciones vencidas</div><div class="val">' + cr.accVencidas + '</div><div class="sub">compromisos con fecha pasada</div></div>'
    + '<div class="kpi amber"><div class="lbl">Próximas 7 días</div><div class="val">' + cr.accProximas + '</div><div class="sub">acciones agendadas</div></div>'
    + '<div class="kpi ' + (cr.visVencidas ? 'red' : 'blue') + '"><div class="lbl">Visitas pendientes</div><div class="val">' + cr.visPend + '</div><div class="sub">' + cr.visVencidas + ' atrasada(s)</div></div>'
    + '<div class="kpi"><div class="lbl">Visitas realizadas</div><div class="val">' + cr.visReal + '</div><div class="sub">' + cr.registro.length + ' registro(s) en terreno</div></div>'
    + '<div class="kpi ' + (cr.sinContacto ? 'amber' : '') + '"><div class="lbl">Sin contacto 30d+</div><div class="val">' + cr.sinContacto + '</div><div class="sub">clientes por reactivar</div></div>'
    + '</div>';

  /* --- Próximas acciones por cliente (✏️ edita el seguimiento del cliente) --- */
  var accTabla = cr.acciones.length
    ? table([
        { k:'cliente', t:'Cliente', render:function(r){ return '<b>' + esc(r.cliente) + '</b>'; } },
        { k:'estado',  t:'Estado',  render:function(r){ return badge(r.estado); } },
        { k:'ult',     t:'Últ. contacto', render:function(r){ return r.ult || '—'; } },
        { k:'accion',  t:'Próxima acción', render:function(r){ return esc(r.accion); } },
        { k:'fecha',   t:'Fecha', render:function(r){ return r.fecha ? (r.vencida ? '<span class="badge b-red">' + r.fecha + ' ⚠ vencida</span>' : r.fecha) : '—'; } },
        { k:'notas',   t:'Notas', render:function(r){ return esc(r.notas); } },
        { k:'acc',     t:'', render:function(r){ return '<button class="btnrep xls" onclick="crmEditarAccion(\'' + esc(r.id) + '\')"' + dis + '>✏️</button>'; } }
      ], cr.acciones)
    : '<p class="hint">Sin acciones registradas — usa ✏️ en un cliente o completa "Próxima acción" en Base de datos → Datos → Clientes.</p>';

  /* --- Plan de visitas (➕ nueva, ✏️ editar, 🗑 eliminar) --- */
  var visTabla = cr.visitas.length
    ? table([
        { k:'id',     t:'Visita', render:function(r){ return esc(r.ID_Visita || ''); } },
        { k:'fecha',  t:'Fecha',  render:function(r){ return r.fecha || '—'; } },
        { k:'resp',   t:'Resp.',  render:function(r){ return esc(r.Resp || ''); } },
        { k:'cli',    t:'Cliente', render:function(r){ return esc(nameCliente(r.ID_Cliente) || r.ID_Cliente || ''); } },
        { k:'pdv',    t:'PDV',    render:function(r){ return esc(namePDV(r.ID_PDV) || r.ID_PDV || ''); } },
        { k:'motivo', t:'Motivo', render:function(r){ return esc(r.Motivo || ''); } },
        { k:'obj',    t:'Objetivo', render:function(r){ return esc(r.Objetivo || ''); } },
        { k:'est',    t:'Estado', render:crmBadgeVisita },
        { k:'prox',   t:'Próx. acción', render:function(r){ return esc(r.Proxima_Accion || '') + (r.proxima ? ' <span class="hint" style="margin:0">(' + r.proxima + ')</span>' : ''); } },
        { k:'acc',    t:'', render:function(r){
            return '<button class="btnrep xls" onclick="crmEditarVisita(' + r._i + ')"' + dis + '>✏️</button> '
                 + '<button class="btnrep pdf" onclick="crmEliminar(\'visita\',' + r._i + ')"' + dis + '>🗑</button>'; } }
      ], cr.visitas)
    : '<p class="hint">Sin visitas — usa ➕ Registrar visita.</p>';

  /* --- Registro de terreno (➕/✏️/🗑) --- */
  var regRows = cr.registro.map(function(r, i){ var o = {}; Object.keys(r).forEach(function(k){ o[k] = r[k]; }); o._i = i; return o; });
  var regTabla = regRows.length
    ? table([
        { k:'fecha', t:'Fecha', render:function(r){ return String(r.Fecha || '').slice(0, 10) || '—'; } },
        { k:'pdv',   t:'PDV', render:function(r){ return esc(namePDV(r.ID_PDV) || r.ID_PDV || ''); } },
        { k:'resp',  t:'Resp.', render:function(r){ return esc(r.Resp || ''); } },
        { k:'stock', t:'Stock obs.', num:1, render:function(r){ return (r.Stock_Observado === '' || r.Stock_Observado == null) ? '—' : r.Stock_Observado; } },
        { k:'venta', t:'Venta est.', num:1, render:function(r){ return (r.Venta_Estimada === '' || r.Venta_Estimada == null) ? '—' : r.Venta_Estimada; } },
        { k:'exhib', t:'Exhibición', render:function(r){ return badge(r.Calidad_Exhib || ''); } },
        { k:'repos', t:'¿Reponer?', render:function(r){
            var si = /^s/i.test(String(r.Necesita_Repos || ''));
            return si ? '<span class="badge b-red">Sí' + (r.Cant_Sugerida ? ' · ' + r.Cant_Sugerida + ' u' : '') + '</span>' : '<span class="badge b-green">No</span>'; } },
        { k:'prob',  t:'Problema', render:function(r){ return esc(r.Problema || ''); } },
        { k:'prox',  t:'Próx. acción', render:function(r){ return esc(r.Proxima_Accion || ''); } },
        { k:'acc',   t:'', render:function(r){
            return '<button class="btnrep xls" onclick="crmEditarRegistro(' + r._i + ')"' + dis + '>✏️</button> '
                 + '<button class="btnrep pdf" onclick="crmEliminar(\'registro\',' + r._i + ')"' + dis + '>🗑</button>'; } }
      ], regRows)
    : '<p class="hint">Sin registros de terreno — usa ➕ Registrar visita a PDV.</p>';

  return kpis
    + msg
    + crmFormPanel()
    + '<div class="panel"><h2>📌 Próximas acciones por cliente</h2>' + accTabla + '</div>'
    + '<div class="panel"><div class="filterbar" style="padding:0;border:0;margin-bottom:6px"><h2 style="margin:0">🗓️ Plan de visitas</h2>'
    + '<div class="repbtns"><button class="btnrep xls" onclick="crmNuevaVisita()"' + dis + '>➕ Registrar visita</button></div></div>' + visTabla + '</div>'
    + '<div class="panel"><div class="filterbar" style="padding:0;border:0;margin-bottom:6px"><h2 style="margin:0">📋 Registro de visitas a PDV (terreno)</h2>'
    + '<div class="repbtns"><button class="btnrep xls" onclick="crmNuevoRegistro()"' + dis + '>➕ Registrar visita a PDV</button></div></div>' + regTabla + '</div>'
    + '<p class="hint">💾 Todo lo que guardes aquí queda en el repo GitHub (data.json) y se refleja al instante en el dashboard y el Excel de reportería. También puedes editar en masa en <b>Base de datos → 📝 Datos</b>.</p>';
}

/* registro en la app + estilos del formulario */
if (typeof window !== 'undefined'){
  (function(){
    if (!document.getElementById('crm-css')){
      var st = document.createElement('style');
      st.id = 'crm-css';
      st.textContent = '.crm-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}'
        + '.crm-campo{display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:#6b7d76;font-weight:600}'
        + '.crm-campo input,.crm-campo select{border:1px solid #d5ded8;border-radius:6px;padding:7px 8px;font:inherit;font-size:13px;color:#1c2b26;background:#fff}'
        + '.crm-campo input:focus,.crm-campo select:focus{outline:2px solid #9cc7ae;border-color:#9cc7ae}';
      document.head.appendChild(st);
    }
    titles.crm = 'CRM · Seguimiento comercial';
    views.crm = crmVista;
  })();
}
