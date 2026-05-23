import { generateSecret, generateURI, verifySync } from 'otplib';
import qrcode from 'qrcode';

// TOTP wrapper (Sprint 3.19) over otplib v13 (+ qrcode). Local-only, no external
// service. The plaintext base32 secret is handled only here / in authService and
// is NEVER logged. App-authenticator (TOTP) only — no SMS, no e-mail OTP.

const ISSUER = 'ClinicBridge';
// Tolerance (seconds) for clock drift: accept the adjacent 30s step on each side.
const EPOCH_TOLERANCE = 30;

export const totpService = {
  // Base32 secret for an authenticator app.
  generateSecret(): string {
    return generateSecret();
  },

  // otpauth:// URI to render as a QR code / manual entry.
  otpauthUrl(accountLabel: string, secret: string): string {
    return generateURI({ issuer: ISSUER, label: accountLabel, secret });
  },

  // Verifies a user-provided 6-digit code against the secret. Returns false on any
  // error (never throws into the auth flow).
  verify(code: string, secret: string): boolean {
    const token = code.replace(/\D/g, '');
    if (token.length === 0) return false;
    try {
      return verifySync({ secret, token, epochTolerance: EPOCH_TOLERANCE }).valid;
    } catch {
      return false;
    }
  },

  // PNG data URL of the otpauth URI, so the frontend just renders an <img>.
  async qrDataUrl(otpauthUrl: string): Promise<string> {
    return qrcode.toDataURL(otpauthUrl);
  },
};
