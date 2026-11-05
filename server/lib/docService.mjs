import { get, run } from '../db.mjs';
import { ApiError, ok } from '../http.mjs';
import { audit, hasPermission } from '../auth.mjs';
import { DOC_TYPES } from '../lib/docTypes.mjs';
import { all } from '../db.mjs';

const HEADER_COLUMNS = [
  'partner_id', 'contact', 'phone', 'address', 'salesperson_id', 'department_id',
  'warehouse_id', 'to_warehouse_id', 'currency', 'exchange_rate', 'payment_terms',
  'due_date', 'project', 'source_type', 'source_id', 'source_no', 'remark',
];

/** 把前端提交的 header 拆成表字段 + extra_json */
export function splitHeader(input = {}) {
  const cols = {};
  const extra = {};
  for (const [k, v] of Object.entries(input)) {
    if (HEADER_COLUMNS.includes(k)) cols[k] = v;
    else if (k.startsWith('x_') || k === 'extra') extra[k] = v;
  }
  return { cols, extra };
}

export function mergedExtra(doc) {
  let e = {};
  try { e = JSON.parse(doc?.extra_json || '{}'); } catch { e = {}; }
  return e;
}

export function lineCalc(line) {
  const qty = Number(line.qty) || 0;
  const price = Number(line.price) || 0;
  const discountRate = Number(line.discount_rate) || 0;
  const taxRate = Number(line.tax_rate) || 0;
  const amount = Math.round(qty * price * (1 - discountRate / 100) * 100) / 100;
  const taxAmount = Math.round(amount * taxRate / 100 * 100) / 100;
  return { qty, price, discountRate, taxRate, amount, taxAmount, totalAmount: Math.round((amount + taxAmount) * 100) / 100 };
}

export function docTotals(lines) {
  let subtotal = 0, taxAmount = 0, discountAmount = 0;
  for (const l of lines) {
    const c = lineCalc(l);
    subtotal += c.amount;
    taxAmount += c.taxAmount;
    discountAmount += (c.qty * c.price * c.discountRate) / 100;
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  return { subtotal: r2(subtotal), discount_amount: r2(discountAmount), tax_amount: r2(taxAmount), total_amount: r2(subtotal + taxAmount) };
}

export function enrichItemLines(lines) {
  return lines.map((line) => {
    if (!line.item_id) return line;
    const item = get('SELECT code, name, spec, uom, tax_rate FROM items WHERE id = ?', line.item_id);
    return {
      ...line,
      item_code: item?.code || line.item_code,
      item_name: item?.name || line.item_name,
      spec: item?.spec || line.spec,
      uom: item?.uom || line.uom,
      tax_rate: line.tax_rate !== undefined && line.tax_rate !== null && line.tax_rate !== '' ? line.tax_rate : item?.tax_rate ?? 13,
    };
  });
}

export function listDocuments({
  docType, status, partnerId, keyword, startDate, endDate, page = 1, pageSize = 20,
  warehouseId, minAmount, maxAmount, salespersonId, extraWhere, extraParams = [], scope,
}) {
  const where = ['d.doc_type = ?'];
  const params = [docType];
  if (status) {
    const arr = String(status).split(',').filter(Boolean);
    where.push(`d.status IN (${arr.map(() => '?').join(',')})`);
    params.push(...arr);
  }
  if (partnerId) { where.push('d.partner_id = ?'); params.push(Number(partnerId)); }
  if (warehouseId) { where.push('d.warehouse_id = ?'); params.push(Number(warehouseId)); }
  if (salespersonId) { where.push('d.salesperson_id = ?'); params.push(Number(salespersonId)); }
  if (startDate) { where.push('d.doc_date >= ?'); params.push(startDate); }
  if (endDate) { where.push('d.doc_date <= ?'); params.push(endDate); }
  if (minAmount) { where.push('d.total_amount >= ?'); params.push(Number(minAmount)); }
  if (maxAmount) { where.push('d.total_amount <= ?'); params.push(Number(maxAmount)); }
  if (keyword) {
    where.push('(d.doc_no LIKE ? OR d.remark LIKE ? OR d.project LIKE ? OR d.source_no LIKE ? OR EXISTS (SELECT 1 FROM customers cc WHERE cc.id = d.partner_id AND d.partner_type=\'customer\' AND (cc.name LIKE ? OR cc.code LIKE ?)) OR EXISTS (SELECT 1 FROM suppliers ss WHERE ss.id = d.partner_id AND d.partner_type=\'supplier\' AND (ss.name LIKE ? OR ss.code LIKE ?)))');
    const k = `%${keyword}%`;
    params.push(k, k, k, k, k, k, k, k);
  }
  if (extraWhere) where.push(extraWhere);
  params.push(...extraParams);
  // 数据范围：all / dept（本部门）/ self（本人，按业务员或制单人）
  if (scope?.where) {
    where.push(scope.where);
    params.push(...(scope.params || []));
  }
  const w = where.join(' AND ');
  const total = get(`SELECT COUNT(*) AS c FROM documents d WHERE ${w}`, ...params)?.c || 0;
  const offset = (page - 1) * pageSize;
  const rows = all(`
    SELECT d.*, COALESCE(c.name, s.name) AS partner_name,
           c.phone AS partner_phone, e.name AS salesperson_name, w2.name AS warehouse_name,
           wt.name AS to_warehouse_name
    FROM documents d
    LEFT JOIN customers c ON c.id = d.partner_id AND d.partner_type = 'customer'
    LEFT JOIN suppliers s ON s.id = d.partner_id AND d.partner_type = 'supplier'
    LEFT JOIN employees e ON e.id = d.salesperson_id
    LEFT JOIN warehouses w2 ON w2.id = d.warehouse_id
    LEFT JOIN warehouses wt ON wt.id = d.to_warehouse_id
    WHERE ${w}
    ORDER BY d.doc_date DESC, d.id DESC
    LIMIT ? OFFSET ?`, ...params, pageSize, offset);
  return { rows, total, page, pageSize };
}

export function getDocumentFull(id) {
  const doc = get('SELECT * FROM documents WHERE id = ?', Number(id));
  if (!doc) throw new ApiError('单据不存在', 404, 'NOT_FOUND');
  const lines = all('SELECT * FROM document_lines WHERE doc_id = ? ORDER BY line_no', doc.id).map((l) => ({
    ...l,
    extra: (() => { try { return JSON.parse(l.extra_json || '{}'); } catch { return {}; } })(),
  }));
  const logs = all('SELECT * FROM document_logs WHERE doc_id = ? ORDER BY id', doc.id);
  const invoices = all('SELECT * FROM invoices WHERE doc_id = ? AND invoice_type IN (?,?)', doc.id, 'AR', 'AP');
  const vouchers = all('SELECT id, voucher_no, voucher_date, total_debit, total_credit, summary FROM vouchers WHERE source_type = ? AND source_id = ?', doc.doc_type, doc.id);
  const partner = doc.partner_type === 'customer'
    ? get('SELECT * FROM customers WHERE id = ?', doc.partner_id)
    : doc.partner_type === 'supplier' ? get('SELECT * FROM suppliers WHERE id = ?', doc.partner_id) : null;
  const extra = mergedExtra(doc);
  // 关联单据：上游来源单 + 下游执行单
  const sourceDoc = doc.source_id ? get('SELECT id, doc_type, doc_no, doc_date, status, total_amount FROM documents WHERE id = ?', doc.source_id) : null;
  const relatedDocs = all(`SELECT id, doc_type, doc_no, doc_date, status, total_amount FROM documents WHERE source_id = ? AND source_type = ? ORDER BY id`, doc.id, doc.doc_type);
  const names = {
    partner_name: partner?.name || null,
    salesperson_name: doc.salesperson_id ? get('SELECT name FROM employees WHERE id = ?', doc.salesperson_id)?.name || null : null,
    warehouse_name: doc.warehouse_id ? get('SELECT name FROM warehouses WHERE id = ?', doc.warehouse_id)?.name || null : null,
    to_warehouse_name: doc.to_warehouse_id ? get('SELECT name FROM warehouses WHERE id = ?', doc.to_warehouse_id)?.name || null : null,
    department_name: doc.department_id ? get('SELECT name FROM departments WHERE id = ?', doc.department_id)?.name || null : null,
  };
  return { ...doc, ...extra, ...names, extra, lines, logs, invoices, vouchers, partner, sourceDoc, relatedDocs };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function isValidDate(s) {
  const m = DATE_RE.exec(String(s || ''));
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, mo - 1, d);
  // 用本地年月日回读校验，避免时区导致日期偏移
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

export function validateDocument({ docType, header, lines, isEdit }) {
  const t = DOC_TYPES[docType];
  if (!t) throw new ApiError(`未知单据类型: ${docType}`, 400);
  if (!header.doc_date) throw new ApiError('单据日期不能为空');
  if (!isValidDate(header.doc_date)) throw new ApiError(`单据日期格式不正确或日期不存在：${header.doc_date}`);
  if (t.partnerType) {
    if (!header.partner_id) throw new ApiError(`请选择${t.partnerType === 'customer' ? '客户' : '供应商'}`);
  }
  for (const f of t.fields || []) {
    if (f.required) {
      const v = header[f.key];
      if (v === undefined || v === null || v === '') throw new ApiError(`${f.label}不能为空`);
    }
  }
  if (!Array.isArray(lines) || lines.length === 0) throw new ApiError('单据明细不能为空');
  const mode = t.lines?.mode || 'items';
  if (mode === 'items') {
    for (const [i, l] of lines.entries()) {
      if (!l.item_id) throw new ApiError(`第 ${i + 1} 行未选择物料`);
      if (!(Number(l.qty) > 0) && docType !== 'ADJ') throw new ApiError(`第 ${i + 1} 行数量必须大于 0`);
      if (Number(l.qty) < 0) throw new ApiError(`第 ${i + 1} 行数量不能为负`);
      if (Number(l.price) < 0) throw new ApiError(`第 ${i + 1} 行单价不能为负数`);
      const disc = Number(l.discount_rate) || 0;
      if (disc < 0 || disc > 100) throw new ApiError(`第 ${i + 1} 行折扣率必须在 0~100% 之间`);
      const tax = Number(l.tax_rate);
      if (Number.isFinite(tax) && (tax < 0 || tax > 100)) throw new ApiError(`第 ${i + 1} 行税率必须在 0~100% 之间`);
    }
  } else if (mode === 'invoices') {
    for (const [i, l] of lines.entries()) {
      let extra = {};
      try { extra = typeof l.extra_json === 'string' ? JSON.parse(l.extra_json || '{}') : (l.extra || {}); } catch { extra = {}; }
      const invId = l.invoice_id ?? extra.invoice_id;
      if (!invId) throw new ApiError(`第 ${i + 1} 行未选择发票`);
      if (!(Number(l.amount ?? l.total_amount) > 0)) throw new ApiError(`第 ${i + 1} 行核销金额必须大于 0`);
    }
  }
  if (docType === 'TR' && header.warehouse_id && header.to_warehouse_id && Number(header.warehouse_id) === Number(header.to_warehouse_id)) {
    throw new ApiError('调出仓库与调入仓库不能相同');
  }
  return true;
}

export function transitionDocTo(doc, action, user) {
  const t = DOC_TYPES[doc.doc_type];
  const tr = t.transitions.find((x) => x.action === action);
  if (!tr) throw new ApiError(`单据不支持该操作: ${action}`);
  if (!tr.from.includes(doc.status)) {
    throw new ApiError(`当前状态「${doc.status}」不允许执行「${tr.label}」`);
  }
  const perm = `${t.module}.${tr.perm}`;
  if (!hasPermission(user, perm) && !hasPermission(user, `${t.module}.edit`)) {
    throw new ApiError(`无权限执行「${tr.label}」（需要 ${perm}）`, 403);
  }
  return tr;
}
