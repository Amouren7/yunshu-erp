/** 筛选项下拉可用性检查：确保「客户类型/等级/区域、供应商分类、员工类型」等字符串数组选项不为空白 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const BASE = process.env.ERP_BASE || 'http://127.0.0.1:8787';
const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const pages = [
  ['/basedata/customers', ['客户类型', '客户等级', '区域']],
  ['/basedata/suppliers', ['供应商分类', '评级']],
  ['/basedata/employees', ['员工类型', '状态']],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--lang=zh-CN'], defaultViewport: { width: 1500, height: 950 } });
const page = await browser.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
await sleep(600);
await page.click('button[type="submit"]');
await sleep(2500);

let fail = 0;
for (const [route, labels] of pages) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2' });
  await sleep(1200);
  for (const label of labels) {
    const selects = await page.$$('.filter-bar .ant-select');
    let clicked = false;
    for (const s of selects) {
      const ph = await s.evaluate((el) => el.querySelector('.ant-select-selection-placeholder')?.textContent || '');
      if (ph.includes(label)) { await s.click(); clicked = true; break; }
    }
    if (!clicked) { console.log(`  [SKIP] ${route} 未找到筛选项「${label}」`); continue; }
    await sleep(500);
    const opts = await page.$$eval('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content', (els) => els.map((e) => e.textContent.trim()));
    const good = opts.length > 0 && opts.every((t) => t.length > 0);
    console.log(`  [${good ? 'PASS' : 'FAIL'}] ${route} 「${label}」选项 ${opts.length} 个: ${opts.slice(0, 8).join(' / ')}${opts.length > 8 ? ' ...' : ''}`);
    if (!good) fail++;
    await page.keyboard.press('Escape');
    await sleep(250);
  }
}
await browser.close();
console.log(fail ? `\n筛选下拉存在 ${fail} 处空白，请检查` : '\n所有筛选下拉均正常 ✓');
process.exit(fail ? 1 : 0);
