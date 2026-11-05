/** 最终交付截图：登录一次，批量截取代表性页面到 docs/screenshots/
 * 用法：node scripts/final-shots.mjs
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.ERP_BASE || 'http://127.0.0.1:8787';
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const OUT = path.resolve('docs', 'screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

async function api(pathname, token, opts = {}) {
  const res = await fetch(BASE + pathname, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...opts });
  const j = await res.json().catch(() => null);
  return j?.data ?? j;
}

const login = await api('/api/auth/login', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
const token = login.token;
const so = (await api('/api/documents?docType=SO&pageSize=1', token)).rows[0];
const dn = (await api('/api/documents?docType=DN&pageSize=1', token)).rows[0];
const grn = (await api('/api/documents?docType=GRN&pageSize=1', token)).rows[0];
const voucher = (await api('/api/finance/vouchers?pageSize=1', token)).rows[0];
const wo = (await api('/api/production/work-orders?pageSize=1', token)).rows[0];
const openWo = (await api('/api/production/work-orders?status=RELEASED,IN_PROGRESS&pageSize=1', token)).rows[0];

const SHOTS = [
  ['/login', '00-login'],
  ['/dashboard', '01-dashboard'],
  ['/basedata/items', '02-basedata-items'],
  ['/basedata/customers', '03-basedata-customers'],
  ['/sales/orders', '04-sales-orders'],
  ['/sales/orders/new', '05-sales-order-new'],
  ['/sales/orders/' + so.id, '06-sales-order-detail'],
  ['/sales/deliveries/' + dn.id, '07-sales-delivery-detail'],
  ['/purchase/orders', '08-purchase-orders'],
  ['/purchase/receipts/' + grn.id, '09-purchase-receipt-detail'],
  ['/inventory/balances', '10-inventory-balances'],
  ['/inventory/ledger', '11-inventory-ledger'],
  ['/inventory/alerts', '12-inventory-alerts'],
  ['/production/overview', '13-production-overview'],
  ['/production/work-orders', '14-production-work-orders'],
  ['/production/work-orders/' + (openWo?.id || wo.id), '15-work-order-detail'],
  ['/production/boms', '16-production-boms'],
  ['/production/mrp', '17-production-mrp'],
  ['/finance/overview', '18-finance-overview'],
  ['/finance/receivables', '19-finance-receivables'],
  ['/finance/statements', '20-finance-statements'],
  ['/finance/vouchers/' + voucher.id, '21-finance-voucher-detail'],
  ['/finance/trial-balance', '22-finance-trial-balance'],
  ['/hr/overview', '23-hr-overview'],
  ['/hr/payrolls', '24-hr-payrolls'],
  ['/crm/overview', '25-crm-overview'],
  ['/crm/leads', '26-crm-leads'],
  ['/reports/kpi', '27-reports-kpi'],
  ['/reports/gross-profit', '28-reports-gross-profit'],
  ['/reports/inventory', '29-reports-inventory'],
  ['/system/users', '30-system-users'],
  ['/system/roles', '31-system-roles'],
  ['/system/info', '32-system-info'],
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--lang=zh-CN'], defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let count = 0;
for (const [route, name] of SHOTS) {
  if (route === '/login') {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
    await sleep(900);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    await page.click('button[type="submit"]');
    await sleep(2600);
  } else {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  }
  count++;
  console.log(`✓ ${name}`);
}
await browser.close();
console.log(`\n已生成 ${count} 张截图 → ${OUT}`);
if (errors.length) console.log('前端错误:', [...new Set(errors)].slice(0, 5));
