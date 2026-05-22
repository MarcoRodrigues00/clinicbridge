// Token persistence for the ClinicBridge frontend.
//
// MVP choice: we keep the JWT in localStorage so the session survives reloads
// with the least moving parts. This is intentionally temporary — a hardened
// setup would move the token to an httpOnly cookie (or a server-side session
// strategy) so JavaScript can't read it and XSS can't exfiltrate it.
//
// Rules enforced here:
// - only the token is ever stored (never the password, never raw PII);
// - all access goes through these helpers so the storage strategy can be
//   swapped in one place later.

const TOKEN_KEY = 'clinicbridge.token';

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    // Storage can throw in private mode / disabled storage. Treat as no token.
    return null;
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // If we can't persist, the session simply won't survive a reload.
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to do — treat as already cleared.
  }
}
