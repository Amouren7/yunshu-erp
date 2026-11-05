/** 全站页面巡检：node scripts/audit.mjs [route1,route2,...]
 * 检查：页面是否渲染出主体内容、是否有前端运行时错误、是否有 4xx/5xx 接口请求。
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.ERP_BASE || 'http://127.0.0.1:8787';
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

const ROUTES = process.argv[2] ? process.argv[2].split(',').map((s) => s.trim()).filter(Boolean) : [
  '/dashboard',
  '/basedata/items', '/basedata/categories', '/basedata/customers', '/basedata/suppliers',
  '/basedata/warehouses', '/basedata/departments', '/basedata/employees', '/basedata/uoms',
  '/basedata/tax-rates', '/basedata/accounts',
  '/sales/orders', '/sales/deliveries', '/sales/returns', '/sales/orders/new',
  '/purchase/orders', '/purchase/receipts', '/purchase/returns',
  '/inventory/balances', '/inventory/ledger', '/inventory/alerts', '/inventory/transfers',
  '/inventory/stocktake', '/inventory/other-in', '/inventory/other-out',
  '/production/overview', '/production/work-orders', '/production/work-orders/new', '/production/boms',
  '/production/mrp', '/production/work-centers', '/production/schedule', '/production/processes',
  '/finance/overview', '/finance/receivables', '/finance/payables', '/finance/invoices',
  '/finance/receipts', '/finance/payments', '/finance/vouchers', '/finance/vouchers/new',
  '/finance/statements', '/finance/trial-balance', '/finance/ledger', '/finance/aging', '/finance/gl-mappings',
  '/hr/overview', '/hr/attendances', '/hr/payrolls', '/hr/leaves', '/hr/departments',
  '/crm/overview', '/crm/leads', '/crm/opportunities', '/crm/activities', '/crm/contracts', '/crm/customer-rank',
  '/reports/kpi', '/reports/sales-summary', '/reports/sales-trend', '/reports/purchase-summary',
  '/reports/inventory', '/reports/gross-profit', '/reports/customer-contribution', '/reports/product-ranking',
  '/system/users', '/system/roles', '/system/settings', '/system/profile', '/system/audit-logs',
  '/system/number-series', '/system/notices', '/system/info',
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--lang=zh-CN'], defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
let consoleErrors = [];
let apiErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message.slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
page.on('response', (r) => {
  const url = r.url();
  if (url.includes('/api/') && r.status() >= 400 && !url.includes('/api/system/notices')) {
    apiErrors.push(`${r.status()} ${url.replace(BASE, '')}`);
  }
});

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 700));
if (await page.$('input#username')) {
  await page.click('button[type="submit"]');
  await new Promise((r) => setTimeout(r, 2600));
}

const results = [];
for (const route of ROUTES) {
  consoleErrors = [];
  apiErrors = [];
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 25000 });
    await new Promise((r) => setTimeout(r, 900));
    const info = await page.evaluate(() => {
      const text = (document.querySelector('.page') || document.body).innerText || '';
      return {
        title: document.querySelector('.page-title')?.textContent?.trim()?.slice(0, 30) || '',
        tables: document.querySelectorAll('.ant-table').length,
        cards: document.querySelectorAll('.card').length,
        charts: document.querySelectorAll('canvas').length,
        empties: document.querySelectorAll('.ant-empty').length,
        notFound: text.includes('页面不存在'),
        textLen: text.length,
      };
    });
    const status = info.notFound ? 'ERROR' : consoleErrors.length || apiErrors.length ? 'WARN' : 'OK';
    results.push({ route, ...info, status, errors: [...new Set([...consoleErrors, ...apiErrors])].slice(0, 4) });
    const mark = status === 'OK' ? '✓' : status === 'WARN' ? '!' : '✗';
    console.log(`${mark} ${route} | ${info.title} | table=${info.tables} card=${info.cards} chart=${info.charts} empty=${info.empties}`);
    if (status !== 'OK') console.log(`    ${[...new Set([...consoleErrors, ...apiErrors])].slice(0, 4).join(' | ')}`);
  } catch (e) {
    results.push({ route, status: 'ERROR', errors: [e.message] });
    console.log(`✗ ${route} | ${e.message}`);
  }
}

const bad = results.filter((r) => r.status !== 'OK');
const blank = results.filter((r) => r.tables === 0 && r.cards === 0 && r.charts === 0);
console.log('\n========================================');
console.log(`页面总数 ${results.length}，正常 ${results.length - bad.length}，异常 ${bad.length}，空白页 ${blank.length}`);
if (bad.length) bad.forEach((b) => console.log(`  - ${b.route}: ${b.errors.join(' | ')}`));
if (blank.length) console.log('空白页: ' + blank.map((b) => b.route).join(', '));
console.log('========================================');
await browser.close();
process.exit(bad.length ? 1 : 0);
