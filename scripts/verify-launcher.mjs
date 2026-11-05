/** 校验 Windows 启动脚本健康度：node scripts/verify-launcher.mjs
 *  - 必须存在、大小合理
 *  - 必须使用 CRLF 换行（LF-only 会导致 cmd 闪退）
 *  - 必须包含 node scripts\boot.mjs 与 pause 兜底
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, '启动ERP.cmd');
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  [PASS] ${name}${detail ? ' — ' + detail : ''}`);
  else { fail++; console.log(`  [FAIL] ${name}${detail ? ' — ' + detail : ''}`); }
};

if (!fs.existsSync(FILE)) {
  console.log('[FAIL] 启动ERP.cmd 不存在，请运行 node scripts/make-launcher.mjs 生成');
  process.exit(1);
}
const buf = fs.readFileSync(FILE);
const text = buf.toString('utf8');
const crlf = (text.match(/\r\n/g) || []).length;
const lf = (text.match(/\n/g) || []).length;

console.log('校验启动脚本:', FILE);
ok('文件存在且非空', buf.length > 200, `${buf.length} 字节`);
ok('使用 CRLF 换行', crlf > 10 && crlf === lf, `CRLF=${crlf} / LF=${lf}`);
ok('无 UTF-8 BOM', buf[0] !== 0xef, 'BOM 会让 cmd 首行解析失败');
ok('包含 boot 调用', /node scripts\\boot\.mjs/.test(text));
ok('包含 pause 兜底', /pause\s*>nul/i.test(text));
ok('包含 Node 未安装提示', /NO_NODE/.test(text));

console.log(fail ? `\n发现 ${fail} 个问题：请运行 node scripts/make-launcher.mjs 重新生成。` : '\n启动脚本健康 ✓');
process.exit(fail ? 1 : 0);
