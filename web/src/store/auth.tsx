import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../api/client';

export interface User {
  id: number;
  username: string;
  name: string;
  phone?: string;
  email?: string;
  roleId?: number;
  roleCode?: string;
  roleName?: string;
  dataScope?: string;
  departmentId?: number;
  departmentName?: string;
  permissions: string[];
  lastLoginAt?: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  hasPerm: (perm?: string) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try {
      const me = await api.get<User>('/api/auth/me');
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>('/api/auth/login', { username, password });
    setToken(res.token);
    setUser(res.user);
    setLoading(false);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/api/auth/logout'); } catch { /* ignore */ }
    setToken('');
    setUser(null);
    location.href = '/login';
  }, []);

  const hasPerm = useCallback((perm?: string) => {
    if (!perm) return true;
    if (!user) return false;
    const perms = user.permissions || [];
    if (perms.includes('*') || perms.includes(perm)) return true;
    const [mod] = perm.split('.');
    return perms.includes(`${mod}.*`);
  }, [user]);

  const value = useMemo(() => ({ user, loading, login, logout, hasPerm, refreshUser: loadMe }), [user, loading, login, logout, hasPerm, loadMe]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
