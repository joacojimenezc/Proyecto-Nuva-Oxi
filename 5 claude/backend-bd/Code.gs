/**
 * NUVA-OXI Web BD — Backend de almacenamiento (Google Apps Script, V8)
 * =====================================================================
 * Web App que persiste en Drive las bases Excel, los documentos de respaldo
 * y el data.json del CRM web de Nuva-Oxi.
 *
 * Estructura en Drive (creada perezosamente, ids cacheados en ScriptProperties):
 *   NUVA-OXI Web BD/
 *     data.json                  (texto plano; '{}' al crearse)
 *     bases/                     (los .xlsx de cada base, 1 archivo por baseId)
 *     docs_fac_sellin/           (facturas sell-in)
 *     docs_fac_compras/          (facturas de compras)
 *     docs_oc/                   (ordenes de compra)
 *     docs_otros/                (otros documentos)
 *
 * Contrato API: ver README-DEPLOY.md. Todas las respuestas son JSON:
 *   {ok:true, ...} o {ok:false, error:'mensaje'}
 */

const KEY = 'NUVAOXI-BD-2607-kx94q';

const ROOT_NAME = 'NUVA-OXI Web BD';
const DATA_JSON = 'data.json';

// Subcarpetas de documentos por categoria
const DOC_CATS = {
  fac_sellin: 'docs_fac_sellin',
  fac_compras: 'docs_fac_compras',
  oc: 'docs_oc',
  otros: 'docs_otros'
};

// baseId -> nombre de archivo fijo del contrato
const BASE_FILES = {
  crm: 'CRM_NUVA_OXI.xlsx',
  sellin: 'BD_SELL_IN_NUVA.xlsx',
  sellout: 'BD_SELL_OUT_NUVA.xlsx',
  inventario: 'BD_INVENTARIO_NUVA.xlsx',
  finanzas: 'BD_FINANZAS_NUVA.xlsx',
  consolidado: 'CONSOLIDADO_COMERCIAL_NUVA.xlsx'
};

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Mime por extension para uploadDoc
const MIME_POR_EXT = {
  pdf: 'application/pdf',
  xlsx: XLSX_MIME,
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  csv: 'text/csv'
};

/* ================================ ENTRADAS ================================ */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.k !== KEY) return json_({ ok: false, error: 'clave invalida' });

    switch (p.action) {
      case 'ping':
        return json_({ ok: true, ts: new Date().toISOString() });
      case 'data':
        return json_(actionData_());
      case 'file':
        return json_(actionFile_(p));
      default:
        return json_({ ok: false, error: 'accion desconocida: ' + String(p.action) });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    // El frontend envia el body como text/plain con JSON adentro (evita preflight CORS)
    var req;
    try {
      req = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return json_({ ok: false, error: 'body JSON invalido' });
    }
    if (!req || req.k !== KEY) return json_({ ok: false, error: 'clave invalida' });

    switch (req.action) {
      case 'uploadBase':
        return json_(uploadBase_(req));
      case 'uploadDoc':
        return json_(uploadDoc_(req));
      case 'deleteDoc':
        return json_(deleteDoc_(req));
      case 'saveData':
        return json_(saveData_(req));
      default:
        return json_({ ok: false, error: 'accion desconocida: ' + String(req.action) });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ================================ ACCIONES ================================ */

// GET ?action=data — data.json + inventario de bases + listado de docs
function actionData_() {
  var raw = readDataJson_();

  // 'generado' vive dentro de data.json pero se devuelve al nivel superior
  var generado = raw.generado || '';
  var data = {};
  for (var k in raw) {
    if (raw.hasOwnProperty(k) && k !== 'generado') data[k] = raw[k];
  }

  // Bases con archivo subido (map bases_<id> -> fileId en Properties)
  var bases = {};
  var props = props_().getProperties();
  for (var key in props) {
    if (key.indexOf('bases_') !== 0) continue;
    var baseId = key.substring(6);
    try {
      var f = DriveApp.getFileById(props[key]);
      if (f.isTrashed()) continue;
      bases[baseId] = {
        filename: f.getName(),
        updatedAt: f.getLastUpdated().toISOString(),
        size: f.getSize()
      };
    } catch (ignorado) {
      // archivo borrado definitivamente o sin acceso: se omite
    }
  }

  // Documentos por categoria, ordenados por updatedAt desc
  var docs = {};
  for (var cat in DOC_CATS) {
    var lista = [];
    var it = getFolder_(DOC_CATS[cat]).getFiles();
    while (it.hasNext()) {
      var d = it.next();
      if (d.isTrashed()) continue;
      lista.push({
        id: d.getId(),
        name: d.getName(),
        size: d.getSize(),
        updatedAt: d.getLastUpdated().toISOString()
      });
    }
    lista.sort(function (a, b) {
      return a.updatedAt < b.updatedAt ? 1 : (a.updatedAt > b.updatedAt ? -1 : 0);
    });
    docs[cat] = lista;
  }

  return { ok: true, generado: generado, data: data, bases: bases, docs: docs };
}

// GET ?action=file&kind=base|doc&id=... — descarga un archivo en base64
function actionFile_(p) {
  var kind = String(p.kind || '');
  var id = String(p.id || '');
  var file = null;

  if (kind === 'base') {
    if (!BASE_FILES[id]) return { ok: false, error: 'base desconocida: ' + id };
    var fileId = props_().getProperty('bases_' + id);
    if (!fileId) return { ok: false, error: 'base sin archivo subido' };
    try {
      file = DriveApp.getFileById(fileId);
    } catch (err) {
      return { ok: false, error: 'archivo de base no accesible' };
    }
    if (file.isTrashed()) return { ok: false, error: 'archivo de base en papelera' };

  } else if (kind === 'doc') {
    if (!id) return { ok: false, error: 'falta id' };
    try {
      file = DriveApp.getFileById(id);
    } catch (err2) {
      return { ok: false, error: 'archivo no accesible' };
    }
    if (file.isTrashed()) return { ok: false, error: 'archivo en papelera' };
    // Solo se sirven archivos dentro del ambito de la app (docs_* o bases)
    if (!estaEnDocs_(file) && !esArchivoDeBase_(file)) {
      return { ok: false, error: 'fuera de ambito' };
    }

  } else {
    return { ok: false, error: 'kind invalido' };
  }

  var blob = file.getBlob();
  return {
    ok: true,
    filename: file.getName(),
    mime: blob.getContentType(),
    b64: Utilities.base64Encode(blob.getBytes())
  };
}

// POST uploadBase — reemplaza el Excel de una base y (opcional) mergea sections
function uploadBase_(req) {
  var id = String(req.id || '');
  if (!BASE_FILES[id]) return { ok: false, error: 'base desconocida: ' + id };
  if (!req.b64) return { ok: false, error: 'falta b64' };

  var bytes = Utilities.base64Decode(req.b64);
  var blob = Utilities.newBlob(bytes, XLSX_MIME, BASE_FILES[id]);

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = props_();

    // Si ya existia archivo para esta base, a la papelera (reversible)
    var viejoId = props.getProperty('bases_' + id);
    if (viejoId) {
      try { DriveApp.getFileById(viejoId).setTrashed(true); } catch (ignorado) {}
    }

    var file = getFolder_('bases').createFile(blob);
    props.setProperty('bases_' + id, file.getId());

    // Merge opcional de secciones en data.json
    if (req.sections && typeof req.sections === 'object') {
      mergeSecciones_(req.sections);
    }

    return { ok: true, updatedAt: file.getLastUpdated().toISOString() };
  } finally {
    lock.releaseLock();
  }
}

// POST uploadDoc — guarda un documento en la subcarpeta de su categoria
function uploadDoc_(req) {
  var carpeta = DOC_CATS[String(req.cat || '')];
  if (!carpeta) return { ok: false, error: 'categoria invalida' };
  if (!req.filename || !req.b64) return { ok: false, error: 'faltan filename/b64' };

  var nombre = sanearNombre_(String(req.filename));
  var ext = '';
  var punto = nombre.lastIndexOf('.');
  if (punto > -1) ext = nombre.substring(punto + 1).toLowerCase();
  var mime = MIME_POR_EXT[ext] || 'application/octet-stream';

  var folder = getFolder_(carpeta);
  var nombreFinal = nombreUnico_(folder, nombre);
  var file = folder.createFile(
    Utilities.newBlob(Utilities.base64Decode(req.b64), mime, nombreFinal)
  );

  return { ok: true, id: file.getId(), name: file.getName() };
}

// POST deleteDoc — a la papelera (reversible), solo dentro del ambito docs_*
function deleteDoc_(req) {
  var id = String(req.id || '');
  if (!id) return { ok: false, error: 'falta id' };

  var file;
  try {
    file = DriveApp.getFileById(id);
  } catch (err) {
    return { ok: false, error: 'archivo no accesible' };
  }
  if (!estaEnDocs_(file)) return { ok: false, error: 'fuera de ambito' };

  file.setTrashed(true);
  return { ok: true };
}

// POST saveData — merge de secciones en data.json sin subir archivo (seeder)
function saveData_(req) {
  if (!req.sections || typeof req.sections !== 'object') {
    return { ok: false, error: 'faltan sections' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    mergeSecciones_(req.sections);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

/* ================================ HELPERS ================================= */

// Respuesta JSON estandar
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function props_() {
  return PropertiesService.getScriptProperties();
}

/**
 * Devuelve una carpeta por nombre ('' = raiz 'NUVA-OXI Web BD').
 * Se crea perezosamente si no existe y su id se cachea en ScriptProperties.
 */
function getFolder_(nombre) {
  var props = props_();
  var clave = nombre ? 'folder_' + nombre : 'folder_root';

  var id = props.getProperty(clave);
  if (id) {
    try {
      var cacheada = DriveApp.getFolderById(id);
      if (!cacheada.isTrashed()) return cacheada;
    } catch (ignorado) {
      // id invalido o carpeta borrada: se recrea abajo
    }
  }

  var folder;
  if (!nombre) {
    var it = DriveApp.getRootFolder().getFoldersByName(ROOT_NAME);
    folder = it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_NAME);
  } else {
    var raiz = getFolder_('');
    var it2 = raiz.getFoldersByName(nombre);
    folder = it2.hasNext() ? it2.next() : raiz.createFolder(nombre);
  }

  props.setProperty(clave, folder.getId());
  return folder;
}

/**
 * Devuelve el archivo data.json de la raiz (lo crea con '{}' si no existe).
 * Id cacheado en ScriptProperties como datajson_id.
 */
function getDataFile_() {
  var props = props_();
  var id = props.getProperty('datajson_id');
  if (id) {
    try {
      var cacheado = DriveApp.getFileById(id);
      if (!cacheado.isTrashed()) return cacheado;
    } catch (ignorado) {}
  }

  var raiz = getFolder_('');
  var it = raiz.getFilesByName(DATA_JSON);
  var file = it.hasNext() ? it.next() : raiz.createFile(DATA_JSON, '{}', MimeType.PLAIN_TEXT);
  props.setProperty('datajson_id', file.getId());
  return file;
}

// Lee y parsea data.json (objeto vacio ante contenido corrupto)
function readDataJson_() {
  try {
    var obj = JSON.parse(getDataFile_().getBlob().getDataAsString('UTF-8'));
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (err) {
    return {};
  }
}

/**
 * Merge superficial clave-por-clave de sections en data.json y actualiza
 * el campo 'generado'. OJO: llamar SIEMPRE con el ScriptLock ya tomado.
 */
function mergeSecciones_(sections) {
  var file = getDataFile_();
  var data = readDataJson_();
  for (var k in sections) {
    if (sections.hasOwnProperty(k)) data[k] = sections[k];
  }
  data.generado = Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'
  );
  file.setContent(JSON.stringify(data));
}

// true si el archivo cuelga de alguna subcarpeta docs_*
function estaEnDocs_(file) {
  var idsDocs = {};
  for (var cat in DOC_CATS) {
    idsDocs[getFolder_(DOC_CATS[cat]).getId()] = true;
  }
  var padres = file.getParents();
  while (padres.hasNext()) {
    if (idsDocs[padres.next().getId()]) return true;
  }
  return false;
}

// true si el archivo es uno de los xlsx de bases registrados en Properties
function esArchivoDeBase_(file) {
  var fid = file.getId();
  var props = props_().getProperties();
  for (var k in props) {
    if (k.indexOf('bases_') === 0 && props[k] === fid) return true;
  }
  return false;
}

// Quita caracteres de control del nombre de archivo
function sanearNombre_(nombre) {
  var limpio = nombre.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  return limpio || 'archivo';
}

// Si ya existe un archivo con ese nombre en la carpeta: ' (2)', ' (3)', ...
function nombreUnico_(folder, nombre) {
  if (!folder.getFilesByName(nombre).hasNext()) return nombre;

  var punto = nombre.lastIndexOf('.');
  var base = punto > 0 ? nombre.substring(0, punto) : nombre;
  var ext = punto > 0 ? nombre.substring(punto) : '';

  for (var n = 2; n < 1000; n++) {
    var candidato = base + ' (' + n + ')' + ext;
    if (!folder.getFilesByName(candidato).hasNext()) return candidato;
  }
  // Salida de emergencia (mas de 999 duplicados)
  return base + ' (' + new Date().getTime() + ')' + ext;
}
