/* ============================================================
   Cliente de correo GMAIL propio para el CRM NUVA OXI.
   Usa Google Identity Services (login) + Gmail REST API.
   NO usa iframe: interfaz propia (bandeja, lectura, redacción).
   Requiere un Client ID de Google en extra.js -> google.client_id
   (ver instrucciones en la pantalla de conexión).
   ============================================================ */
window.GM = { client:null, token:null, email:null, list:null, msg:null, view:'inbox', loading:false, error:null };

/* ---- helpers ---- */
function gmEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function gmB64(s){ s=String(s||'').replace(/-/g,'+').replace(/_/g,'/'); try{ return decodeURIComponent(escape(atob(s))); }catch(e){ try{ return atob(s); }catch(_){ return ''; } } }
function gmName(from){ const m=String(from||'').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/); if(m) return (m[1].trim()||m[2]); return String(from||'').trim(); }
function gmDate(d){ if(!d) return ''; const t=new Date(d); if(isNaN(t)) return d; const hoy=new Date(); const mismo=t.toDateString()===hoy.toDateString(); return mismo ? t.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}) : t.toLocaleDateString('es-CL',{day:'2-digit',month:'short'}); }
function gmExtractBody(payload){
  function walk(p, mime){
    if(!p) return '';
    if(p.mimeType===mime && p.body && p.body.data) return gmB64(p.body.data);
    if(p.parts){ for(const c of p.parts){ const r=walk(c,mime); if(r) return r; } }
    return '';
  }
  const plain = walk(payload,'text/plain');
  if(plain) return plain;
  const html = walk(payload,'text/html');
  if(html){ return html.replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|tr|li|h[1-6])>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\n{3,}/g,'\n\n').trim(); }
  if(payload && payload.body && payload.body.data) return gmB64(payload.body.data);
  return '(Este correo no tiene contenido de texto legible.)';
}

/* ---- API (fetch con token) ---- */
async function gmApi(path, opts){
  opts = opts || {};
  opts.headers = Object.assign({ 'Authorization':'Bearer '+GM.token }, opts.headers||{});
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+path, opts);
  if(r.status===401){ GM.token=null; throw new Error('Sesión de Google expirada — reconéctate.'); }
  if(!r.ok){ const t=await r.text().catch(()=> ''); throw new Error('Gmail API '+r.status+' '+t.slice(0,140)); }
  return r.json();
}

/* ---- acciones ---- */
function gmailConnect(){
  const cfg = (window.NUVA_DATA && NUVA_DATA.google) || {};
  if(!cfg.client_id){ GM.error='Falta el Client ID de Google. Agrégalo en extra.js → "google" → "client_id".'; render(); return; }
  if(!(window.google && google.accounts && google.accounts.oauth2)){ GM.error='No se pudo cargar Google Identity Services (revisa tu conexión a internet).'; render(); return; }
  if(!GM.client){
    GM.client = google.accounts.oauth2.initTokenClient({
      client_id: cfg.client_id,
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
      callback: (resp)=>{ if(resp && resp.access_token){ GM.token=resp.access_token; GM.error=null; gmailLoadInbox(); } else { GM.error='No se autorizó el acceso a Gmail.'; render(); } }
    });
  }
  GM.error=null; render();
  GM.client.requestAccessToken();
}
function gmailSignOut(){ try{ if(GM.token && window.google) google.accounts.oauth2.revoke(GM.token); }catch(e){} GM.token=null; GM.list=null; GM.msg=null; GM.view='inbox'; render(); }

async function gmailLoadInbox(){
  try{
    GM.loading=true; GM.view='inbox'; GM.msg=null; render();
    const prof = await gmApi('profile'); GM.email = prof.emailAddress;
    const list = await gmApi('messages?maxResults=15&q='+encodeURIComponent('in:inbox'));
    const ids = (list.messages||[]).map(m=>m.id);
    const out = [];
    for(const id of ids){
      const m = await gmApi('messages/'+id+'?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date');
      const h={}; (m.payload && m.payload.headers || []).forEach(x=>h[x.name.toLowerCase()]=x.value);
      out.push({ id, from:h.from||'', subject:h.subject||'(sin asunto)', date:h.date||'', snippet:m.snippet||'', unread:(m.labelIds||[]).indexOf('UNREAD')>=0 });
    }
    GM.list = out; GM.loading=false; render();
  }catch(e){ GM.loading=false; GM.error=String(e.message||e); render(); }
}
async function gmailOpen(id){
  try{
    GM.loading=true; GM.view='read'; render();
    const m = await gmApi('messages/'+id+'?format=full');
    const h={}; (m.payload && m.payload.headers || []).forEach(x=>h[x.name.toLowerCase()]=x.value);
    GM.msg = { id, from:h.from||'', to:h.to||'', subject:h.subject||'(sin asunto)', date:h.date||'', body: gmExtractBody(m.payload) };
    GM.loading=false; render();
  }catch(e){ GM.loading=false; GM.error=String(e.message||e); render(); }
}
function gmailBack(){ GM.view='inbox'; GM.msg=null; render(); }
function gmailCompose(pref){ GM.compose = pref || {to:'',subject:'',body:''}; GM.view='compose'; render(); }
function gmailReply(){ if(!GM.msg) return gmailCompose(); const to=GM.msg.from; const subject=/^re:/i.test(GM.msg.subject)?GM.msg.subject:('Re: '+GM.msg.subject); const quoted='\n\n----- '+gmName(GM.msg.from)+' escribió: -----\n'+GM.msg.body; gmailCompose({to,subject,body:quoted}); }
async function gmailSend(){
  const to=(document.getElementById('cmpTo')||{}).value||'';
  const subject=(document.getElementById('cmpSubj')||{}).value||'';
  const body=(document.getElementById('cmpBody')||{}).value||'';
  if(!to.trim()){ alert('Falta el destinatario.'); return; }
  const mime = 'To: '+to+'\r\nSubject: =?UTF-8?B?'+btoa(unescape(encodeURIComponent(subject)))+'?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n'+body;
  const raw = btoa(unescape(encodeURIComponent(mime))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  try{
    GM.loading=true; render();
    await gmApi('messages/send',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({raw}) });
    GM.loading=false; alert('Correo enviado ✓'); gmailLoadInbox();
  }catch(e){ GM.loading=false; GM.error='No se pudo enviar: '+(e.message||e); render(); }
}

/* ---- vista (la llama views.correo() en app.js) ---- */
function gmailView(){
  const cfg = (window.NUVA_DATA && NUVA_DATA.google) || {};
  const err = GM.error ? `<div class="alert bad" style="margin-bottom:14px">⚠️ ${gmEsc(GM.error)}</div>` : '';

  if(!cfg.client_id){
    return `<div class="glaunch">
      <div class="glaunch-ico">✉️</div>
      <h2>Configura el correo (una vez)</h2>
      <p class="hint" style="max-width:640px;text-align:left">Esta es una interfaz de correo <b>propia</b> (no un iframe). Para conectarla a tu Gmail necesitas un <b>Client ID de Google</b> (gratis):</p>
      <ol class="setup-list">
        <li>Entra a <a class="lnk" href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console</a> y crea un proyecto.</li>
        <li>En <b>APIs y servicios → Biblioteca</b>, habilita la <b>Gmail API</b>.</li>
        <li>En <b>Pantalla de consentimiento OAuth</b>: tipo <b>Externo</b>, modo <b>Testing</b>, y agrégate como <b>usuario de prueba</b>.</li>
        <li>En <b>Credenciales → Crear credenciales → ID de cliente OAuth → Aplicación web</b>. En <b>Orígenes autorizados de JavaScript</b> agrega la URL de tu web (ej. <code>http://localhost:8099</code> y tu dominio de Vercel).</li>
        <li>Copia el <b>Client ID</b> y pégalo en <code>extra.js → "google" → "client_id"</code>.</li>
      </ol>
      <p class="hint">Luego vuelve a esta pestaña y presiona <b>Conectar Gmail</b>.</p>
    </div>`;
  }

  if(!GM.token){
    return `<div class="glaunch">
      <div class="glaunch-ico">✉️</div>
      <h2>Correo NUVA OXI</h2>
      <p class="hint" style="max-width:520px">Conéctate con tu cuenta de Google para ver y responder tus correos aquí, dentro del CRM.</p>
      ${err}
      <button class="btn-google" onclick="gmailConnect()"><span class="gg">G</span> Conectar Gmail</button>
      <p class="hint" style="margin-top:12px">Se abrirá el login de Google. Si dice "app no verificada", es porque el proyecto está en modo prueba: continúa con tu cuenta.</p>
    </div>`;
  }

  const toolbar = `<div class="gmtoolbar">
    <div class="gm-acct"><span class="gm-avatar">${gmEsc((GM.email||'?')[0].toUpperCase())}</span><span>${gmEsc(GM.email||'')}</span></div>
    <div class="repbtns">
      <button class="btnrep xls" onclick="gmailCompose()">✍️ Redactar</button>
      <button class="btnrep pdf" onclick="gmailLoadInbox()">↻ Actualizar</button>
      <button class="btnrep" style="background:#eceeed;color:#5a6b64" onclick="gmailSignOut()">⎋ Salir</button>
    </div>
  </div>`;

  if(GM.loading){
    return toolbar + err + `<div class="panel"><p class="hint">⏳ Cargando desde Gmail…</p></div>`;
  }

  if(GM.view==='compose'){
    const c = GM.compose||{to:'',subject:'',body:''};
    return toolbar + err + `<div class="panel gm-compose">
      <h2>✍️ Nuevo correo</h2>
      <label class="gm-l">Para</label><input id="cmpTo" class="gm-in" type="email" value="${gmEsc(c.to)}" placeholder="destinatario@correo.com" />
      <label class="gm-l">Asunto</label><input id="cmpSubj" class="gm-in" value="${gmEsc(c.subject)}" placeholder="Asunto" />
      <label class="gm-l">Mensaje</label><textarea id="cmpBody" class="gm-in" rows="12" placeholder="Escribe tu mensaje…">${gmEsc(c.body)}</textarea>
      <div class="repbtns" style="margin-top:12px">
        <button class="btn-google" onclick="gmailSend()">📨 Enviar</button>
        <button class="btnrep" style="background:#eceeed;color:#5a6b64" onclick="gmailBack()">Cancelar</button>
      </div>
    </div>`;
  }

  if(GM.view==='read' && GM.msg){
    const m = GM.msg;
    return toolbar + err + `<div class="panel gm-read">
      <button class="lnk" onclick="gmailBack()">← Volver a la bandeja</button>
      <h2 style="margin:10px 0 6px">${gmEsc(m.subject)}</h2>
      <div class="gm-meta"><b>${gmEsc(gmName(m.from))}</b> &lt;${gmEsc((m.from.match(/<([^>]+)>/)||[])[1]||m.from)}&gt; · ${gmEsc(new Date(m.date).toLocaleString('es-CL'))}</div>
      <div class="gm-body">${gmEsc(m.body)}</div>
      <div class="repbtns" style="margin-top:14px"><button class="btn-google" onclick="gmailReply()">↩ Responder</button></div>
    </div>`;
  }

  // bandeja
  const list = GM.list||[];
  const rows = list.map(m=>`<div class="gm-item ${m.unread?'unread':''}" onclick="gmailOpen('${m.id}')">
      <div class="gm-from">${m.unread?'<span class="gm-dot"></span>':''}${gmEsc(gmName(m.from))}</div>
      <div class="gm-mid"><span class="gm-subj">${gmEsc(m.subject)}</span> <span class="gm-snip">— ${gmEsc(m.snippet)}</span></div>
      <div class="gm-date">${gmEsc(gmDate(m.date))}</div>
    </div>`).join('');
  return toolbar + err + `<div class="panel" style="padding:0;overflow:hidden">
      <div class="gm-listhead">📥 Bandeja de entrada · ${list.length} correo(s)</div>
      ${list.length ? rows : '<p class="hint" style="padding:16px">Sin correos en la bandeja.</p>'}
    </div>`;
}
