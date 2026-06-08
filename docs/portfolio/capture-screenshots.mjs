// ClinicBridge — portfolio screenshot capture (Playwright).
//
// Local / synthetic ONLY. Drives the running app against the "Clínica Demo Aurora"
// dataset and writes desktop (1440x900) + mobile (390x844) PNGs into the
// screenshots/ folder next to this file. Images are NEVER committed — the
// screenshots/.gitignore ignores *.png/*.jpg/*.webm/*.pdf etc.
//
// This script is tooling (text); it is safe to keep in the repo. It does NOT
// capture .env, tokens, secrets or terminals — only rendered app screens.
//
// ─────────────────────────────────────────────────────────────────────────────
// PREREQUISITES (one-time)
//   1. Infra + apps up (synthetic data):
//        docker compose up -d postgres
//        pnpm --filter backend migrate:latest
//        ALLOW_DEMO_SEED=true pnpm --filter backend seed:demo:full   # if not seeded
//      Backend (host dev) — demo login on, generous auth rate limit for capture:
//        ALLOW_DEMO_LOGIN=true AUTH_RATE_LIMIT_MAX=5000 pnpm --filter backend dev
//      Frontend — talk DIRECTLY to the host backend (bypass the nginx-edge proxy
//      that frontend/.env points at, when nginx is not running):
//        VITE_API_BASE_URL=http://localhost:3001 VITE_PORT=5174 pnpm --filter frontend dev
//
//   2. Playwright (kept OUT of the repo deps — install in a throwaway dir):
//        mkdir -p /tmp/cb-shots && cd /tmp/cb-shots
//        npm i playwright && npx playwright install chromium
//        cp <repo>/docs/portfolio/capture-screenshots.mjs .
//
// RUN
//   cd /tmp/cb-shots
//   OUT_DIR=<repo>/docs/portfolio/screenshots \
//   BASE_URL=http://localhost:5174 API_URL=http://localhost:3001 \
//   node capture-screenshots.mjs
//
// NOTES / GOTCHAS learned in practice:
//   - frontend/.env proxies /api → https://localhost:8443 (nginx edge). If nginx
//     is down, /auth/me 500s and /app bounces to /login. Override VITE_API_BASE_URL
//     to the backend directly (above), OR bring up the edge profile.
//   - /auth/* is rate limited (default 20 / 15 min / IP). Re-running capture a few
//     times can trip a 429; restart the backend with AUTH_RATE_LIMIT_MAX high.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium, request as pwRequest } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || 'http://localhost:5174';
const API = process.env.API_URL || 'http://localhost:3001';
const OUT = process.env.OUT_DIR || join(HERE, 'screenshots');
const TOKEN_KEY = 'clinicbridge.token';
mkdirSync(OUT, { recursive: true });

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gotoSafe(page, url) {
  try { await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 }); }
  catch { try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }); } catch {} }
  await sleep(1200);
}
async function shot(page, name) {
  try { await page.screenshot({ path: join(OUT, name), fullPage: true }); results.push(['OK ', name]); }
  catch (e) { results.push(['ERR', `${name} — ${e.message.split('\n')[0]}`]); }
}

// Nav buttons carry a stable data-tour-id="nav-<key>" — robust on desktop & mobile.
const TAB_KEY = {
  'Início': 'inicio', 'Pacientes': 'pacientes', 'Agenda': 'agenda', 'Financeiro': 'financeiro',
  'Relatórios': 'relatorios', 'Serviços': 'servicos', 'Convênios': 'convenios',
  'Estoque': 'estoque', 'Equipe': 'equipe', 'Segurança': 'seguranca',
};
async function clickTab(page, label) {
  const key = TAB_KEY[label];
  if (key) {
    try {
      const nav = page.locator(`[data-tour-id="nav-${key}"]`).first();
      if (await nav.count()) { await nav.scrollIntoViewIfNeeded().catch(() => {}); await nav.click({ timeout: 6000 }); await sleep(1300); return true; }
    } catch {}
  }
  try {
    const btn = page.getByRole('button', { name: label, exact: true }).first();
    if (await btn.count()) { await btn.click({ timeout: 5000 }); await sleep(1200); return true; }
  } catch {}
  results.push(['SKIP', `tab "${label}" not found`]);
  return false;
}

async function getDemoToken() {
  const ctx = await pwRequest.newContext();
  const res = await ctx.post(`${API}/auth/demo-login`, { headers: { 'content-type': 'application/json' } });
  const json = await res.json();
  await ctx.dispose();
  if (!json.token) throw new Error('demo-login returned no token (is ALLOW_DEMO_LOGIN=true and the demo seeded?)');
  return json.token;
}
async function authenticate(page, token) {
  await gotoSafe(page, BASE);
  await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [TOKEN_KEY, token]);
  await gotoSafe(page, `${BASE}/app`);
  try { await page.locator('[data-tour-id="nav-agenda"]').first().waitFor({ timeout: 10000 }); } catch {}
  await sleep(800);
}
async function tryAuri(page, name) {
  for (const re of [/Auri/i, /Ver tour/i, /tour/i, /ajuda/i]) {
    try { const b = page.getByRole('button', { name: re }).first(); if (await b.count()) { await b.click({ timeout: 4000 }); await sleep(1500); await shot(page, name); return; } } catch {}
  }
  await shot(page, name);
}

async function run() {
  const browser = await chromium.launch();
  const token = await getDemoToken();

  // DESKTOP 1440x900
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'pt-BR' });
  const d = await desktop.newPage();
  await gotoSafe(d, BASE);            await shot(d, '01-desktop-landing.png');
  await gotoSafe(d, `${BASE}/demo`);   await shot(d, '02-desktop-demo-login.png');
  await authenticate(d, token);        await shot(d, '03-desktop-dashboard.png');
  await clickTab(d, 'Agenda');         await shot(d, '04-desktop-agenda.png');
  await clickTab(d, 'Pacientes');      await shot(d, '05-desktop-pacientes.png');
  await clickTab(d, 'Financeiro');     await shot(d, '07-desktop-financeiro.png');
  await clickTab(d, 'Convênios');      await shot(d, '08-desktop-convenios.png');
  await clickTab(d, 'Estoque');        await shot(d, '09-desktop-estoque.png');
  await clickTab(d, 'Equipe');         await shot(d, '10-desktop-governanca.png');
  await clickTab(d, 'Segurança');      await shot(d, '12-desktop-security-docs.png');
  await clickTab(d, 'Início');         await tryAuri(d, '11-desktop-auri-onboarding.png');
  // Prontuário/Documentos live inside a patient detail — capture LAST.
  {
    let ok = false;
    try {
      await clickTab(d, 'Pacientes');
      const first = d.locator('[data-tour-id="patients-list"] button, [class*="patient"] button, table tbody tr, ul li button').first();
      if (await first.count()) {
        await first.click({ timeout: 4000 }); await sleep(1500);
        for (const re of [/Prontu/i, /Documento/i]) { const s = d.getByRole('button', { name: re }).first(); if (await s.count()) { await s.click({ timeout: 3000 }); await sleep(1200); break; } }
        await shot(d, '06-desktop-documentos-prontuario.png'); ok = true;
      }
    } catch {}
    if (!ok) results.push(['SKIP', '06 prontuário/documentos (no patient detail reachable) — capture manually']);
  }
  await desktop.close();

  // MOBILE 390x844
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' });
  const m = await mobile.newPage();
  await gotoSafe(m, BASE);            await shot(m, '01-mobile-landing.png');
  await gotoSafe(m, `${BASE}/demo`);   await shot(m, '02-mobile-demo-login.png');
  await authenticate(m, token);        await shot(m, '03-mobile-dashboard.png');
  await clickTab(m, 'Agenda');         await shot(m, '04-mobile-agenda.png');
  await clickTab(m, 'Pacientes');      await shot(m, '05-mobile-pacientes.png');
  await clickTab(m, 'Início');         await tryAuri(m, '06-mobile-auri-onboarding.png');
  await mobile.close();

  await browser.close();
  console.log('\n=== capture summary ===');
  for (const [s, n] of results) console.log(`  [${s}] ${n}`);
  console.log(`\nSaved to: ${OUT}  (images are gitignored — never committed)`);
}
run().catch((e) => { console.error('FATAL:', e); process.exit(1); });
