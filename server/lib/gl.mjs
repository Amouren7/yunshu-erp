import { get, run, all } from '../db.mjs';
import { round2 } from '../http.mjs';
import { nextVoucherNo } from './numbering.mjs';

const cache = { mapping: null, accounts: null };

export function mapping(key) {
  if (!cache.mapping) {
    const rows = all('SELECT key, account_code FROM gl_mappings');
    cache.mapping = Object.fromEntries(rows.map((r) => [r.key, r.account_code]));
  }
  return cache.mapping[key] || null;
}

export function clearCache() {
  cache.mapping = null;
  cache.accounts = null;
}

export function accountName(code) {
  if (!cache.accounts) {
    const rows = all('SELECT code, name FROM accounts');
    cache.accounts = Object.fromEntries(rows.map((r) => [r.code, r.name]));
  }
  return cache.accounts[code] || code;
}

export function inventoryAccount(itemType) {
  if (itemType === '原料' || itemType === '包装物') return mapping('RAW_MATERIAL') || '1403';
  return mapping('INVENTORY') || '1405';
}

export function cashAccount(settleMethod) {
  if (settleMethod === '现金') return mapping('CASH') || '1001';
  return mapping('BANK') || '1002';
}

/**
 * 生成并过账一张记账凭证
 * lines: [{account_code, summary, debit, credit, partner_type, partner_id, partner_name}]
 */
export function postVoucher({ date, period, sourceType, sourceId, summary, lines, user, voucherType = 'AUTO', docNo }) {
  const valid = (lines || []).filter((l) => round2(l.debit) !== 0 || round2(l.credit) !== 0);
  if (!valid.length) return null;
  const totalDebit = round2(valid.reduce((s, l) => s + round2(l.debit), 0));
  const totalCredit = round2(valid.reduce((s, l) => s + round2(l.credit), 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`凭证借贷不平：借 ${totalDebit} / 贷 ${totalCredit}（${summary}）`);
  }
  const voucherNo = nextVoucherNo(period);
  const r = run(
    `INSERT INTO vouchers(voucher_no, voucher_date, period, voucher_type, source_type, source_id, summary,
       total_debit, total_credit, status, created_by, created_by_name, posted_at)
     VALUES(?,?,?,?,?,?,?,?,?,'POSTED',?,?, datetime('now','localtime'))`,
    voucherNo, date, period, voucherType, sourceType ?? null, sourceId ?? null,
    summary || docNo || voucherNo, totalDebit, totalCredit, user?.id ?? null, user?.name ?? 'system');
  const voucherId = r.lastInsertRowid;
  let lineNo = 1;
  for (const l of valid) {
    run(`INSERT INTO voucher_lines(voucher_id, line_no, account_code, account_name, summary, debit, credit,
           partner_type, partner_id, partner_name)
         VALUES(?,?,?,?,?,?,?,?,?,?)`,
      voucherId, lineNo++, l.account_code, accountName(l.account_code), l.summary || summary || '',
      round2(l.debit), round2(l.credit), l.partner_type ?? null, l.partner_id ?? null, l.partner_name ?? null);
  }
  return { id: voucherId, voucher_no: voucherNo, totalDebit, totalCredit };
}

export function voucherBySource(sourceType, sourceId) {
  return get('SELECT * FROM vouchers WHERE source_type = ? AND source_id = ?', sourceType, sourceId);
}

/** 科目余额（用于报表） */
export function accountBalances({ startDate, endDate }) {
  return all(`
    SELECT vl.account_code, a.name AS account_name, a.category, a.direction,
           ROUND(SUM(vl.debit), 2) AS debit, ROUND(SUM(vl.credit), 2) AS credit
    FROM voucher_lines vl
    JOIN vouchers v ON v.id = vl.voucher_id
    JOIN accounts a ON a.code = vl.account_code
    WHERE v.status = 'POSTED' AND v.voucher_date >= ? AND v.voucher_date <= ?
    GROUP BY vl.account_code
    ORDER BY vl.account_code`, startDate, endDate);
}

export function glMappings() {
  return all('SELECT * FROM gl_mappings ORDER BY key');
}
