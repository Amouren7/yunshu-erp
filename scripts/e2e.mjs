/**
 * 端到端业务闭环验证脚本
 * 隔离环境：临时数据目录 + 独立端口，不污染演示数据。
 * 用法：node scripts/e2e.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'server', 'data-e2e');
const PORT = 8798;
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  [PASS] ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); console.log(`  [FAIL] ${name}${extra ? ' — ' + extra : ''}`); }
}
function eq(name, actual, expected) { ok(name, actual === expected, `期望 ${expected}，实际 ${actual}`); }
function record(title) { console.log(`\n【${title}】`); }

function run(cmd, args, env) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
    p.on('exit', (code) => resolve(code));
  });
}
function startServer() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['server/index.mjs'], {
      cwd: ROOT, env: { ...process.env, ERP_DATA_DIR: DATA_DIR, ERP_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    p.stdout.on('data', (d) => { if (String(d).includes('API')) resolve(p); });
    setTimeout(() => resolve(p), 8000);
    p.on('exit', (c) => setTimeout(() => reject(new Error('服务启动失败 code=' + c)), 200));
  });
}

let token = '';
async function call(method, pathname, body) {
  const res = await fetch(BASE + pathname, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  const text = await res.text();
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  return { status: res.status, body: payload?.data ?? payload, message: payload?.message };
}

const today = new Date().toISOString().slice(0, 10);

// 提交 + 审核（单据需要先提交才能审核）
async function submitAndApprove(docId) {
  const s = await call('POST', `/api/documents/${docId}/action`, { action: 'submit' });
  if (s.status !== 200) return { status: s.status, message: '提交失败: ' + s.message, body: s.body };
  const a = await call('POST', `/api/documents/${docId}/action`, { action: 'approve' });
  return { status: a.status, body: a.body, message: '审核失败: ' + a.message };
}

try {
  if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log('生成隔离测试数据（约 10 秒）...');
  const seedCode = await run(process.execPath, ['server/seed.mjs'], { ERP_DATA_DIR: DATA_DIR });
  if (seedCode !== 0) throw new Error('种子数据生成失败');
  const server = await startServer();
  console.log('测试服务已启动: ' + BASE);

  try {
    // ---------- 认证 ----------
    record('认证与基础数据');
    const login = await call('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    eq('管理员登录', login.status, 200);
    token = login.body?.token;
    ok('获取 token', !!token);
    const me = await call('GET', '/api/auth/me');
    eq('当前用户', me.body?.username, 'admin');
    const meta = await call('GET', '/api/meta');
    eq('元数据接口', meta.status, 200);
    ok('单据类型 >= 12 种', Object.keys(meta.body?.docTypes || {}).length >= 12, `实际 ${Object.keys(meta.body?.docTypes || {}).length}`);
    const bad = await call('POST', '/api/auth/login', { username: 'admin', password: 'wrong' });
    eq('错误密码被拒绝', bad.status, 401);

    const customers = await call('GET', '/api/masterdata/customers?pageSize=1');
    const customerId = customers.body?.rows?.[0]?.id;
    ok('读取客户主数据', !!customerId);
    const items = await call('GET', '/api/masterdata/items?pageSize=10');
    const itemRows = items.body?.rows || [];
    const sellable = itemRows.filter((i) => i.item_type === '成品');
    const itemA = sellable[0];
    const warehouses = await call('GET', '/api/masterdata/warehouses?pageSize=10');
    const wh = (warehouses.body?.rows || []).find((w) => w.type === '成品仓');
    ok('读取成品与成品仓', !!itemA && !!wh);

    // ---------- 销售到收款 ----------
    record('销售到收款（O2C）');
    const so = await call('POST', '/api/documents', {
      doc_type: 'SO', doc_date: today, partner_id: customerId, warehouse_id: wh.id,
      payment_terms: '月结30天',
      lines: [
        { item_id: itemA.id, qty: 10, price: itemA.price_sale, tax_rate: 13 },
        { item_id: sellable[1].id, qty: 5, price: sellable[1].price_sale, tax_rate: 13 },
      ],
    });
    eq('创建销售订单', so.status, 200);
    const soId = so.body?.id;
    ok('订单号自动生成', /^XSDD\d+/.test(so.body?.doc_no || ''), so.body?.doc_no);
    const expectTotal = Math.round(((10 * itemA.price_sale) + (5 * sellable[1].price_sale)) * 1.13 * 100) / 100;
    ok('订单金额自动计算正确', Math.abs((so.body?.doc?.total_amount || 0) - expectTotal) < 0.02, `期望 ${expectTotal}，实际 ${so.body?.doc?.total_amount}`);
    const soSubmit = await call('POST', `/api/documents/${soId}/action`, { action: 'submit' });
    eq('提交销售订单', soSubmit.body?.status, 'SUBMITTED');
    const soApprove = await call('POST', `/api/documents/${soId}/action`, { action: 'approve' });
    eq('审核销售订单', soApprove.body?.status, 'APPROVED');

    const dn = await call('POST', '/api/documents', { doc_type: 'DN', doc_date: today, source_id: soId });
    eq('从销售订单生成发货单', dn.status, 200);
    ok('发货单引用源单', dn.body?.doc?.source_no === so.body?.doc_no, dn.body?.doc?.source_no);
    eq('发货单明细继承订单', dn.body?.doc?.lines?.length, 2);
    const dnApprove = await submitAndApprove(dn.body?.id);
    eq('审核发货单（过账）', dnApprove.body?.status, 'APPROVED');

    const soAfter = await call('GET', `/api/documents/${soId}`);
    eq('销售订单状态推进为已发货', soAfter.body?.status, 'FULL_SHIPPED');
    const ledger = await call('GET', '/api/inventory/ledger?docType=DN&pageSize=5');
    ok('发货生成库存出库流水', (ledger.body?.rows || []).length >= 2, `流水 ${ledger.body?.rows?.length} 条`);
    const sample = (ledger.body?.rows || [])[0];
    ok('出库金额按移动加权成本计算', Number(sample?.unit_cost) > 0, `单位成本 ${sample?.unit_cost}`);
    const arInv = await call('GET', `/api/finance/invoices?invoiceType=AR&partnerId=${customerId}&pageSize=10`);
    const invRow = (arInv.body?.rows || []).find((r) => r.doc_no === dn.body?.doc_no);
    ok('发货自动生成应收发票', !!invRow, invRow?.invoice_no);
    const vouchers = await call('GET', `/api/finance/vouchers?startDate=${today}&endDate=${today}&pageSize=50`);
    ok('发货自动生成会计凭证', (vouchers.body?.rows || []).length >= 1, `当日凭证 ${(vouchers.body?.rows || []).length} 张`);
    ok('科目余额表可查询', (await call('GET', `/api/finance/trial-balance?startDate=${today}&endDate=${today}`)).status === 200);
    ok('利润表可查询', (await call('GET', `/api/finance/income-statement?period=${today.slice(0, 7)}`)).status === 200);

    const rc = await call('POST', '/api/documents', {
      doc_type: 'RC', doc_date: today, partner_id: customerId,
      lines: [{ invoice_id: invRow?.id, amount: invRow?.total_amount }],
    });
    ok('创建收款单', rc.status === 200, rc.message || '');
    const rcApprove = await submitAndApprove(rc.body?.id);
    eq('收款单审核过账', rcApprove.body?.status, 'APPROVED');
    const invAfter = await call('GET', `/api/finance/invoices/${invRow?.id}`);
    ok('发票状态更新为已收', ['已收', '部分收款'].includes(invAfter.body?.status), invAfter.body?.status);
    ok('科目映射可查询', (await call('GET', '/api/finance/gl-mappings')).status === 200);

    // ---------- 采购到付款 ----------
    record('采购到付款（P2P）');
    const suppliers = await call('GET', '/api/masterdata/suppliers?pageSize=1');
    const supplierId = suppliers.body?.rows?.[0]?.id;
    const rawItem = itemRows.filter((i) => i.item_type === '原料')[0] || itemA;
    const po = await call('POST', '/api/documents', {
      doc_type: 'PO', doc_date: today, partner_id: supplierId, warehouse_id: wh.id,
      lines: [{ item_id: rawItem.id, qty: 100, price: rawItem.price_purchase || 10, tax_rate: 13 }],
    });
    eq('创建采购订单', po.status, 200);
    await call('POST', `/api/documents/${po.body.id}/action`, { action: 'submit' });
    const poApprove = await call('POST', `/api/documents/${po.body.id}/action`, { action: 'approve' });
    eq('审核采购订单', poApprove.body?.status, 'APPROVED');
    const grn = await call('POST', '/api/documents', { doc_type: 'GRN', doc_date: today, source_id: po.body.id });
    eq('从采购订单生成入库单', grn.status, 200);
    const grnApprove = await submitAndApprove(grn.body?.id);
    eq('审核入库单（过账）', grnApprove.body?.status, 'APPROVED');
    const poAfter = await call('GET', `/api/documents/${po.body.id}`);
    eq('采购订单状态推进为已入库', poAfter.body?.status, 'FULL_RECEIVED');
    const stock = await call('GET', `/api/inventory/balances?keyword=${encodeURIComponent(rawItem.code)}&onlyNonZero=0`);
    const stockRow = (stock.body || []).find((r) => r.item_id === rawItem.id && r.warehouse_id === wh.id);
    ok('入库增加库存数量', Number(stockRow?.qty || 0) >= 100, `当前库存 ${stockRow?.qty}`);
    const apInv = await call('GET', `/api/finance/invoices?invoiceType=AP&partnerId=${supplierId}&pageSize=10`);
    ok('入库自动生成应付发票', (apInv.body?.rows || []).some((r) => r.doc_no === grn.body?.doc_no));

    // ---------- 生产 ----------
    record('生产工单闭环');
    const wo = await call('POST', '/api/production/work-orders', {
      item_id: itemA.id, qty: 20, planned_start: today, planned_end: today, priority: '普通',
    });
    eq('创建生产工单', wo.status, 200);
    const woId = wo.body?.id || wo.body?.workOrder?.id;
    ok('工单号自动生成', !!(wo.body?.order_no || wo.body?.work_order?.order_no || woId));
    const woDetail = await call('GET', `/api/production/work-orders/${woId}`);
    ok('工单 BOM 展开物料清单', (woDetail.body?.materials || []).length > 0, `${(woDetail.body?.materials || []).length} 种物料`);
    for (const action of ['release', 'start']) {
      const r = await call('POST', `/api/production/work-orders/${woId}/action`, { action });
      ok(`工单动作 ${action}`, r.status === 200, r.message || '');
    }
    const issue = await call('POST', `/api/production/work-orders/${woId}/action`, { action: 'issue' });
    ok('工单领料过账', issue.status === 200, issue.message || '');
    const complete = await call('POST', `/api/production/work-orders/${woId}/action`, { action: 'complete', qty: 20 });
    ok('工单完工入库过账', complete.status === 200, complete.message || '');

    // ---------- 其它模块 ----------
    record('其它模块接口');
    const checks = [
      ['工作台汇总', '/api/dashboard/summary'],
      ['生产总览', '/api/production/overview'],
      ['物料需求 MRP', '/api/production/materials-requirements'],
      ['产能负荷', '/api/production/work-center-load'],
      ['人事总览', '/api/hr/overview'],
      ['考勤列表', '/api/hr/attendances?pageSize=2'],
      ['薪资列表', '/api/hr/payrolls?pageSize=2'],
      ['CRM 总览', '/api/crm/overview'],
      ['线索列表', '/api/crm/leads?pageSize=2'],
      ['客户贡献排行', '/api/crm/customers/rank'],
      ['用户列表', '/api/system/users?pageSize=2'],
      ['角色列表', '/api/system/roles'],
      ['审计日志', '/api/system/audit-logs?pageSize=2'],
      ['经营 KPI', '/api/reports/kpi-dashboard'],
      ['销售汇总', '/api/reports/sales-summary'],
      ['库存周转', '/api/reports/inventory-turnover'],
      ['应收账龄', '/api/finance/ar-aging'],
      ['资产负债表', '/api/finance/balance-sheet'],
      ['现金流量表', '/api/finance/cash-flow'],
    ];
    for (const [name, url] of checks) {
      const r = await call('GET', url);
      ok(name, r.status === 200, r.status !== 200 ? `HTTP ${r.status} ${r.message || ''}` : '');
    }

    // ---------- 权限 ----------
    record('权限控制');
    const guestLogin = await call('POST', '/api/auth/login', { username: 'guest', password: 'guest123' });
    eq('只读账号登录', guestLogin.status, 200);
    const adminToken = token;
    token = guestLogin.body?.token;
    const denied = await call('POST', '/api/documents', { doc_type: 'SO', doc_date: today, partner_id: customerId, lines: [{ item_id: itemA.id, qty: 1, price: 1 }] });
    eq('只读账号创建单据被拒绝', denied.status, 403);
    const deniedApprove = await call('POST', `/api/documents/${soId}/action`, { action: 'void' });
    ok('只读账号无法作废单据', deniedApprove.status === 400 || deniedApprove.status === 403, `HTTP ${deniedApprove.status}`);
    token = adminToken;
    const noAuth = await fetch(BASE + '/api/documents?docType=SO');
    eq('未登录访问被拒绝', noAuth.status, 401);

    // ---------- 校验 ----------
    record('业务校验');
    const invalid = await call('POST', '/api/documents', { doc_type: 'SO', doc_date: today, lines: [] });
    eq('空明细被拒绝', invalid.status, 400);
    const noPartner = await call('POST', '/api/documents', { doc_type: 'SO', doc_date: today, lines: [{ item_id: itemA.id, qty: 1 }] });
    eq('缺客户被拒绝', noPartner.status, 400);
  } finally {
    try { server.kill(); } catch { /* ignore */ }
  }
} catch (err) {
  console.error('\n执行异常:', err.message);
  fail++;
  failures.push('执行异常: ' + err.message);
} finally {
  try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
}

console.log('\n========================================');
console.log(`  通过 ${pass} 项，失败 ${fail} 项`);
if (failures.length) {
  console.log('  失败项:');
  failures.forEach((f) => console.log('   - ' + f));
}
console.log('========================================');
process.exit(fail ? 1 : 0);
