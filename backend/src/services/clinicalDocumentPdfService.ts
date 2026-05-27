import PDFDocument from 'pdfkit';
import type { Readable } from 'stream';
import { clinicDao } from '../dao/clinicDao';
import { patientDao } from '../dao/patientDao';
import { userDao } from '../dao/userDao';
import type {
  ClinicalDocumentRow,
  ClinicalDocumentType,
} from '../types/db';

// Clinical document PDF generation service (Sprint 4.3B; layout v2 Sprint 4.3C).
// ADR 0011 §10: mandatory legal footer every page; no ICP-Brasil integration;
// no logo/image/storage; no QR code; compress:false for smoke-test hex extraction.
//
// MANDATORY LEGAL FOOTER — ADR 0011 §10.2.
// This text is fixed by ADR 0011 and must appear on every page.
// Removing or editing requires reopening ADR 0011.
// Smoke tests verify: "ICP-Brasil", "Gov.br/ITI", "VALIDAR".
const MANDATORY_LEGAL_FOOTER =
  'PDF gerado pelo ClinicBridge. Este arquivo ainda não possui assinatura digital ICP-Brasil. ' +
  'Para validade jurídica plena, o profissional deve assinar externamente com certificado ' +
  'ICP-Brasil ou ferramenta compatível (ex.: GOV.BR, assinadores CFM). ' +
  'Após assinado, autentique no serviço VALIDAR oficial Gov.br/ITI (validar.iti.gov.br). ' +
  'Enquanto não assinado digitalmente, válido para impressão e assinatura manual, ' +
  'conforme responsabilidade do profissional emitente.';

const DOC_TYPE_LABEL: Record<ClinicalDocumentType, string> = {
  receipt_simple: 'Receita simples',
  attestation: 'Atestado médico',
  declaration: 'Declaração de comparecimento',
  exam_request: 'Solicitação de exame',
  orientation: 'Orientação clínica',
};

function formatDateBR(date: Date | null): string {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} às ${hour}h${min}`;
}

function formatDateOnlyBR(value: string | Date | null): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function shortenId(id: string): string {
  return id.replace(/-/g, '').slice(0, 8);
}

function drawHRule(
  doc: PDFKit.PDFDocument,
  x: number,
  w: number,
  color: string,
  weight = 0.5,
): void {
  doc.moveTo(x, doc.y).lineTo(x + w, doc.y)
    .strokeColor(color).lineWidth(weight).stroke();
  doc.lineWidth(1);
}

function renderMetadata(
  doc: PDFKit.PDFDocument,
  x: number,
  w: number,
  type: ClinicalDocumentType,
  metadata: Record<string, unknown> | null,
): void {
  if (!metadata) return;
  const lines: string[] = [];

  function asString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return null;
  }
  function asArrayOfStrings(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const out: string[] = [];
    for (const item of value) {
      const s = asString(item);
      if (s) out.push(s);
    }
    return out.length ? out : null;
  }

  if (type === 'attestation') {
    const days = asString(metadata.days_absent);
    if (days) lines.push(`Dias de afastamento: ${days}`);
    const start = asString(metadata.start_date);
    if (start) lines.push(`Início: ${formatDateOnlyBR(start)}`);
    const end = asString(metadata.end_date);
    if (end) lines.push(`Término: ${formatDateOnlyBR(end)}`);
    const cid = asString(metadata.cid_free);
    if (cid) lines.push(`CID (livre): ${cid}`);
  } else if (type === 'declaration') {
    const ed = asString(metadata.event_date);
    if (ed) lines.push(`Data do comparecimento: ${formatDateOnlyBR(ed)}`);
    const st = asString(metadata.start_time);
    const et = asString(metadata.end_time);
    if (st || et) lines.push(`Horário: ${st ?? '—'} às ${et ?? '—'}`);
  } else if (type === 'receipt_simple') {
    const meds = asArrayOfStrings(metadata.medications);
    if (meds) lines.push(`Medicamentos:\n  - ${meds.join('\n  - ')}`);
    const dosage = asString(metadata.dosage);
    if (dosage) lines.push(`Posologia: ${dosage}`);
    const instructions = asString(metadata.instructions);
    if (instructions) lines.push(`Instruções: ${instructions}`);
    const validity = asString(metadata.validity_days);
    if (validity) lines.push(`Validade (dias): ${validity}`);
  } else if (type === 'exam_request') {
    const exams = asArrayOfStrings(metadata.exams_requested);
    if (exams) lines.push(`Exames solicitados:\n  - ${exams.join('\n  - ')}`);
    const indication = asString(metadata.clinical_indication);
    if (indication) lines.push(`Indicação clínica: ${indication}`);
  }
  // 'orientation' has no structured fields — everything goes into body.

  if (lines.length === 0) return;
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#888888');
  doc.text('DETALHES ESTRUTURADOS', x, doc.y, { width: w });
  doc.moveDown(0.25);
  doc.font('Helvetica').fontSize(10.5).fillColor('#111111');
  for (const line of lines) {
    doc.text(line, x, doc.y, { width: w, align: 'left', lineGap: 1 });
  }
}

// Draws the mandatory legal footer on the current page.
// pageAdded fires for pages 2+; page 1 is handled explicitly after body.
function drawFooterOnPage(doc: PDFKit.PDFDocument): void {
  const { left, right, bottom } = doc.page.margins;
  const footerH = 56;
  const fy = doc.page.height - bottom - footerH + 10;
  const fw = doc.page.width - left - right;
  doc.save();
  doc.moveTo(left, fy - 7).lineTo(left + fw, fy - 7)
    .strokeColor('#cccccc').lineWidth(0.4).stroke();
  doc.lineWidth(1);
  doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#666666');
  doc.text(MANDATORY_LEGAL_FOOTER, left, fy, { width: fw, align: 'justify' });
  doc.restore();
}

function attachLegalFooter(doc: PDFKit.PDFDocument): void {
  doc.on('pageAdded', () => drawFooterOnPage(doc));
}

export interface BuildDocumentPdfInput {
  document: ClinicalDocumentRow;
}

export interface BuildDocumentPdfOutput {
  stream: Readable;
  filename: string;
}

export const clinicalDocumentPdfService = {
  async build(input: BuildDocumentPdfInput): Promise<BuildDocumentPdfOutput> {
    const { document: row } = input;

    const [clinic, patient, author] = await Promise.all([
      clinicDao.findById(row.clinica_id),
      patientDao.findByIdForClinic(row.patient_id, row.clinica_id),
      userDao.findById(row.author_user_id),
    ]);

    const ml = 58;
    const cw = 595.28 - ml * 2; // content width ≈ 479pt

    const doc = new PDFDocument({
      size: 'A4',
      // compress:false — allows smoke-test hex extraction without a poppler dependency.
      compress: false,
      margins: { top: 56, bottom: 80, left: ml, right: ml },
      info: {
        Title: row.title,
        Producer: 'ClinicBridge',
        Creator: 'ClinicBridge',
      },
      autoFirstPage: true,
    });

    attachLegalFooter(doc);

    // ── 1. Clinic header ──────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#111111');
    doc.text(clinic?.nome ?? '—', ml, doc.y, { width: cw });
    if (clinic?.cnpj) {
      doc.font('Helvetica').fontSize(8.5).fillColor('#888888');
      doc.text(`CNPJ: ${clinic.cnpj}`, ml, doc.y, { width: cw });
    }
    doc.moveDown(0.3);
    drawHRule(doc, ml, cw, '#1a1a1a', 1.2);
    doc.moveDown(0.7);

    // ── 2. Document type title ────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#1a1a1a');
    doc.text(DOC_TYPE_LABEL[row.doc_type], ml, doc.y, { width: cw, align: 'center' });
    if (row.title && row.title !== DOC_TYPE_LABEL[row.doc_type]) {
      doc.font('Helvetica-Oblique').fontSize(11).fillColor('#555555');
      doc.text(row.title, ml, doc.y, { width: cw, align: 'center' });
    }
    doc.fillColor('#000000').moveDown(0.5);
    drawHRule(doc, ml, cw, '#cccccc', 0.5);
    doc.moveDown(0.6);

    // ── 3. Metadata box (shaded, bordered, 2-column) ──────────────────────────
    const boxPad = 12;
    const colW = (cw - 20) / 2;
    const rightX = ml + colW + 20;
    const metaBoxStartY = doc.y;
    const metaBoxH = 112;

    doc.rect(ml, metaBoxStartY, cw, metaBoxH).fill('#f1f3f8');
    doc.rect(ml, metaBoxStartY, cw, metaBoxH).strokeColor('#c5cede').lineWidth(0.6).stroke();
    doc.lineWidth(1);
    doc.fillColor('#000000');

    // Left column — Paciente + Profissional
    let lY = metaBoxStartY + boxPad;

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#9090a8');
    doc.text('PACIENTE', ml + boxPad, lY, { width: colW - boxPad });
    lY = doc.y + 2;
    doc.font('Helvetica').fontSize(11).fillColor('#111111');
    doc.text(patient?.nome ?? '—', ml + boxPad, lY, { width: colW - boxPad });
    lY = doc.y;
    if (patient?.data_nascimento) {
      doc.font('Helvetica').fontSize(8.5).fillColor('#777777');
      doc.text(
        `Nasc.: ${formatDateOnlyBR(patient.data_nascimento as unknown as Date)}`,
        ml + boxPad, lY + 2, { width: colW - boxPad },
      );
      lY = doc.y + 2;
    }
    lY += 9;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#9090a8');
    doc.text('PROFISSIONAL', ml + boxPad, lY, { width: colW - boxPad });
    lY = doc.y + 2;
    doc.font('Helvetica').fontSize(11).fillColor('#111111');
    doc.text(author?.nome ?? '—', ml + boxPad, lY, { width: colW - boxPad });

    // Right column — Data de emissão + Tipo + Atendimento
    let rY = metaBoxStartY + boxPad;

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#9090a8');
    doc.text('DATA DE EMISSÃO', rightX, rY, { width: colW - boxPad });
    rY = doc.y + 2;
    doc.font('Helvetica').fontSize(11).fillColor('#111111');
    doc.text(formatDateBR(row.finalized_at), rightX, rY, { width: colW - boxPad });
    rY = doc.y + 10;

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#9090a8');
    doc.text('TIPO DE DOCUMENTO', rightX, rY, { width: colW - boxPad });
    rY = doc.y + 2;
    doc.font('Helvetica').fontSize(10.5).fillColor('#111111');
    doc.text(DOC_TYPE_LABEL[row.doc_type], rightX, rY, { width: colW - boxPad });

    if (row.encounter_id) {
      rY = doc.y + 8;
      doc.font('Helvetica').fontSize(8.5).fillColor('#999999');
      doc.text(
        `Atendimento: #${shortenId(row.encounter_id)}`,
        rightX, rY, { width: colW - boxPad },
      );
    }

    // Advance cursor past metadata box
    doc.y = metaBoxStartY + metaBoxH + 16;
    doc.fillColor('#000000');

    // ── 4. Content section ────────────────────────────────────────────────────
    // Label strip with subtle background — acts as section header
    const labelStripH = 20;
    const labelY = doc.y;
    doc.rect(ml, labelY, cw, labelStripH).fill('#e8ebf2');
    doc.rect(ml, labelY, cw, labelStripH).strokeColor('#c5cede').lineWidth(0.5).stroke();
    doc.lineWidth(1);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#555570');
    doc.text('CONTEÚDO DO DOCUMENTO', ml + boxPad, labelY + 6, { width: cw - boxPad * 2 });
    doc.fillColor('#000000');

    // Body area — min 200pt so short content still fills the page properly
    const bodyAreaY = labelY + labelStripH + 12;
    doc.y = bodyAreaY;

    doc.font('Helvetica').fontSize(11).fillColor('#111111');
    if (row.body && row.body.trim().length > 0) {
      doc.text(row.body, ml, doc.y, { width: cw, align: 'left', lineGap: 2 });
    } else {
      doc.fillColor('#bbbbbb').text('(documento sem conteúdo registrado)', ml, doc.y, { width: cw });
      doc.fillColor('#111111');
    }

    const contentMinEndY = bodyAreaY + 200;
    if (doc.y < contentMinEndY) doc.y = contentMinEndY;

    doc.moveDown(0.5);
    drawHRule(doc, ml, cw, '#dddddd', 0.4);
    doc.moveDown(0.4);

    // ── 5. Per-type structured metadata ───────────────────────────────────────
    renderMetadata(doc, ml, cw, row.doc_type, row.metadata_json);

    // ── 6. Signature block ────────────────────────────────────────────────────
    // All y-positions are derived from sigY before any rendering, so nothing
    // can ever cross another element regardless of PDFKit cursor behaviour.
    //
    // Visual order:  line → name → label → date
    //   ──────────────────────────────  (sigLineY)
    //   Smoke Profissional              (sigNameY  = sigLineY + 10)
    //   Assinatura do prof. resp.       (sigLabelY = sigLineY + 26)
    //   Data: ____/____/________        (sigDateY  = sigLineY + 40)
    //
    // sigMinY: keep block in the lower third (≥490pt).
    // sigUpperLimit: leave ≥90pt clear before the footer band.
    const footerBandY = 841.89 - 80 - 56 + 10; // ≈ 715pt
    const sigUpperLimit = footerBandY - 90;      // ≈ 625pt
    const sigMinY = 490;
    const sigLineY  = Math.min(Math.max(doc.y + 44, sigMinY), sigUpperLimit);
    const sigNameY  = sigLineY + 10;
    const sigLabelY = sigLineY + 26;
    const sigDateY  = sigLineY + 40;

    const sigLineLen = 280;
    const sigLineX = ml + (cw - sigLineLen) / 2;

    // 1. Line
    doc
      .moveTo(sigLineX, sigLineY)
      .lineTo(sigLineX + sigLineLen, sigLineY)
      .strokeColor('#555555')
      .lineWidth(0.6)
      .stroke();
    doc.lineWidth(1);

    // 2. Professional's name (below the line)
    doc.font('Helvetica').fontSize(10.5).fillColor('#111111');
    doc.text(author?.nome ?? '______________________________', ml, sigNameY, {
      width: cw,
      align: 'center',
      lineBreak: false,
    });

    // 3. Role label
    doc.font('Helvetica').fontSize(8.5).fillColor('#666666');
    doc.text('Assinatura do profissional responsável', ml, sigLabelY, {
      width: cw,
      align: 'center',
      lineBreak: false,
    });

    // 4. Date
    doc.text('Data: ____/____/________', ml, sigDateY, {
      width: cw,
      align: 'center',
      lineBreak: false,
    });

    // ── 7. Legal footer — page 1 ──────────────────────────────────────────────
    // pageAdded fires only for pages 2+; draw explicitly for page 1.
    drawFooterOnPage(doc);

    doc.end();

    const filename = `documento-${shortenId(row.id)}.pdf`;
    return { stream: doc as unknown as Readable, filename };
  },
};
