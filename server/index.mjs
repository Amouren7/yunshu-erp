import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { migrate, isSeeded } from './db.mjs';
import { authenticate } from './auth.mjs';
import { createRouter, json, ok, fail, ApiError, readBody, pathnameOf, query } from './http.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const WEB_DIST = path.join(ROOT, 'web', 'dist');
const PORT = Number(process.env.ERP_PORT || 8787);

migrate();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
};

const router = createRouter();

// 公共路由
router.get('/api/health', async () => ({
  status: 'ok',
  name: '云枢ERP',
  version: '1.0.0',
  time: new Date().toISOString(),
  seeded: isSeeded(),
}), { public: true });

// 自动加载 server/api/*.mjs，每个模块导出 register(router)
const apiDir = path.join(__dirname, 'api');
const files = fs.existsSync(apiDir) ? fs.readdirSync(apiDir).filter((f) => f.endsWith('.mjs')) : [];
for (const f of files.sort()) {
  const mod = await import(pathToFileURL(path.join(apiDir, f)).href);
  if (typeof mod.register === 'function') {
    mod.register(router);
    console.log(`[api] 已挂载 ${f}`);
  }
}

function sendFile(res, filePath, isAsset) {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
      'Content-Length': data.length,
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const pathname = pathnameOf(req);

  try {
    if (pathname.startsWith('/api/')) {
      const matched = router.match(req.method, pathname);
      if (!matched) { fail(res, 404, `接口不存在: ${req.method} ${pathname}`, 'NOT_FOUND'); return; }
      const { route, params } = matched;
      const auth = authenticate(req);
      const ctx = {
        req, res, params, query: query(req),
        user: auth.user, token: auth.token,
        body: {},
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      };
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        ctx.body = await readBody(req);
      }
      if (!route.opts.public && !auth.user) {
        fail(res, 401, '登录状态已失效，请重新登录', 'UNAUTHORIZED');
        return;
      }
      if (route.opts.perm && auth.user) {
        const required = route.opts.perm;
        const perms = auth.user.permissions || [];
        const isAdmin = perms.includes('*');
        const list = Array.isArray(required) ? required : [required];
        const allowed = isAdmin || list.some((r) => perms.includes(r) || perms.includes(r.split('.')[0] + '.*'));
        if (!allowed) throw new ApiError(`无访问权限（需要 ${list.join(' 或 ')}）`, 403, 'FORBIDDEN');
      }
      const result = await route.handler(ctx);
      if (!res.writableEnded) {
        if (result && typeof result === 'object' && result.__file) {
          res.writeHead(200, { 'Content-Type': MIME[result.__file.ext] || 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(result.__file.name)}` });
          res.end(result.__file.buffer);
        } else {
          ok(res, result === undefined ? null : result);
        }
      }
      return;
    }

    // 静态资源
    let filePath = path.join(WEB_DIST, decodeURIComponent(pathname));
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(WEB_DIST))) { fail(res, 403, '禁止访问'); return; }
    if (pathname === '/' || pathname === '') filePath = path.join(WEB_DIST, 'index.html');

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const isAsset = pathname.startsWith('/assets/');
      if (sendFile(res, filePath, isAsset)) return;
    }
    // SPA fallback
    const index = path.join(WEB_DIST, 'index.html');
    if (fs.existsSync(index)) {
      if (sendFile(res, index, false)) return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>云枢ERP</title></head>
<body style="font-family:system-ui;padding:40px">
<h2>云枢ERP 服务已启动</h2>
<p>前端尚未构建。开发模式请运行 <code>npm run dev</code>，生产模式请先 <code>npm run build</code> 再访问本页。</p>
<p>API 健康检查：<a href="/api/health">/api/health</a></p>
</body></html>`);
  } catch (err) {
    const status = err?.status || 500;
    if (status >= 500) console.error('[error]', err);
    fail(res, status, err?.message || '服务器内部错误', err?.code || 'INTERNAL_ERROR');
  } finally {
    if (pathname.startsWith('/api/') && Date.now() - started > 1500) {
      console.log(`[slow] ${req.method} ${pathname} ${Date.now() - started}ms`);
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   云枢ERP · Yunshu ERP  v1.0.0               ║');
  console.log(`  ║   API 服务: http://127.0.0.1:${PORT}            ║`);
  console.log(`  ║   数据文件: server/data/erp.db                ║`);
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
});

process.on('SIGINT', () => { console.log('\n服务已停止'); process.exit(0); });
