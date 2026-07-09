import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1");
const dashboardPath = "C:\\Users\\jimen\\Downloads\\Dashboard_NUVA_OXI_2026-07-09 (1).xlsx";
const outputPath = path.join(outputDir, "Dashboard_NUVA_OXI_Maestro_2026-07-09.xlsx");

const canonicalSources = [
  {
    key: "CC",
    sourceName: "CONSOLIDADO_COMERCIAL_NUVA.xlsx",
    file: "C:\\Users\\jimen\\Downloads\\CONSOLIDADO_COMERCIAL_NUVA.xlsx",
    maps: {
      PORTADA: "CC_PORTADA",
      sell_out: "CC_sell_out",
      sell_in: "CC_sell_in",
      ANALISIS: "CC_ANALISIS",
    },
  },
  {
    key: "FIN",
    sourceName: "BD_FINANZAS_NUVA.xlsx",
    file: "C:\\Users\\jimen\\Downloads\\BD_FINANZAS_NUVA.xlsx",
    duplicateOf: "BD_FINANZAS_NUVA (1).xlsx",
    maps: {
      ESTADO_RESULTADOS: "FIN_EST_RESULT",
      BALANCE: "FIN_BALANCE",
      FLUJO_CAJA: "FIN_FLUJO_CAJA",
      datos_ventas: "FIN_datos_ventas",
    },
  },
  {
    key: "INV",
    sourceName: "BD_INVENTARIO_NUVA.xlsx",
    file: "C:\\Users\\jimen\\Downloads\\BD_INVENTARIO_NUVA.xlsx",
    maps: {
      INVENTARIO_PDV: "INV_INVENTARIO_PDV",
      MOVIMIENTOS: "INV_MOVIMIENTOS",
      STOCK_CANAL: "INV_STOCK_CANAL",
      ref_SKU: "INV_ref_SKU",
      ref_PDV: "INV_ref_PDV",
      ventas_crm: "INV_ventas_crm",
    },
  },
  {
    key: "SIN",
    sourceName: "BD_SELL_IN_NUVA (2).xlsx",
    file: "C:\\Users\\jimen\\Downloads\\BD_SELL_IN_NUVA (2).xlsx",
    maps: {
      ANALISIS: "SIN_ANALISIS",
      GESTION_PEDIDOS: "SIN_GESTION_PED",
      ref_SKU: "SIN_ref_SKU",
      ref_Clientes: "SIN_ref_Clientes",
      VENTAS: "SIN_VENTAS",
    },
  },
  {
    key: "SOUT",
    sourceName: "BD_SELL_OUT_NUVA (2).xlsx",
    file: "C:\\Users\\jimen\\Downloads\\BD_SELL_OUT_NUVA (2).xlsx",
    maps: {
      SELL_OUT: "SOUT_SELL_OUT",
      RESUMEN: "SOUT_RESUMEN",
      carga_clientes: "SOUT_carga_clientes",
      carga_cencosud: "SOUT_carga_cencosud",
    },
  },
  {
    key: "CRM",
    sourceName: "CRM_NUVA_OXI (3).xlsx",
    file: "C:\\Users\\jimen\\Downloads\\CRM_NUVA_OXI (3).xlsx",
    maps: {
      "13_Dashboard": "CRM_13_Dashboard",
      "12_POP": "CRM_12_POP",
      "11_Tareas_Decisiones": "CRM_11_Tareas",
      "10_Condiciones_Margen": "CRM_10_Margen",
      "09_Sell_In": "CRM_09_Sell_In",
      "08_Pedidos_OC": "CRM_08_Pedidos",
      "07_Stock_Canal": "CRM_07_Stock_Canal",
      "06_Registro_PDV": "CRM_06_Reg_PDV",
      "05_Plan_Visitas": "CRM_05_Visitas",
      "04_Priorizacion": "CRM_04_Prioridad",
      "03_Maestro_SKU": "CRM_03_SKU",
      "02_Maestro_PDV": "CRM_02_PDV",
      "01_Maestro_Clientes": "CRM_01_Clientes",
      "00_Parametros": "CRM_00_Parametros",
    },
  },
];

const duplicateSources = [
  {
    sourceName: "BD_FINANZAS_NUVA (1).xlsx",
    file: "C:\\Users\\jimen\\Downloads\\BD_FINANZAS_NUVA (1).xlsx",
    status: "Duplicado exacto de BD_FINANZAS_NUVA.xlsx; no se copio dos veces.",
  },
];

function colLetter(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

function rangeAddress(rows, cols) {
  return `A1:${colLetter(cols)}${rows}`;
}

function isBlankCell(value) {
  return value === null || value === undefined || value === "";
}

function rowIsBlank(row) {
  return row.every(isBlankCell);
}

function sanitizeTableName(name) {
  return `tbl_${name}`.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 240);
}

async function sha256(file) {
  const bytes = await fs.readFile(file);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function parseNdjson(ndjson) {
  return ndjson
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function sheetSummaryRows(ndjson) {
  return parseNdjson(ndjson).filter((row) => row.kind === "sheet");
}

function repairKnownSourceValues(masterSheetName, values) {
  const next = values.map((row) => row.slice());
  const replacements = {
    FIN_EST_RESULT: {
      "6,1": "Margen bruto",
      "14,1": "Total gastos operativos",
      "16,1": "Resultado operativo",
    },
    FIN_BALANCE: {
      "7,1": "Total activos",
      "12,1": "Total pasivos + patrimonio",
    },
    FIN_FLUJO_CAJA: {
      "8,1": "Resultado operativo",
      "9,1": "Caja neta estimada",
    },
  };
  const map = replacements[masterSheetName] || {};
  for (const [key, label] of Object.entries(map)) {
    const [row, col] = key.split(",").map((v) => Number(v) - 1);
    if (next[row]?.[col] === "#NAME?") {
      next[row][col] = label;
    }
  }
  return next;
}

function canAddTable(values) {
  if (values.length < 2) return false;
  const first = values[0];
  if (first.some(isBlankCell)) return false;
  if (values.slice(1).some(rowIsBlank)) return false;
  const headers = first.map((v) => String(v).trim());
  return new Set(headers).size === headers.length;
}

function applyBasicFormatting(sheet, values) {
  const rows = values.length;
  const cols = values[0]?.length || 0;
  if (!rows || !cols) return;

  const used = sheet.getRange(rangeAddress(rows, cols));
  used.format = {
    fill: "#FFFFFF",
    font: { name: "Aptos", size: 10, color: "#1F2937" },
    borders: { preset: "outside", style: "thin", color: "#D9E2EC" },
  };
  sheet.getRange(`A1:${colLetter(cols)}1`).format = {
    fill: "#0F766E",
    font: { bold: true, color: "#FFFFFF" },
  };
  sheet.getRange(`A1:${colLetter(cols)}1`).format.wrapText = true;
  used.format.autofitColumns();
  sheet.freezePanes.freezeRows(1);

  const headers = values[0].map((value) => String(value ?? "").toLowerCase());
  headers.forEach((header, index) => {
    const letter = colLetter(index + 1);
    const range = sheet.getRange(`${letter}2:${letter}${rows}`);
    if (/fecha|vigente|venc|pago|entrada|contacto|despacho|factura|oc/.test(header)) {
      range.format.numberFormat = "yyyy-mm-dd";
    } else if (/%|rotacion|margen_frontal|rappel|merma/.test(header)) {
      range.format.numberFormat = "0.0%";
    } else if (/venta|monto|costo|margen|pvp|precio|neto|caja|cxc|cobro|pago|patrimonio|proveedor/.test(header)) {
      range.format.numberFormat = "$#,##0";
    } else if (/uds|stock|meta|score|semana|plazo|dias|disponible|asignado|comprometido|punto|registros/.test(header)) {
      range.format.numberFormat = "#,##0";
    }
  });
}

function addTableIfUseful(sheet, sheetName, values) {
  if (!canAddTable(values)) return;
  const rows = values.length;
  const cols = values[0].length;
  const table = sheet.tables.add(rangeAddress(rows, cols), true, sanitizeTableName(sheetName));
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
}

function writeMatrix(sheet, values) {
  if (!values.length || !values[0]?.length) return;
  sheet.getRangeByIndexes(0, 0, values.length, values[0].length).values = values;
}

function addMetadataSheets(workbook, copiedSheets, sourceRows) {
  const index = workbook.worksheets.add("00_Indice");
  index.showGridLines = false;
  const indexRows = [
    ["Excel maestro NUVA OXI", null, null, null, null, null],
    ["Este archivo concentra el dashboard y las bases fuente para trabajar en un solo libro.", null, null, null, null, null],
    [null, null, null, null, null, null],
    ["Hoja maestra", "Origen", "Hoja original", "Rango copiado", "Filas", "Columnas"],
    ...copiedSheets.map((item) => [
      item.masterSheet,
      item.sourceName,
      item.originalSheet,
      item.range,
      item.rows,
      item.cols,
    ]),
  ];
  writeMatrix(index, indexRows);
  index.getRange(`A1:F${indexRows.length}`).format = {
    fill: "#FFFFFF",
    font: { name: "Aptos", size: 10, color: "#1F2937" },
  };
  index.getRange("A1:F1").merge();
  index.getRange("A2:F2").merge();
  index.getRange("A1:F1").format = { fill: "#0B1F33", font: { bold: true, size: 16, color: "#FFFFFF" } };
  index.getRange("A2:F2").format = { fill: "#E8F3F1", font: { italic: true, color: "#334155" } };
  index.getRange("A4:F4").format = { fill: "#0F766E", font: { bold: true, color: "#FFFFFF" } };
  index.getRange(`A4:F${indexRows.length}`).format.borders = { preset: "all", style: "thin", color: "#D9E2EC" };
  index.getRange(`E5:F${indexRows.length}`).format.numberFormat = "#,##0";
  index.getRange(`A1:F${indexRows.length}`).format.autofitColumns();
  index.freezePanes.freezeRows(4);

  const sources = workbook.worksheets.add("00_Fuentes");
  sources.showGridLines = false;
  const sourcesValues = [
    ["Fuente", "Ruta", "SHA-256", "Estado", "Notas"],
    ...sourceRows,
  ];
  writeMatrix(sources, sourcesValues);
  sources.getRange(`A1:E${sourcesValues.length}`).format = {
    fill: "#FFFFFF",
    font: { name: "Aptos", size: 10, color: "#1F2937" },
  };
  sources.getRange("A1:E1").format = { fill: "#0F766E", font: { bold: true, color: "#FFFFFF" } };
  sources.getRange(`A1:E${sourcesValues.length}`).format.borders = { preset: "all", style: "thin", color: "#D9E2EC" };
  sources.getRange("B:B").format.wrapText = true;
  sources.getRange("C:C").format.wrapText = true;
  sources.getRange(`A1:E${sourcesValues.length}`).format.autofitColumns();
  sources.freezePanes.freezeRows(1);

  const checks = workbook.worksheets.add("00_Checks");
  checks.showGridLines = false;
  const checkRows = [
    ["MODEL STATUS", null, null, null],
    [null, null, null, null],
    ["Check", "Delta", "Estado", "Donde revisar"],
    ["Sell-in unidades Dashboard vs CRM", null, null, "Dashboard B16 / CRM_09_Sell_In H"],
    ["Venta neta Dashboard vs CRM", null, null, "Dashboard E16 / CRM_09_Sell_In K"],
    ["Sell-out Dashboard vs SOUT", null, null, "Dashboard C16 / SOUT_SELL_OUT F"],
    ["CxC Dashboard vs CRM", null, null, "Dashboard C5 / CRM_09_Sell_In N,K"],
    ["Finanzas duplicadas", 0, "OK", "BD_FINANZAS_NUVA y BD_FINANZAS_NUVA (1) son identicos"],
  ];
  writeMatrix(checks, checkRows);
  checks.getRange("A1:D8").format = {
    fill: "#FFFFFF",
    font: { name: "Aptos", size: 10, color: "#1F2937" },
  };
  checks.getRange("B1").formulas = [["=IF(COUNTIF(C4:C8,\"REVISAR\")=0,\"PASS\",\"FAIL\")"]];
  checks.getRange("B4").formulas = [["='Dashboard'!B16-SUMIF('CRM_09_Sell_In'!$A$2:$A$1000,\">0\",'CRM_09_Sell_In'!$H$2:$H$1000)"]];
  checks.getRange("B5").formulas = [["='Dashboard'!E16-SUMIF('CRM_09_Sell_In'!$A$2:$A$1000,\">0\",'CRM_09_Sell_In'!$K$2:$K$1000)"]];
  checks.getRange("B6").formulas = [["='Dashboard'!C16-SUM('SOUT_SELL_OUT'!$F$2:$F$1000)"]];
  checks.getRange("B7").formulas = [["='Dashboard'!C5-SUMIFS('CRM_09_Sell_In'!$K$2:$K$1000,'CRM_09_Sell_In'!$A$2:$A$1000,\">0\",'CRM_09_Sell_In'!$N$2:$N$1000,\"Emitida\")"]];
  checks.getRange("C4").formulas = [["=IF(ABS(B4)<0.01,\"OK\",\"REVISAR\")"]];
  checks.getRange("C4:C7").fillDown();
  checks.getRange("A1:D1").format = { fill: "#0B1F33", font: { bold: true, size: 14, color: "#FFFFFF" } };
  checks.getRange("A3:D3").format = { fill: "#0F766E", font: { bold: true, color: "#FFFFFF" } };
  checks.getRange("B4:B8").format.numberFormat = "#,##0.00";
  checks.getRange("A1:D8").format.borders = { preset: "all", style: "thin", color: "#D9E2EC" };
  checks.getRange("A1:D8").format.autofitColumns();
  checks.freezePanes.freezeRows(3);
}

function updateDashboardFormulas(workbook) {
  const dash = workbook.worksheets.getItem("Dashboard");
  dash.showGridLines = false;

  dash.getRange("A2:F2").values = [["Maestro generado 2026-07-09  -  Piloto comercial  -  Confidencial / uso interno", null, null, null, null, null]];

  dash.getRange("A5").formulas = [["=SUMIF('CRM_09_Sell_In'!$A$2:$A$1000,\">0\",'CRM_09_Sell_In'!$K$2:$K$1000)"]];
  dash.getRange("B5").formulas = [["=SUMIF('CRM_09_Sell_In'!$A$2:$A$1000,\">0\",'CRM_09_Sell_In'!$M$2:$M$1000)"]];
  dash.getRange("C5").formulas = [["=SUMIFS('CRM_09_Sell_In'!$K$2:$K$1000,'CRM_09_Sell_In'!$A$2:$A$1000,\">0\",'CRM_09_Sell_In'!$N$2:$N$1000,\"Emitida\")"]];
  dash.getRange("D5").formulas = [["=COUNTA('CRM_09_Sell_In'!$D$2:$D$7)&\"/\"&COUNTA('CRM_02_PDV'!$A$2:$A$1000)&\" PDV - \"&TEXT(COUNTA('CRM_09_Sell_In'!$D$2:$D$7)/COUNTA('CRM_02_PDV'!$A$2:$A$1000),\"0%\")"]];
  dash.getRange("E5").formulas = [["=SUM('SOUT_SELL_OUT'!$F$2:$F$1000)&\" u\""]];

  dash.getRange("A6").formulas = [["=SUMIF('CRM_09_Sell_In'!$A$2:$A$1000,\">0\",'CRM_09_Sell_In'!$H$2:$H$1000)&\" u - bruto c/IVA $\"&TEXT(SUMIF('CRM_09_Sell_In'!$A$2:$A$1000,\">0\",'CRM_09_Sell_In'!$K$2:$K$1000)*1.19,\"#,##0\")"]];
  dash.getRange("B6").formulas = [["=\"costo total $\"&TEXT(SUM('CRM_09_Sell_In'!$L$2:$L$1000),\"#,##0\")"]];
  dash.getRange("C6").formulas = [["=COUNTIF('CRM_09_Sell_In'!$N$2:$N$1000,\"Emitida\")&\" facturas emitidas\""]];
  dash.getRange("D6").formulas = [["=(--(COUNTIFS('CRM_09_Sell_In'!$C$2:$C$1000,\"CL-CEN\",'CRM_09_Sell_In'!$A$2:$A$1000,\">0\")>0)+--(COUNTIFS('CRM_09_Sell_In'!$C$2:$C$1000,\"CL-DEL\",'CRM_09_Sell_In'!$A$2:$A$1000,\">0\")>0)+--(COUNTIFS('CRM_09_Sell_In'!$C$2:$C$1000,\"CL-ALN\",'CRM_09_Sell_In'!$A$2:$A$1000,\">0\")>0)+--(COUNTIFS('CRM_09_Sell_In'!$C$2:$C$1000,\"CL-CORG\",'CRM_09_Sell_In'!$A$2:$A$1000,\">0\")>0)+--(COUNTIFS('CRM_09_Sell_In'!$C$2:$C$1000,\"CL-FORK\",'CRM_09_Sell_In'!$A$2:$A$1000,\">0\")>0)+--(COUNTIFS('CRM_09_Sell_In'!$C$2:$C$1000,\"CL-PIR\",'CRM_09_Sell_In'!$A$2:$A$1000,\">0\")>0)+--(COUNTIFS('CRM_09_Sell_In'!$C$2:$C$1000,\"CL-RITZ\",'CRM_09_Sell_In'!$A$2:$A$1000,\">0\")>0))&\"/\"&COUNTA('CRM_01_Clientes'!$A$2:$A$100)&\" clientes con venta\""]];
  dash.getRange("E6").formulas = [["=TEXT(SUM('SOUT_SELL_OUT'!$F$2:$F$1000)/SUMIF('CRM_09_Sell_In'!$A$2:$A$1000,\">0\",'CRM_09_Sell_In'!$H$2:$H$1000),\"0%\")&\" rotacion global\""]];

  const pdvRows = [
    [10, "J001"],
    [11, "H001"],
    [12, "P001"],
    [13, "D001"],
    [14, "AN01"],
    [15, "D002"],
  ];
  for (const [row, id] of pdvRows) {
    dash.getRange(`A${row}`).formulas = [[`=INDEX('CRM_02_PDV'!$C$2:$C$1000,MATCH("${id}",'CRM_02_PDV'!$A$2:$A$1000,0))`]];
    dash.getRange(`B${row}`).formulas = [[`=SUMIFS('CRM_09_Sell_In'!$H$2:$H$1000,'CRM_09_Sell_In'!$D$2:$D$1000,"${id}")`]];
    dash.getRange(`C${row}`).formulas = [[`=SUMIFS('SOUT_SELL_OUT'!$F$2:$F$1000,'SOUT_SELL_OUT'!$D$2:$D$1000,"${id}")`]];
    dash.getRange(`D${row}`).formulas = [[`=IFERROR(C${row}/B${row},0)`]];
    dash.getRange(`E${row}`).formulas = [[`=SUMIFS('CRM_09_Sell_In'!$K$2:$K$1000,'CRM_09_Sell_In'!$D$2:$D$1000,"${id}")`]];
  }
  dash.getRange("B16").formulas = [["=SUM(B10:B15)"]];
  dash.getRange("C16").formulas = [["=SUM(C10:C15)"]];
  dash.getRange("D16").formulas = [["=IFERROR(C16/B16,0)"]];
  dash.getRange("E16").formulas = [["=SUM(E10:E15)"]];

  const skuRows = [
    [35, "SKU-FRU-4"],
    [36, "SKU-MAN-4"],
    [37, "SKU-CAC-4"],
    [38, "SKU-CAC-U"],
    [39, "SKU-FRU-U"],
    [40, "SKU-MAN-U"],
  ];
  for (const [row, sku] of skuRows) {
    dash.getRange(`A${row}`).values = [[sku]];
    dash.getRange(`B${row}`).formulas = [[`=INDEX('CRM_03_SKU'!$B$2:$B$1000,MATCH("${sku}",'CRM_03_SKU'!$A$2:$A$1000,0))`]];
    dash.getRange(`C${row}`).formulas = [[`=SUMIFS('CRM_09_Sell_In'!$H$2:$H$1000,'CRM_09_Sell_In'!$E$2:$E$1000,"${sku}")`]];
    dash.getRange(`D${row}`).formulas = [[`=SUMIFS('CRM_09_Sell_In'!$K$2:$K$1000,'CRM_09_Sell_In'!$E$2:$E$1000,"${sku}")`]];
    dash.getRange(`E${row}`).formulas = [[`=IFERROR(D${row}/$A$5,0)`]];
  }

  const clientRows = [
    [44, "CL-CEN"],
    [45, "CL-RITZ"],
    [46, "CL-DEL"],
    [47, "CL-PIR"],
    [48, "CL-ALN"],
  ];
  for (const [row, client] of clientRows) {
    dash.getRange(`A${row}`).formulas = [[`=INDEX('CRM_01_Clientes'!$B$2:$B$1000,MATCH("${client}",'CRM_01_Clientes'!$A$2:$A$1000,0))`]];
    dash.getRange(`B${row}`).formulas = [[`=SUMIFS('CRM_09_Sell_In'!$H$2:$H$1000,'CRM_09_Sell_In'!$C$2:$C$1000,"${client}")`]];
    dash.getRange(`C${row}`).formulas = [[`=IFERROR(B${row}/$B$49,0)`]];
    dash.getRange(`D${row}`).formulas = [[`=SUMIFS('CRM_09_Sell_In'!$K$2:$K$1000,'CRM_09_Sell_In'!$C$2:$C$1000,"${client}")`]];
    dash.getRange(`E${row}`).formulas = [[`=IFERROR(D${row}/$D$49,0)`]];
  }
  dash.getRange("B49").formulas = [["=SUM(B44:B48)"]];
  dash.getRange("C49").formulas = [["=SUM(C44:C48)"]];
  dash.getRange("D49").formulas = [["=SUM(D44:D48)"]];
  dash.getRange("E49").formulas = [["=SUM(E44:E48)"]];

  dash.getRange("A53").formulas = [["=COUNTIFS('CRM_01_Clientes'!$M$2:$M$1000,\"<\"&DATE(2026,7,9),'CRM_01_Clientes'!$M$2:$M$1000,\"<>\")"]];
  dash.getRange("B53").formulas = [["=COUNTIFS('CRM_01_Clientes'!$M$2:$M$1000,\">=\"&DATE(2026,7,9),'CRM_01_Clientes'!$M$2:$M$1000,\"<=\"&DATE(2026,7,16))"]];
  dash.getRange("C53").formulas = [["=COUNTIF('CRM_05_Visitas'!$H$2:$H$1000,\"Planificada\")"]];
  dash.getRange("D53").formulas = [["=COUNTIFS('CRM_05_Visitas'!$B$2:$B$1000,\"<\"&DATE(2026,7,9),'CRM_05_Visitas'!$H$2:$H$1000,\"Planificada\")"]];
  dash.getRange("E53").formulas = [["=COUNTIF('CRM_05_Visitas'!$H$2:$H$1000,\"Realizada\")"]];
  dash.getRange("F53").formulas = [["=COUNTIFS('CRM_01_Clientes'!$K$2:$K$1000,\"<\"&DATE(2026,6,9),'CRM_01_Clientes'!$K$2:$K$1000,\"<>\")"]];

  dash.getRange("A5:C5").format.numberFormat = "$#,##0";
  dash.getRange("B10:C16").format.numberFormat = "#,##0";
  dash.getRange("D10:D16").format.numberFormat = "0.0%";
  dash.getRange("E10:E16").format.numberFormat = "$#,##0";
  dash.getRange("C35:C40").format.numberFormat = "#,##0";
  dash.getRange("D35:D40").format.numberFormat = "$#,##0";
  dash.getRange("E35:E40").format.numberFormat = "0.0%";
  dash.getRange("B44:B49").format.numberFormat = "#,##0";
  dash.getRange("C44:C49").format.numberFormat = "0.0%";
  dash.getRange("D44:D49").format.numberFormat = "$#,##0";
  dash.getRange("E44:E49").format.numberFormat = "0.0%";

  for (const range of [
    "A10:E15",
    "A23:F23",
    "A27:F30",
    "A35:E40",
    "A44:E48",
    "A53:F53",
    "A56:F62",
    "A65:F67",
    "A71:D74",
  ]) {
    dash.getRange(range).format = { font: { color: "#E5E7EB" } };
  }
}

async function main() {
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(dashboardPath));
  const copiedSheets = [];
  const sourceRows = [
    [
      "Dashboard_NUVA_OXI_2026-07-09 (1).xlsx",
      dashboardPath,
      await sha256(dashboardPath),
      "Base del maestro",
      "Se mantuvo como hoja Dashboard inicial.",
    ],
  ];

  for (const source of canonicalSources) {
    const sourceHash = await sha256(source.file);
    sourceRows.push([
      source.sourceName,
      source.file,
      sourceHash,
      "Incluido",
      source.duplicateOf ? `Tambien existe copia identica: ${source.duplicateOf}` : "",
    ]);

    const sourceWorkbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source.file));
    const sheetInfo = await sourceWorkbook.inspect({
      kind: "sheet",
      include: "name,index,range,address",
      maxChars: 50000,
    });

    for (const info of sheetSummaryRows(sheetInfo.ndjson)) {
      const originalSheet = info.name;
      const masterSheet = source.maps[originalSheet] || `${source.key}_${originalSheet}`.slice(0, 31);
      const srcSheet = sourceWorkbook.worksheets.getItem(originalSheet);
      const used = srcSheet.getUsedRange();
      let values = used.values;
      if (!values?.length || !values[0]?.length) continue;
      values = repairKnownSourceValues(masterSheet, values);

      const dstSheet = workbook.worksheets.add(masterSheet);
      writeMatrix(dstSheet, values);
      applyBasicFormatting(dstSheet, values);
      addTableIfUseful(dstSheet, masterSheet, values);
      copiedSheets.push({
        sourceName: source.sourceName,
        originalSheet,
        masterSheet,
        range: info.range || rangeAddress(values.length, values[0].length),
        rows: values.length,
        cols: values[0].length,
      });
    }
  }

  for (const duplicate of duplicateSources) {
    sourceRows.push([
      duplicate.sourceName,
      duplicate.file,
      await sha256(duplicate.file),
      "No copiado",
      duplicate.status,
    ]);
  }

  addMetadataSheets(workbook, copiedSheets, sourceRows);
  updateDashboardFormulas(workbook);

  const formulaErrors = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "formula error scan",
  });
  await fs.writeFile(path.join(outputDir, "formula_error_scan.ndjson"), formulaErrors.ndjson, "utf8");

  const dashPreview = await workbook.render({
    sheetName: "Dashboard",
    range: "A1:F74",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(path.join(outputDir, "dashboard_preview.png"), new Uint8Array(await dashPreview.arrayBuffer()));

  const indexPreview = await workbook.render({
    sheetName: "00_Indice",
    range: "A1:F45",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(path.join(outputDir, "indice_preview.png"), new Uint8Array(await indexPreview.arrayBuffer()));

  const exported = await SpreadsheetFile.exportXlsx(workbook);
  await exported.save(outputPath);
  console.log(outputPath);
}

await main();
