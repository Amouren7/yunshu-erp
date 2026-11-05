const TOKEN_KEY = 'erp_token';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(token: string) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiClientError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Params = Record<string, any> | undefined;

export function buildQuery(params?: Params): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) sp.set(k, v.join(','));
    else sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

async function request<T = any>(method: string, path: string, body?: any, params?: Params): Promise<T> {
  const url = path + buildQuery(params);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    throw new ApiClientError('网络连接失败，请检查服务是否启动', 0);
  }
  let payload: any = null;
  const text = await res.text();
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }

  if (res.status === 401) {
    setToken('');
    if (!location.pathname.startsWith('/login')) {
      location.href = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
    }
    throw new ApiClientError('登录已过期，请重新登录', 401, 'UNAUTHORIZED');
  }
  if (!res.ok || (payload && payload.success === false)) {
    throw new ApiClientError(payload?.message || `请求失败（${res.status}）`, res.status, payload?.code);
  }
  return (payload?.data ?? payload) as T;
}

export const api = {
  get: <T = any>(path: string, params?: Params) => request<T>('GET', path, undefined, params),
  post: <T = any>(path: string, body?: any, params?: Params) => request<T>('POST', path, body, params),
  put: <T = any>(path: string, body?: any) => request<T>('PUT', path, body),
  patch: <T = any>(path: string, body?: any) => request<T>('PATCH', path, body),
  del: <T = any>(path: string) => request<T>('DELETE', path),
};

/** 下载/打开文件（带 token 的 URL） */
export function fileUrl(path: string, params?: Params) {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${buildQuery(params).replace(/^\?/, sep === '?' ? '?' : '&')}${buildQuery(params) ? '&' : ''}token=${getToken()}`.replace(/[?&]+$/, '');
}
