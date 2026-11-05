import { URL } from 'node:url';

export class ApiError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

export function ok(res, data = null, extra = {}) {
  json(res, 200, { success: true, data, ...extra });
}

export function fail(res, status, message, code = 'ERROR') {
  json(res, status, { success: false, message, code });
}

export function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new ApiError('请求体过大', 413)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(new ApiError('JSON 格式错误', 400)); }
    });
    req.on('error', reject);
  });
}

/** 极简路由器：支持 '/api/items/:id' 形式路径参数 */
export function createRouter() {
  const routes = [];
  function add(method, pattern, handler, opts = {}) {
    const keys = [];
    const regex = new RegExp(
      '^' + pattern.replace(/\/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$'
    );
    routes.push({ method, pattern, regex, keys, handler, opts });
  }
  const router = {
    get: (p, h, o) => add('GET', p, h, o),
    post: (p, h, o) => add('POST', p, h, o),
    put: (p, h, o) => add('PUT', p, h, o),
    patch: (p, h, o) => add('PATCH', p, h, o),
    delete: (p, h, o) => add('DELETE', p, h, o),
    routes,
    match(method, pathname) {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.regex.exec(pathname);
        if (m) {
          const params = {};
          r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
          return { route: r, params };
        }
      }
      return null;
    },
  };
  return router;
}

export function query(req) {
  const url = new URL(req.url, 'http://localhost');
  const o = {};
  for (const [k, v] of url.searchParams.entries()) o[k] = v;
  return o;
}

export function pathnameOf(req) {
  return new URL(req.url, 'http://localhost').pathname;
}

export function num(v, def = 0) {
  if (v === undefined || v === null || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function paginate(req) {
  const q = query(req);
  const page = Math.max(1, parseInt(q.page || '1', 10) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(q.pageSize || '20', 10) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize, q };
}

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/** 排序字段白名单校验，防止注入 */
export function orderBy(raw, allowed, fallback) {
  const s = String(raw || '').trim();
  const m = /^([a-zA-Z_][a-zA-Z0-9_]*)(\s+(asc|desc))?$/i.exec(s);
  if (!m) return fallback;
  const col = m[1];
  if (!allowed.includes(col)) return fallback;
  const dir = (m[3] || 'desc').toUpperCase();
  return `${col} ${dir}`;
}

export function todayStr(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function periodOf(dateStr) {
  return String(dateStr || todayStr()).slice(0, 7);
}
