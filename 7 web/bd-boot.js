/* ============================================================
   NUVA OXI · bd-boot.js — cargador previo a app.js
   Si hay backend (bd-config.js -> api), baja los datos remotos y los
   fusiona sobre window.NUVA_DATA ANTES de inyectar app.js (que calcula
   sus agregados al parsear). Luego inyecta app.js y bd.js en orden.
   ============================================================ */
(function(){
  var CFG = window.NUVA_BD_CFG || { api: '', key: '' };

  /* Claves de NUVA_DATA que son PROPIAS de los datos (las únicas que el
     backend puede pisar). Las de extra.js / industria.js nunca se tocan. */
  var OWNED = ['generado','clientes','pdv','sku','sellin','pedidos','decisiones','sellout','finanzas'];

  function inyectar(src, cb){
    var s = document.createElement('script');
    s.src = src;
    if (cb) s.onload = cb;
    s.onerror = function(){
      console.error('bd-boot: no se pudo cargar ' + src);
      if (cb) cb();
    };
    document.body.appendChild(s);
  }
  /* app.js primero (renderiza con los datos ya fusionados), después bd.js */
  function arrancar(){ inyectar('app.js', function(){ inyectar('bd.js'); }); }

  /* Sin backend configurado: modo local puro, data.js manda */
  if (!CFG.api){
    window.NUVA_REMOTE = null;
    arrancar();
    return;
  }

  /* Placeholder mientras llega la respuesta (app.js lo reemplaza al renderizar) */
  var app = document.getElementById('app');
  if (app && !app.innerHTML.trim())
    app.innerHTML = '<p class="hint" style="padding:6px 2px">Cargando datos…</p>';

  var ctl = new AbortController();
  var timer = setTimeout(function(){ ctl.abort(); }, 8000);   // timeout 8s

  fetch(CFG.api + '?action=data&k=' + encodeURIComponent(CFG.key), { signal: ctl.signal })
    .then(function(r){ return r.json(); })
    .then(function(j){
      clearTimeout(timer);
      if (!j || !j.ok) throw new Error((j && j.error) || 'respuesta inválida del backend');
      window.NUVA_REMOTE = j;
      window.NUVA_DOCS   = j.docs  || {};
      window.NUVA_BASES  = j.bases || {};
      var D  = window.NUVA_DATA = window.NUVA_DATA || {};
      var rd = j.data || {};
      OWNED.forEach(function(k){ if (rd[k] !== undefined) D[k] = rd[k]; });
      if (j.generado) D.generado = j.generado;   // el backend lo devuelve al nivel superior
    })
    .catch(function(e){
      clearTimeout(timer);
      console.warn('bd-boot: sin datos remotos (' + (e && e.message) + ') — usando data.js local.');
      window.NUVA_REMOTE = null;   // modo fallback: data.js manda
    })
    .then(arrancar);   // en éxito o error, siempre arranca la app
})();
