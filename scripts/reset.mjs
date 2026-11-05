/** 重置数据库并重新生成演示数据：npm run reset */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_DIR = path.join(ROOT, 'server', 'data');

if (fs.existsSync(DB_DIR)) {
  for (const f of fs.readdirSync(DB_DIR)) {
    if (f.startsWith('erp.db')) {
      fs.rmSync(path.join(DB_DIR, f), { force: true });
      console.log(`已删除 ${f}`);
    }
  }
}
console.log('开始重新生成演示数据...');
await import('../server/seed.mjs');
