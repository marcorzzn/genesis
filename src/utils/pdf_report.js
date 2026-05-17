/**
 * @module PdfReport
 * @description Tiny dependency-free PDF exporter for Genesis telemetry reports.
 */

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 46;

function cleanText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pdfEscape(value) {
  return cleanText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapText(text, maxChars) {
  const words = cleanText(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

class PdfCanvas {
  constructor() {
    this.ops = [];
  }

  text(x, y, size, value, options = {}) {
    const font = options.bold ? 'F2' : 'F1';
    const color = options.color ?? [0.08, 0.1, 0.14];
    this.ops.push(`${color[0]} ${color[1]} ${color[2]} rg`);
    this.ops.push(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
  }

  wrappedText(x, y, size, value, maxChars, leading = 14, options = {}) {
    const lines = wrapText(value, maxChars);
    let cursor = y;
    for (const line of lines) {
      this.text(x, cursor, size, line, options);
      cursor -= leading;
    }
    return cursor;
  }

  rect(x, y, w, h, color) {
    this.ops.push(`${color[0]} ${color[1]} ${color[2]} rg ${x} ${y} ${w} ${h} re f`);
  }

  strokeRect(x, y, w, h, color = [0.75, 0.78, 0.84]) {
    this.ops.push(`${color[0]} ${color[1]} ${color[2]} RG ${x} ${y} ${w} ${h} re S`);
  }

  line(x1, y1, x2, y2, color = [0.25, 0.34, 0.46], width = 1) {
    this.ops.push(`${color[0]} ${color[1]} ${color[2]} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  }

  stream() {
    return this.ops.join('\n');
  }
}

class PdfDocument {
  constructor() {
    this.pages = [];
  }

  addPage(drawFn) {
    const canvas = new PdfCanvas();
    drawFn(canvas);
    this.pages.push(canvas.stream());
  }

  build() {
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
    ];

    const pageIds = [];
    for (const stream of this.pages) {
      const contentId = objects.length + 1;
      objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const pageId = objects.length + 1;
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
    }

    objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets[index + 1] = pdf.length;
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return new Blob([pdf], { type: 'application/pdf' });
  }
}

function drawMetricBar(canvas, x, y, label, value, color) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  canvas.text(x, y + 11, 9, label, { bold: true, color: [0.18, 0.22, 0.3] });
  canvas.strokeRect(x + 130, y, 260, 12);
  canvas.rect(x + 130, y, 260 * safeValue / 100, 12, color);
  canvas.text(x + 402, y + 2, 9, `${safeValue.toFixed(1)}%`, { color: [0.18, 0.22, 0.3] });
}

function drawSeries(canvas, series, x, y, w, h, key, color) {
  if (!series.length) return;
  const values = series.map((d) => Number(d[key]) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-6, max - min);
  canvas.strokeRect(x, y, w, h, [0.78, 0.82, 0.88]);
  for (let i = 1; i < series.length; i++) {
    const x1 = x + (i - 1) * w / Math.max(1, series.length - 1);
    const x2 = x + i * w / Math.max(1, series.length - 1);
    const y1 = y + ((values[i - 1] - min) / span) * h;
    const y2 = y + ((values[i] - min) / span) * h;
    canvas.line(x1, y1, x2, y2, color, 1.5);
  }
}

export function buildGenesisReportPdf(report) {
  const doc = new PdfDocument();
  const latest = report.latest ?? {};
  const normalized = latest.normalized ?? {};
  const population = latest.population ?? {};
  const society = latest.society ?? {};
  const substrate = latest.substrate ?? {};

  doc.addPage((page) => {
    page.rect(0, PAGE_H - 92, PAGE_W, 92, [0.05, 0.08, 0.12]);
    page.text(MARGIN, PAGE_H - 46, 22, report.title, { bold: true, color: [1, 1, 1] });
    page.text(MARGIN, PAGE_H - 68, 10, `Generated ${report.generatedAt}`, { color: [0.74, 0.83, 0.95] });
    page.wrappedText(MARGIN, PAGE_H - 120, 10, report.summary, 92, 14);

    page.text(MARGIN, PAGE_H - 178, 14, 'Core metrics', { bold: true });
    drawMetricBar(page, MARGIN, PAGE_H - 214, 'Emergence index', latest.emergenceScore ?? 0, [0.1, 0.55, 0.9]);
    drawMetricBar(page, MARGIN, PAGE_H - 240, 'Edge of chaos', (normalized.edgeOfChaos ?? 0) * 100, [0.15, 0.75, 0.65]);
    drawMetricBar(page, MARGIN, PAGE_H - 266, 'Bio complexity', (normalized.biologicalComplexity ?? 0) * 100, [0.28, 0.62, 0.28]);
    drawMetricBar(page, MARGIN, PAGE_H - 292, 'Social complexity', (normalized.socialComplexity ?? 0) * 100, [0.6, 0.34, 0.82]);

    page.text(MARGIN, PAGE_H - 344, 14, 'State snapshot', { bold: true });
    const rows = [
      ['Phase', latest.phase],
      ['Tick', latest.tick],
      ['Population', population.alive],
      ['Species', population.species],
      ['Life rule', substrate.rule],
      ['Technologies', society.technologies],
      ['Professions', society.professions],
      ['Laws', society.laws]
    ];
    let y = PAGE_H - 374;
    for (const [label, value] of rows) {
      page.text(MARGIN, y, 10, `${label}:`, { bold: true });
      page.text(MARGIN + 118, y, 10, value ?? '-');
      y -= 18;
    }
  });

  doc.addPage((page) => {
    page.text(MARGIN, PAGE_H - 54, 18, 'Causal analysis', { bold: true });
    let y = PAGE_H - 88;
    for (const driver of latest.drivers ?? []) {
      page.text(MARGIN, y, 12, `${driver.label} (${Math.round(driver.score * 100)}%)`, { bold: true });
      y = page.wrappedText(MARGIN, y - 18, 9, `${driver.evidence}. ${driver.explanation}`, 92, 12);
      y -= 14;
    }

    page.text(MARGIN, y - 6, 18, 'Mathematical laws in use', { bold: true });
    y -= 40;
    for (const principle of report.principles ?? []) {
      page.text(MARGIN, y, 11, principle.name, { bold: true });
      y = page.wrappedText(MARGIN + 18, y - 15, 8, principle.formula, 96, 11, { color: [0.1, 0.32, 0.62] });
      y = page.wrappedText(MARGIN + 18, y - 2, 9, principle.meaning, 92, 12);
      y -= 12;
      if (y < 70) break;
    }
  });

  doc.addPage((page) => {
    page.text(MARGIN, PAGE_H - 54, 18, 'Infographics and trend window', { bold: true });
    page.text(MARGIN, PAGE_H - 82, 9, `Window samples: ${(report.series ?? []).length}. Trend emergence delta: ${(report.trend?.emergenceDelta ?? 0).toFixed(2)}`);

    page.text(MARGIN, PAGE_H - 122, 12, 'Emergence index', { bold: true });
    drawSeries(page, report.series ?? [], MARGIN, PAGE_H - 280, 500, 130, 'emergenceScore', [0.1, 0.55, 0.9]);
    page.text(MARGIN, PAGE_H - 318, 12, 'Population', { bold: true });
    drawSeries(page, report.series ?? [], MARGIN, PAGE_H - 476, 500, 130, 'population', [0.15, 0.65, 0.35]);
    page.text(MARGIN, PAGE_H - 514, 12, 'Neural complexity', { bold: true });
    drawSeries(page, report.series ?? [], MARGIN, PAGE_H - 672, 500, 130, 'complexity', [0.58, 0.35, 0.82]);
  });

  return doc.build();
}

export function downloadGenesisReportPdf(report, filename = 'genesis-report.pdf') {
  const blob = buildGenesisReportPdf(report);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadGenesisReportJson(report, filename = 'genesis-report.json') {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
