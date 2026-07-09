/* ============================================================
   NUVA OXI · API "Base de datos" (función serverless de Vercel)
   ------------------------------------------------------------
   Las bases Excel, los documentos y el data.json viven en el REPO
   GitHub (joacojimenezc/Proyecto-Nuva-Oxi, rama main). Esta función
   los lee/escribe vía la API de GitHub con un token que SOLO existe
   como variable de entorno en Vercel (GITHUB_TOKEN, fine-grained,
   permiso Contents RW únicamente sobre este repo).

   Contrato (igual que el frontend bd.js / bd-boot.js):
     GET  ?action=ping|data|file(kind=base|doc,id)   + k=KEY
     POST JSON {k, action: uploadBase|uploadDoc|deleteDoc|saveData, ...}
   Respuestas SIEMPRE HTTP 200 con {ok:true,...} o {ok:false,error}.

   Nota: el "borrado" de documentos elimina el archivo del HEAD del
   repo; el historial git lo conserva (recuperable con git checkout).
   ============================================================ */

const OWNER  = 'joacojimenezc';
const REPO   = 'Proyecto-Nuva-Oxi';
const BRANCH = 'main';
const KEY    = process.env.BD_KEY || 'NUVAOXI-BD-2607-kx94q';
const TOKEN  = process.env.GITHUB_TOKEN || '';

const DATA_PATH = '7 web/data.json';

/* baseId -> ruta del Excel dentro del repo (las rutas reales del proyecto) */
const BASE_PATHS = {
  crm:         'CRM_NUVA_OXI.xlsx',
  sellin:      '1 venta sell in/BD_SELL_IN_NUVA.xlsx',
  sellout:     '2 venta sell out/BD_SELL_OUT_NUVA.xlsx',
  inventario:  '3 control inventario/BD_INVENTARIO_NUVA.xlsx',
  finanzas:    '4 finanzas/BD_FINANZAS_NUVA.xlsx',
  consolidado: '8 reporteria/CONSOLIDADO_COMERCIAL_NUVA.xlsx'
};

/* categoría de documento -> carpeta del repo */
const DOC_DIRS = {
  fac_sellin:  '4 finanzas/contabilidad/1 facturas sell in',
  fac_compras: '4 finanzas/contabilidad/2 facturas compras',
  oc:          '4 finanzas/contabilidad/3 ordenes de compra',
  otros:       '4 finanzas/contabilidad/4 otros'
};

/* límite de subida: el body de una función Vercel admite ~4.5 MB;
   base64 infla ~33%, así que el archivo binario debe ser <= ~3 MB */
const MAX_B64 = 4.2 * 1024 * 1024;

const MIME_POR_EXT = {
  pdf:  'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv:  'text/csv',
  jpg:  'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  json: 'application/json'
};

/* ---------------- helpers GitHub ---------------- */

const GH = 'https://api.github.com';

function encPath(p){ return String(p).split('/').map(encodeURIComponent).join('/'); }
function baseName(p){ var i = String(p).lastIndexOf('/'); return i < 0 ? String(p) : String(p).slice(i + 1); }
function mimeDe(nombre){
  var i = String(nombre).lastIndexOf('.');
  var ext = i < 0 ? '' : String(nombre).slice(i + 1).toLowerCase();
  return MIME_POR_EXT[ext] || 'application/octet-stream';
}

async function gh(method, path, body, accept){
  const r = await fetch(GH + path, {
    method: method,
    headers: Object.assign({
      'Authorization': 'Bearer ' + TOKEN,
      'Accept': accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'nuva-oxi-bd'
    }, body ? { 'Content-Type': 'application/json' } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
  return r;
}

/* contenido crudo de un archivo del repo (null si no existe) */
async function leerRaw(path){
  const r = await gh('GET', `/repos/${OWNER}/${REPO}/contents/${encPath(path)}?ref=${BRANCH}`, null, 'application/vnd.github.raw');
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GitHub GET ' + path + ': HTTP ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

/* sha actual de un archivo (null si no existe) — necesario para PUT/DELETE */
async function shaDe(path){
  const r = await gh('GET', `/repos/${OWNER}/${REPO}/contents/${encPath(path)}?ref=${BRANCH}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('GitHub sha ' + path + ': HTTP ' + r.status);
  const j = await r.json();
  return j && j.sha ? j.sha : null;
}

/* crea o actualiza un archivo (commit directo a main) */
async function escribir(path, b64, mensaje){
  const sha = await shaDe(path);
  const body = { message: mensaje, content: b64, branch: BRANCH };
  if (sha) body.sha = sha;
  const r = await gh('PUT', `/repos/${OWNER}/${REPO}/contents/${encPath(path)}`, body);
  if (r.status === 409 || r.status === 422){
    throw new Error('conflicto de escritura en ' + path + ' (otro cambio simultáneo) — reintenta');
  }
  if (!r.ok){
    let det = ''; try { det = (await r.json()).message || ''; } catch (e) {}
    throw new Error('GitHub PUT ' + path + ': HTTP ' + r.status + (det ? ' — ' + det : ''));
  }
  return r.json();
}

async function borrar(path, mensaje){
  const sha = await shaDe(path);
  if (!sha) throw new Error('el archivo no existe en el repo: ' + path);
  const r = await gh('DELETE', `/repos/${OWNER}/${REPO}/contents/${encPath(path)}`,
    { message: mensaje, sha: sha, branch: BRANCH });
  if (!r.ok) throw new Error('GitHub DELETE ' + path + ': HTTP ' + r.status);
  return true;
}

/* lista archivos de una carpeta ([] si la carpeta no existe) */
async function listar(dir){
  const r = await gh('GET', `/repos/${OWNER}/${REPO}/contents/${encPath(dir)}?ref=${BRANCH}`);
  if (r.status === 404) return [];
  if (!r.ok) throw new Error('GitHub LIST ' + dir + ': HTTP ' + r.status);
  const arr = await r.json();
  if (!Array.isArray(arr)) return [];
  return arr.filter(f => f.type === 'file' && f.name.charAt(0) !== '.');
}

/* fecha del último commit que tocó una ruta (ISO) o null */
async function ultimaFecha(path){
  const r = await gh('GET', `/repos/${OWNER}/${REPO}/commits?path=${encPath(path)}&sha=${BRANCH}&per_page=1`);
  if (!r.ok) return null;
  const arr = await r.json();
  const c = Array.isArray(arr) && arr[0] && arr[0].commit;
  return (c && (c.committer || c.author) && (c.committer || c.author).date) || null;
}

/* ---------------- data.json ---------------- */

function fechaCL(){
  /* 'yyyy-MM-dd HH:mm' hora de Chile (sv-SE da ese formato) */
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Santiago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date()).replace(',', '');
}

/* lee data.json; {corrupto:true} si existe pero no parsea (NO se pisa) */
async function leerData(){
  const buf = await leerRaw(DATA_PATH);
  if (buf === null) return { data: {}, nuevo: true };
  try {
    const obj = JSON.parse(buf.toString('utf8'));
    return { data: (obj && typeof obj === 'object') ? obj : {}, nuevo: false };
  } catch (e) {
    return { corrupto: true };
  }
}

/* merge superficial de sections + 'generado'; aborta si data.json está corrupto */
async function mergeData(sections){
  const cur = await leerData();
  if (cur.corrupto) throw new Error('data.json del repo está corrupto — no se hace merge (arréglalo o bórralo primero)');
  const data = cur.data;
  for (const k in sections){
    if (Object.prototype.hasOwnProperty.call(sections, k)) data[k] = sections[k];
  }
  data.generado = fechaCL();
  const b64 = Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
  await escribir(DATA_PATH, b64, 'BD web: actualizar data.json');
  return data.generado;
}

/* ---------------- validaciones ---------------- */

function nombreSano(nombre){
  var limpio = String(nombre || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')  // caracteres de control
    .replace(/[\/\\:*?"<>|]/g, '')           // separadores/prohibidos de ruta
    .replace(/\.{2,}/g, '.')                 // sin '..' (chocaría con docPathValido)
    .trim();
  if (!limpio || limpio === '.' || limpio === '..') limpio = 'archivo';
  if (limpio.charAt(0) === '.') limpio = 'archivo-' + limpio.slice(1);
  return limpio;
}

/* un doc id válido es una ruta DENTRO de alguna carpeta de documentos */
function docPathValido(p){
  const s = String(p || '');
  if (s.indexOf('..') >= 0) return false;
  for (const cat in DOC_DIRS){
    if (s.indexOf(DOC_DIRS[cat] + '/') === 0 && s.length > DOC_DIRS[cat].length + 1) return true;
  }
  return false;
}

async function nombreUnico(dir, nombre){
  const usados = new Set((await listar(dir)).map(f => f.name));
  if (!usados.has(nombre)) return nombre;
  const punto = nombre.lastIndexOf('.');
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const ext  = punto > 0 ? nombre.slice(punto) : '';
  for (let n = 2; n < 1000; n++){
    const cand = base + ' (' + n + ')' + ext;
    if (!usados.has(cand)) return cand;
  }
  return base + ' (' + Date.now() + ')' + ext;
}

/* ---------------- acciones ---------------- */

async function accionData(){
  const [cur, basesMeta, docsListas] = await Promise.all([
    leerData(),
    Promise.all(Object.keys(BASE_PATHS).map(async id => {
      const fecha = await ultimaFecha(BASE_PATHS[id]);
      return { id, fecha };
    })),
    Promise.all(Object.keys(DOC_DIRS).map(async cat => {
      const files = await listar(DOC_DIRS[cat]);
      return { cat, files };
    }))
  ]);

  const raw = cur.corrupto ? {} : cur.data;
  const generado = raw.generado || '';
  const data = {};
  for (const k in raw){
    if (Object.prototype.hasOwnProperty.call(raw, k) && k !== 'generado') data[k] = raw[k];
  }

  const bases = {};
  basesMeta.forEach(b => {
    if (b.fecha) bases[b.id] = { filename: baseName(BASE_PATHS[b.id]), updatedAt: b.fecha };
  });

  const docs = {};
  docsListas.forEach(d => {
    docs[d.cat] = d.files
      .map(f => ({ id: f.path, name: f.name, size: f.size }))
      .sort((a, b) => a.name < b.name ? 1 : -1);
  });

  return { ok: true, generado, data, bases, docs };
}

async function accionFile(q){
  let path;
  if (q.kind === 'base'){
    path = BASE_PATHS[String(q.id || '')];
    if (!path) return { ok: false, error: 'base desconocida: ' + q.id };
  } else if (q.kind === 'doc'){
    path = String(q.id || '');
    if (!docPathValido(path)) return { ok: false, error: 'fuera de ambito' };
  } else {
    return { ok: false, error: 'kind invalido' };
  }
  const buf = await leerRaw(path);
  if (buf === null) return { ok: false, error: 'el archivo no existe en el repo' };
  return { ok: true, filename: baseName(path), mime: mimeDe(path), b64: buf.toString('base64') };
}

async function accionUploadBase(b){
  const id = String(b.id || '');
  if (!BASE_PATHS[id]) return { ok: false, error: 'base desconocida: ' + id };
  if (!b.b64) return { ok: false, error: 'falta b64' };
  if (b.b64.length > MAX_B64) return { ok: false, error: 'archivo demasiado grande (máx ~3 MB vía web; usa la carpeta local para archivos mayores)' };

  await escribir(BASE_PATHS[id], b.b64, 'BD web: actualizar base ' + id + ' (' + baseName(BASE_PATHS[id]) + ')');
  if (b.sections && typeof b.sections === 'object'){
    await mergeData(b.sections);
  }
  return { ok: true, updatedAt: new Date().toISOString() };
}

async function accionUploadDoc(b){
  const dir = DOC_DIRS[String(b.cat || '')];
  if (!dir) return { ok: false, error: 'categoria invalida' };
  if (!b.filename || !b.b64) return { ok: false, error: 'faltan filename/b64' };
  if (b.b64.length > MAX_B64) return { ok: false, error: 'archivo demasiado grande (máx ~3 MB vía web; usa la carpeta local para archivos mayores)' };

  const nombre = await nombreUnico(dir, nombreSano(b.filename));
  const path = dir + '/' + nombre;
  await escribir(path, b.b64, 'BD web: subir documento ' + nombre);
  return { ok: true, id: path, name: nombre };
}

async function accionDeleteDoc(b){
  const path = String(b.id || '');
  if (!docPathValido(path)) return { ok: false, error: 'fuera de ambito' };
  await borrar(path, 'BD web: eliminar documento ' + baseName(path));
  return { ok: true };
}

async function accionSaveData(b){
  if (!b.sections || typeof b.sections !== 'object') return { ok: false, error: 'faltan sections' };
  await mergeData(b.sections);
  return { ok: true };
}

/* ---------------- handler ---------------- */

module.exports = async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (!TOKEN){
      return res.status(200).json({ ok: false, error: 'GITHUB_TOKEN no configurado en Vercel (Settings → Environment Variables)' });
    }

    if (req.method === 'GET'){
      const q = req.query || {};
      if (q.k !== KEY) return res.status(200).json({ ok: false, error: 'clave invalida' });
      switch (q.action){
        case 'ping': return res.status(200).json({ ok: true, ts: new Date().toISOString() });
        case 'data': return res.status(200).json(await accionData());
        case 'file': return res.status(200).json(await accionFile(q));
        default:     return res.status(200).json({ ok: false, error: 'accion desconocida: ' + String(q.action) });
      }
    }

    if (req.method === 'POST'){
      let b = req.body;
      if (typeof b === 'string'){
        try { b = JSON.parse(b); } catch (e) { return res.status(200).json({ ok: false, error: 'body JSON invalido' }); }
      }
      if (!b || typeof b !== 'object') return res.status(200).json({ ok: false, error: 'body vacio' });
      if (b.k !== KEY) return res.status(200).json({ ok: false, error: 'clave invalida' });
      switch (b.action){
        case 'uploadBase': return res.status(200).json(await accionUploadBase(b));
        case 'uploadDoc':  return res.status(200).json(await accionUploadDoc(b));
        case 'deleteDoc':  return res.status(200).json(await accionDeleteDoc(b));
        case 'saveData':   return res.status(200).json(await accionSaveData(b));
        default:           return res.status(200).json({ ok: false, error: 'accion desconocida: ' + String(b.action) });
      }
    }

    return res.status(200).json({ ok: false, error: 'metodo no soportado' });
  } catch (err) {
    return res.status(200).json({ ok: false, error: String(err && err.message || err) });
  }
};
