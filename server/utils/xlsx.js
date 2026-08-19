// Minimal, dependency-free .xlsx (OOXML) writer for the admin CSV/XLSX
// download buttons (Beneficiaries, Helpers). The sandbox this server runs in
// has no npm registry access, so a real library (SheetJS, exceljs, ...)
// can't be installed — this hand-rolls just enough of the ZIP container
// plus spreadsheetml XML to produce a single-sheet workbook Excel opens
// cleanly. Every zip entry is STORED (uncompressed, method 0) rather than
// DEFLATEd — simpler to get byte-correct, and these exports are small
// (dozens to low hundreds of rows) so file size doesn't matter.

// Standard CRC-32 (zip/PNG polynomial), table-based.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// DOS date/time pair every zip entry needs — exact value doesn't matter for
// anything downstream (Excel ignores it), just needs to be well-formed.
function dosDateTime(date) {
  const time = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1F);
  const dosDate = (((Math.max(date.getFullYear(), 1980) - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0xF) << 5) | (date.getDate() & 0x1F);
  return { time, dosDate };
}

// Builds a STORED-method zip archive from [{ name, data: Buffer }, ...].
function buildZip(files) {
  const { time, dosDate } = dosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const data = file.data;
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);       // version needed
    localHeader.writeUInt16LE(0, 6);        // flags
    localHeader.writeUInt16LE(0, 8);        // method: 0 = stored
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18); // compressed size
    localHeader.writeUInt32LE(data.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);       // extra field length
    localParts.push(localHeader, nameBuf, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);     // version made by
    centralHeader.writeUInt16LE(20, 6);     // version needed
    centralHeader.writeUInt16LE(0, 8);      // flags
    centralHeader.writeUInt16LE(0, 10);     // method: stored
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);     // extra length
    centralHeader.writeUInt16LE(0, 32);     // comment length
    centralHeader.writeUInt16LE(0, 34);     // disk number start
    centralHeader.writeUInt16LE(0, 36);     // internal attrs
    centralHeader.writeUInt32LE(0, 38);     // external attrs
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + data.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const centralDirOffset = offset;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(centralDirOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, end]);
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// 1-based column index -> spreadsheet column letters (1 -> A, 27 -> AA, ...).
function colLetter(n) {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// headers: string[]; rows: array of arrays, each cell a string or number
// (numbers are written as real numeric cells, everything else as inline
// strings — no shared-strings table needed for exports this size).
function buildXlsx(headers, rows) {
  const allRows = [headers, ...rows];
  const rowsXml = allRows.map((row, rIdx) => {
    const r = rIdx + 1;
    const cellsXml = row.map((value, cIdx) => {
      const ref = `${colLetter(cIdx + 1)}${r}`;
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${ref}"><v>${value}</v></c>`;
      }
      const text = value == null ? '' : String(value);
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
    }).join('');
    return `<row r="${r}">${cellsXml}</row>`;
  }).join('');

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetData>${rowsXml}</sheetData>`
    + `</worksheet>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    + `</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>`
    + `</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>`
    + `</Relationships>`;

  const files = [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRels, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml, 'utf8') },
  ];

  return buildZip(files);
}

module.exports = { buildXlsx };
