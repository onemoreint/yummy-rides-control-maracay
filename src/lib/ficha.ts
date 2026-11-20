import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawFooter, drawHeader, slug } from './exporters';
import { privateImageDataUrl } from './files';
import { cedula, fmtDate, fmtPhone, fullName, REVIEW_LABEL, STATUS_LABEL } from './format';
import type { AffiliationHistory, Assignment, DocumentRow, Driver, Motorcycle } from './types';

export interface FichaData {
  driver: Driver;
  assignments: (Assignment & { motorcycle: Motorcycle })[];
  documents: DocumentRow[];
  docLabels: Record<string, string>;
  affiliation: AffiliationHistory[];
}

const HEAD = { fillColor: [53, 0, 100] as [number, number, number], textColor: 255 };

/** Genera la ficha institucional del conductor. mode 'print' abre el diálogo de impresión. */
export async function buildFicha(data: FichaData, mode: 'download' | 'print') {
  const { driver: d } = data;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  await drawHeader(doc, 'Expediente digital del conductor', `${d.code} · ${fullName(d)}`);

  // Fotografía
  let y = 34;
  const photo = d.photo_path ? await privateImageDataUrl(d.photo_path) : null;
  if (photo) {
    doc.addImage(photo, 'JPEG', 12, y, 34, 34);
    doc.setDrawColor(160, 32, 240);
    doc.rect(12, y, 34, 34);
  }
  const x = photo ? 52 : 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(fullName(d), x, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Código: ${d.code}`, x, y + 13);
  doc.text(`Cédula: ${cedula(d)}`, x, y + 19);
  doc.text(`Estado de afiliación: ${STATUS_LABEL[d.status]}${d.is_draft ? ' (borrador)' : ''}`, x, y + 25);
  doc.text(`Fecha de ingreso: ${fmtDate(d.join_date)}`, x, y + 31);
  y += 40;

  const current = data.assignments.find((a) => a.is_current);
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [['Datos personales y de contacto', '']],
    body: [
      ['Fecha de nacimiento', fmtDate(d.birth_date)],
      ['Teléfono principal', fmtPhone(d.phone)],
      ['WhatsApp', fmtPhone(d.whatsapp)],
      ['Dirección', d.address ?? '—'],
      ['Parroquia / Municipio / Estado', [d.parish, d.municipality, d.state].filter(Boolean).join(' / ') || '—'],
      [
        'Contacto de emergencia',
        d.emergency_name ? `${d.emergency_name} (${d.emergency_relationship ?? '—'}) · ${fmtPhone(d.emergency_phone)}` : '—',
      ],
      ['Motocicleta actual', current ? `${current.motorcycle.plate} · ${current.motorcycle.brand} ${current.motorcycle.model} (${current.motorcycle.code})` : 'Sin asignación'],
      ['Observaciones administrativas', d.internal_notes ?? '—'],
      ['Última actualización', new Date(d.updated_at).toLocaleString('es-VE')],
    ],
    headStyles: HEAD,
    styles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' } },
    margin: { left: 12, right: 12 },
  });

  const next = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  autoTable(doc, {
    startY: next(),
    head: [['Historial de motocicletas', 'Placa', 'Propietario', 'Desde', 'Hasta']],
    body: data.assignments.length
      ? data.assignments.map((a) => [
          `${a.motorcycle.brand} ${a.motorcycle.model}${a.is_current ? ' (actual)' : ''}`,
          a.motorcycle.plate,
          a.motorcycle.owner_name,
          fmtDate(a.start_date),
          a.end_date ? fmtDate(a.end_date) : '—',
        ])
      : [['Sin registros', '', '', '', '']],
    headStyles: HEAD,
    styles: { fontSize: 8.5 },
    margin: { left: 12, right: 12 },
  });

  autoTable(doc, {
    startY: next(),
    head: [['Documento', 'Emisión', 'Vencimiento', 'Revisión']],
    body: data.documents.length
      ? data.documents.map((x) => [
          data.docLabels[x.doc_type] ?? x.doc_type,
          fmtDate(x.issue_date),
          x.expiry_date ? fmtDate(x.expiry_date) : 'No aplica',
          REVIEW_LABEL[x.review_status],
        ])
      : [['Sin documentos cargados', '', '', '']],
    headStyles: HEAD,
    styles: { fontSize: 8.5 },
    margin: { left: 12, right: 12 },
  });

  autoTable(doc, {
    startY: next(),
    head: [['Historial de afiliación', 'Fecha', 'Motivo', 'Responsable']],
    body: data.affiliation.map((h) => [
      `${h.previous_status ? STATUS_LABEL[h.previous_status] + ' → ' : ''}${STATUS_LABEL[h.new_status]}`,
      fmtDate(h.effective_date),
      [h.reason, h.notes].filter(Boolean).join(' · ') || '—',
      h.changed_by_name ?? '—',
    ]),
    headStyles: HEAD,
    styles: { fontSize: 8.5 },
    margin: { left: 12, right: 12 },
  });

  drawFooter(doc);
  const name = `ficha-${d.code}-${slug(fullName(d))}.pdf`;
  if (mode === 'print') {
    doc.autoPrint();
    const url = URL.createObjectURL(doc.output('blob'));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } else {
    doc.save(name);
  }
}
