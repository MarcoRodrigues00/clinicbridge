import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, type PublicClinic, type SafeUser } from './api';
import { clearToken, getToken, setToken } from './authStorage';
import { DEMO_CLINIC_NAME, setDemoWriteBlock } from './demoMode';

export interface LoginAttemptResult {
  mfaRequired: boolean;
  challengeToken?: string;
}

interface AuthContextValue {
  loading: boolean;
  authenticated: boolean;
  user: SafeUser | null;
  clinic: PublicClinic | null;
  // True while the active session belongs to the synthetic demo clinic.
  isDemo: boolean;
  login: (email: string, senha: string) => Promise<LoginAttemptResult>;
  completeMfaLogin: (challengeToken: string, code: string) => Promise<void>;
  // Starts a guided-demo session (no credentials; backend env-gated).
  enterDemo: () => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SafeUser | null>(null);
  const [clinic, setClinic] = useState<PublicClinic | null>(null);

  const clearSession = useCallback(() => {
    clearToken();
    setUser(null);
    setClinic(null);
    setDemoWriteBlock(false);
  }, []);

  const refreshMe = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setClinic(null);
      return;
    }
    try {
      const me = await api.getMe(token);
      setUser(me.user);
      setClinic(me.clinic);
    } catch (err) {
      // A rejected/expired token must not leave a half-authenticated UI.
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        return;
      }
      // Network/other failures: surface to caller, keep existing state.
      throw err;
    }
  }, [clearSession]);

  // Bootstrap: if a token was persisted, validate it once on mount.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await refreshMe();
      } catch {
        // Transient failure on boot — stay logged out until the user retries.
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshMe]);

  const login = useCallback(
    async (email: string, senha: string): Promise<LoginAttemptResult> => {
      const res = await api.login({ email, senha });
      // MFA-enabled account: no token yet — the caller must collect a TOTP code
      // and call completeMfaLogin with the challenge. The challenge token stays in
      // the caller's state only (never persisted).
      if ('mfa_required' in res) {
        return { mfaRequired: true, challengeToken: res.mfa_challenge_token };
      }
      setToken(res.token);
      try {
        await refreshMe();
      } catch {
        setUser(res.user);
      }
      return { mfaRequired: false };
    },
    [refreshMe],
  );

  const completeMfaLogin = useCallback(
    async (challengeToken: string, code: string) => {
      const res = await api.verifyMfaLogin(challengeToken, code);
      setToken(res.token);
      try {
        await refreshMe();
      } catch {
        setUser(res.user);
      }
    },
    [refreshMe],
  );

  // Guided demo: starts a session for the fixed demo owner. The demo write-block
  // is armed by the effect below once the demo clinic loads.
  const enterDemo = useCallback(async () => {
    const res = await api.demoLogin();
    setToken(res.token);
    try {
      await refreshMe();
    } catch {
      setUser(res.user);
    }
  }, [refreshMe]);

  const isDemo = clinic?.nome === DEMO_CLINIC_NAME;

  // Keep the API-layer write-block in sync with the active tenant: armed only
  // while the demo clinic is loaded, disarmed on logout / real-clinic sessions.
  useEffect(() => {
    setDemoWriteBlock(isDemo);
  }, [isDemo]);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const value: AuthContextValue = {
    loading,
    authenticated: user !== null,
    user,
    clinic,
    isDemo,
    login,
    completeMfaLogin,
    enterDemo,
    logout,
    refreshMe,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return ctx;
}
