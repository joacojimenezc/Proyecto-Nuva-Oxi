/* ============================================================
   NUVA OXI · Servir la base con clave (funcion serverless de Vercel)
   ------------------------------------------------------------
   El Excel con datos sensibles NO se publica como archivo estatico.
   Vive en el repo privado (store/) y solo esta funcion lo entrega, y
   SOLO si la peticion trae la clave correcta (validada aqui, en el
   servidor: el navegador nunca decide el acceso).

   El codigo de esta funcion NO se envia al navegador, por eso el hash
   de la clave vive aca de forma segura.

   GET /api/data            (header  x-gate: <clave>)  -> binario .xlsx
   GET /api/data?download=1 (header  x-gate: <clave>)  -> descarga
   Sin clave o incorrecta -> 401.
   ============================================================ */

const crypto = require("crypto");

const OWNER = "joacojimenezc";
const REPO = "Proyecto-Nuva-Oxi";
const BRANCH = "main";
const FILE_PATH = "store/NUVA_OXI_Control_Comercial_FINAL_v2.xlsx";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const TOKEN = process.env.GITHUB_TOKEN || "";
// SHA-256 de la clave de ingreso (no la clave). Se puede sobreescribir con env GATE_HASH.
const GATE_HASH = process.env.GATE_HASH || "de3048f1ee2e9d1b9ea71d1bd92caad8b8669f8888a9dda867c74e6b0e9b73ea";

function encPath(p){ return String(p).split("/").map(encodeURIComponent).join("/"); }

async function ghRaw(path){
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${encPath(path)}?ref=${BRANCH}`, {
    headers: {
      "Authorization": "Bearer " + TOKEN,
      "Accept": "application/vnd.github.raw",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "nuva-oxi-data"
    }
  });
  if (!r.ok) throw new Error("GitHub GET base: HTTP " + r.status);
  return Buffer.from(await r.arrayBuffer());
}

module.exports = async function handler(req, res){
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "x-gate, Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (!TOKEN) return res.status(500).json({ ok: false, error: "GITHUB_TOKEN no configurado en Vercel" });

    const key = req.headers["x-gate"] || (req.query && req.query.k) || "";
    const h = crypto.createHash("sha256").update(String(key)).digest("hex");
    if (h !== GATE_HASH) return res.status(401).json({ ok: false, error: "no autorizado" });

    const buf = await ghRaw(FILE_PATH);
    res.setHeader("Content-Type", XLSX_MIME);
    if (req.query && req.query.download) {
      res.setHeader("Content-Disposition", 'attachment; filename="NUVA_OXI_Control_Comercial.xlsx"');
    }
    return res.status(200).send(buf);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
};
