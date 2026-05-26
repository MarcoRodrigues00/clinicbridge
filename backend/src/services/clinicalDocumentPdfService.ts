import PDFDocument from 'pdfkit';
import type { Readable } from 'stream';
import { clinicDao } from '../dao/clinicDao';
import { patientDao } from '../dao/patientDao';
import { userDao } from '../dao/userDao';
import type {
  ClinicalDocumentRow,
  ClinicalDocumentType,
} from '../types/db';

// Clinical document PDF generation service (Sprint 4.3B; ADR 0011 §10).
//
// IMPORTANT — this module is invoked ONLY AFTER:
//   1. The document has been verified as status='finalized' (caller: service).
//   2. The PDF-DOWNLOAD audit has been persisted in STRICT mode (caller: service).
// It receives the document row as-is and must return a stream the controller
// can pipe to the HTTP response. The module DOES NOT decide authorization,
// DOES NOT emit audit (caller already did), and DOES NOT persist anything.
//
// Output format: A4 portrait, single-pass write, streamed (no buffering of the
// full PDF in memory before response start). Uses pdfkit standard fonts
// (Helvetica family — built into the binary, no font file lookups).
//
// MANDATORY LEGAL FOOTER — ADR 0011 §10.2. The text is fixed by ADR 0011 and
// must appear verbatim on every page of every clinical-document PDF. Removing
// or editing this footer is a regulatory-risk change and requires reopening
// ADR 0011.

const MANDATORY_LEGAL_FOOTER =
  'Este documento foi gerado pelo ClinicBridge e não possui assinatura digital ' +
  'ICP-Brasil. A validade jurídica plena pode exigir assinatura física do ' +
  'profissional responsável ou assinatura digital com certificado válido ' +
  '(ICP-Brasil/CFM). Não é uma prescrição eletrônica legalmente válida.';

const DOC_TYPE_LABEL: Record<ClinicalDocumentType, string> = {
  receipt_simple: 'Receita simples',
  attestation: 'Atestado médico',
  declaration: 'Declaração de comparecimento',
  exam_request: 'Solicitação de exame',
  orientation: 'Orientação clínica',
};

function formatDateBR(date: Date | null): string {
  if (!date) return '-';
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hour}:${min}`;
}

function formatDateOnlyBR(value: string | Date | null): string {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function shortenId(id: string): string {
  // First 8 chars of the UUID — used in filenames and the encounter linkage line.
  return id.replace(/-/g, '').slice(0, 8);
}

// Renders structured per-type metadata fields. Only fields that exist in
// metadata_json are rendered; missing fields are silently skipped — the
// per-type contract is operator-defined in the UI (no DB CHECK on shape).
function renderMetadata(
  doc: PDFKit.PDFDocument,
  type: ClinicalDocumentType,
  metadata: Record<string, unknown> | null,
): void {
  if (!metadata) return;
  const lines: string[] = [];

  function asString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
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
    if (st || et) {
      lines.push(`Horário: ${st ?? '-'} às ${et ?? '-'}`);
    }
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
  // 'orientation' has no structured fields by ADR 0011 §3.1; everything goes
  // into body.

  if (lines.length === 0) return;
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(11).text('Detalhes');
  doc.font('Helvetica').fontSize(10);
  for (const line of lines) {
    doc.text(line, { align: 'left' });
  }
}

// Adds the mandatory legal footer at the bottom of every page. Called via
// pdfkit's pageAdded event so it survives multi-page documents.
function attachLegalFooter(doc: PDFKit.PDFDocument): void {
  const draw = (): void => {
    const { bottom } = doc.page.margins;
    // Save current state so the footer doesn't pollute the cursor of ongoing
    // text flows on the page.
    doc.save();
    doc.fontSize(8).fillColor('#444444').font('Helvetica-Oblique');
    // Place the footer text block in the bottom margin band.
    const footerHeight = 50;
    const y = doc.page.height - bottom - footerHeight + 10;
    const x = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.text(MANDATORY_LEGAL_FOOTER, x, y, { width, align: 'justify' });
    doc.restore();
  };
  doc.on('pageAdded', draw);
  // pdfkit emits 'pageAdded' only for subsequent pages. Draw on the first page
  // explicitly after the body is written — done by the caller via finalizeFooter.
}

// Build a one-page-or-more PDF for a finalized clinical document. The returned
// stream is the pdfkit PDFDocument itself (Readable). The caller is responsible
// for setting HTTP headers and piping to the response.
//
// NOTE on streaming: pdfkit begins emitting bytes as you draw. We call
// `doc.end()` synchronously after all content is written — the consumer of
// the stream will receive everything and then EOF. There is no buffering of
// the full PDF in memory.
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

    // Resolve administrative metadata for the PDF header — clinic, patient
    // and author. These ARE administrative reads (no clinical content), so
    // they do NOT emit clinical_read_audit rows. The PDF-download audit was
    // already persisted by the caller (clinicalDocumentService.getForPdf).
    const [clinic, patient, author] = await Promise.all([
      clinicDao.findById(row.clinica_id),
      patientDao.findByIdForClinic(row.patient_id, row.clinica_id),
      userDao.findById(row.author_user_id),
    ]);

    const doc = new PDFDocument({
      size: 'A4',
      // Uncompressed streams (v0.1). This makes content streams readable without
      // a decompressor, allowing smoke-test validation of the mandatory legal
      // footer (ADR 0011 §10.2) without a poppler/pdftotext dependency.
      // Tradeoff: slightly larger PDFs. Acceptable for on-demand, non-stored docs.
      compress: false,
      // Margins leave room for header AND a footer band for the legal notice.
      margins: { top: 60, bottom: 70, left: 60, right: 60 },
      // Subject/title go into the PDF metadata. Author intentionally OMITTED
      // (would leak `nome` of the professional into PDF metadata, which is
      // not redacted by clients and not necessary for the document itself).
      info: {
        Title: row.title,
        Producer: 'ClinicBridge',
        Creator: 'ClinicBridge',
      },
      autoFirstPage: true,
    });

    attachLegalFooter(doc);

    // ----- Header (clinic identification) ---------------------------------
    doc.font('Helvetica-Bold').fontSize(14);
    doc.text(clinic?.nome ?? '—', { align: 'left' });
    doc.font('Helvetica').fontSize(9).fillColor('#555555');
    const clinicMeta: string[] = [];
    if (clinic?.cnpj) clinicMeta.push(`CNPJ: ${clinic.cnpj}`);
    if (clinicMeta.length) doc.text(clinicMeta.join('  ·  '));
    doc.moveDown(0.5);

    // Separator line.
    doc.fillColor('#000000');
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor('#cccccc')
      .stroke();
    doc.moveDown(0.6);

    // ----- Title block ----------------------------------------------------
    doc.font('Helvetica-Bold').fontSize(16);
    doc.text(`${DOC_TYPE_LABEL[row.doc_type]}`, { align: 'center' });
    doc.font('Helvetica').fontSize(11);
    if (row.title && row.title !== DOC_TYPE_LABEL[row.doc_type]) {
      doc.text(row.title, { align: 'center' });
    }
    doc.moveDown(0.8);

    // ----- Metadata block (issuance + people) -----------------------------
    doc.font('Helvetica-Bold').fontSize(10).text('Emissão');
    doc.font('Helvetica').fontSize(10);
    doc.text(`Data: ${formatDateBR(row.finalized_at)}`);
    if (row.encounter_id) {
      doc.text(`Atendimento vinculado: #${shortenId(row.encounter_id)}`);
    }

    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').text('Paciente');
    doc.font('Helvetica');
    doc.text(`Nome: ${patient?.nome ?? '—'}`);
    if (patient?.data_nascimento) {
      doc.text(`Data de nascimento: ${formatDateOnlyBR(patient.data_nascimento)}`);
    }
    // CPF intentionally NOT included in v0.1 (ADR 0011 §10.3). Operator may
    // include it in body if the document type requires.

    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').text('Profissional');
    doc.font('Helvetica');
    doc.text(`Nome: ${author?.nome ?? '—'}`);
    // Registro profissional não existe ainda como campo estruturado em
    // users — a UI futura pode coletar; o profissional pode usar `body`
    // ou a área de assinatura manual abaixo. Omissão intencional aqui.

    doc.moveDown(0.6);
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor('#cccccc')
      .stroke();
    doc.moveDown(0.6);

    // ----- Body (clinical content) ----------------------------------------
    doc.font('Helvetica-Bold').fontSize(11).text('Conteúdo');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(11);
    if (row.body && row.body.trim().length > 0) {
      doc.text(row.body, { align: 'left' });
    } else {
      doc.fillColor('#888888').text('(documento sem corpo)');
      doc.fillColor('#000000');
    }

    // ----- Structured per-type fields ------------------------------------
    renderMetadata(doc, row.doc_type, row.metadata_json);

    // ----- Manual signature block ----------------------------------------
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(11);
    // Signature line + label.
    const signatureLineWidth = 260;
    const signatureLineX =
      (doc.page.width - signatureLineWidth) / 2;
    doc
      .moveTo(signatureLineX, doc.y + 30)
      .lineTo(signatureLineX + signatureLineWidth, doc.y + 30)
      .strokeColor('#222222')
      .stroke();
    doc.moveDown(2);
    doc.fontSize(10).fillColor('#222222');
    doc.text(author?.nome ?? '__________________________________', { align: 'center' });
    doc.text('Assinatura do profissional responsável', { align: 'center' });
    doc.moveDown(0.5);
    doc.text('Data: ___ / ___ / ______', { align: 'center' });

    // Draw the legal footer on the FIRST page now (pageAdded only fires for
    // subsequent pages). Save/restore protects current text cursor.
    {
      const drawFooterNow = (): void => {
        const { bottom } = doc.page.margins;
        doc.save();
        doc.fontSize(8).fillColor('#444444').font('Helvetica-Oblique');
        const footerHeight = 50;
        const y = doc.page.height - bottom - footerHeight + 10;
        const x = doc.page.margins.left;
        const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        doc.text(MANDATORY_LEGAL_FOOTER, x, y, { width, align: 'justify' });
        doc.restore();
      };
      drawFooterNow();
    }

    doc.end();

    const filename = `documento-${shortenId(row.id)}.pdf`;
    return {
      stream: doc as unknown as Readable,
      filename,
    };
  },
};
