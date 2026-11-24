'use strict';

/**
 * Zero-dependency PDF writer for the registration list.
 * Uses the predefined Adobe CID font STSong-Light (UniGB-UCS2-H) for CJK text
 * and Helvetica for Latin text, so no font file has to be shipped or embedded.
 */

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 36;

const COLUMNS = [
  { key: 'index', label: '序号', width: 26 },
  { key: 'name', label: '姓名', width: 62 },
  { key: 'email', label: '邮箱', width: 116 },
  { key: 'affiliation', label: '单位', width: 88 },
  { key: 'position', label: '职务', width: 62 },
  { key: 'country', label: '国家', width: 42 },
  { key: 'notes', label: '备注', width: 96 },
  { key: 'report', label: '报告题目与摘要', width: 152 },
  { key: 'pdf', label: 'PDF 附件', width: 58 },
  { key: 'createdAt', label: '注册时间', width: 68 }
];

const CELL_SIZE = 7.2;
const LINE_HEIGHT = 9.2;
const PADDING_X = 3;
const PADDING_Y = 3.2;

function isWide(code) {
  return (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    code >= 0x20000
  );
}

function charWidth(ch, size) {
  return isWide(ch.codePointAt(0)) ? size : size * 0.5;
}

function measure(text, size) {
  let total = 0;
  for (const ch of text) total += charWidth(ch, size);
  return total;
}

function wrapText(text, maxWidth, size) {
  const lines = [];
  let current = '';
  let width = 0;
  for (const ch of text) {
    if (ch === '\n') {
      lines.push(current);
      current = '';
      width = 0;
      continue;
    }
    const w = charWidth(ch, size);
    if (width + w > maxWidth && current) {
      lines.push(current);
      current = ch;
      width = w;
    } else {
      current += ch;
      width += w;
    }
  }
  lines.push(current);
  return lines;
}

function splitRuns(text) {
  const runs = [];
  let buffer = '';
  let wide = null;
  for (const ch of text) {
    const nextWide = isWide(ch.codePointAt(0));
    if (wide === null) wide = nextWide;
    if (nextWide !== wide) {
      runs.push({ text: buffer, wide });
      buffer = '';
      wide = nextWide;
    }
    buffer += ch;
  }
  if (buffer) runs.push({ text: buffer, wide });
  return runs;
}

function hexUtf16(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    out += text.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  }
  return out;
}

function escapeLiteral(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function num(value) {
  return (Math.round(value * 100) / 100).toString();
}

function textOps(text, x, y, size) {
  const runs = splitRuns(text);
  if (!runs.length) return '';
  let ops = 'BT\n';
  let cursor = x;
  for (const run of runs) {
    if (run.wide) {
      ops += '/F1 ' + num(size) + ' Tf\n';
      ops += '1 0 0 1 ' + num(cursor) + ' ' + num(y) + ' Tm\n';
      ops += '<' + hexUtf16(run.text) + '> Tj\n';
    } else {
      ops += '/F2 ' + num(size) + ' Tf\n';
      ops += '1 0 0 1 ' + num(cursor) + ' ' + num(y) + ' Tm\n';
      ops += '(' + escapeLiteral(run.text) + ') Tj\n';
    }
    cursor += measure(run.text, size);
  }
  ops += 'ET\n';
  return ops;
}

function formatDate(value) {
  if (!value) return '';
  const text = String(value).replace('T', ' ').replace('Z', '');
  return text.slice(0, 16);
}

function reportText(entry) {
  const presentation = entry.presentation;
  if (!presentation || !presentation.requested) return '不申请报告';
  const title = presentation.title || '';
  let abstract = presentation.abstract || '';
  if (abstract.length > 420) abstract = abstract.slice(0, 420) + '…';
  return '题目：' + title + '\n摘要：' + abstract;
}

function buildRows(registrations) {
  return registrations.map((entry, index) => ({
    index: String(index + 1),
    name: entry.name || '',
    email: entry.email || '',
    affiliation: entry.affiliation || '',
    position: entry.position || '',
    country: entry.country || '',
    notes: entry.notes || '',
    report: reportText(entry),
    pdf: (entry.presentation && entry.presentation.pdf && entry.presentation.pdf.name) || '—',
    createdAt: formatDate(entry.createdAt)
  }));
}

function layoutRows(rows) {
  return rows.map((row) => {
    const cells = COLUMNS.map((column) => {
      const value = row[column.key] || '';
      const lines = wrapText(value, column.width - PADDING_X * 2, CELL_SIZE);
      return { lines };
    });
    const lineCount = cells.reduce((max, cell) => Math.max(max, cell.lines.length), 1);
    return { cells, height: lineCount * LINE_HEIGHT + PADDING_Y * 2 };
  });
}

function buildPages(rows, title, subtitle) {
  const pages = [];
  let ops = '';
  let y = 0;

  const startPage = () => {
    ops = '';
    y = PAGE_HEIGHT - MARGIN;
    ops += textOps(title, MARGIN, y - 14, 15);
    y -= 30;
    ops += textOps(subtitle, MARGIN, y - 6, 8.5);
    y -= 22;
    pages.push({});
  };

  const drawHeader = () => {
    const height = 16;
    ops += 'q 0.04 0.086 0.133 rg ' + num(MARGIN) + ' ' + num(y - height) + ' ' +
      num(PAGE_WIDTH - MARGIN * 2) + ' ' + num(height) + ' re f Q\n';
    ops += '1 1 1 rg\n';
    let x = MARGIN;
    for (const column of COLUMNS) {
      const labelWidth = measure(column.label, 7.4);
      const offset = Math.max(0, (column.width - labelWidth) / 2);
      ops += textOps(column.label, x + offset, y - height + 5, 7.4);
      x += column.width;
    }
    ops += '0 0 0 rg\n';
    y -= height;
  };

  const drawRow = (row, index) => {
    const totalWidth = COLUMNS.reduce((sum, column) => sum + column.width, 0);
    if (index % 2 === 1) {
      ops += 'q 0.969 0.957 0.933 rg ' + num(MARGIN) + ' ' + num(y - row.height) + ' ' +
        num(totalWidth) + ' ' + num(row.height) + ' re f Q\n';
    }
    let x = MARGIN;
    row.cells.forEach((cell, columnIndex) => {
      const column = COLUMNS[columnIndex];
      let lineY = y - PADDING_Y - CELL_SIZE + 1.2;
      for (const line of cell.lines) {
        ops += textOps(line, x + PADDING_X, lineY, CELL_SIZE);
        lineY -= LINE_HEIGHT;
      }
      x += column.width;
    });
    ops += '0.79 0.76 0.71 RG 0.4 w ' + num(MARGIN) + ' ' + num(y - row.height) + ' m ' +
      num(MARGIN + totalWidth) + ' ' + num(y - row.height) + ' l S\n';
    y -= row.height;
  };

  startPage();
  drawHeader();

  const laidOut = layoutRows(rows);
  if (!laidOut.length) {
    ops += textOps('暂无报名记录', MARGIN, y - 16, 9);
    y -= 30;
  }

  let rowIndex = 0;
  for (const row of laidOut) {
    if (y - row.height < MARGIN + 24) {
      pages[pages.length - 1].ops = ops;
      startPage();
      drawHeader();
    }
    drawRow(row, rowIndex);
    rowIndex += 1;
  }
  pages[pages.length - 1].ops = ops;

  pages.forEach((page, index) => {
    const footer = '第 ' + (index + 1) + ' 页 / 共 ' + pages.length + ' 页';
    const footerWidth = measure(footer, 7.5);
    page.ops += textOps(footer, (PAGE_WIDTH - footerWidth) / 2, MARGIN - 12, 7.5);
  });

  return pages;
}

function buildRegistrationsPdf(registrations, options = {}) {
  const title = options.title || '李政道诞辰一百周年 · 湍流研究遗产系列学术报告会';
  const exportedAt = options.exportedAt || new Date();
  const stamp = exportedAt.toISOString().slice(0, 16).replace('T', ' ');
  const subtitle = '参会报名名单（导出时间：' + stamp + ' UTC，共 ' + registrations.length + ' 人）';
  const pages = buildPages(buildRows(registrations), title, subtitle);

  const objects = [];
  const addObject = (body) => {
    objects.push(body);
    return objects.length;
  };

  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesObjectIndex = addObject(''); // filled in later

  addObject(
    '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H ' +
    '/DescendantFonts [4 0 R] >>'
  );
  addObject(
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light ' +
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> ' +
    '/FontDescriptor 5 0 R /DW 1000 >>'
  );
  addObject(
    '<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 ' +
    '/FontBBox [-25 -254 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -120 ' +
    '/CapHeight 700 /StemV 80 >>'
  );
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  const pageRefs = [];
  for (const page of pages) {
    const content = addObject(
      '<< /Length ' + Buffer.byteLength(page.ops, 'latin1') + ' >>\nstream\n' + page.ops + 'endstream'
    );
    const pageObj = addObject(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + num(PAGE_WIDTH) + ' ' + num(PAGE_HEIGHT) + '] ' +
      '/Resources << /Font << /F1 3 0 R /F2 6 0 R >> >> /Contents ' + content + ' 0 R >>'
    );
    pageRefs.push(pageObj);
  }

  objects[pagesObjectIndex - 1] =
    '<< /Type /Pages /Kids [' + pageRefs.map((ref) => ref + ' 0 R').join(' ') + '] ' +
    '/Count ' + pageRefs.length + ' >>';

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += (index + 1) + ' 0 obj\n' + body + '\nendobj\n';
  });

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += 'xref\n0 ' + (objects.length + 1) + '\n';
  pdf += '0000000000 65535 f \n';
  offsets.forEach((offset) => {
    pdf += String(offset).padStart(10, '0') + ' 00000 n \n';
  });
  pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\n';
  pdf += 'startxref\n' + xrefOffset + '\n%%EOF\n';

  return Buffer.from(pdf, 'latin1');
}

module.exports = { buildRegistrationsPdf };
