/* ============================================================
   NUVA OXI · Pestaña CRM / Seguimiento comercial (crm.js)
   Se carga DESPUÉS de app.js (la inyecta bd-boot.js): usa sus globals
   esc(), table(), badge(), clp(), views, titles, D, nameCliente,
   namePDV y crmResumen() (definido en app.js).
   Datos: clientes (próxima acción / últ. contacto), visitas
   (05_Plan_Visitas) y registro (06_Registro_PDV). Se editan en
   Base de datos → Datos o subiendo el CRM Excel.
   ============================================================ */

function crmBadgeVisita(v){
  if (v.realizada) return '<span class="badge b-green">Realizada</span>';
  if (v.vencida)   return '<span class="badge b-red">Atrasada</span>';
  return '<span class="badge b-amber">' + esc(v.Estado_Visita || 'Planificada') + '</span>';
}

function crmVista(){
  var cr = crmResumen();

  /* --- KPIs --- */
  var kpis = '<div class="kpis">'
    + '<div class="kpi ' + (cr.accVencidas ? 'red' : '') + '"><div class="lbl">Acciones vencidas</div><div class="val">' + cr.accVencidas + '</div><div class="sub">compromisos con fecha pasada</div></div>'
    + '<div class="kpi amber"><div class="lbl">Próximas 7 días</div><div class="val">' + cr.accProximas + '</div><div class="sub">acciones agendadas</div></div>'
    + '<div class="kpi ' + (cr.visVencidas ? 'red' : 'blue') + '"><div class="lbl">Visitas pendientes</div><div class="val">' + cr.visPend + '</div><div class="sub">' + cr.visVencidas + ' atrasada(s)</div></div>'
    + '<div class="kpi"><div class="lbl">Visitas realizadas</div><div class="val">' + cr.visReal + '</div><div class="sub">' + cr.registro.length + ' registro(s) en terreno</div></div>'
    + '<div class="kpi ' + (cr.sinContacto ? 'amber' : '') + '"><div class="lbl">Sin contacto 30d+</div><div class="val">' + cr.sinContacto + '</div><div class="sub">clientes por reactivar</div></div>'
    + '</div>';

  /* --- Próximas acciones por cliente --- */
  var accTabla = cr.acciones.length
    ? table([
        { k:'cliente', t:'Cliente', render:function(r){ return '<b>' + esc(r.cliente) + '</b>'; } },
        { k:'estado',  t:'Estado',  render:function(r){ return badge(r.estado); } },
        { k:'ult',     t:'Últ. contacto', render:function(r){ return r.ult || '—'; } },
        { k:'accion',  t:'Próxima acción', render:function(r){ return esc(r.accion); } },
        { k:'fecha',   t:'Fecha', render:function(r){ return r.fecha ? (r.vencida ? '<span class="badge b-red">' + r.fecha + ' ⚠ vencida</span>' : r.fecha) : '—'; } },
        { k:'notas',   t:'Notas', render:function(r){ return esc(r.notas); } }
      ], cr.acciones)
    : '<p class="hint">Sin acciones registradas — completa "Próxima acción" en la tabla Clientes (Base de datos → Datos).</p>';

  /* --- Plan de visitas --- */
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
        { k:'prox',   t:'Próx. acción', render:function(r){ return esc(r.Proxima_Accion || '') + (r.proxima ? ' <span class="hint" style="margin:0">(' + r.proxima + ')</span>' : ''); } }
      ], cr.visitas)
    : '<p class="hint">Sin visitas planificadas — agrégalas en Base de datos → Datos → 🗓️ Plan de visitas.</p>';

  /* --- Registro de visitas a PDV (terreno) --- */
  var regTabla = cr.registro.length
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
        { k:'prox',  t:'Próx. acción', render:function(r){ return esc(r.Proxima_Accion || ''); } }
      ], cr.registro)
    : '<p class="hint">Sin registros de terreno — agrégalos en Base de datos → Datos → 📋 Registro de visitas a PDV.</p>';

  return kpis
    + '<div class="panel"><h2>📌 Próximas acciones por cliente</h2>' + accTabla + '</div>'
    + '<div class="panel"><h2>🗓️ Plan de visitas</h2>' + visTabla + '</div>'
    + '<div class="panel"><h2>📋 Registro de visitas a PDV (terreno)</h2>' + regTabla + '</div>'
    + '<p class="hint">✏️ Estos datos se editan en <b>Base de datos → 📝 Datos</b> (tablas Clientes, Plan de visitas y Registro) o subiendo el CRM Excel — el resumen del dashboard y el Excel de reportería se actualizan solos.</p>';
}

/* registro en la app */
if (typeof window !== 'undefined'){
  titles.crm = 'CRM · Seguimiento comercial';
  views.crm = crmVista;
}
