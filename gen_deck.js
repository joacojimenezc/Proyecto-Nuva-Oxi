const pptxgen = require("pptxgenjs");
const p = new pptxgen();
p.layout = "LAYOUT_WIDE"; // 13.3 x 7.5
p.author = "Blue Economy Lab";
p.title = "Blue Economy Lab — WP3";

// Paleta Ocean
const NAVY = "0A2540";
const DEEP = "065A82";
const TEAL = "1C7293";
const SEA = "21A0A0";
const ICE = "CFE8F0";
const LIGHT = "F4F9FB";
const WHITE = "FFFFFF";
const MUT = "5B7385";

const W = 13.3, H = 7.5;
const HF = "Georgia";
const BF = "Calibri";

function footer(s, n) {
  s.addText("Blue Economy Lab  ·  WP3  ·  Erasmus+ N.º 101183250", {
    x: 0.5, y: H - 0.42, w: 9, h: 0.3, fontFace: BF, fontSize: 9, color: MUT, align: "left", margin: 0 });
  s.addText(String(n), { x: W - 1.0, y: H - 0.42, w: 0.5, h: 0.3, fontFace: BF, fontSize: 9, color: MUT, align: "right", margin: 0 });
}
function kicker(s, t) {
  s.addText(t.toUpperCase(), { x: 0.5, y: 0.45, w: 9, h: 0.3, fontFace: BF, fontSize: 12, color: SEA, bold: true, charSpacing: 3, margin: 0 });
}
function title(s, t) {
  s.addText(t, { x: 0.5, y: 0.78, w: 12.3, h: 0.9, fontFace: HF, fontSize: 32, color: NAVY, bold: true, margin: 0 });
}

// ---------- Slide 1: Portada ----------
let s = p.addSlide();
s.background = { color: NAVY };
s.addShape(p.shapes.OVAL, { x: 9.2, y: -2.2, w: 7, h: 7, fill: { color: DEEP, transparency: 35 }, line: { type: "none" } });
s.addShape(p.shapes.OVAL, { x: 10.8, y: 3.6, w: 5.2, h: 5.2, fill: { color: TEAL, transparency: 45 }, line: { type: "none" } });
s.addText("ERASMUS+  ·  N.º 101183250", { x: 0.8, y: 1.5, w: 9, h: 0.4, fontFace: BF, fontSize: 14, color: SEA, bold: true, charSpacing: 4, margin: 0 });
s.addText("Blue Economy Lab", { x: 0.8, y: 2.1, w: 11, h: 1.2, fontFace: HF, fontSize: 54, color: WHITE, bold: true, margin: 0 });
s.addText("Pilotos de Economía Azul · WP3", { x: 0.8, y: 3.45, w: 11, h: 0.7, fontFace: HF, fontSize: 26, color: ICE, italic: true, margin: 0 });
s.addShape(p.shapes.LINE, { x: 0.85, y: 4.35, w: 3.2, h: 0, line: { color: SEA, width: 2.5 } });
s.addText("De la Academia de Economía Azul a la implementación de tres pilotos formativos\ncomparables, trazables y escalables en el territorio.", {
  x: 0.8, y: 4.6, w: 8.6, h: 1.0, fontFace: BF, fontSize: 16, color: ICE, lineSpacingMultiple: 1.2, margin: 0 });
s.addText("Junio 2026  ·  IDMA", { x: 0.8, y: H - 0.7, w: 6, h: 0.4, fontFace: BF, fontSize: 13, color: SEA, bold: true, margin: 0 });

// ---------- Slide 2: El proyecto ----------
s = p.addSlide(); s.background = { color: WHITE };
kicker(s, "El proyecto"); title(s, "¿Qué es Blue Economy Lab?");
s.addText([
  { text: "Iniciativa de cooperación internacional financiada por ", options: {} },
  { text: "Erasmus+ (N.º 101183250)", options: { bold: true, color: DEEP } },
  { text: " que impulsa la ", options: {} },
  { text: "Economía Azul", options: { bold: true, color: DEEP } },
  { text: " desde la educación técnico-profesional, conectando formación, sostenibilidad marino-costera y empleabilidad.", options: {} },
], { x: 0.5, y: 1.85, w: 7.0, h: 1.8, fontFace: BF, fontSize: 16, color: "33414C", lineSpacingMultiple: 1.25, margin: 0 });

const goals = [
  ["Formar", "Capacidades en economía azul para docentes, estudiantes y comunidad."],
  ["Territorializar", "Vincular la educación con los ecosistemas y actores marino-costeros locales."],
  ["Escalar", "Convertir cada piloto en aprendizaje transferible y replicable."],
];
let gy = 1.95;
goals.forEach(([h, d]) => {
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 7.9, y: gy, w: 4.9, h: 1.4, fill: { color: LIGHT }, line: { color: ICE, width: 1 }, rectRadius: 0.08 });
  s.addShape(p.shapes.RECTANGLE, { x: 7.9, y: gy, w: 0.1, h: 1.4, fill: { color: SEA }, line: { type: "none" } });
  s.addText(h, { x: 8.2, y: gy + 0.15, w: 4.4, h: 0.4, fontFace: HF, fontSize: 17, bold: true, color: NAVY, margin: 0 });
  s.addText(d, { x: 8.2, y: gy + 0.58, w: 4.4, h: 0.75, fontFace: BF, fontSize: 13, color: MUT, lineSpacingMultiple: 1.1, margin: 0 });
  gy += 1.6;
});
s.addText("Marco: Work Package 3 (WP3) — implementación y continuidad de pilotos.", {
  x: 0.5, y: 4.0, w: 7.0, h: 0.5, fontFace: BF, fontSize: 13, italic: true, color: TEAL, margin: 0 });
footer(s, 2);

// ---------- Slide 3: WP2 -> WP3 ----------
s = p.addSlide(); s.background = { color: WHITE };
kicker(s, "Del diseño a la acción"); title(s, "De la Academia a los pilotos (WP2 → WP3)");
const steps = [
  ["WP2", "Academia de Economía Azul", "Formación y diseño de proyectos por equipos multidisciplinarios.", DEEP],
  ["Selección", "Evaluación por rúbrica", "10 criterios (1–10): cooperación, innovación, sostenibilidad, impacto territorial, escalabilidad…", TEAL],
  ["WP3", "3 pilotos seleccionados", "Los proyectos mejor evaluados pasan a implementación con mentorías.", SEA],
];
let sx = 0.5;
steps.forEach(([tag, h, d, c], i) => {
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: sx, y: 2.1, w: 3.9, h: 2.9, fill: { color: LIGHT }, line: { color: ICE, width: 1 }, rectRadius: 0.08 });
  s.addShape(p.shapes.OVAL, { x: sx + 0.3, y: 2.4, w: 0.9, h: 0.9, fill: { color: c }, line: { type: "none" } });
  s.addText(String(i + 1), { x: sx + 0.3, y: 2.4, w: 0.9, h: 0.9, align: "center", valign: "middle", fontFace: HF, fontSize: 24, bold: true, color: WHITE, margin: 0 });
  s.addText(tag.toUpperCase(), { x: sx + 1.35, y: 2.5, w: 2.4, h: 0.35, fontFace: BF, fontSize: 12, bold: true, color: c, charSpacing: 2, margin: 0 });
  s.addText(h, { x: sx + 0.3, y: 3.5, w: 3.3, h: 0.7, fontFace: HF, fontSize: 18, bold: true, color: NAVY, margin: 0 });
  s.addText(d, { x: sx + 0.3, y: 4.15, w: 3.35, h: 0.8, fontFace: BF, fontSize: 12.5, color: MUT, lineSpacingMultiple: 1.1, margin: 0 });
  if (i < 2) s.addText("→", { x: sx + 3.85, y: 3.2, w: 0.55, h: 0.6, align: "center", valign: "middle", fontFace: HF, fontSize: 28, bold: true, color: SEA, margin: 0 });
  sx += 4.3;
});
s.addText("Resultado: tres pilotos que demuestran cómo la economía azul se enseña, se aplica y se sostiene en el tiempo.", {
  x: 0.5, y: 5.4, w: 12.3, h: 0.5, fontFace: BF, fontSize: 14, italic: true, color: TEAL, align: "center", margin: 0 });
footer(s, 3);

// ---------- Slide 4: Metodología ----------
s = p.addSlide(); s.background = { color: NAVY };
s.addText("METODOLOGÍA", { x: 0.5, y: 0.45, w: 9, h: 0.3, fontFace: BF, fontSize: 12, color: SEA, bold: true, charSpacing: 3, margin: 0 });
s.addText("Metodología MicroVET", { x: 0.5, y: 0.78, w: 12.3, h: 0.9, fontFace: HF, fontSize: 32, color: WHITE, bold: true, margin: 0 });
s.addText("Cada piloto recorre una cadena común que lo hace comparable y trazable, apoyada por canvases del MicroVET Toolkit (Learner Persona, Learner Journey Map).", {
  x: 0.5, y: 1.7, w: 12.3, h: 0.7, fontFace: BF, fontSize: 15, color: ICE, lineSpacingMultiple: 1.15, margin: 0 });
const chain = ["Diseño", "Ejecución", "Evaluación", "Aprendizaje", "Transferencia"];
const chainSub = ["Ficha + hipótesis", "Actividades + mentorías", "Pre/post + observación", "Cross-assessment", "Canvas + caso"];
let cx = 0.5; const cw = 2.35, cgap = 0.21;
chain.forEach((c, i) => {
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: cx, y: 2.9, w: cw, h: 1.9, fill: { color: i % 2 ? TEAL : DEEP }, line: { type: "none" }, rectRadius: 0.08 });
  s.addText(String(i + 1), { x: cx + 0.15, y: 3.05, w: 0.6, h: 0.5, fontFace: HF, fontSize: 22, bold: true, color: SEA, margin: 0 });
  s.addText(c, { x: cx + 0.15, y: 3.6, w: cw - 0.3, h: 0.5, fontFace: HF, fontSize: 17, bold: true, color: WHITE, margin: 0 });
  s.addText(chainSub[i], { x: cx + 0.15, y: 4.1, w: cw - 0.3, h: 0.6, fontFace: BF, fontSize: 11.5, color: ICE, lineSpacingMultiple: 1.05, margin: 0 });
  cx += cw + cgap;
});
s.addText("Criterios transversales:  comparabilidad · trazabilidad · pertinencia territorial · calidad · continuidad · comunicación", {
  x: 0.5, y: 5.5, w: 12.3, h: 0.5, fontFace: BF, fontSize: 13.5, italic: true, color: SEA, align: "center", margin: 0 });
footer(s, 4);

// ---------- Slide 5: Portafolio ----------
s = p.addSlide(); s.background = { color: WHITE };
kicker(s, "Portafolio"); title(s, "Los tres pilotos seleccionados");
const pilots = [
  ["01", "Mes Azul IDMA", "Programa institucional anual, modular y escalable.", DEEP],
  ["02", "Diplomado en Economía Azul", "Formación continua semipresencial de 120 horas.", TEAL],
  ["03", "Guardianes del Agua", "Proyecto escolar interdisciplinario (ABP + ecopedagogía).", SEA],
];
let px = 0.5;
pilots.forEach(([num, h, d, c]) => {
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: px, y: 2.1, w: 3.9, h: 3.4, fill: { color: LIGHT }, line: { color: ICE, width: 1 }, rectRadius: 0.08 });
  s.addShape(p.shapes.RECTANGLE, { x: px, y: 2.1, w: 3.9, h: 0.9, fill: { color: c }, line: { type: "none" } });
  s.addText(num, { x: px + 0.3, y: 2.25, w: 3, h: 0.6, fontFace: HF, fontSize: 30, bold: true, color: WHITE, margin: 0 });
  s.addText(h, { x: px + 0.3, y: 3.25, w: 3.35, h: 1.0, fontFace: HF, fontSize: 19, bold: true, color: NAVY, lineSpacingMultiple: 1.0, margin: 0 });
  s.addText(d, { x: px + 0.3, y: 4.35, w: 3.35, h: 1.0, fontFace: BF, fontSize: 13.5, color: MUT, lineSpacingMultiple: 1.15, margin: 0 });
  px += 4.3;
});
footer(s, 5);

// ---------- Helper for pilot detail slides ----------
function pilotSlide(n, accent, num, name, autores, idea, hyp, impactos) {
  let s = p.addSlide(); s.background = { color: WHITE };
  s.addShape(p.shapes.RECTANGLE, { x: 0, y: 0, w: 0.25, h: H, fill: { color: accent }, line: { type: "none" } });
  s.addText("PILOTO " + num, { x: 0.6, y: 0.45, w: 9, h: 0.3, fontFace: BF, fontSize: 12, color: accent, bold: true, charSpacing: 3, margin: 0 });
  s.addText(name, { x: 0.6, y: 0.78, w: 12, h: 0.85, fontFace: HF, fontSize: 30, color: NAVY, bold: true, margin: 0 });
  s.addText(autores, { x: 0.6, y: 1.6, w: 12, h: 0.4, fontFace: BF, fontSize: 13, italic: true, color: MUT, margin: 0 });
  // Idea
  s.addText("IDEA GENERAL", { x: 0.6, y: 2.2, w: 7, h: 0.3, fontFace: BF, fontSize: 12, bold: true, color: accent, charSpacing: 2, margin: 0 });
  s.addText(idea, { x: 0.6, y: 2.55, w: 6.9, h: 1.7, fontFace: BF, fontSize: 15, color: "33414C", lineSpacingMultiple: 1.25, margin: 0 });
  // Hipótesis
  s.addText("HIPÓTESIS DE CAMBIO", { x: 0.6, y: 4.35, w: 7, h: 0.3, fontFace: BF, fontSize: 12, bold: true, color: accent, charSpacing: 2, margin: 0 });
  s.addText(hyp, { x: 0.6, y: 4.7, w: 6.9, h: 1.9, fontFace: BF, fontSize: 14, italic: true, color: TEAL, lineSpacingMultiple: 1.2, margin: 0 });
  // Impact box
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 7.9, y: 2.2, w: 4.9, h: 4.4, fill: { color: LIGHT }, line: { color: ICE, width: 1 }, rectRadius: 0.08 });
  s.addText("IMPACTO ESPERADO", { x: 8.2, y: 2.45, w: 4.4, h: 0.3, fontFace: BF, fontSize: 12, bold: true, color: accent, charSpacing: 2, margin: 0 });
  s.addText(impactos.map((t, i) => ({ text: t, options: { bullet: { code: "2022", indent: 18 }, breakLine: true, paraSpaceAfter: 10 } })),
    { x: 8.25, y: 2.9, w: 4.3, h: 3.5, fontFace: BF, fontSize: 14, color: "33414C", lineSpacingMultiple: 1.1, margin: 0 });
  footer(s, n);
}

pilotSlide(6, DEEP, "01", "Mes Azul IDMA", "Paola C. · Javiera C. · Víctor B.",
  "Instancia institucional mensual con empresas, emprendimientos, charlas, talleres, salidas a terreno y experiencias inmersivas para estudiantes, articulada con aliados territoriales.",
  "Si IDMA instala un Mes Azul anual con aliados territoriales y materiales educativos, podrá posicionarse como referente técnico-profesional en Economía Azul y abrir oportunidades de empleabilidad e innovación.",
  ["Programa anual modular y escalable", "Red de aliados territoriales", "Empleabilidad e innovación azul", "Posicionamiento de IDMA como referente TP"]);

pilotSlide(7, TEAL, "02", "Diplomado en Economía Azul y Sostenibilidad Costera", "Estefanía C. · Juan O.",
  "Formación continua semipresencial de 120 horas que integra educación ambiental, saberes locales, economía circular, gestión ambiental, turismo azul y competencias laborales para actores marino-costeros.",
  "Si actores territoriales participan en una formación contextualizada y evaluada por proyectos, podrán aplicar prácticas sostenibles y generar evidencia para una línea formativa azul permanente.",
  ["120 horas, modalidad semipresencial", "Dirigido a docentes, egresados y comunidad", "Aprendizaje basado en proyectos", "Base para una línea formativa azul permanente"]);

pilotSlide(8, SEA, "03", "Guardianes del Agua", "Equipo escolar territorial",
  "Proyecto escolar interdisciplinario basado en Aprendizaje Basado en Proyectos (ABP) y ecopedagogía, para reconectar a las comunidades educativas con los ecosistemas acuáticos locales.",
  "Si las comunidades educativas investigan y actúan sobre su territorio acuático, desarrollarán cultura oceánica y ciudadanía azul desde la escuela.",
  ["Cultura oceánica en estudiantes", "Vínculo escuela–territorio", "Metodología ABP + ecopedagogía", "Ciudadanía ambiental activa"]);

// ---------- Slide 9: Ruta junio ----------
s = p.addSlide(); s.background = { color: WHITE };
kicker(s, "Implementación"); title(s, "Ruta de trabajo · Junio 2026");
s.addText("Cuatro semanas; cada una cierra con un producto mínimo, una mentoría y una decisión de avance.", {
  x: 0.5, y: 1.75, w: 12.3, h: 0.4, fontFace: BF, fontSize: 14, color: MUT, margin: 0 });
const weeks = [
  ["Semana 1", "Segmento–problema", "Usuarios, necesidad, contexto y restricciones.", "Ficha problema + mapa de actores"],
  ["Semana 2", "Problema–solución", "Propuesta de valor, one-page y cronograma.", "One-page + planificación"],
  ["Semana 3", "Solución–comunidad", "Probar actividades, feedback y ajustes.", "Prototipo + registro"],
  ["Semana 4", "Implementación–continuidad", "Consolidar evidencias, aliados y sostenibilidad.", "Canvas + pack final"],
];
let wx = 0.5; const ww = 3.0, wgap = 0.2;
weeks.forEach(([wk, ph, d, prod], i) => {
  const c = [DEEP, TEAL, SEA, NAVY][i];
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: wx, y: 2.35, w: ww, h: 3.6, fill: { color: LIGHT }, line: { color: ICE, width: 1 }, rectRadius: 0.08 });
  s.addShape(p.shapes.RECTANGLE, { x: wx, y: 2.35, w: ww, h: 0.65, fill: { color: c }, line: { type: "none" } });
  s.addText(wk.toUpperCase(), { x: wx + 0.2, y: 2.47, w: ww - 0.4, h: 0.4, fontFace: BF, fontSize: 13, bold: true, color: WHITE, charSpacing: 2, margin: 0 });
  s.addText(ph, { x: wx + 0.2, y: 3.15, w: ww - 0.4, h: 0.8, fontFace: HF, fontSize: 16, bold: true, color: NAVY, lineSpacingMultiple: 1.0, margin: 0 });
  s.addText(d, { x: wx + 0.2, y: 3.95, w: ww - 0.4, h: 1.0, fontFace: BF, fontSize: 12.5, color: MUT, lineSpacingMultiple: 1.15, margin: 0 });
  s.addText("Producto mínimo", { x: wx + 0.2, y: 5.0, w: ww - 0.4, h: 0.3, fontFace: BF, fontSize: 10, bold: true, color: c, charSpacing: 1, margin: 0 });
  s.addText(prod, { x: wx + 0.2, y: 5.3, w: ww - 0.4, h: 0.6, fontFace: BF, fontSize: 12, bold: true, color: NAVY, lineSpacingMultiple: 1.05, margin: 0 });
  wx += ww + wgap;
});
footer(s, 9);

// ---------- Slide 10: Cierre ----------
s = p.addSlide(); s.background = { color: NAVY };
s.addShape(p.shapes.OVAL, { x: -2, y: 3.5, w: 6, h: 6, fill: { color: DEEP, transparency: 45 }, line: { type: "none" } });
s.addText("IMPACTO Y CONTINUIDAD", { x: 0.8, y: 0.9, w: 9, h: 0.3, fontFace: BF, fontSize: 13, color: SEA, bold: true, charSpacing: 3, margin: 0 });
s.addText("Pilotos que se sostienen\ny se vuelven a aplicar", { x: 0.8, y: 1.3, w: 11, h: 1.4, fontFace: HF, fontSize: 36, color: WHITE, bold: true, lineSpacingMultiple: 1.0, margin: 0 });
const closing = [
  ["Continuidad institucional", "Ruta de los próximos 90 días y canvas de continuidad por piloto."],
  ["Escalabilidad", "Cada piloto se documenta como caso de estudio transferible y replicable."],
  ["Evidencia y calidad", "Fotos, asistencia, actas, encuestas, rúbricas y cross-assessment."],
];
let cy = 3.05;
closing.forEach(([h, d]) => {
  s.addShape(p.shapes.OVAL, { x: 0.8, y: cy + 0.05, w: 0.22, h: 0.22, fill: { color: SEA }, line: { type: "none" } });
  s.addText(h, { x: 1.2, y: cy - 0.05, w: 10.5, h: 0.4, fontFace: HF, fontSize: 18, bold: true, color: WHITE, margin: 0 });
  s.addText(d, { x: 1.2, y: cy + 0.4, w: 10.8, h: 0.5, fontFace: BF, fontSize: 14, color: ICE, lineSpacingMultiple: 1.1, margin: 0 });
  cy += 1.15;
});
s.addShape(p.shapes.LINE, { x: 0.85, y: 6.55, w: 11.6, h: 0, line: { color: TEAL, width: 1 } });
s.addText("Blue Economy Lab  ·  WP3  ·  Erasmus+ N.º 101183250  ·  IDMA — Junio 2026", {
  x: 0.8, y: 6.7, w: 11.7, h: 0.4, fontFace: BF, fontSize: 12, color: SEA, margin: 0 });

p.writeFile({ fileName: "Blue_Economy_Lab_WP3_Vision_General.pptx" }).then(f => console.log("OK:", f));
