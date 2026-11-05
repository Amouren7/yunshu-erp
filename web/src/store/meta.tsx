import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './auth';

export interface MetaData {
  app: { name: string; version: string; company: string };
  enums: Record<string, any[]>;
  docTypes: Record<string, any>;
  modules: { key: string; name: string }[];
  actions: { key: string; name: string }[];
  dicts: {
    uoms: any[];
    currencies: any[];
    taxRates: any[];
    itemCategories: any[];
    warehouses: any[];
    departments: any[];
    accounts: any[];
  };
  settings: Record<string, any>;
}

interface MetaContextValue {
  meta: MetaData | null;
  loading: boolean;
  refreshMeta: () => void;
  enumOf: (key: string) => any[];
  dict: (key: string) => any[];
  docType: (code: string) => any;
}

const MetaContext = createContext<MetaContextValue>(null as any);

export function MetaProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api.get<MetaData>('/api/meta')
      .then((m) => setMeta(m))
      .catch(() => setMeta(null))
      .finally(() => setLoading(false));
  }, [user, tick]);

  const value = useMemo<MetaContextValue>(() => ({
    meta,
    loading,
    refreshMeta: () => setTick((t) => t + 1),
    enumOf: (key: string) => (meta?.enums?.[key] as any[]) || [],
    dict: (key: string) => ((meta?.dicts as any)?.[key] as any[]) || [],
    docType: (code: string) => meta?.docTypes?.[code],
  }), [meta, loading]);

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export function useMeta() {
  return useContext(MetaContext);
}
