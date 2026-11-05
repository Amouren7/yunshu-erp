/** 打印视图检查：node scripts/print-shot.mjs <route> [outName] */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.ERP_BASE || 'http://127.0.0.1:8787';
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const route = process.argv[2] || '/sales/deliveries/1';
const out = path.resolve('qa-shots', process.argv[3] || 'print-view.png');

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--lang=zh-CN'], defaultViewport: { width: 1200, height: 1400 } });
const page = await browser.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 700));
if (await page.$('input#username')) {
  await page.click('button[type="submit"]');
  await new Promise((r) => setTimeout(r, 2600));
}
await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 1500));
await page.emulateMediaType('print');
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: out, fullPage: true });
console.log('打印视图已保存: ' + out);
await browser.close();
