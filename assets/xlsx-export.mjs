/**
 * Small, self-contained Office Open XML (.xlsx) writer for researcher exports.
 * No third-party scripts or network requests ever receive participant data.
 * ZIP uses the standard STORE method for maximum browser/Excel compatibility.
 */
const encoder = new TextEncoder();
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function xmlEscape(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function excelColumn(i) {
  let s = '';
  for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}
function cellXml(value, address, header) {
  if (value === null || value === undefined || value === '') return '';
  const style = header ? ' s="1"' : '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${address}"${style}><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') return `<c r="${address}"${style} t="b"><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${address}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}
function worksheetXml({columns, rows}) {
  const matrix = [columns, ...rows.map(row => columns.map(key => row[key]))];
  const lastCol = excelColumn(columns.length - 1);
  const data = matrix.map((values, y) => {
    const n = y + 1;
    const cells = values.map((value, x) => cellXml(value, `${excelColumn(x)}${n}`, y === 0)).join('');
    return `<row r="${n}">${cells}</row>`;
  }).join('');
  const colWidths = columns.map((name, i) => {
    const width = /participant_id/.test(name) ? 38 : /(?:note|description|options)/.test(name) ? 42 :
      /(?:date|started_at|submitted_at|completed_at)/.test(name) ? 29 : Math.min(26, Math.max(14, name.length + 3));
    return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:${lastCol}${matrix.length}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="17"/><cols>${colWidths}</cols>` +
    `<sheetData>${data}</sheetData>` +
    `<autoFilter ref="A1:${lastCol}${matrix.length}"/>` +
    `</worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF254766"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/></cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

function buildPackage(sheets) {
  const baseTypes = [
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `<Default Extension="xml" ContentType="application/xml"/>`,
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
  ];
  const workbookSheets = [];
  const workbookRels = [];
  const files = [];
  for (let i = 0; i < sheets.length; i++) {
    const n = i + 1;
    const name = sheets[i].name;
    if (!/^[^\\/*?\[\]:]{1,31}$/.test(name)) throw new Error(`잘못된 Excel 시트 이름: ${name}`);
    baseTypes.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    workbookSheets.push(`<sheet name="${xmlEscape(name)}" sheetId="${n}" r:id="rId${n}"/>`);
    workbookRels.push(`<Relationship Id="rId${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/>`);
    files.push([`xl/worksheets/sheet${n}.xml`, worksheetXml(sheets[i])]);
  }
  files.push(['[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${baseTypes.join('')}</Types>`]);
  files.push(['_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`]);
  files.push(['xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${workbookSheets.join('')}</sheets></workbook>`]);
  files.push(['xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRels.join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
  files.push(['xl/styles.xml', STYLES_XML]);
  return files;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
function zipStore(files) {
  let localOffset = 0;
  const locals = [];
  const centrals = [];
  for (const [path, source] of files) {
    const name = encoder.encode(path), body = encoder.encode(source), crc = crc32(body);
    const local = new Uint8Array(30 + name.length + body.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);v.setUint16(4, 20, true);v.setUint16(6, 0x0800, true);
    v.setUint16(8, 0, true);v.setUint32(14, crc, true);
    v.setUint32(18, body.length, true);v.setUint32(22, body.length, true);
    v.setUint16(26, name.length, true);
    local.set(name, 30);local.set(body, 30 + name.length);
    locals.push(local);
    const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);cv.setUint16(4, 20, true);cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);cv.setUint32(24, body.length, true);
    cv.setUint16(28, name.length, true);cv.setUint32(42, localOffset, true);
    central.set(name, 46);centrals.push(central);
    localOffset += local.length;
  }
  if (files.length > 65535) throw new Error('ZIP 엔트리 수 초과');
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const total = localOffset + centralSize + 22;
  if (total >= 0xffffffff) throw new Error('엑셀 파일이 ZIP의 크기 제한을 초과했습니다. CSV를 사용하세요.');
  const output = new Uint8Array(total);
  let offset = 0;
  for (const bytes of [...locals, ...centrals]) {output.set(bytes, offset);offset += bytes.length;}
  const end = new DataView(output.buffer, offset, 22);
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);end.setUint32(16, localOffset, true);
  return output;
}

export function createXlsxBlob(sheets) {
  if (!Array.isArray(sheets) || !sheets.length) throw new Error('엑셀 시트가 없습니다.');
  for (const s of sheets) if (!Array.isArray(s.columns) || !Array.isArray(s.rows)) throw new Error('엑셀 데이터 형식이 잘못되었습니다.');
  const bytes = zipStore(buildPackage(sheets));
  return new Blob([bytes], { type: XLSX_MIME });
}