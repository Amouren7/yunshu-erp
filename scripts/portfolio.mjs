/** 生成作品集预览图与 PDF：node scripts/portfolio.mjs */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(ROOT, 'portfolio', 'index.html');
const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files', '--lang=zh-CN'], defaultViewport: { width: 1440, height: 1000 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('requestfailed', (r) => errors.push(`资源加载失败: ${r.url()}`));
await page.goto(pathToFileURL(HTML).href, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 500));

const preview = path.join(ROOT, 'portfolio', 'preview.png');
await page.screenshot({ path: preview, fullPage: true });
console.log('预览图:', preview);

const pdf = path.join(ROOT, 'portfolio', '云枢ERP-作品集.pdf');
await page.pdf({
  path: pdf,
  format: 'A4',
  printBackground: true,
  margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: '<div style="width:100%;font-size:8px;color:#8a93a3;padding:0 10mm;display:flex;justify-content:space-between;"><span>云枢ERP · 项目作品集</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
});
console.log('PDF:', pdf);
await browser.close();
if (errors.length) {
  console.log('页面资源问题:', [...new Set(errors)].slice(0, 5));
  process.exit(1);
}
