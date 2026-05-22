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

interface AuthContextValue {
  loading: boolean;
  authenticated: boolean;
  user: SafeUser | null;
  clinic: PublicClinic | null;
  login: (email: string, senha: string) => Promise<void>;
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
    async (email: string, senha: string) => {
      const res = await api.login({ email, senha });
      setToken(res.token);
      // Login returns the user but not the clinic, so resolve the full session
      // via /auth/me. If that round-trip fails for a non-auth reason, fall back
      // to the user we already have from the login response.
      try {
        await refreshMe();
      } catch {
        setUser(res.user);
      }
    },
    [refreshMe],
  );

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const value: AuthContextValue = {
    loading,
    authenticated: user !== null,
    user,
    clinic,
    login,
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
