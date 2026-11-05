import dayjs from 'dayjs';

export function fmtMoney(v: any, digits = 2): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtNumber(v: any, digits = 0): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtQty(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function todayStr(): string {
  return dayjs().format('YYYY-MM-DD');
}

export function monthStart(): string {
  return dayjs().startOf('month').format('YYYY-MM-DD');
}

export function fmtDate(v: any): string {
  if (!v) return '-';
  return String(v).slice(0, 10);
}

export function fmtDateTime(v: any): string {
  if (!v) return '-';
  return String(v).slice(0, 16);
}

export function percent(v: any, digits = 1): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0%';
  return `${(n * 100).toFixed(digits)}%`;
}

/** 人民币金额转中文大写 */
export function toChineseMoney(n: number): string {
  if (!Number.isFinite(n)) return '';
  const fraction = ['角', '分'];
  const digit = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const unit = [['元', '万', '亿'], ['', '拾', '佰', '仟']];
  let head = n < 0 ? '负' : '';
  n = Math.abs(n);
  let s = '';
  for (let i = 0; i < fraction.length; i++) {
    s += (digit[Math.floor(n * 10 * Math.pow(10, i)) % 10] + fraction[i]).replace(/零./, '');
  }
  s = s || '整';
  n = Math.floor(n);
  for (let i = 0; i < unit[0].length && n > 0; i++) {
    let p = '';
    for (let j = 0; j < unit[1].length && n > 0; j++) {
      p = digit[n % 10] + unit[1][j] + p;
      n = Math.floor(n / 10);
    }
    s = p.replace(/(零.)*零$/, '').replace(/^$/, '零') + unit[0][i] + s;
  }
  let out = head + s.replace(/(零.)*零元/, '元').replace(/(零.)+/g, '零').replace(/^整$/, '零元整');
  if (/[角分]$/.test(out)) out += '整';
  return out;
}

export interface CsvColumn { title: string; dataIndex?: string | string[]; render?: (...args: any[]) => any; csv?: (row: any) => any }

export function exportCsv(filename: string, columns: CsvColumn[], rows: any[]) {
  const cols = columns.filter((c) => c.dataIndex || c.csv);
  const header = cols.map((c) => `"${String(c.title).replace(/"/g, '""')}"`).join(',');
  const body = rows.map((row) =>
    cols.map((c) => {
      let v: any;
      if (c.csv) v = c.csv(row);
      else {
        const idx = Array.isArray(c.dataIndex) ? c.dataIndex.join('.') : (c.dataIndex as string);
        v = idx.split('.').reduce((o: any, k: string) => (o == null ? o : o[k]), row);
      }
      if (v === null || v === undefined) v = '';
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(',')
  ).join('\r\n');
  const blob = new Blob(['\ufeff' + header + '\r\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function dayjsToStr(v: any): any {
  if (v && typeof v === 'object' && typeof v.format === 'function') return v.format('YYYY-MM-DD');
  return v;
}

export function rangeToParams(v: any): Record<string, string> {
  if (!v || !v[0] || !v[1]) return {};
  return { startDate: dayjs(v[0]).format('YYYY-MM-DD'), endDate: dayjs(v[1]).format('YYYY-MM-DD') };
}

export const DOC_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  APPROVED: 'success',
  PARTIAL_SHIPPED: 'warning',
  FULL_SHIPPED: 'cyan',
  COMPLETED: 'success',
  CLOSED: 'default',
  VOID: 'error',
  PARTIAL_RECEIVED: 'warning',
  FULL_RECEIVED: 'cyan',
  RELEASED: 'processing',
  IN_PROGRESS: 'processing',
};

export function statusColor(status: string, docType?: string): string {
  return DOC_STATUS_COLORS[status] || 'default';
}
