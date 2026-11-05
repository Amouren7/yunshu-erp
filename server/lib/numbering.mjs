import { get, run, all } from '../db.mjs';

const DEFAULT_SERIES = {
  SO: 'XSDD', DN: 'XSFH', SR: 'XSTH', PO: 'CGDD', GRN: 'CGRK', PR: 'CGTH',
  TR: 'KCDB', ADJ: 'KCYK', OI: 'QTRK', OO: 'QTCK', RC: 'SKD', PY: 'FKD',
  MO: 'SCGD', AR: 'YSFP', AP: 'YFFP', CONTRACT: 'HT', VOUCHER: '记',
};

export function ensureNumberSeries() {
  for (const [docType, prefix] of Object.entries(DEFAULT_SERIES)) {
    const exist = get('SELECT doc_type FROM number_series WHERE doc_type = ?', docType);
    if (!exist) {
      run('INSERT INTO number_series(doc_type, prefix, next_no, pad, date_pattern) VALUES(?,?,?,?,?)',
        docType, prefix, 1, 4, docType === 'VOUCHER' ? 'yyyyMM' : 'yyyyMM');
    }
  }
}

function pattern(dateStr, pat) {
  const d = String(dateStr || new Date().toISOString().slice(0, 10));
  const [y, m, day] = d.split('-');
  return String(pat || 'yyyyMM')
    .replace('yyyy', y)
    .replace('MM', m)
    .replace('dd', day || '01');
}

/** 生成单据号，例：XSDD2026100001 */
export function nextDocNo(docType, dateStr) {
  let s = get('SELECT * FROM number_series WHERE doc_type = ?', docType);
  if (!s) {
    run('INSERT INTO number_series(doc_type, prefix, next_no, pad, date_pattern) VALUES(?,?,?,?,?)',
      docType, DEFAULT_SERIES[docType] || docType, 1, 4, 'yyyyMM');
    s = get('SELECT * FROM number_series WHERE doc_type = ?', docType);
  }
  const pad = (n) => String(n).padStart(s.pad || 4, '0');
  const no = `${s.prefix}${pattern(dateStr, s.date_pattern)}${pad(s.next_no)}`;
  run('UPDATE number_series SET next_no = next_no + 1 WHERE doc_type = ?', docType);
  return no;
}

/** 预览下一个单据号（不占用号段） */
export function peekDocNo(docType, dateStr) {
  let s = get('SELECT * FROM number_series WHERE doc_type = ?', docType);
  if (!s) {
    run('INSERT INTO number_series(doc_type, prefix, next_no, pad, date_pattern) VALUES(?,?,?,?,?)',
      docType, DEFAULT_SERIES[docType] || docType, 1, 4, 'yyyyMM');
    s = get('SELECT * FROM number_series WHERE doc_type = ?', docType);
  }
  const pad = (n) => String(n).padStart(s.pad || 4, '0');
  return `${s.prefix}${pattern(dateStr, s.date_pattern)}${pad(s.next_no)}`;
}

/** 凭证号：记-202610-0001（按期间独立编号） */
export function nextVoucherNo(period) {
  const row = get("SELECT COUNT(*) AS c FROM vouchers WHERE period = ?", period);
  const seq = (row?.c || 0) + 1;
  return `记-${period.replace('-', '')}-${String(seq).padStart(4, '0')}`;
}

export function nextInvoiceNo(type, dateStr) {
  return nextDocNo(type, dateStr);
}

export function allSeries() {
  return all('SELECT * FROM number_series ORDER BY doc_type');
}
