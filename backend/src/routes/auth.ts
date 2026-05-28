import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authRateLimit } from '../middlewares/authRateLimit';
import { requireAuth } from '../middlewares/requireAuth';
import { asyncHandler } from '../utils/asyncHandler';

export const authRouter = Router();

// Rate limit is scoped to /auth/* only — global limiting is intentionally
// deferred until other endpoints (upload, exports) ship in later sprints.
authRouter.use('/auth', authRateLimit);

authRouter.post('/auth/register', asyncHandler(authController.register));
authRouter.post('/auth/login', asyncHandler(authController.login));

// Guided demo (Sprint 5.0E). Env-gated (ALLOW_DEMO_LOGIN) and production-refused
// in the service. No credentials in the body — issues a session for the fixed
// pre-seeded demo owner only. Shares the /auth/* rate limiter above.
authRouter.post('/auth/demo-login', asyncHandler(authController.demoLogin));

// MFA (Sprint 3.19). All under /auth/* so the authRateLimit above applies.
// verify-login uses the challenge token in the body (no requireAuth yet); the
// others require an authenticated session.
authRouter.post('/auth/mfa/verify-login', asyncHandler(authController.verifyMfaLogin));
authRouter.post('/auth/mfa/setup', requireAuth, asyncHandler(authController.mfaSetup));
authRouter.post('/auth/mfa/confirm', requireAuth, asyncHandler(authController.mfaConfirm));
authRouter.get('/auth/mfa/status', requireAuth, asyncHandler(authController.mfaStatus));
authRouter.post('/auth/mfa/disable', requireAuth, asyncHandler(authController.mfaDisable));
// Backup codes (Sprint 3.21): regenerate requires an authenticated session AND a
// valid current TOTP code (checked in the service). Initial codes are issued by
// /auth/mfa/confirm. There is no GET that returns codes — they are shown once.
authRouter.post(
  '/auth/mfa/backup-codes/regenerate',
  requireAuth,
  asyncHandler(authController.regenerateMfaBackupCodes),
);
// /auth/me intentionally does NOT compose requireClinic: admin_sistema users
// have no clinic and the service safely returns clinic:null in that case.
// Future tenant-scoped routes (patients, imports, exports) MUST add
// requireClinic after requireAuth.
authRouter.get('/auth/me', requireAuth, asyncHandler(authController.me));
