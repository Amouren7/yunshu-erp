#!/usr/bin/env node
/** 开发模式：同时启动 API 服务（8787）与 Vite 开发服务器（5173） */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];

function start(name, args, color) {
  const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  child.stdout.on('data', (d) => process.stdout.write(prefix + d.toString().replace(/\n/g, `\n${prefix}`).trimEnd() + '\n'));
  child.stderr.on('data', (d) => process.stderr.write(prefix + d.toString().trimEnd() + '\n'));
  child.on('exit', (code) => console.log(`${name} 退出，code=${code}`));
  children.push(child);
}

start('api', ['server/index.mjs'], '36');
start('web', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5173'], '35');

console.log('');
console.log('  \x1b[32m开发模式已启动\x1b[0m');
console.log('  前端（热更新）: http://127.0.0.1:5173');
console.log('  后端 API      : http://127.0.0.1:8787');
console.log('  生产模式访问  : http://127.0.0.1:8787 （需先 npm run build）');
console.log('');

function shutdown() {
  for (const c of children) { try { c.kill(); } catch { /* ignore */ } }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
