#!/usr/bin/env node
/** 一键启动：检查依赖/数据/构建 → 启动服务 → 等待就绪 → 打开浏览器
 *  - 如果服务已经在运行：直接打开浏览器并退出（不会报端口占用）
 *  - 启动失败会打印明确原因并以非 0 退出，方便 bat 窗口停住显示
 */
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const PORT = Number(process.env.ERP_PORT || 8787);
const URL_BASE = `http://127.0.0.1:${PORT}`;

const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'boot.log');
try { if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ignore */ }
function log(line) {
  const text = `[${new Date().toLocaleString('zh-CN')}] ${line}`;
  console.log(line);
  try { appendFileSync(LOG_FILE, text + '\n', 'utf8'); } catch { /* ignore */ }
}

function run(cmd, args) {
  log(`\n▶ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: isWindows });
  return r.status === 0;
}

function openBrowser() {
  try {
    if (isWindows) spawn('cmd', ['/c', 'start', '', URL_BASE], { stdio: 'ignore', detached: true }).unref();
    else if (process.platform === 'darwin') spawn('open', [URL_BASE], { stdio: 'ignore', detached: true }).unref();
    else spawn('xdg-open', [URL_BASE], { stdio: 'ignore', detached: true }).unref();
    log(`已打开浏览器：${URL_BASE}`);
  } catch {
    log(`请手动在浏览器打开：${URL_BASE}`);
  }
}

async function probeHealth(timeoutMs = 1000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${URL_BASE}/api/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const body = await res.json();
    return body?.data || body;
  } catch {
    return null;
  }
}

log('╔══════════════════════════════════════════════╗');
log('║        云枢ERP · 一键启动程序                ║');
log('╚══════════════════════════════════════════════╝');

// 0) 已运行则直接打开浏览器
const existing = await probeHealth();
if (existing) {
  log(`\n检测到云枢ERP已在运行（端口 ${PORT}，版本 ${existing.version || '-'}）。`);
  openBrowser();
  log('演示账号：admin / admin123');
  log('\n无需重复启动，本窗口将关闭。');
  process.exit(0);
}

// 1) 依赖
if (!existsSync(path.join(ROOT, 'node_modules'))) {
  log('\n[1/4] 首次运行，安装依赖（约 20 秒）...');
  if (!run('npm', ['install', '--no-audit', '--no-fund'])) {
    log('\n[ERROR] 依赖安装失败，请检查 Node.js（>=22.5，需内置 node:sqlite）与网络后重试。');
    process.exit(1);
  }
} else {
  log('\n[1/4] 依赖已安装 ✓');
}

// 2) 数据库
const dbFile = path.join(ROOT, 'server', 'data', 'erp.db');
if (!existsSync(dbFile)) {
  log('\n[2/4] 未发现数据库，正在生成演示数据（约 10 秒）...');
  if (!run(process.execPath, ['server/seed.mjs'])) {
    log('\n[ERROR] 演示数据生成失败（详见上方输出，或 logs/boot.log）。');
    process.exit(1);
  }
} else {
  log('\n[2/4] 数据库已存在 ✓');
}

// 3) 前端构建
const distIndex = path.join(ROOT, 'web', 'dist', 'index.html');
if (!existsSync(distIndex)) {
  log('\n[3/4] 未发现前端构建产物，正在构建（约 20 秒）...');
  if (!run('npm', ['run', 'build'])) {
    log('\n[ERROR] 前端构建失败（详见上方输出）。');
    process.exit(1);
  }
} else {
  log('\n[3/4] 前端已构建 ✓');
}

// 4) 启动服务
log(`\n[4/4] 正在启动服务（端口 ${PORT}）...`);
const server = spawn(process.execPath, ['server/index.mjs'], {
  stdio: 'inherit', cwd: ROOT, env: { ...process.env, ERP_PORT: String(PORT) },
});

let opening = false;
let exited = false;
server.on('error', (err) => {
  log(`\n[ERROR] 无法启动 Node 服务：${err.message}`);
  process.exit(1);
});
server.on('exit', (code) => {
  exited = true;
  log(`\n服务进程已退出（code=${code ?? 0}）。`);
  if (code && code !== 0) log('请查看上方错误信息，或 logs/boot.log。');
  process.exit(code ?? 0);
});

// 轮询等待服务就绪，再打开浏览器
(async () => {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline && !exited) {
    const h = await probeHealth(1200);
    if (h) {
      if (!opening) {
        opening = true;
        log(`\n✔ 服务已就绪：${URL_BASE}`);
        log('  演示账号：admin / admin123');
        log('  按 Ctrl+C 可停止服务。\n');
        openBrowser();
      }
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!exited) {
    log(`\n[WARN] 服务在 25 秒内未就绪，请查看上面输出（常见原因：端口 ${PORT} 被占用）。`);
  }
})();

process.on('SIGINT', () => {
  log('\n正在停止服务...');
  try { server.kill(); } catch { /* ignore */ }
  process.exit(0);
});
