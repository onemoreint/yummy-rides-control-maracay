import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { publicAssetDataUrl } from './files';

export interface ExportColumn {
  key: string;
  label: string;
}
export type ExportRow = Record<string, string | number | null | undefined>;

const PURPLE: [number, number, number] = [53, 0, 100];
const ELECTRIC: [number, number, number] = [160, 32, 240];

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportCSV(title: string, cols: ExportColumn[], rows: ExportRow[]) {
  const esc = (v: unknown) => {
    let s = v == null ? '' : String(v);
    // Evita inyección de fórmulas al abrir el CSV en Excel
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => esc(c.label)).join(';'), ...rows.map((r) => cols.map((c) => esc(r[c.key])).join(';'))];
  // BOM para que Excel respete tildes y ñ
  download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${slug(title)}-${stamp()}.csv`);
}

export async function exportXLSX(title: string, cols: ExportColumn[], rows: ExportRow[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const header = cols.map((c) => ({
    value: c.label,
    fontWeight: 'bold' as const,
    textColor: '#FFFFFF',
    backgroundColor: '#350064',
  }));
  const body = rows.map((r) =>
    cols.map((c) => {
      const v = r[c.key];
      if (typeof v === 'number') return { value: v, type: Number };
      return { value: v == null ? '' : String(v), type: String };
    }),
  );
  const blob = await writeXlsxFile([header, ...body], {
    sheet: title.slice(0, 30),
    columns: cols.map(() => ({ width: 22 })),
    stickyRowsCount: 1,
  }).toBlob();
  download(blob, `${slug(title)}-${stamp()}.xlsx`);
}

export async function exportReportPDF(title: string, subtitle: string, cols: ExportColumn[], rows: ExportRow[]) {
  const doc = new jsPDF({ orientation: cols.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'letter' });
  await drawHeader(doc, title, subtitle);
  autoTable(doc, {
    startY: 34,
    head: [cols.map((c) => c.label)],
    body: rows.map((r) => cols.map((c) => (r[c.key] == null ? '' : String(r[c.key])))),
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: PURPLE, textColor: 255 },
    alternateRowStyles: { fillColor: [247, 237, 254] },
    margin: { left: 12, right: 12 },
  });
  drawFooter(doc);
  download(doc.output('blob'), `${slug(title)}-${stamp()}.pdf`);
}

export async function drawHeader(doc: jsPDF, title: string, subtitle: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PURPLE);
  doc.rect(0, 0, w, 26, 'F');
  doc.setFillColor(...ELECTRIC);
  doc.rect(0, 26, w, 1.2, 'F');
  const logo = await publicAssetDataUrl('brand/yummy-logo-pdf.jpg');
  if (logo) doc.addImage(logo, 'JPEG', 10, 3, 20, 20);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Yummy Rides Control Maracay', 34, 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(title, 34, 17);
  doc.setFontSize(8);
  doc.text(subtitle, 34, 22);
  doc.text(`Generado: ${new Date().toLocaleString('es-VE')}`, w - 10, 22, { align: 'right' });
  doc.setTextColor(20, 20, 20);
}

export function drawFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text('Documento confidencial — contiene datos personales. Uso exclusivo administrativo de Yummy Rides Maracay.', 12, h - 7);
    doc.text(`Página ${i} de ${pages}`, w - 12, h - 7, { align: 'right' });
  }
}

export function slug(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export { download };
