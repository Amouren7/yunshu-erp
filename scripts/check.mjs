/** 数据自检脚本：node scripts/check.mjs */
import { get, all } from '../server/db.mjs';

const q = (sql) => get(sql);
console.log('=== 数据自检 ===');
console.log('公司:', q("SELECT value FROM settings WHERE key='company_name'")?.value);
const docs = all('SELECT doc_type, COUNT(*) c, ROUND(SUM(total_amount),2) amt FROM documents GROUP BY doc_type ORDER BY doc_type');
console.table(docs);
console.log('DN 销售总额:', q("SELECT ROUND(SUM(total_amount),2) v FROM documents WHERE doc_type='DN' AND status NOT IN ('VOID')"));
console.log('GRN 采购总额:', q("SELECT ROUND(SUM(total_amount),2) v FROM documents WHERE doc_type='GRN' AND status NOT IN ('VOID')"));
console.log('AR 未收:', q("SELECT ROUND(SUM(total_amount-paid_amount),2) v, COUNT(*) c FROM invoices WHERE invoice_type='AR' AND status NOT IN ('已收','已核销','已作废')"));
console.log('AP 未付:', q("SELECT ROUND(SUM(total_amount-paid_amount),2) v, COUNT(*) c FROM invoices WHERE invoice_type='AP' AND status NOT IN ('已付','已核销','已作废')"));
console.log('库存金额:', q('SELECT ROUND(SUM(qty*avg_cost),2) v, COUNT(*) c FROM stock_balances'));
console.log('负库存条数:', q('SELECT COUNT(*) c FROM stock_balances WHERE qty < 0'));
const gl = q('SELECT ROUND(SUM(debit),2) d, ROUND(SUM(credit),2) c FROM voucher_lines');
console.log('总账借/贷:', gl);
console.log('借贷不平凭证:', q('SELECT COUNT(*) c FROM vouchers WHERE ABS(total_debit-total_credit) > 0.01'));
console.log('损益(本年): 收入', q("SELECT ROUND(SUM(vl.credit-vl.debit),2) v FROM voucher_lines vl JOIN accounts a ON a.code=vl.account_code WHERE a.category='INCOME' AND vl.account_code LIKE '6%'"));
const inc = all(`SELECT a.category, ROUND(SUM(vl.debit),2) debit, ROUND(SUM(vl.credit),2) credit
  FROM voucher_lines vl JOIN accounts a ON a.code = vl.account_code
  WHERE a.category IN ('INCOME','EXPENSE') GROUP BY a.category`);
console.table(inc);
console.log('工单状态:', all('SELECT status, COUNT(*) c FROM work_orders GROUP BY status'));
console.log('最近单据:', all("SELECT doc_type, doc_no, doc_date, status, total_amount FROM documents ORDER BY id DESC LIMIT 8"));
