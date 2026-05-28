// Guided demo mode (Sprint 5.0E). Centralizes the front-end "demo" detection and
// the write-block that keeps the synthetic demo tenant clean during a presentation.
//
// IMPORTANT: this is a UX guardrail for a controlled demo, NOT a security control.
// The demo tenant is 100% synthetic and isolated; a direct API call could still
// mutate it. Backend read-only enforcement for a PUBLIC demo is future work.

export const DEMO_CLINIC_NAME = 'Clínica Demo Aurora';

export const DEMO_BLOCKED_MESSAGE =
  'Na demonstração, esta ação fica bloqueada para manter os dados de exemplo limpos. ' +
  'No uso real, sua clínica poderá executar essa ação.';

// Dispatched on window whenever a write is blocked, so a single global listener
// can surface the humanized message regardless of which panel triggered it.
export const DEMO_BLOCKED_EVENT = 'cb:demo-action-blocked';

let demoWriteBlock = false;

export function setDemoWriteBlock(active: boolean): void {
  demoWriteBlock = active;
}

export function isDemoWriteBlock(): boolean {
  return demoWriteBlock;
}

// Endpoints that stay allowed even while the block is active (the demo session
// itself must be able to start; reads are never blocked here).
const ALLOWED_WRITE_PATHS = ['/auth/demo-login'];

export function isWriteBlockedInDemo(path: string, method: string): boolean {
  if (!demoWriteBlock) return false;
  const m = method.toUpperCase();
  const isWrite = m === 'POST' || m === 'PATCH' || m === 'PUT' || m === 'DELETE';
  if (!isWrite) return false;
  if (ALLOWED_WRITE_PATHS.some((p) => path.startsWith(p))) return false;
  return true;
}

export function notifyDemoBlocked(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DEMO_BLOCKED_EVENT));
  }
}
