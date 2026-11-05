/** 视觉 QA：用 Puppeteer + 本机 Chrome 截图各页面，并收集控制台错误
 * 用法：node scripts/shots.mjs [route1,route2,...]
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.ERP_BASE || 'http://127.0.0.1:8787';
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const CHROME = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => fs.existsSync(p));
const OUT = path.resolve('qa-shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const DEFAULT_ROUTES = [
  '/login', '/dashboard', '/basedata/items', '/basedata/customers', '/basedata/employees',
  '/sales/orders', '/sales/orders/new', '/sales/deliveries', '/purchase/orders', '/purchase/receipts',
  '/inventory/balances', '/inventory/ledger', '/inventory/alerts',
];
const routes = process.argv[2] ? process.argv[2].split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_ROUTES;

const errors = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--lang=zh-CN', '--font-render-hinting=none'],
  defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') {
    const t = m.text();
    if (!t.includes('favicon')) errors.push(`[console] ${t.slice(0, 300)}`);
  }
});
page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

async function shot(name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

try {
  // 登录
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 900));
  await shot('00-login');
  const userInput = await page.$('input#username');
  if (userInput) {
    const vals = await page.evaluate(() => ({
      u: (document.querySelector('input#username') || {}).value,
      p: (document.querySelector('input#password') || {}).value,
    }));
    if (vals.u !== 'admin') {
      await page.evaluate(() => {
        const setVal = (sel, v) => {
          const el = document.querySelector(sel);
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        setVal('input#username', 'admin');
        setVal('input#password', 'admin123');
      });
    }
    await page.click('button[type="submit"]');
    await new Promise((r) => setTimeout(r, 2600));
  }

  let idx = 1;
  for (const route of routes) {
    if (route === '/login') continue;
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise((r) => setTimeout(r, 1200));
      const stat = await page.evaluate(() => ({
        title: document.title,
        h1: document.querySelector('.page-title')?.textContent?.trim()?.slice(0, 40) || '',
        tables: document.querySelectorAll('.ant-table').length,
        cards: document.querySelectorAll('.card').length,
        text: (document.body.innerText || '').slice(0, 120).replace(/\s+/g, ' '),
      }));
      const name = `${String(idx).padStart(2, '0')}${route.replace(/\//g, '_')}`;
      await shot(name);
      console.log(`✓ ${route} → ${name}.png | ${stat.h1} | tables=${stat.tables} cards=${stat.cards}`);
     } catch (e) {
      console.log(`✗ ${route} → ${e.message}`);
    }
    idx++;
  }
} finally {
  if (errors.length) {
    console.log('\n=== 前端运行时错误 ===');
    const uniq = [...new Set(errors)];
    uniq.slice(0, 30).forEach((e) => console.log(e));
    fs.writeFileSync(path.join(OUT, 'errors.txt'), uniq.join('\n'), 'utf8');
  } else {
    console.log('\n=== 无前端运行时错误 ===');
  }
  await browser.close();
}
