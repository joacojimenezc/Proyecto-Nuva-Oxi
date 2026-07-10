/* ============================================================
   NUVA OXI · Subir Excel (funcion serverless de Vercel)
   ------------------------------------------------------------
   Reemplaza el Excel base de la web en el repo GitHub para que
   TODOS vean los datos nuevos (no solo el navegador del que subio).
   Al commitear a main, Vercel republica y el sitio sirve el archivo
   nuevo (app.js lo lee con cache:no-store).

   Requiere en Vercel (Settings -> Environment Variables):
     GITHUB_TOKEN  (fine-grained, permiso Contents Read/Write SOLO
                    sobre joacojimenezc/Proyecto-Nuva-Oxi)   [obligatorio]
     BD_WRITE_KEY  (clave de subida)                          [opcional]
       - si esta definida, quien suba debe ingresarla;
       - si NO esta definida, cualquiera que pase la portada puede subir.

   GET  ?action=ping                       -> estado de configuracion
   POST {key?, filename?, b64}             -> {ok:true} o {ok:false,error}
   ============================================================ */

const OWNER = "joacojimenezc";
const REPO = "Proyecto-Nuva-Oxi";
const BRANCH = "main";
const FILE_PATH = "store/NUVA_OXI_Control_Comercial_FINAL_v2.xlsx";

const TOKEN = process.env.GITHUB_TOKEN || "";
const WRITE_KEY = process.env.BD_WRITE_KEY || "";

const GH = "https://api.github.com";
const MAX_B64 = 6 * 1024 * 1024; // ~4.4 MB de archivo real

function encPath(p){ return String(p).split("/").map(encodeURIComponent).join("/"); }

async function gh(method, path, body){
  return fetch(GH + path, {
    method,
    headers: Object.assign({
      "Authorization": "Bearer " + TOKEN,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "nuva-oxi-upload"
    }, body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined
  });
}

async function shaActual(){
  const r = await gh("GET", `/repos/${OWNER}/${REPO}/contents/${encPath(FILE_PATH)}?ref=${BRANCH}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("GitHub GET sha: HTTP " + r.status);
  const j = await r.json();
  return j && j.sha ? j.sha : null;
}

module.exports = async function handler(req, res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const q = req.query || {};
      if (q.action === "ping") {
        return res.status(200).json({ ok: true, tokenOk: !!TOKEN, requiereClave: !!WRITE_KEY });
      }
      return res.status(200).json({ ok: false, error: "accion desconocida" });
    }

    if (req.method !== "POST") return res.status(200).json({ ok: false, error: "metodo no soportado" });

    if (!TOKEN) return res.status(200).json({ ok: false, error: "GITHUB_TOKEN no configurado en Vercel; sin el no se puede guardar para todos" });

    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { return res.status(200).json({ ok: false, error: "body JSON invalido" }); } }
    if (!b || typeof b !== "object") return res.status(200).json({ ok: false, error: "body vacio" });

    if (WRITE_KEY && b.key !== WRITE_KEY) return res.status(200).json({ ok: false, error: "clave de subida invalida" });
    if (!b.b64) return res.status(200).json({ ok: false, error: "falta el archivo" });
    if (b.b64.length > MAX_B64) return res.status(200).json({ ok: false, error: "archivo demasiado grande (max ~4 MB)" });

    const sha = await shaActual();
    const nombre = (b.filename ? String(b.filename) : "Excel").slice(0, 120);
    const bodyPut = { message: "Subir Excel desde la web (" + nombre + ")", content: b.b64, branch: BRANCH };
    if (sha) bodyPut.sha = sha;

    const r = await gh("PUT", `/repos/${OWNER}/${REPO}/contents/${encPath(FILE_PATH)}`, bodyPut);
    if (r.status === 409) return res.status(200).json({ ok: false, error: "conflicto (otra subida simultanea); reintenta" });
    if (!r.ok) {
      let det = ""; try { det = (await r.json()).message || ""; } catch (e) {}
      return res.status(200).json({ ok: false, error: "GitHub PUT: HTTP " + r.status + (det ? " - " + det : "") });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(200).json({ ok: false, error: String(err && err.message || err) });
  }
};
