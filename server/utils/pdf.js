// Minimal hand-rolled single-page PDF writer — no npm dependency (the
// sandbox this app was built in has no registry access, so anything new
// has to be built on Node's built-ins only; see server/utils/webauthn.js
// for the same constraint applied to WebAuthn/CBOR).
//
// Supports just enough of the PDF 1.4 spec to draw a certificate: text in
// the two standard Helvetica fonts, filled rectangles, and straight lines.
// Standard (base-14) fonts need no embedding, which keeps this small.

const PAGE_WIDTH = 595.28;  // A4 in points
const PAGE_HEIGHT = 841.89;

function escapePdfText(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    // Standard PDF text strings are Latin-1 (WinAnsiEncoding) — strip
    // anything outside that range rather than emit bytes that would
    // render as garbage.
    .replace(/[^\x20-\x7E]/g, '');
}

function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ops: array of drawing instructions, top-left origin (y grows downward,
// like screen/CSS coordinates) — converted to PDF's bottom-left origin here
// so callers don't have to think about it.
function buildContentStream(ops) {
  const parts = [];
  let fillColor = null;
  for (const op of ops) {
    if (op.type === 'text') {
      const font = op.font === 'bold' ? 'F2' : 'F1';
      const size = op.size || 11;
      const color = op.color || '#32373c';
      if (color !== fillColor) {
        const [r, g, b] = rgb(color);
        parts.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
        fillColor = color;
      }
      const y = PAGE_HEIGHT - op.y;
      parts.push('BT');
      parts.push(`/${font} ${size} Tf`);
      parts.push(`${op.x.toFixed(2)} ${y.toFixed(2)} Td`);
      parts.push(`(${escapePdfText(op.text)}) Tj`);
      parts.push('ET');
    } else if (op.type === 'rect') {
      const color = op.color || '#579500';
      const [r, g, b] = rgb(color);
      parts.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
      fillColor = null; // rect fill doesn't affect text fill color cache below
      const y = PAGE_HEIGHT - op.y - op.h;
      parts.push(`${op.x.toFixed(2)} ${y.toFixed(2)} ${op.w.toFixed(2)} ${op.h.toFixed(2)} re f`);
    } else if (op.type === 'line') {
      const color = op.color || '#579500';
      const [r, g, b] = rgb(color);
      parts.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
      parts.push(`${(op.width || 1).toFixed(2)} w`);
      const y1 = PAGE_HEIGHT - op.y1;
      const y2 = PAGE_HEIGHT - op.y2;
      parts.push(`${op.x1.toFixed(2)} ${y1.toFixed(2)} m ${op.x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    }
  }
  return parts.join('\n');
}

// Builds a complete single-page PDF (as a Buffer) from a flat list of
// drawing ops. Handles the object table / xref / trailer bookkeeping.
function buildPdf(ops) {
  const content = buildContentStream(ops);
  const contentBytes = Buffer.byteLength(content, 'latin1');

  const objects = [
    null, // objects are 1-indexed; index 0 unused
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] /Contents 4 0 R >>`,
    `<< /Length ${contentBytes} >>\nstream\n${content}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0]; // offset of object 0 is unused, kept for index alignment
  for (let i = 1; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += `0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

// Certificate of Service — issued to a helper for one or more completed
// (delivered) help items. "Signed" here means a visible signature block
// with the organization's name and issue date, not a cryptographic PDF
// signature — real PKI signing would need a certificate/key-management
// setup well beyond what this volunteer-matching app needs.
function buildCertificatePdf({ helperName, memberNumber, helps, issuedDate }) {
  const ops = [];
  const green = '#579500';
  const gray = '#32373c';

  ops.push({ type: 'rect', x: 0, y: 0, w: PAGE_WIDTH, h: 8, color: green });

  ops.push({ type: 'text', x: 60, y: 70, size: 24, font: 'bold', text: 'REMAR Schweiz', color: green });
  ops.push({ type: 'text', x: 60, y: 92, size: 10, text: 'Connecting helpers with people who need support across Switzerland.', color: gray });

  ops.push({ type: 'line', x1: 60, y1: 112, x2: PAGE_WIDTH - 60, y2: 112, width: 1, color: green });

  ops.push({ type: 'text', x: 60, y: 150, size: 20, font: 'bold', text: 'Certificate of Service', color: gray });

  const totalHours = helps.reduce((sum, h) => sum + (parseFloat(h.duration_hours) || 0), 0);
  ops.push({ type: 'text', x: 60, y: 185, size: 11,
    text: `This certifies that ${helperName} (${memberNumber}) delivered the following volunteer service${helps.length > 1 ? 's' : ''}:` });

  let y = 220;
  ops.push({ type: 'text', x: 60, y, size: 9, font: 'bold', text: 'Date', color: gray });
  ops.push({ type: 'text', x: 150, y, size: 9, font: 'bold', text: 'Service', color: gray });
  ops.push({ type: 'text', x: 400, y, size: 9, font: 'bold', text: 'Hours', color: gray });
  y += 6;
  ops.push({ type: 'line', x1: 60, y1: y, x2: PAGE_WIDTH - 60, y2: y, width: 0.75, color: '#cccccc' });
  y += 20;

  for (const h of helps) {
    const dateStr = h.scheduled_date ? new Date(h.scheduled_date).toLocaleDateString() : '—';
    ops.push({ type: 'text', x: 60, y, size: 10, text: dateStr });
    ops.push({ type: 'text', x: 150, y, size: 10, text: (h.title || '').slice(0, 45) });
    ops.push({ type: 'text', x: 400, y, size: 10, text: h.duration_hours ? `${h.duration_hours}h` : '—' });
    y += 22;
  }

  y += 10;
  ops.push({ type: 'line', x1: 60, y1: y, x2: PAGE_WIDTH - 60, y2: y, width: 0.75, color: '#cccccc' });
  y += 24;
  ops.push({ type: 'text', x: 60, y, size: 11, font: 'bold', text: `Total hours: ${totalHours.toFixed(1)}`, color: gray });

  // Signature block
  const sigY = 680;
  ops.push({ type: 'line', x1: 60, y1: sigY, x2: 260, y2: sigY, width: 1, color: gray });
  ops.push({ type: 'text', x: 60, y: sigY + 22, size: 14, font: 'bold', text: 'REMAR Schweiz', color: green });
  ops.push({ type: 'text', x: 60, y: sigY + 38, size: 9, text: `Authorized digital signature — issued ${issuedDate}`, color: gray });

  ops.push({ type: 'text', x: 60, y: 800, size: 8,
    text: `Member: ${helperName} (${memberNumber})  •  Certificate issued ${issuedDate}  •  REMAR Schweiz`, color: '#999999' });

  return buildPdf(ops);
}

module.exports = { buildPdf, buildCertificatePdf, PAGE_WIDTH, PAGE_HEIGHT };
