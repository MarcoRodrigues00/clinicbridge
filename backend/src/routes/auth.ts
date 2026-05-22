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
// /auth/me intentionally does NOT compose requireClinic: admin_sistema users
// have no clinic and the service safely returns clinic:null in that case.
// Future tenant-scoped routes (patients, imports, exports) MUST add
// requireClinic after requireAuth.
authRouter.get('/auth/me', requireAuth, asyncHandler(authController.me));
