// Manual/assisted reminders for the Administrative Schedule (Sprint 3.18).
//
// IMPORTANT — these helpers only PREPARE a neutral, administrative reminder for a
// HUMAN to copy/send. There is NO automatic sending, NO WhatsApp official API, NO
// job/cron/queue. The message is intentionally NEUTRAL: it must NEVER contain
// clinical data (diagnosis/treatment/medication/exam/record), the professional's
// name/role/specialty label, administrative_notes, CPF, e-mail or any sensitive
// area. Only patient name, clinic name, date and time + a neutral confirm/reschedule
// instruction. WhatsApp official API stays out of scope (future ADR/sprint).

export interface ReminderParts {
  nome: string;
  clinica: string;
  data: string;
  hora: string;
}

// Neutral reminder template. Do NOT add professional/specialty/notes/clinical text.
export function buildReminderMessage(parts: ReminderParts): string {
  return (
    `Olá, ${parts.nome}! Passando para lembrar do seu atendimento agendado na ` +
    `${parts.clinica} para ${parts.data} às ${parts.hora}. Para confirmar ou ` +
    `remarcar, responda esta mensagem ou entre em contato com a clínica.`
  );
}

// Formats a date-only string (YYYY-MM-DD) as DD/MM/YYYY without building a Date,
// so it never shifts a day across time zones.
export function formatReminderDate(isoOrDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoOrDate);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : isoOrDate;
}

// Extracts HH:MM in UTC from an ISO timestamp. The agenda stores/handles times in
// UTC in the MVP, so this shows the same digits the user typed.
export function formatReminderTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// Normalizes a phone for wa.me. Returns digits with a BR country code, or null when
// the number is missing/invalid. Never stores or edits the patient's phone.
//  - strips non-digits
//  - already has DDI 55 + 10/11 local digits (len 12/13) -> keep
//  - 10/11 digits (BR local, no DDI) -> prefix 55
//  - anything else -> null (too short/long/invalid)
export function normalizeWhatsappPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return null;
}

// Builds a wa.me URL with the message pre-filled, or null when the phone is invalid.
// The human still chooses to send — this only opens WhatsApp with the draft.
export function buildWhatsappUrl(
  rawPhone: string | null | undefined,
  message: string,
): string | null {
  const phone = normalizeWhatsappPhone(rawPhone);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
