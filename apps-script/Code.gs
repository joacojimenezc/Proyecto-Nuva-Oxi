/**
 * WP3 · Blue Economy Lab — Backend (Apps Script Web App)
 * --------------------------------------------------------------------
 * Un solo Web App sirve DOS cosas sobre la misma Google Sheet:
 *
 *  1) EVALUACIONES (cross-assessment)
 *     • doPost (sin "type")      -> agrega una fila por evaluación.
 *     • doGet  (sin "type")      -> devuelve todas las evaluaciones en JSON.
 *
 *  2) CONTENIDO EDITABLE (modo "Editar contenido" de la web)
 *     • doGet  ?type=content     -> devuelve los textos editados (overrides) en JSON.
 *     • doPost {type:"content"}  -> guarda los overrides. REQUIERE contraseña
 *                                   (Script Property EDIT_PASSWORD).
 *
 * La Sheet puede permanecer PRIVADA: el script corre como tú (el dueño).
 * Solo el Web App se publica como «cualquier persona».
 *
 * >>> Cómo desplegar / configurar la contraseña: ver README_DESPLIEGUE.md <<<
 */

var SHEET_ID = '1WCnjvygXah8H2eutZYdvVcZJ7IKcsdi4UknXz0ZNxBU';

/* Orden EXACTO de columnas de la Sheet de evaluaciones (fila 1 = encabezados). */
var COLS = [
  'timestamp','evaluator.name','evaluator.org','evaluator.country','evaluator.email',
  'pilotId','pilotName',
  'scores.q1','scores.q2','scores.q3','scores.q4','scores.q5','scores.q6','scores.q7','scores.q8',
  'weighted','pct','state','comments',
  'evidence.q1','evidence.q2','evidence.q3','evidence.q4','evidence.q5','evidence.q6','evidence.q7','evidence.q8',
  'id'
];

function sheet_() { return SpreadsheetApp.openById(SHEET_ID).getSheets()[0]; }

function get_(obj, path) {
  var parts = path.split('.'), v = obj;
  for (var i = 0; i < parts.length; i++) { v = (v == null) ? '' : v[parts[i]]; }
  return (v == null) ? '' : v;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===================== CONTENIDO EDITABLE ===================== */
/* Los overrides {clave: html} se guardan como un único JSON en la celda A1
 * de una pestaña "Contenido" de la misma Sheet. */
function contentCell_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('Contenido');
  if (!sh) { sh = ss.insertSheet('Contenido'); sh.getRange('A1').setValue('{}'); }
  return sh.getRange('A1');
}
function getContent_() {
  try { var v = contentCell_().getValue(); return v ? JSON.parse(v) : {}; }
  catch (e) { return {}; }
}
function setContent_(obj) { contentCell_().setValue(JSON.stringify(obj)); }

/* ---------- LECTURA ---------- */
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.type === 'content') {
      return json_({ ok: true, content: getContent_() });
    }
    var values = sheet_().getDataRange().getValues();
    var out = [];
    for (var i = 1; i < values.length; i++) {
      var r = values[i];
      if (!r[0] && !r[1]) continue; // fila vacía
      out.push({
        id: r[27] || ('row' + i),
        timestamp: r[0],
        evaluator: { name: r[1], org: r[2], country: r[3], email: r[4] },
        pilotId: r[5],
        pilotName: r[6],
        scores: { q1:+r[7]||0, q2:+r[8]||0, q3:+r[9]||0, q4:+r[10]||0, q5:+r[11]||0, q6:+r[12]||0, q7:+r[13]||0, q8:+r[14]||0 },
        weighted: +r[15] || 0,
        pct: +r[16] || 0,
        state: r[17],
        comments: r[18],
        evidence: { q1:r[19], q2:r[20], q3:r[21], q4:r[22], q5:r[23], q6:r[24], q7:r[25], q8:r[26] }
      });
    }
    return json_({ ok: true, count: out.length, evaluations: out });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ---------- ESCRITURA ---------- */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // (2) Guardar contenido editado — requiere contraseña.
    if (body && body.type === 'content') {
      var pw = PropertiesService.getScriptProperties().getProperty('EDIT_PASSWORD');
      if (!pw || String(body.password) !== String(pw)) {
        return json_({ ok: false, error: 'unauthorized' });
      }
      var content = (body.content && typeof body.content === 'object') ? body.content : {};
      setContent_(content);
      return json_({ ok: true, count: Object.keys(content).length });
    }

    // (1) Evaluación nueva.
    var row = COLS.map(function (path) { return get_(body, path); });
    sheet_().appendRow(row);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
