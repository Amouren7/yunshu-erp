/**
 * 报表中心 API
 * 统一约定：GET /api/reports/xxx?startDate=&endDate=&page=&pageSize=
 * 列表统一返回 { rows, total, page, pageSize, summary }，金额保留 2 位小数。
 * 销售类报表口径：金额 = 未税金额(subtotal)，total_amount = 价税合计；
 * 毛利 = 未税销售额 - 销售成本，毛利率 = 毛利 / 未税销售额。
 */
import { all, get } from '../db.mjs';
import { ApiError, paginate, round2, todayStr } from '../http.mjs';
import { inventoryValue } from '../lib/stock.mjs';

const SALES_STATUSES = ['APPROVED', 'PARTIAL_SHIPPED', 'FULL_SHIPPED', 'COMPLETED'];
const PURCHASE_STATUSES = ['APPROVED', 'PARTIAL_RECEIVED', 'FULL_RECEIVED', 'COMPLETED'];
const SALES_IN = SALES_STATUSES.map(() => '?').join(',');
const PURCHASE_IN = PURCHASE_STATUSES.map(() => '?').join(',');

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return ymd(d);
}
function shiftYear(dateStr, years) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setFullYear(d.getFullYear() + years);
  return ymd(d);
}
function dayDiff(startDate, endDate) {
  return Math.round((new Date(`${endDate}T00:00:00`) - new Date(`${startDate}T00:00:00`)) / 86400000);
}
function lastMonths(endDate, n) {
  const d = new Date(`${endDate}T00:00:00`);
  d.setDate(1);
  const list = [];
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    list.push(`${x.getFullYear()}-${pad2(x.getMonth() + 1)}`);
  }
  return list;
}
function growthRate(cur, prev) {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  if (!p) return null;
  return round2(((c - p) / Math.abs(p)) * 100);
}
function grossRate(profit, amount) {
  return Number(amount) ? round2((Number(profit) / Number(amount)) * 100) : 0;
}
function resolveRange(ctx, defaultMonths = 12) {
  const endDate = isDate(ctx.query.endDate) ? ctx.query.endDate : todayStr();
  let startDate = isDate(ctx.query.startDate) ? ctx.query.startDate : null;
  if (!startDate) {
    const d = new Date(`${endDate}T00:00:00`);
    d.setDate(1);
    d.setMonth(d.getMonth() - (defaultMonths - 1));
    startDate = ymd(d);
  }
  if (startDate > endDate) throw new ApiError('开始日期不能晚于结束日期');
  return { startDate, endDate };
}

/** 单据头汇总（金额为未税） */
function docTotals(docType, statuses, startDate, endDate) {
  const r = get(
    `SELECT COUNT(*) AS orders,
            ROUND(COALESCE(SUM(subtotal),0),2) AS amount,
            ROUND(COALESCE(SUM(tax_amount),0),2) AS tax_amount,
            ROUND(COALESCE(SUM(total_amount),0),2) AS total_amount,
            ROUND(COALESCE(SUM(cost_amount),0),2) AS cost_amount
       FROM documents
      WHERE doc_type = ? AND status IN (${statuses.map(() => '?').join(',')}) AND doc_date BETWEEN ? AND ?`,
    docType, ...statuses, startDate, endDate
  ) || { orders: 0, amount: 0, tax_amount: 0, total_amount: 0, cost_amount: 0 };
  const amount = round2(r.amount);
  const cost = round2(r.cost_amount);
  return {
    orders: Number(r.orders) || 0,
    amount,
    tax_amount: round2(r.tax_amount),
    total_amount: round2(r.total_amount),
    cost_amount: cost,
    profit: round2(amount - cost),
  };
}

export function register(router) {
  // ============================================================
  // 销售汇总（按客户）
  // ============================================================
  router.get('/api/reports/sales-summary', async (ctx) => {
    const { startDate, endDate } = resolveRange(ctx);
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [
      "d.doc_type = 'DN'",
      `d.status IN (${SALES_IN})`,
      'd.doc_date BETWEEN ? AND ?',
      'd.partner_id IS NOT NULL',
    ];
    const params = [...SALES_STATUSES, startDate, endDate];
    if (ctx.query.customerId) { where.push('d.partner_id = ?'); params.push(Number(ctx.query.customerId)); }
    if (ctx.query.keyword) {
      where.push('(c.code LIKE ? OR c.name LIKE ?)');
      const kw = `%${ctx.query.keyword}%`;
      params.push(kw, kw);
    }
    const w = `WHERE ${where.join(' AND ')}`;
    const total = get(`SELECT COUNT(DISTINCT d.partner_id) AS c FROM documents d JOIN customers c ON c.id = d.partner_id ${w}`, ...params)?.c || 0;
    const rows = all(
      `WITH qty AS (
         SELECT d.partner_id AS pid, ROUND(SUM(l.qty),2) AS qty
           FROM document_lines l JOIN documents d ON d.id = l.doc_id
          WHERE d.doc_type = 'DN' AND d.status IN (${SALES_IN}) AND d.doc_date BETWEEN ? AND ?
          GROUP BY d.partner_id)
       SELECT c.id AS customer_id, c.code AS customer_code, c.name AS customer_name, c.level, c.region,
              COUNT(*) AS order_count,
              ROUND(COALESCE(SUM(d.subtotal),0),2) AS amount,
              ROUND(COALESCE(SUM(d.tax_amount),0),2) AS tax_amount,
              ROUND(COALESCE(SUM(d.total_amount),0),2) AS total_amount,
              ROUND(COALESCE(SUM(d.cost_amount),0),2) AS cost_amount,
              ROUND(COALESCE(SUM(d.subtotal - d.cost_amount),0),2) AS profit,
              COALESCE(q.qty,0) AS qty
         FROM documents d
         JOIN customers c ON c.id = d.partner_id
         LEFT JOIN qty q ON q.pid = c.id
         ${w}
        GROUP BY c.id ORDER BY total_amount DESC LIMIT ? OFFSET ?`,
      ...SALES_STATUSES, startDate, endDate, ...params, pageSize, offset
    ).map((r) => ({ ...r, profit_rate: grossRate(r.profit, r.amount) }));
    const summaryRow = get(
      `SELECT COUNT(DISTINCT d.id) AS orders,
              ROUND(COALESCE(SUM(d.subtotal),0),2) AS amount,
              ROUND(COALESCE(SUM(d.tax_amount),0),2) AS tax_amount,
              ROUND(COALESCE(SUM(d.total_amount),0),2) AS total_amount,
              ROUND(COALESCE(SUM(d.cost_amount),0),2) AS cost_amount,
              ROUND(COALESCE(SUM(d.subtotal - d.cost_amount),0),2) AS profit
         FROM documents d JOIN customers c ON c.id = d.partner_id ${w}`,
      ...params
    ) || {};
    return {
      rows, total, page, pageSize, startDate, endDate,
      summary: {
        customerCount: total,
        orders: Number(summaryRow.orders) || 0,
        amount: round2(summaryRow.amount),
        tax_amount: round2(summaryRow.tax_amount),
        total_amount: round2(summaryRow.total_amount),
        cost_amount: round2(summaryRow.cost_amount),
        profit: round2(summaryRow.profit),
        profit_rate: grossRate(summaryRow.profit, summaryRow.amount),
      },
    };
  }, { perm: 'reports.view' });

  // ============================================================
  // 销售汇总（按产品）
  // ============================================================
  router.get('/api/reports/sales-by-item', async (ctx) => {
    const { startDate, endDate } = resolveRange(ctx);
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [
      "d.doc_type = 'DN'",
      `d.status IN (${SALES_IN})`,
      'd.doc_date BETWEEN ? AND ?',
      'l.item_id IS NOT NULL',
    ];
    const params = [...SALES_STATUSES, startDate, endDate];
    if (ctx.query.categoryId) { where.push('i.category_id = ?'); params.push(Number(ctx.query.categoryId)); }
    if (ctx.query.keyword) {
      where.push('(i.code LIKE ? OR i.name LIKE ? OR i.spec LIKE ?)');
      const kw = `%${ctx.query.keyword}%`;
      params.push(kw, kw, kw);
    }
    const w = `WHERE ${where.join(' AND ')}`;
    const total = get(
      `SELECT COUNT(DISTINCT l.item_id) AS c FROM document_lines l
         JOIN documents d ON d.id = l.doc_id JOIN items i ON i.id = l.item_id ${w}`,
      ...params
    )?.c || 0;
    const rows = all(
      `SELECT i.id AS item_id, i.code AS item_code, i.name AS item_name, i.spec, i.uom, i.item_type,
              c.name AS category_name,
              COUNT(DISTINCT d.id) AS order_count,
              ROUND(COALESCE(SUM(l.qty),0),2) AS qty,
              ROUND(COALESCE(SUM(l.amount),0),2) AS amount,
              ROUND(COALESCE(SUM(l.tax_amount),0),2) AS tax_amount,
              ROUND(COALESCE(SUM(l.total_amount),0),2) AS total_amount,
              ROUND(COALESCE(SUM(l.cost_amount),0),2) AS cost_amount,
              ROUND(COALESCE(SUM(l.amount - l.cost_amount),0),2) AS profit
         FROM document_lines l
         JOIN documents d ON d.id = l.doc_id
         JOIN items i ON i.id = l.item_id
         LEFT JOIN item_categories c ON c.id = i.category_id
         ${w}
        GROUP BY l.item_id ORDER BY total_amount DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, offset
    ).map((r) => ({ ...r, profit_rate: grossRate(r.profit, r.amount) }));
    const summaryRow = get(
      `SELECT COUNT(DISTINCT d.id) AS orders,
              ROUND(COALESCE(SUM(l.qty),0),2) AS qty,
              ROUND(COALESCE(SUM(l.amount),0),2) AS amount,
              ROUND(COALESCE(SUM(l.tax_amount),0),2) AS tax_amount,
              ROUND(COALESCE(SUM(l.total_amount),0),2) AS total_amount,
              ROUND(COALESCE(SUM(l.cost_amount),0),2) AS cost_amount,
              ROUND(COALESCE(SUM(l.amount - l.cost_amount),0),2) AS profit
         FROM document_lines l JOIN documents d ON d.id = l.doc_id JOIN items i ON i.id = l.item_id ${w}`,
      ...params
    ) || {};
    return {
      rows, total, page, pageSize, startDate, endDate,
      summary: {
        itemCount: total,
        orders: Number(summaryRow.orders) || 0,
        qty: round2(summaryRow.qty),
        amount: round2(summaryRow.amount),
        tax_amount: round2(summaryRow.tax_amount),
        total_amount: round2(summaryRow.total_amount),
        cost_amount: round2(summaryRow.cost_amount),
        profit: round2(summaryRow.profit),
        profit_rate: grossRate(summaryRow.profit, summaryRow.amount),
      },
    };
  }, { perm: 'reports.view' });

  // ============================================================
  // 销售汇总（按业务员）
  // ============================================================
  router.get('/api/reports/sales-by-salesperson', async (ctx) => {
    const { startDate, endDate } = resolveRange(ctx);
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [
      "d.doc_type = 'DN'",
      `d.status IN (${SALES_IN})`,
      'd.doc_date BETWEEN ? AND ?',
    ];
    const params = [...SALES_STATUSES, startDate, endDate];
    if (ctx.query.departmentId) { where.push('d.department_id = ?'); params.push(Number(ctx.query.departmentId)); }
    const w = `WHERE ${where.join(' AND ')}`;
    const total = get(
      `SELECT COUNT(DISTINCT COALESCE(d.salesperson_id, 0)) AS c FROM documents d ${w}`,
      ...params
    )?.c || 0;
    const rows = all(
      `SELECT d.salesperson_id, e.code AS employee_code, e.name AS salesperson_name,
              d.department_id, dept.name AS department_name,
              COUNT(DISTINCT d.id) AS order_count,
              ROUND(COALESCE(SUM(l.qty),0),2) AS qty,
              ROUND(COALESCE(SUM(l.amount),0),2) AS amount,
              ROUND(COALESCE(SUM(l.tax_amount),0),2) AS tax_amount,
              ROUND(COALESCE(SUM(l.total_amount),0),2) AS total_amount,
              ROUND(COALESCE(SUM(l.cost_amount),0),2) AS cost_amount,
              ROUND(COALESCE(SUM(l.amount - l.cost_amount),0),2) AS profit
         FROM documents d
         LEFT JOIN document_lines l ON l.doc_id = d.id
         LEFT JOIN employees e ON e.id = d.salesperson_id
         LEFT JOIN departments dept ON dept.id = d.department_id
         ${w}
        GROUP BY d.salesperson_id ORDER BY total_amount DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, offset
    ).map((r) => ({
      ...r,
      salesperson_name: r.salesperson_name || '未分配',
      profit_rate: grossRate(r.profit, r.amount),
    }));
    const summaryRow = get(
      `SELECT COUNT(DISTINCT d.id) AS orders,
              ROUND(COALESCE(SUM(l.amount),0),2) AS amount,
              ROUND(COALESCE(SUM(l.total_amount),0),2) AS total_amount,
              ROUND(COALESCE(SUM(l.cost_amount),0),2) AS cost_amount,
              ROUND(COALESCE(SUM(l.amount - l.cost_amount),0),2) AS profit
         FROM documents d LEFT JOIN document_lines l ON l.doc_id = d.id ${w}`,
      ...params
    ) || {};
    return {
      rows, total, page, pageSize, startDate, endDate,
      summary: {
        salespersonCount: total,
        orders: Number(summaryRow.orders) || 0,
        amount: round2(summaryRow.amount),
        total_amount: round2(summaryRow.total_amount),
        cost_amount: round2(summaryRow.cost_amount),
        profit: round2(summaryRow.profit),
        profit_rate: grossRate(summaryRow.profit, summaryRow.amount),
      },
    };
  }, { perm: 'reports.view' });

  // ============================================================
  // 销售月度趋势（默认近 12 个月）
  // ============================================================
  router.get('/api/reports/sales-monthly', async (ctx) => {
    const endDate = isDate(ctx.query.endDate) ? ctx.query.endDate : todayStr();
    const months = Math.min(24, Math.max(1, Number(ctx.query.months) || 12));
    const periods = lastMonths(endDate, months);
    const startDate = `${periods[0]}-01`;
    const docs = all(
      `SELECT strftime('%Y-%m', doc_date) AS period, COUNT(*) AS orders,
              ROUND(COALESCE(SUM(subtotal),0),2) AS amount,
              ROUND(COALESCE(SUM(tax_amount),0),2) AS tax_amount,
              ROUND(COALESCE(SUM(total_amount),0),2) AS total_amount,
              ROUND(COALESCE(SUM(cost_amount),0),2) AS cost_amount,
              ROUND(COALESCE(SUM(subtotal - cost_amount),0),2) AS profit
         FROM documents
        WHERE doc_type = 'DN' AND status IN (${SALES_IN}) AND doc_date BETWEEN ? AND ?
        GROUP BY period`,
      ...SALES_STATUSES, startDate, endDate
    );
    const qtys = Object.fromEntries(
      all(
        `SELECT strftime('%Y-%m', d.doc_date) AS period, ROUND(COALESCE(SUM(l.qty),0),2) AS qty
           FROM document_lines l JOIN documents d ON d.id = l.doc_id
          WHERE d.doc_type = 'DN' AND d.status IN (${SALES_IN}) AND d.doc_date BETWEEN ? AND ?
          GROUP BY period`,
        ...SALES_STATUSES, startDate, endDate
      ).map((r) => [r.period, r.qty])
    );
    const docMap = Object.fromEntries(docs.map((r) => [r.period, r]));
    const rows = periods.map((period) => {
      const d = docMap[period] || {};
      const amount = round2(d.amount);
      const cost = round2(d.cost_amount);
      const profit = round2(amount - cost);
      return {
        period,
        orders: Number(d.orders) || 0,
        qty: round2(qtys[period] || 0),
        amount,
        tax_amount: round2(d.tax_amount),
        total_amount: round2(d.total_amount),
        cost_amount: cost,
        profit,
        profit_rate: grossRate(profit, amount),
      };
    });
    const summary = {
      amount: round2(rows.reduce((s, r) => s + r.amount, 0)),
      total_amount: round2(rows.reduce((s, r) => s + r.total_amount, 0)),
      cost_amount: round2(rows.reduce((s, r) => s + r.cost_amount, 0)),
      profit: round2(rows.reduce((s, r) => s + r.profit, 0)),
      orders: rows.reduce((s, r) => s + r.orders, 0),
    };
    summary.profit_rate = grossRate(summary.profit, summary.amount);
    return { rows, total: rows.length, startDate, endDate, months, summary };
  }, { perm: 'reports.view' });

  // ============================================================
  // 采购汇总（按供应商）
  // ============================================================
  router.get('/api/reports/purchase-summary', async (ctx) => {
    const { startDate, endDate } = resolveRange(ctx);
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [
      "d.doc_type = 'GRN'",
      `d.status IN (${PURCHASE_IN})`,
      'd.doc_date BETWEEN ? AND ?',
      'd.partner_id IS NOT NULL',
    ];
    const params = [...PURCHASE_STATUSES, startDate, endDate];
    if (ctx.query.supplierId) { where.push('d.partner_id = ?'); params.push(Number(ctx.query.supplierId)); }
    if (ctx.query.keyword) {
      where.push('(s.code LIKE ? OR s.name LIKE ?)');
      const kw = `%${ctx.query.keyword}%`;
      params.push(kw, kw);
    }
    const w = `WHERE ${where.join(' AND ')}`;
    const total = get(`SELECT COUNT(DISTINCT d.partner_id) AS c FROM documents d JOIN suppliers s ON s.id = d.partner_id ${w}`, ...params)?.c || 0;
    const rows = all(
      `WITH qty AS (
         SELECT d.partner_id AS pid, ROUND(SUM(l.qty),2) AS qty
           FROM document_lines l JOIN documents d ON d.id = l.doc_id
          WHERE d.doc_type = 'GRN' AND d.status IN (${PURCHASE_IN}) AND d.doc_date BETWEEN ? AND ?
          GROUP BY d.partner_id)
       SELECT s.id AS supplier_id, s.code AS supplier_code, s.name AS supplier_name, s.category, s.rating, s.region,
              COUNT(*) AS order_count,
              ROUND(COALESCE(SUM(d.subtotal),0),2) AS amount,
              ROUND(COALESCE(SUM(d.tax_amount),0),2) AS tax_amount,
              ROUND(COALESCE(SUM(d.total_amount),0),2) AS total_amount,
              COALESCE(q.qty,0) AS qty
         FROM documents d
         JOIN suppliers s ON s.id = d.partner_id
         LEFT JOIN qty q ON q.pid = s.id
         ${w}
        GROUP BY s.id ORDER BY total_amount DESC LIMIT ? OFFSET ?`,
      ...PURCHASE_STATUSES, startDate, endDate, ...params, pageSize, offset
    );
    const summaryRow = get(
      `SELECT COUNT(DISTINCT d.id) AS orders,
              ROUND(COALESCE(SUM(d.subtotal),0),2) AS amount,
              ROUND(COALESCE(SUM(d.tax_amount),0),2) AS tax_amount,
              ROUND(COALESCE(SUM(d.total_amount),0),2) AS total_amount
         FROM documents d JOIN suppliers s ON s.id = d.partner_id ${w}`,
      ...params
    ) || {};
    return {
      rows, total, page, pageSize, startDate, endDate,
      summary: {
        supplierCount: total,
        orders: Number(summaryRow.orders) || 0,
        amount: round2(summaryRow.amount),
        tax_amount: round2(summaryRow.tax_amount),
        total_amount: round2(summaryRow.total_amount),
      },
    };
  }, { perm: 'reports.view' });

  // ============================================================
  // 采购汇总（按产品）
  // ============================================================
  router.get('/api/reports/purchase-by-item', async (ctx) => {
    const { startDate, endDate } = resolveRange(ctx);
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [
      "d.doc_type = 'GRN'",
      `d.status IN (${PURCHASE_IN})`,
      'd.doc_date BETWEEN ? AND ?',
      'l.item_id IS NOT NULL',
    ];
    const params = [...PURCHASE_STATUSES, startDate, endDate];
    if (ctx.query.keyword) {
      where.push('(i.code LIKE ? OR i.name LIKE ?)');
      const kw = `%${ctx.query.keyword}%`;
      params.push(kw, kw);
    }
    const w = `WHERE ${where.join(' AND ')}`;
    const total = get(
      `SELECT COUNT(DISTINCT l.item_id) AS c FROM document_lines l
         JOIN documents d ON d.id = l.doc_id JOIN items i ON i.id = l.item_id ${w}`,
      ...params
    )?.c || 0;
    const rows = all(
      `SELECT i.id AS item_id, i.code AS item_code, i.name AS item_name, i.spec, i.uom, i.item_type,
              c.name AS category_name,
              COUNT(DISTINCT d.id) AS order_count,
              ROUND(COALESCE(SUM(l.qty),0),2) AS qty,
              ROUND(COALESCE(SUM(l.amount),0),2) AS amount,
              ROUND(COALESCE(SUM(l.tax_amount),0),2) AS tax_amount,
              ROUND(COALESCE(SUM(l.total_amount),0),2) AS total_amount
         FROM document_lines l
         JOIN documents d ON d.id = l.doc_id
         JOIN items i ON i.id = l.item_id
         LEFT JOIN item_categories c ON c.id = i.category_id
         ${w}
        GROUP BY l.item_id ORDER BY total_amount DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, offset
    ).map((r) => ({ ...r, avg_price: Number(r.qty) > 0 ? round2(Number(r.amount) / Number(r.qty)) : 0 }));
    const summaryRow = get(
      `SELECT COUNT(DISTINCT d.id) AS orders,
              ROUND(COALESCE(SUM(l.qty),0),2) AS qty,
              ROUND(COALESCE(SUM(l.amount),0),2) AS amount,
              ROUND(COALESCE(SUM(l.total_amount),0),2) AS total_amount
         FROM document_lines l JOIN documents d ON d.id = l.doc_id JOIN items i ON i.id = l.item_id ${w}`,
      ...params
    ) || {};
    return {
      rows, total, page, pageSize, startDate, endDate,
      summary: {
        itemCount: total,
        orders: Number(summaryRow.orders) || 0,
        qty: round2(summaryRow.qty),
        amount: round2(summaryRow.amount),
        total_amount: round2(summaryRow.total_amount),
      },
    };
  }, { perm: 'reports.view' });

  // ============================================================
  // 采购月度趋势（默认近 12 个月）
  // ============================================================
  router.get('/api/reports/purchase-monthly', async (ctx) => {
    const endDate = isDate(ctx.query.endDate) ? ctx.query.endDate : todayStr();
    const months = Math.min(24, Math.max(1, Number(ctx.query.months) || 12));
    const periods = lastMonths(endDate, months);
    const startDate = `${periods[0]}-01`;
    const docs = all(
      `SELECT strftime('%Y-%m', doc_date) AS period, COUNT(*) AS orders,
              ROUND(COALESCE(SUM(subtotal),0),2) AS amount,
              ROUND(COALESCE(SUM(tax_amount),0),2) AS tax_amount,
              ROUND(COALESCE(SUM(total_amount),0),2) AS total_amount
         FROM documents
        WHERE doc_type = 'GRN' AND status IN (${PURCHASE_IN}) AND doc_date BETWEEN ? AND ?
        GROUP BY period`,
      ...PURCHASE_STATUSES, startDate, endDate
    );
    const qtys = Object.fromEntries(
      all(
        `SELECT strftime('%Y-%m', d.doc_date) AS period, ROUND(COALESCE(SUM(l.qty),0),2) AS qty
           FROM document_lines l JOIN documents d ON d.id = l.doc_id
          WHERE d.doc_type = 'GRN' AND d.status IN (${PURCHASE_IN}) AND d.doc_date BETWEEN ? AND ?
          GROUP BY period`,
        ...PURCHASE_STATUSES, startDate, endDate
      ).map((r) => [r.period, r.qty])
    );
    const docMap = Object.fromEntries(docs.map((r) => [r.period, r]));
    const rows = periods.map((period) => {
      const d = docMap[period] || {};
      return {
        period,
        orders: Number(d.orders) || 0,
        qty: round2(qtys[period] || 0),
        amount: round2(d.amount),
        tax_amount: round2(d.tax_amount),
        total_amount: round2(d.total_amount),
      };
    });
    return {
      rows, total: rows.length, startDate, endDate, months,
      summary: {
        amount: round2(rows.reduce((s, r) => s + r.amount, 0)),
        total_amount: round2(rows.reduce((s, r) => s + r.total_amount, 0)),
        orders: rows.reduce((s, r) => s + r.orders, 0),
      },
    };
  }, { perm: 'reports.view' });

  // ============================================================
  // 库存余额（按仓库/分类汇总）
  // ============================================================
  router.get('/api/reports/inventory-balance', async () => {
    const inv = inventoryValue();
    const byWarehouse = all(
      `SELECT w.id AS warehouse_id, w.code, w.name, w.type,
              COUNT(DISTINCT sb.item_id) AS sku_count,
              ROUND(COALESCE(SUM(sb.qty),0),2) AS qty,
              ROUND(COALESCE(SUM(sb.qty * sb.avg_cost),0),2) AS amount
         FROM stock_balances sb JOIN warehouses w ON w.id = sb.warehouse_id
        WHERE sb.qty <> 0
        GROUP BY w.id ORDER BY amount DESC`
    );
    const byCategory = all(
      `SELECT COALESCE(c.id, 0) AS category_id, COALESCE(c.name, '未分类') AS category_name,
              COUNT(DISTINCT sb.item_id) AS sku_count,
              ROUND(COALESCE(SUM(sb.qty),0),2) AS qty,
              ROUND(COALESCE(SUM(sb.qty * sb.avg_cost),0),2) AS amount
         FROM stock_balances sb
         JOIN items i ON i.id = sb.item_id
         LEFT JOIN item_categories c ON c.id = i.category_id
        WHERE sb.qty <> 0
        GROUP BY c.id ORDER BY amount DESC`
    );
    const topItems = all(
      `SELECT sb.item_id, i.code AS item_code, i.name AS item_name, i.spec, i.uom, i.item_type,
              ROUND(SUM(sb.qty),2) AS qty,
              ROUND(SUM(sb.qty * sb.avg_cost),2) AS amount,
              ROUND(AVG(sb.avg_cost),2) AS avg_cost
         FROM stock_balances sb JOIN items i ON i.id = sb.item_id
        WHERE sb.qty <> 0
        GROUP BY sb.item_id ORDER BY amount DESC LIMIT 20`
    );
    return {
      summary: {
        total_amount: round2(inv.amount),
        sku_count: Number(inv.sku_count) || 0,
        warehouse_count: byWarehouse.length,
        category_count: byCategory.length,
        total_qty: round2(byWarehouse.reduce((s, r) => s + Number(r.qty || 0), 0)),
      },
      byWarehouse,
      byCategory,
      topItems,
    };
  }, { perm: 'reports.view' });

  // ============================================================
  // 库存周转率（本期出库成本 / 平均库存）
  // ============================================================
  router.get('/api/reports/inventory-turnover', async (ctx) => {
    const { startDate, endDate } = resolveRange(ctx);
    const sumDirection = (direction, mode) => {
      const dateSql = mode === 'range'
        ? 'biz_date BETWEEN ? AND ?'
        : 'biz_date > ?';
      const params = mode === 'range' ? [direction, startDate, endDate] : [direction, endDate];
      return round2(
        get(
          `SELECT ROUND(COALESCE(SUM(amount),0),2) AS v FROM stock_ledger
            WHERE direction = ? AND doc_type <> 'TR' AND ${dateSql}`,
          ...params
        )?.v || 0
      );
    };
    const inRange = sumDirection('IN', 'range');
    const outRange = sumDirection('OUT', 'range');
    const inAfter = sumDirection('IN', 'after');
    const outAfter = sumDirection('OUT', 'after');
    const currentValue = round2(inventoryValue().amount);
    const ending = round2(currentValue - inAfter + outAfter);
    // 期初库存 = 期末 - 本期净变动；历史数据存在四舍五入尾差，出现微小负数时归零
    const opening = round2(Math.max(0, ending - inRange + outRange));
    const avgInventory = round2((opening + ending) / 2);
    const turnoverRate = avgInventory > 0 ? round2(outRange / avgInventory) : 0;
    const days = Math.max(1, dayDiff(startDate, endDate) + 1);
    const turnoverDays = turnoverRate > 0 ? round2(days / turnoverRate) : null;

    // 按分类计算周转
    const catCurrent = all(
      `SELECT COALESCE(c.id, 0) AS category_id, COALESCE(c.name, '未分类') AS category_name,
              ROUND(COALESCE(SUM(sb.qty * sb.avg_cost),0),2) AS current_value
         FROM stock_balances sb JOIN items i ON i.id = sb.item_id
         LEFT JOIN item_categories c ON c.id = i.category_id
        GROUP BY c.id`
    );
    const catRange = all(
      `SELECT COALESCE(c.id, 0) AS category_id,
              ROUND(COALESCE(SUM(CASE WHEN sl.direction = 'OUT' THEN sl.amount ELSE 0 END),0),2) AS out_cost,
              ROUND(COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.amount ELSE 0 END),0),2) AS in_cost
         FROM stock_ledger sl JOIN items i ON i.id = sl.item_id
         LEFT JOIN item_categories c ON c.id = i.category_id
        WHERE sl.doc_type <> 'TR' AND sl.biz_date BETWEEN ? AND ?
        GROUP BY c.id`,
      startDate, endDate
    );
    const catAfter = all(
      `SELECT COALESCE(c.id, 0) AS category_id,
              ROUND(COALESCE(SUM(CASE WHEN sl.direction = 'OUT' THEN sl.amount ELSE 0 END),0),2) AS out_cost,
              ROUND(COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.amount ELSE 0 END),0),2) AS in_cost
         FROM stock_ledger sl JOIN items i ON i.id = sl.item_id
         LEFT JOIN item_categories c ON c.id = i.category_id
        WHERE sl.doc_type <> 'TR' AND sl.biz_date > ?
        GROUP BY c.id`,
      endDate
    );
    const rangeMap = Object.fromEntries(catRange.map((r) => [r.category_id, r]));
    const afterMap = Object.fromEntries(catAfter.map((r) => [r.category_id, r]));
    const byCategory = catCurrent.map((c) => {
      const range = rangeMap[c.category_id] || { out_cost: 0, in_cost: 0 };
      const after = afterMap[c.category_id] || { out_cost: 0, in_cost: 0 };
      const cur = round2(c.current_value);
      const endVal = round2(cur - Number(after.in_cost || 0) + Number(after.out_cost || 0));
      const openVal = round2(Math.max(0, endVal - Number(range.in_cost || 0) + Number(range.out_cost || 0)));
      const avg = round2((openVal + endVal) / 2);
      const rate = avg > 0 ? round2(Number(range.out_cost || 0) / avg) : 0;
      return {
        category_id: c.category_id,
        category_name: c.category_name,
        out_cost: round2(range.out_cost),
        in_cost: round2(range.in_cost),
        current_value: cur,
        opening_value: openVal,
        ending_value: endVal,
        avg_inventory: avg,
        turnover_rate: rate,
        turnover_days: rate > 0 ? round2(days / rate) : null,
      };
    }).sort((a, b) => b.out_cost - a.out_cost);
    return {
      startDate, endDate, days,
      summary: {
        out_cost: outRange,
        in_cost: inRange,
        current_inventory: currentValue,
        opening_inventory: opening,
        ending_inventory: ending,
        avg_inventory: avgInventory,
        turnover_rate: turnoverRate,
        turnover_days: turnoverDays,
      },
      byCategory,
    };
  }, { perm: 'reports.view' });

  // ============================================================
  // 毛利分析（单据级）
  // ============================================================
  router.get('/api/reports/gross-profit', async (ctx) => {
    const { startDate, endDate } = resolveRange(ctx);
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [
      "d.doc_type = 'DN'",
      `d.status IN (${SALES_IN})`,
      'd.doc_date BETWEEN ? AND ?',
    ];
    const params = [...SALES_STATUSES, startDate, endDate];
    if (ctx.query.customerId) { where.push('d.partner_id = ?'); params.push(Number(ctx.query.customerId)); }
    if (ctx.query.keyword) {
      where.push('(d.doc_no LIKE ? OR c.name LIKE ?)');
      const kw = `%${ctx.query.keyword}%`;
      params.push(kw, kw);
    }
    const w = `WHERE ${where.join(' AND ')}`;
    const total = get(
      `SELECT COUNT(*) AS c FROM documents d LEFT JOIN customers c ON c.id = d.partner_id ${w}`,
      ...params
    )?.c || 0;
    const rows = all(
      `SELECT d.id, d.doc_no, d.doc_date, d.partner_id, c.code AS customer_code, c.name AS customer_name,
              d.salesperson_id, e.name AS salesperson_name,
              ROUND(d.subtotal,2) AS amount,
              ROUND(d.tax_amount,2) AS tax_amount,
              ROUND(d.total_amount,2) AS total_amount,
              ROUND(d.cost_amount,2) AS cost_amount,
              ROUND(d.subtotal - d.cost_amount,2) AS profit
         FROM documents d
         LEFT JOIN customers c ON c.id = d.partner_id
         LEFT JOIN employees e ON e.id = d.salesperson_id
         ${w}
        ORDER BY d.doc_date DESC, d.id DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, offset
    ).map((r) => ({ ...r, profit_rate: grossRate(r.profit, r.amount) }));
    const summaryRow = get(
      `SELECT COUNT(*) AS orders,
              ROUND(COALESCE(SUM(d.subtotal),0),2) AS amount,
              ROUND(COALESCE(SUM(d.tax_amount),0),2) AS tax_amount,
              ROUND(COALESCE(SUM(d.total_amount),0),2) AS total_amount,
              ROUND(COALESCE(SUM(d.cost_amount),0),2) AS cost_amount,
              ROUND(COALESCE(SUM(d.subtotal - d.cost_amount),0),2) AS profit
         FROM documents d LEFT JOIN customers c ON c.id = d.partner_id ${w}`,
      ...params
    ) || {};
    return {
      rows, total, page, pageSize, startDate, endDate,
      summary: {
        orders: Number(summaryRow.orders) || 0,
        amount: round2(summaryRow.amount),
        tax_amount: round2(summaryRow.tax_amount),
        total_amount: round2(summaryRow.total_amount),
        cost_amount: round2(summaryRow.cost_amount),
        profit: round2(summaryRow.profit),
        profit_rate: grossRate(summaryRow.profit, summaryRow.amount),
      },
    };
  }, { perm: 'reports.view' });

  // ============================================================
  // 客户贡献 ABC 分析
  // ============================================================
  router.get('/api/reports/customer-contribution', async (ctx) => {
    const { startDate, endDate } = resolveRange(ctx);
    const { page, pageSize } = paginate(ctx.req);
    const rowsAll = all(
      `SELECT d.partner_id AS customer_id, c.code AS customer_code, c.name AS customer_name,
              c.level, c.region, c.category,
              COUNT(DISTINCT d.id) AS order_count,
              ROUND(COALESCE(SUM(d.subtotal),0),2) AS amount,
              ROUND(COALESCE(SUM(d.total_amount),0),2) AS total_amount,
              ROUND(COALESCE(SUM(d.cost_amount),0),2) AS cost_amount,
              ROUND(COALESCE(SUM(d.subtotal - d.cost_amount),0),2) AS profit
         FROM documents d JOIN customers c ON c.id = d.partner_id
        WHERE d.doc_type = 'DN' AND d.status IN (${SALES_IN}) AND d.doc_date BETWEEN ? AND ?
          AND d.partner_id IS NOT NULL
        GROUP BY d.partner_id ORDER BY total_amount DESC`,
      ...SALES_STATUSES, startDate, endDate
    );
    const totalAmount = round2(rowsAll.reduce((s, r) => s + Number(r.total_amount || 0), 0));
    let cumulative = 0;
    const allRows = rowsAll.map((r, i) => {
      cumulative = round2(cumulative + Number(r.total_amount || 0));
      const cumulativeRate = totalAmount > 0 ? round2((cumulative / totalAmount) * 100) : 0;
      return {
        ...r,
        rank: i + 1,
        profit_rate: grossRate(r.profit, r.amount),
        amount_share: totalAmount > 0 ? round2((Number(r.total_amount) / totalAmount) * 100) : 0,
        cumulative_amount: cumulative,
        cumulative_rate: cumulativeRate,
        abc_class: cumulativeRate <= 70 ? 'A' : cumulativeRate <= 90 ? 'B' : 'C',
      };
    });
    const offset = (page - 1) * pageSize;
    const rows = allRows.slice(offset, offset + pageSize);
    const countClass = (cls) => allRows.filter((r) => r.abc_class === cls).length;
    return {
      rows, total: allRows.length, page, pageSize, startDate, endDate,
      summary: {
        customerCount: allRows.length,
        total_amount: totalAmount,
        a_count: countClass('A'),
        b_count: countClass('B'),
        c_count: countClass('C'),
      },
    };
  }, { perm: 'reports.view' });

  // ============================================================
  // 产品畅销榜
  // ============================================================
  router.get('/api/reports/product-ranking', async (ctx) => {
    const { startDate, endDate } = resolveRange(ctx);
    const limit = Math.min(100, Number(ctx.query.limit) || 20);
    const sortBy = String(ctx.query.sort || 'amount') === 'qty' ? 'qty' : 'amount';
    const raw = all(
      `SELECT i.id AS item_id, i.code AS item_code, i.name AS item_name, i.spec, i.uom, i.item_type,
              c.name AS category_name,
              COUNT(DISTINCT d.id) AS order_count,
              ROUND(COALESCE(SUM(l.qty),0),2) AS qty,
              ROUND(COALESCE(SUM(l.amount),0),2) AS amount,
              ROUND(COALESCE(SUM(l.total_amount),0),2) AS total_amount,
              ROUND(COALESCE(SUM(l.cost_amount),0),2) AS cost_amount,
              ROUND(COALESCE(SUM(l.amount - l.cost_amount),0),2) AS profit
         FROM document_lines l
         JOIN documents d ON d.id = l.doc_id
         JOIN items i ON i.id = l.item_id
         LEFT JOIN item_categories c ON c.id = i.category_id
        WHERE d.doc_type = 'DN' AND d.status IN (${SALES_IN}) AND d.doc_date BETWEEN ? AND ?
          AND l.item_id IS NOT NULL
        GROUP BY l.item_id
        ORDER BY ${sortBy} DESC, l.item_id ASC
        LIMIT ?`,
      ...SALES_STATUSES, startDate, endDate, limit
    );
    const totalAmount = round2(raw.reduce((s, r) => s + Number(r.total_amount || 0), 0));
    const totalQty = round2(raw.reduce((s, r) => s + Number(r.qty || 0), 0));
    const rows = raw.map((r, i) => ({
      ...r,
      rank: i + 1,
      profit_rate: grossRate(r.profit, r.amount),
      amount_share: totalAmount > 0 ? round2((Number(r.total_amount) / totalAmount) * 100) : 0,
      qty_share: totalQty > 0 ? round2((Number(r.qty) / totalQty) * 100) : 0,
    }));
    return {
      rows, total: rows.length, startDate, endDate, sort: sortBy,
      summary: { itemCount: rows.length, amount: totalAmount, qty: totalQty },
    };
  }, { perm: 'reports.view' });

  // ============================================================
  // 综合 KPI（含同比 / 环比）
  // ============================================================
  router.get('/api/reports/kpi-dashboard', async (ctx) => {
    const today = todayStr();
    const endDate = isDate(ctx.query.endDate) ? ctx.query.endDate : today;
    const startDate = isDate(ctx.query.startDate) ? ctx.query.startDate : `${endDate.slice(0, 7)}-01`;
    if (startDate > endDate) throw new ApiError('开始日期不能晚于结束日期');
    const days = Math.max(1, dayDiff(startDate, endDate) + 1);
    const prevEnd = addDays(startDate, -1);
    const prevStart = addDays(prevEnd, -(days - 1));
    const yoyStart = shiftYear(startDate, -1);
    const yoyEnd = shiftYear(endDate, -1);

    const sales = docTotals('DN', SALES_STATUSES, startDate, endDate);
    const salesPrev = docTotals('DN', SALES_STATUSES, prevStart, prevEnd);
    const salesYoy = docTotals('DN', SALES_STATUSES, yoyStart, yoyEnd);
    const purchase = docTotals('GRN', PURCHASE_STATUSES, startDate, endDate);
    const purchasePrev = docTotals('GRN', PURCHASE_STATUSES, prevStart, prevEnd);
    const purchaseYoy = docTotals('GRN', PURCHASE_STATUSES, yoyStart, yoyEnd);

    const period = `${startDate.slice(0, 7)}`;
    const inventory = inventoryValue();
    const receivable = get(
      `SELECT ROUND(COALESCE(SUM(total_amount - paid_amount),0),2) AS amount, COUNT(*) AS count
         FROM invoices WHERE invoice_type = 'AR' AND status NOT IN ('已收','已核销','已作废')`
    ) || { amount: 0, count: 0 };
    const payable = get(
      `SELECT ROUND(COALESCE(SUM(total_amount - paid_amount),0),2) AS amount, COUNT(*) AS count
         FROM invoices WHERE invoice_type = 'AP' AND status NOT IN ('已付','已核销','已作废')`
    ) || { amount: 0, count: 0 };
    const cashIn = get(
      "SELECT ROUND(COALESCE(SUM(amount),0),2) AS v FROM payments WHERE payment_type = 'RECEIPT' AND payment_date BETWEEN ? AND ?",
      startDate, endDate
    )?.v || 0;
    const cashOut = get(
      "SELECT ROUND(COALESCE(SUM(amount),0),2) AS v FROM payments WHERE payment_type = 'PAYMENT' AND payment_date BETWEEN ? AND ?",
      startDate, endDate
    )?.v || 0;
    const newCustomers = get(
      'SELECT COUNT(*) AS c FROM customers WHERE substr(created_at,1,10) BETWEEN ? AND ?',
      startDate, endDate
    )?.c || 0;
    const newCustomersPrev = get(
      'SELECT COUNT(*) AS c FROM customers WHERE substr(created_at,1,10) BETWEEN ? AND ?',
      prevStart, prevEnd
    )?.c || 0;
    const customerTotal = get("SELECT COUNT(*) AS c FROM customers WHERE status = '正常'")?.c || 0;
    const wip = get("SELECT COUNT(*) AS c FROM work_orders WHERE status IN ('RELEASED','IN_PROGRESS')")?.c || 0;
    const monthRange = { start: `${today.slice(0, 7)}-01`, end: today };
    const completedMonth = get(
      `SELECT ROUND(COALESCE(SUM(completed_qty),0),2) AS qty, COUNT(*) AS orders
         FROM work_orders WHERE actual_end BETWEEN ? AND ? AND status IN ('COMPLETED','CLOSED')`,
      monthRange.start, monthRange.end
    ) || { qty: 0, orders: 0 };
    const headcount = get("SELECT COUNT(*) AS c FROM employees WHERE status = '在职'")?.c || 0;
    const latestPayroll = get(
      'SELECT period, ROUND(COALESCE(SUM(net_pay),0),2) AS net, COUNT(*) AS count FROM payrolls GROUP BY period ORDER BY period DESC LIMIT 1'
    );

    const profit = sales.profit;
    const profitPrev = salesPrev.profit;
    const profitYoy = salesYoy.profit;
    return {
      range: { startDate, endDate, days, period },
      prevRange: { startDate: prevStart, endDate: prevEnd },
      lastYearRange: { startDate: yoyStart, endDate: yoyEnd },
      sales: {
        value: sales.amount,
        total_amount: sales.total_amount,
        tax_amount: sales.tax_amount,
        orders: sales.orders,
        prev: salesPrev.amount,
        lastYear: salesYoy.amount,
        mom: growthRate(sales.amount, salesPrev.amount),
        yoy: growthRate(sales.amount, salesYoy.amount),
        orderMom: growthRate(sales.orders, salesPrev.orders),
      },
      purchase: {
        value: purchase.amount,
        total_amount: purchase.total_amount,
        orders: purchase.orders,
        prev: purchasePrev.amount,
        lastYear: purchaseYoy.amount,
        mom: growthRate(purchase.amount, purchasePrev.amount),
        yoy: growthRate(purchase.amount, purchaseYoy.amount),
      },
      grossProfit: {
        value: profit,
        rate: grossRate(profit, sales.amount),
        prev: profitPrev,
        lastYear: profitYoy,
        mom: growthRate(profit, profitPrev),
        yoy: growthRate(profit, profitYoy),
      },
      inventory: {
        value: round2(inventory.amount),
        skuCount: Number(inventory.sku_count) || 0,
      },
      receivable: { value: round2(receivable.amount), count: Number(receivable.count) || 0 },
      payable: { value: round2(payable.amount), count: Number(payable.count) || 0 },
      cash: {
        inflow: round2(cashIn),
        outflow: round2(cashOut),
        net: round2(Number(cashIn) - Number(cashOut)),
      },
      orders: {
        salesOrders: sales.orders,
        purchaseOrders: purchase.orders,
        prevSalesOrders: salesPrev.orders,
      },
      customers: {
        total: customerTotal,
        newInRange: newCustomers,
        prevNew: newCustomersPrev,
        mom: growthRate(newCustomers, newCustomersPrev),
      },
      production: {
        wip,
        completedQtyThisMonth: round2(completedMonth.qty),
        completedOrdersThisMonth: Number(completedMonth.orders) || 0,
      },
      hr: {
        headcount,
        payrollPeriod: latestPayroll?.period || null,
        payrollNet: round2(latestPayroll?.net || 0),
        payrollCount: Number(latestPayroll?.count) || 0,
      },
    };
  }, { perm: 'reports.view' });
}
