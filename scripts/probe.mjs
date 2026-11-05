/**
 * 边界与权限探针：找出真实存在的漏洞/边界 bug（隔离库，不影响演示数据）
 * 用法：node scripts/probe.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'server', 'data-probe');
const PORT = 8796;
const BASE = `http://127.0.0.1:${PORT}`;
const findings = [];
let pass = 0;
const out = (level, name, detail) => {
  if (level === 'BUG') findings.push({ name, detail });
  else pass++;
  console.log(`  [${level}] ${name}${detail ? ' — ' + detail : ''}`);
};

function run(cmd, args, env) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
    p.on('exit', (code) => resolve(code));
  });
}
function startServer() {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['server/index.mjs'], {
      cwd: ROOT, env: { ...process.env, ERP_DATA_DIR: DATA_DIR, ERP_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    p.stdout.on('data', (d) => { if (String(d).includes('API')) resolve(p); });
    setTimeout(() => resolve(p), 8000);
  });
}

let token = '';
async function call(method, pathname, body) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  return { status: res.status, body: payload?.data ?? payload, message: payload?.message };
}
const today = new Date().toISOString().slice(0, 10);
const login = async (u, p) => {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  const j = await r.json();
  return j?.data;
};

try {
  if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('准备隔离测试库...');
  const seedCode = await run(process.execPath, ['server/seed.mjs'], { ERP_DATA_DIR: DATA_DIR });
  if (seedCode !== 0) throw new Error('seed failed');
  const server = await startServer();

  try {
    const admin = await login('admin', 'admin123');
    token = admin.token;
    const customers = (await call('GET', '/api/masterdata/customers?pageSize=1')).body.rows[0];
    const items = (await call('GET', '/api/masterdata/items?pageSize=30')).body.rows;
    const fg = items.find((i) => i.item_type === '成品');
    const zeroItem = items.find((i) => i.item_type === '原料' && i.code === 'RM-LABEL01') || items.find((i) => i.code.startsWith('RM-'));
    const wh = (await call('GET', '/api/masterdata/warehouses?pageSize=10')).body.rows.find((w) => w.type === '成品仓');
    const rawWh = (await call('GET', '/api/masterdata/warehouses?pageSize=10')).body.rows.find((w) => w.type === '原料仓');

    // ---------- A. 超量发货 ----------
    console.log('\n【A. 超量发货（同一订单被两次发货）】');
    const so = await call('POST', '/api/documents', {
      doc_type: 'SO', doc_date: today, partner_id: customers.id, warehouse_id: wh.id,
      lines: [{ item_id: fg.id, qty: 10, price: fg.price_sale, tax_rate: 13 }],
    });
    await call('POST', `/api/documents/${so.body.id}/action`, { action: 'submit' });
    await call('POST', `/api/documents/${so.body.id}/action`, { action: 'approve' });
    const dn1 = await call('POST', '/api/documents', { doc_type: 'DN', doc_date: today, source_id: so.body.id });
    const dn2 = await call('POST', '/api/documents', { doc_type: 'DN', doc_date: today, source_id: so.body.id });
    const app1 = await call('POST', `/api/documents/${dn1.body.id}/action`, { action: 'submit' }).then(() => call('POST', `/api/documents/${dn1.body.id}/action`, { action: 'approve' }));
    const app2 = await call('POST', `/api/documents/${dn2.body.id}/action`, { action: 'submit' }).then(() => call('POST', `/api/documents/${dn2.body.id}/action`, { action: 'approve' }));
    if (app2.status === 200) out('BUG', '同一销售订单可被重复发货', `DN1=${dn1.body.doc_no} 已审核, DN2=${dn2.body.doc_no} 仍审核成功，超发 10 台`);
    else out('OK', '重复发货被拒绝', app2.message);

    // ---------- B. 超量核销 ----------
    console.log('\n【B. 收款超过发票余额】');
    const ar = await call('GET', `/api/finance/invoices?invoiceType=AR&partnerId=${customers.id}&pageSize=5`);
    const inv = (ar.body.rows || []).find((r) => r.status === '未收') || (ar.body.rows || [])[0];
    if (inv) {
      const over = Math.round((inv.total_amount - inv.paid_amount) * 100) / 100 + 1000;
      const rc = await call('POST', '/api/documents', { doc_type: 'RC', doc_date: today, partner_id: customers.id, lines: [{ invoice_id: inv.id, amount: over }] });
      let rcApprove = null;
      if (rc.status === 200) {
        await call('POST', `/api/documents/${rc.body.id}/action`, { action: 'submit' });
        rcApprove = await call('POST', `/api/documents/${rc.body.id}/action`, { action: 'approve' });
      }
      const invAfter = await call('GET', `/api/finance/invoices/${inv.id}`);
      if (rcApprove && rcApprove.status === 200) {
        const paid = Number(invAfter.body?.paid_amount || 0);
        out('BUG', '收款金额可超过发票余额', `发票应收 ${inv.total_amount}，收款输入 ${over}，审核成功；发票 paid_amount=${paid}（被截断）与收款单据/G/L 金额不一致`);
      } else out('OK', '超额核销被拒绝', rcApprove?.message || rc.message);
    }

    // ---------- C. 负库存开关 ----------
    console.log('\n【C. 不允许负库存 设置是否生效】');
    // 选一个在原料仓确实没有库存的物料（新建物料，确保 0 库存）
    const zeroItem2 = await call('POST', '/api/masterdata/items', { code: 'PROBE-ZERO-01', name: '探针零库存物料', item_type: '原料', uom: '个', price_purchase: 10 });
    const testItem = { id: zeroItem2.body.id, code: 'PROBE-ZERO-01' };
    await call('PUT', '/api/system/settings', { settings: { allow_negative_stock: '0' } });
    const oo = await call('POST', '/api/documents', {
      doc_type: 'OO', doc_date: today, warehouse_id: rawWh.id,
      lines: [{ item_id: testItem.id, qty: 5 }],
    });
    let ooApprove = null;
    if (oo.status === 200) {
      await call('POST', `/api/documents/${oo.body.id}/action`, { action: 'submit' });
      ooApprove = await call('POST', `/api/documents/${oo.body.id}/action`, { action: 'approve' });
    }
    const zeroStock = await call('GET', `/api/inventory/item-stock?itemId=${testItem.id}&warehouseId=${rawWh.id}`);
    if (ooApprove && ooApprove.status === 200) out('BUG', '已设置"不允许负库存"，仍可出库为负', `${testItem.code} 原库存 0，出库 5 后审核成功；库存=${zeroStock.body?.[0]?.qty ?? 0}`);
    else out('OK', '负库存被拦截', ooApprove?.message || oo.message);
    await call('PUT', '/api/system/settings', { settings: { allow_negative_stock: '1' } });

    // ---------- D. 单据读取权限 ----------
    console.log('\n【D. 仅有"基础资料"权限能否读取销售单据】');
    const role = await call('POST', '/api/system/roles', { code: 'ONLY_BASEDATA', name: '仅基础资料', permissions: ['basedata.view'], data_scope: 'all' });
    if (role.status === 200) {
      const u = await call('POST', '/api/system/users', { username: 'probe_bd', password: 'probe123456', name: '探针用户', role_id: role.body.id });
      if (u.status === 200) {
        const t = await login('probe_bd', 'probe123456');
        const keep = token; token = t.token;
        const read = await call('GET', '/api/documents?docType=SO&pageSize=1');
        token = keep;
        if (read.status === 200) out('BUG', '销售单据被"基础资料"权限越权读取', `ONLY_BASEDATA 用户 GET /api/documents?docType=SO 返回 200（${read.body?.rows?.length} 行）`);
        else out('OK', '跨模块读取被拒绝', read.message);
      }
    }

    // ---------- E. 数据范围 data_scope ----------
    console.log('\n【E. 数据范围（本人/本部门）是否生效】');
    const salesUser = await login('liqiang', 'sales456');
    if (salesUser) {
      // 管理员新建一张归属其他人的销售订单（created_by=admin），本人范围用户不应看到/打开
      const adminSo = await call('POST', '/api/documents', {
        doc_type: 'SO', doc_date: today, partner_id: customers.id, warehouse_id: wh.id,
        lines: [{ item_id: fg.id, qty: 1, price: 100, tax_rate: 13 }],
      });
      const keep = token; token = salesUser.token;
      const mine = await call('GET', '/api/documents?docType=SO&pageSize=1');
      const myTotal = mine.body?.total || 0;
      const detailOther = await call('GET', `/api/documents/${adminSo.body.id}`);
      token = keep;
      const adminAll = await call('GET', '/api/documents?docType=SO&pageSize=1');
      const adminTotal = adminAll.body?.total || 0;
      if (detailOther.status === 403 && myTotal < adminTotal) out('OK', 'data_scope=本人 生效（列表过滤 + 详情越权拦截）', `liqiang=${myTotal} / admin=${adminTotal}，他人单据详情返回 ${detailOther.status}`);
      else out('BUG', 'data_scope=本人 未生效', `列表 liqiang=${myTotal}/admin=${adminTotal}，他人单据详情=${detailOther.status}`);
    }

    // ---------- F. 金额与税率边界 ----------
    console.log('\n【F. 折扣/税率/日期边界】');
    const bad1 = await call('POST', '/api/documents', {
      doc_type: 'SO', doc_date: today, partner_id: customers.id, warehouse_id: wh.id,
      lines: [{ item_id: fg.id, qty: 1, price: 100, discount_rate: 200, tax_rate: 13 }],
    });
    if (bad1.status === 200) out('BUG', '折扣率 200% 被接受', `订单金额=${bad1.body?.doc?.total_amount}`);
    else out('OK', '非法折扣被拒绝', bad1.message);
    const bad2 = await call('POST', '/api/documents', {
      doc_type: 'SO', doc_date: today, partner_id: customers.id, warehouse_id: wh.id,
      lines: [{ item_id: fg.id, qty: 1, price: 100, tax_rate: 9999 }],
    });
    if (bad2.status === 200) out('BUG', '税率 9999% 被接受', `税额=${bad2.body?.doc?.tax_amount}`);
    else out('OK', '非法税率被拒绝', bad2.message);
    const bad3 = await call('POST', '/api/documents', {
      doc_type: 'SO', doc_date: '2026-13-45', partner_id: customers.id, warehouse_id: wh.id,
      lines: [{ item_id: fg.id, qty: 1, price: 100 }],
    });
    if (bad3.status === 200) out('BUG', '非法日期 2026-13-45 被接受', bad3.body?.doc?.doc_date);
    else out('OK', '非法日期被拒绝', bad3.message);

    // ---------- G. 常规边界（应通过） ----------
    console.log('\n【G. 常规边界】');
    const dup = await call('POST', '/api/masterdata/items', { code: fg.code, name: '重复物料' });
    out(dup.status === 400 ? 'OK' : 'BUG', '物料编码唯一性', dup.status === 400 ? dup.message : `返回 ${dup.status}`);
    const del = await call('DELETE', `/api/masterdata/items/${fg.id}`);
    out(del.status === 400 ? 'OK' : 'BUG', '被引用物料禁止删除', del.status === 400 ? del.message : `返回 ${del.status}`);
    const badType = await call('GET', '/api/documents?docType=HACK');
    out(badType.status === 400 ? 'OK' : 'BUG', '未知单据类型', badType.status === 400 ? badType.message : `返回 ${badType.status}`);
    const bigPage = await call('GET', '/api/documents?docType=SO&pageSize=99999');
    out((bigPage.body?.pageSize || 0) <= 200 ? 'OK' : 'BUG', '超大分页被限制', `pageSize=${bigPage.body?.pageSize}`);
    const inj = await call('GET', "/api/documents?docType=SO&keyword=%27%20OR%201%3D1%20--");
    out(inj.status === 200 ? 'OK' : 'BUG', '关键字 SQL 注入尝试', `返回 ${inj.status}，${inj.body?.total ?? 0} 行（参数化查询）`);
    const negQty = await call('POST', '/api/documents', {
      doc_type: 'SO', doc_date: today, partner_id: customers.id, warehouse_id: wh.id,
      lines: [{ item_id: fg.id, qty: -5, price: 100 }],
    });
    out(negQty.status === 400 ? 'OK' : 'BUG', '负数量被拒绝', negQty.status === 400 ? negQty.message : `返回 ${negQty.status}`);
    const editApproved = await call('PUT', `/api/documents/${so.body.id}`, { remark: 'x' });
    out(editApproved.status === 400 ? 'OK' : 'BUG', '已审核单据禁止修改', editApproved.status === 400 ? editApproved.message : `返回 ${editApproved.status}`);
    const twice = await call('POST', `/api/documents/${so.body.id}/action`, { action: 'approve' });
    out(twice.status === 400 ? 'OK' : 'BUG', '重复审核被拒绝', twice.status === 400 ? twice.message : `返回 ${twice.status}`);
  } finally {
    try { server.kill(); } catch { /* ignore */ }
  }
} catch (e) {
  console.error('探针异常:', e.message);
} finally {
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log('\n========================================');
console.log(`  常规通过 ${pass} 项，发现 BUG ${findings.length} 项`);
findings.forEach((f, i) => console.log(`  ${i + 1}. ${f.name} — ${f.detail}`));
console.log('========================================');
process.exit(findings.length ? 1 : 0);
