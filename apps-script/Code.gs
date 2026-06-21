/**
 * WP3 · Blue Economy Lab — Backend de evaluaciones (cross-assessment)
 * --------------------------------------------------------------------
 * Conecta el formulario de rúbrica de la web (sitio estático en Vercel)
 * con la Google Sheet que funciona como base de datos:
 *   "WP3 Cross-Assessment — Base de Datos de Evaluaciones"
 *
 *  • doPost  -> agrega una fila por cada evaluación enviada desde la web.
 *  • doGet   -> devuelve todas las evaluaciones en JSON para que la
 *               sección «Resultados» de la web las muestre en vivo.
 *
 * La Sheet puede permanecer PRIVADA: este script corre como tú (el dueño)
 * y es el único que la lee/escribe. Solo el Web App se publica como
 * «cualquier persona».
 *
 * >>> Cómo desplegar: ver README_DESPLIEGUE.md (mismo directorio). <<<
 */

var SHEET_ID = '1WCnjvygXah8H2eutZYdvVcZJ7IKcsdi4UknXz0ZNxBU';

/* Orden EXACTO de columnas de la Sheet (fila 1 = encabezados). */
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

/* ---------- LECTURA: la web pide las evaluaciones guardadas ---------- */
function doGet(e) {
  try {
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

/* ---------- ESCRITURA: la web envía una evaluación nueva ---------- */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var row = COLS.map(function (path) { return get_(body, path); });
    sheet_().appendRow(row);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
