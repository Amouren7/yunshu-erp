/** UI 端到端流程冒烟：登录 → 新建销售订单 → 保存并提交 → 审核 → 校验状态与打印视图
 * 用法：node scripts/ui-flow.mjs
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.ERP_BASE || 'http://127.0.0.1:8787';
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const OUT = path.resolve('qa-shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  [PASS] ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; failures.push(`${name}${extra ? ' — ' + extra : ''}`); console.log(`  [FAIL] ${name}${extra ? ' — ' + extra : ''}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--lang=zh-CN'], defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

async function selectOption(inputSelector, text) {
  const el = await page.$(inputSelector);
  if (!el) throw new Error('找不到下拉框: ' + inputSelector);
  await el.click({ clickCount: 3 });
  await page.keyboard.type(text, { delay: 25 });
  await sleep(1000);
  await page.keyboard.press('Enter');
  await sleep(500);
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  await sleep(700);
  await page.click('button[type="submit"]');
  await sleep(2600);
  ok('管理员登录', page.url().includes('/dashboard'), page.url());

  await page.goto(`${BASE}/sales/orders/new`, { waitUntil: 'networkidle2' });
  await sleep(1400);
  ok('打开新建销售订单页', !!(await page.$('.doc-lines-edit')));

  await selectOption('input#partner_id', '深圳华控');
  const partnerText = await page.$eval('#partner_id', (el) => el.closest('.ant-form-item')?.innerText || '');
  ok('选择客户成功', partnerText.includes('深圳华控'), partnerText.replace(/\s+/g, ' ').slice(0, 60));

  await selectOption('input#warehouse_id', '成品仓库');
  const whText = await page.$eval('#warehouse_id', (el) => el.closest('.ant-form-item')?.innerText || '');
  ok('选择发货仓库成功', whText.includes('成品仓库'), whText.replace(/\s+/g, ' ').slice(0, 60));

  await selectOption('.doc-lines-edit .ant-select input', 'FG-GW1000');
  const numbers = await page.$$eval('.doc-lines-edit tbody input.ant-input-number-input', (els) => els.map((e) => Number(e.value)));
  const price = numbers[1] || 0;
  const taxRate = numbers[3] || 0;
  ok('物料行自动带出价格与税率', price > 0 && taxRate === 13, `数量=${numbers[0]} 单价=${price} 税率=${taxRate}`);

  const qtyInput = await page.$('.doc-lines-edit tbody input.ant-input-number-input');
  if (qtyInput) {
    await qtyInput.click({ clickCount: 3 });
    await page.keyboard.type('5');
    await sleep(500);
  }
  const totalText = await page.$eval('.doc-total-bar', (el) => el.innerText.replace(/\s+/g, ' '));
  const totalNums = (totalText.match(/￥([\d,]+\.\d{2})/g) || []).map((s) => Number(s.replace(/[￥,]/g, '')));
  const totalNum = totalNums[totalNums.length - 1] || 0;
  ok('合计金额随数量联动', totalNum > 0, `价税合计=${totalNum}`);

  let submitted = false;
  for (const b of await page.$$('button')) {
    const t = await page.evaluate((el) => el.innerText, b);
    if (t.includes('保存并提交')) { await b.click(); submitted = true; break; }
  }
  ok('点击保存并提交', submitted);
  await sleep(3400);

  const url = page.url();
  ok('保存后进入单据详情', /\/sales\/orders\/\d+/.test(url), url);
  const title = await page.$eval('.page-title', (el) => el.innerText).catch(() => '');
  ok('单据编号已生成', /XSDD\d+/.test(title), title.replace(/\s+/g, ' '));
  let bodyText = await page.evaluate(() => document.body.innerText);
  ok('提交后状态为待审批', bodyText.includes('待审批'));
  await page.screenshot({ path: path.join(OUT, 'ui-01-so-submitted.png') });

  let approved = false;
  for (const b of await page.$$('button')) {
    const t = await page.evaluate((el) => el.innerText.trim(), b);
    if (t === '审核') { await b.click(); approved = true; break; }
  }
  ok('点击审核按钮', approved);
  let okBtn = null;
  for (let i = 0; i < 20 && !okBtn; i++) { okBtn = await page.$('.ant-modal .ant-btn-primary'); if (!okBtn) await sleep(200); }
  if (okBtn) await okBtn.click();
  await sleep(3000);
  bodyText = await page.evaluate(() => document.body.innerText);
  ok('审核后状态为已审核', bodyText.includes('已审核'));
  await page.screenshot({ path: path.join(OUT, 'ui-02-so-approved.png') });
  ok('详情页展示关联凭证区域', bodyText.includes('关联凭证与发票'));
  ok('详情页展示操作日志', bodyText.includes('操作日志'));

  await page.goto(`${BASE}/sales/orders`, { waitUntil: 'networkidle2' });
  await sleep(1600);
  const listText = await page.evaluate(() => document.body.innerText);
  ok('销售订单列表可见新单据', /XSDD\d+/.test(listText) && listText.includes('已审核'));

  await page.goto(url, { waitUntil: 'networkidle2' });
  await sleep(1600);
  await page.emulateMediaType('print');
  await sleep(600);
  const printVisible = await page.evaluate(() => {
    const el = document.querySelector('#print-area');
    if (!el) return false;
    return window.getComputedStyle(el).display !== 'none' && (el.innerText || '').includes('销售订单');
  });
  ok('打印区域在打印媒体下可见', printVisible);
  await page.screenshot({ path: path.join(OUT, 'ui-03-print.png'), fullPage: true });
  await page.emulateMediaType('screen');
} catch (e) {
  fail++;
  failures.push('执行异常: ' + e.message);
  console.error('执行异常:', e.message);
} finally {
  const real = errors.filter((e) => !e.includes('favicon') && !e.includes('404'));
  if (real.length) {
    console.log('\n前端错误:');
    [...new Set(real)].slice(0, 8).forEach((e) => console.log('  - ' + e));
  }
  await browser.close();
}

console.log('\n========================================');
console.log(`  UI 流程：通过 ${pass} 项，失败 ${fail} 项`);
failures.forEach((f) => console.log('   - ' + f));
console.log('========================================');
process.exit(fail ? 1 : 0);
