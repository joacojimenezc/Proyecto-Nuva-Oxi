import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const files = [
  "C:\\Users\\jimen\\Downloads\\CONSOLIDADO_COMERCIAL_NUVA.xlsx",
  "C:\\Users\\jimen\\Downloads\\BD_FINANZAS_NUVA (1).xlsx",
  "C:\\Users\\jimen\\Downloads\\BD_FINANZAS_NUVA.xlsx",
  "C:\\Users\\jimen\\Downloads\\BD_INVENTARIO_NUVA.xlsx",
  "C:\\Users\\jimen\\Downloads\\BD_SELL_IN_NUVA (2).xlsx",
  "C:\\Users\\jimen\\Downloads\\BD_SELL_OUT_NUVA (2).xlsx",
  "C:\\Users\\jimen\\Downloads\\CRM_NUVA_OXI (3).xlsx",
  "C:\\Users\\jimen\\Downloads\\Dashboard_NUVA_OXI_2026-07-09 (1).xlsx",
];

const outDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const results = [];

for (const file of files) {
  const bytes = await fs.readFile(file);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const blob = await FileBlob.load(file);
  const workbook = await SpreadsheetFile.importXlsx(blob);
  const summary = await workbook.inspect({
    kind: "workbook,sheet,table,definedName,drawing",
    maxChars: 12000,
    tableMaxRows: 5,
    tableMaxCols: 8,
    tableMaxCellChars: 80,
  });
  const base = path.basename(file).replace(/[^\w.-]+/g, "_");
  await fs.writeFile(path.join(outDir, `${base}.inspect.ndjson`), summary.ndjson, "utf8");
  results.push({
    name: path.basename(file),
    path: file,
    size: bytes.length,
    sha256: hash,
    inspectFile: `${base}.inspect.ndjson`,
    summary: summary.ndjson,
  });
}

await fs.writeFile(path.join(outDir, "workbook_inventory.json"), JSON.stringify(results, null, 2), "utf8");

for (const item of results) {
  console.log(`\n## ${item.name}`);
  console.log(`size=${item.size} sha256=${item.sha256}`);
  console.log(item.summary.slice(0, 6000));
}
