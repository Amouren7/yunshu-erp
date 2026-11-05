import { all, get } from '../db.mjs';
import { inventoryValue } from '../lib/stock.mjs';

function monthRange(monthOffset = 0) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const endD = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const end = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
  return { start, end, period: start.slice(0, 7) };
}

function sumDocs(docType, start, end, field = 'total_amount', statuses = ['APPROVED', 'PARTIAL_SHIPPED', 'FULL_SHIPPED', 'COMPLETED', 'PARTIAL_RECEIVED', 'FULL_RECEIVED']) {
  const r = get(`SELECT ROUND(COALESCE(SUM(${field}),0),2) AS v, COUNT(*) AS c FROM documents
                 WHERE doc_type = ? AND doc_date >= ? AND doc_date <= ? AND status IN (${statuses.map(() => '?').join(',')})`,
    docType, start, end, ...statuses);
  return { amount: r?.v || 0, count: r?.c || 0 };
}

function arBalance() {
  return get(`SELECT ROUND(COALESCE(SUM(total_amount - paid_amount),0),2) AS v FROM invoices
              WHERE invoice_type='AR' AND status NOT IN ('已收','已核销','已作废')`)?.v || 0;
}
function apBalance() {
  return get(`SELECT ROUND(COALESCE(SUM(total_amount - paid_amount),0),2) AS v FROM invoices
              WHERE invoice_type='AP' AND status NOT IN ('已付','已核销','已作废')`)?.v || 0;
}

export function register(router) {
  router.get('/api/dashboard/summary', async () => {
    const cur = monthRange(0);
    const prev = monthRange(-1);
    const sales = sumDocs('DN', cur.start, cur.end);
    const salesPrev = sumDocs('DN', prev.start, prev.end);
    const purchase = sumDocs('GRN', cur.start, cur.end);
    const purchasePrev = sumDocs('GRN', prev.start, prev.end);
    const cogs = get(`SELECT ROUND(COALESCE(SUM(cost_amount),0),2) AS v FROM documents
                      WHERE doc_type='DN' AND doc_date BETWEEN ? AND ? AND status IN ('APPROVED','PARTIAL_SHIPPED','FULL_SHIPPED','COMPLETED')`,
      cur.start, cur.end)?.v || 0;
    const cogsPrev = get(`SELECT ROUND(COALESCE(SUM(cost_amount),0),2) AS v FROM documents
                      WHERE doc_type='DN' AND doc_date BETWEEN ? AND ? AND status IN ('APPROVED','PARTIAL_SHIPPED','FULL_SHIPPED','COMPLETED')`,
      prev.start, prev.end)?.v || 0;
    const inv = inventoryValue();
    const todo = get(`SELECT COUNT(*) AS c FROM documents WHERE status='SUBMITTED'`)?.c || 0;
    const wo = get(`SELECT COUNT(*) AS c FROM work_orders WHERE status IN ('RELEASED','IN_PROGRESS')`)?.c || 0;
    const alerts = get(`SELECT COUNT(*) AS c FROM (
        SELECT i.id FROM items i LEFT JOIN stock_balances sb ON sb.item_id = i.id
        WHERE i.status='启用' GROUP BY i.id HAVING COALESCE(SUM(sb.qty),0) < i.safety_stock)`)?.c || 0;
    const outstandingAr = arBalance();
    const outstandingAp = apBalance();
    const customers = get("SELECT COUNT(*) AS c FROM customers WHERE status='正常'")?.c || 0;
    const items = get("SELECT COUNT(*) AS c FROM items WHERE status='启用'")?.c || 0;
    const grossProfit = Math.round((sales.amount - cogs) * 100) / 100;
    const grossProfitPrev = Math.round((salesPrev.amount - cogsPrev) * 100) / 100;
    const growth = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);
    return {
      period: cur.period,
      sales: { value: sales.amount, count: sales.count, growth: growth(sales.amount, salesPrev.amount) },
      purchase: { value: purchase.amount, count: purchase.count, growth: growth(purchase.amount, purchasePrev.amount) },
      grossProfit: { value: grossProfit, rate: sales.amount ? Math.round((grossProfit / sales.amount) * 1000) / 10 : 0, growth: growth(grossProfit, grossProfitPrev) },
      inventory: { value: inv.amount, skuCount: inv.sku_count },
      receivable: outstandingAr,
      payable: outstandingAp,
      todo,
      producing: wo,
      alerts,
      customers,
      items,
    };
  }, { perm: 'dashboard.view' });

  router.get('/api/dashboard/trend', async (ctx) => {
    const months = Math.min(24, Number(ctx.query.months) || 12);
    const rows = [];
    for (let i = months - 1; i >= 0; i--) {
      const m = monthRange(-i);
      const sales = sumDocs('DN', m.start, m.end);
      const purchase = sumDocs('GRN', m.start, m.end);
      const cogs = get(`SELECT ROUND(COALESCE(SUM(cost_amount),0),2) AS v FROM documents
                        WHERE doc_type='DN' AND doc_date BETWEEN ? AND ? AND status IN ('APPROVED','PARTIAL_SHIPPED','FULL_SHIPPED','COMPLETED')`,
        m.start, m.end)?.v || 0;
      rows.push({
        period: m.period,
        sales: sales.amount,
        purchase: purchase.amount,
        cogs,
        profit: Math.round((sales.amount - cogs) * 100) / 100,
        orders: sales.count,
      });
    }
    return rows;
  }, { perm: 'dashboard.view' });

  router.get('/api/dashboard/category-share', async () => {
    return all(`
      SELECT COALESCE(c.name, '未分类') AS name, ROUND(SUM(l.amount),2) AS amount
      FROM document_lines l
      JOIN documents d ON d.id = l.doc_id
      LEFT JOIN items i ON i.id = l.item_id
      LEFT JOIN item_categories c ON c.id = i.category_id
      WHERE d.doc_type='DN' AND d.status IN ('APPROVED','PARTIAL_SHIPPED','FULL_SHIPPED','COMPLETED')
        AND d.doc_date >= date('now','localtime','-6 months')
      GROUP BY c.id ORDER BY amount DESC LIMIT 8`);
  }, { perm: 'dashboard.view' });

  router.get('/api/dashboard/top-customers', async (ctx) => {
    const limit = Math.min(20, Number(ctx.query.limit) || 8);
    return all(`
      SELECT d.partner_id, c.name, c.code, ROUND(SUM(d.total_amount),2) AS amount, COUNT(*) AS orders
      FROM documents d JOIN customers c ON c.id = d.partner_id
      WHERE d.doc_type='DN' AND d.status IN ('APPROVED','PARTIAL_SHIPPED','FULL_SHIPPED','COMPLETED')
        AND d.doc_date >= date('now','localtime','-6 months')
      GROUP BY d.partner_id ORDER BY amount DESC LIMIT ?`, limit);
  }, { perm: 'dashboard.view' });

  router.get('/api/dashboard/top-items', async (ctx) => {
    const limit = Math.min(20, Number(ctx.query.limit) || 8);
    return all(`
      SELECT l.item_id, i.code, i.name, i.spec, i.uom, ROUND(SUM(l.qty),2) AS qty, ROUND(SUM(l.amount),2) AS amount
      FROM document_lines l JOIN documents d ON d.id = l.doc_id JOIN items i ON i.id = l.item_id
      WHERE d.doc_type='DN' AND d.status IN ('APPROVED','PARTIAL_SHIPPED','FULL_SHIPPED','COMPLETED')
        AND d.doc_date >= date('now','localtime','-6 months')
      GROUP BY l.item_id ORDER BY amount DESC LIMIT ?`, limit);
  }, { perm: 'dashboard.view' });

  router.get('/api/dashboard/recent-docs', async (ctx) => {
    const limit = Math.min(50, Number(ctx.query.limit) || 10);
    return all(`
      SELECT d.id, d.doc_type, d.doc_no, d.doc_date, d.status, d.total_amount,
             COALESCE(c.name, s.name) AS partner_name, u.name AS created_by_name
      FROM documents d
      LEFT JOIN customers c ON c.id = d.partner_id AND d.partner_type='customer'
      LEFT JOIN suppliers s ON s.id = d.partner_id AND d.partner_type='supplier'
      LEFT JOIN users u ON u.id = d.created_by
      ORDER BY d.id DESC LIMIT ?`, limit);
  }, { perm: 'dashboard.view' });

  router.get('/api/dashboard/todos', async () => {
    const rows = all(`SELECT doc_type, COUNT(*) AS count, MIN(doc_date) AS earliest FROM documents
      WHERE status='SUBMITTED' GROUP BY doc_type ORDER BY count DESC`);
    const leave = get(`SELECT COUNT(*) AS c FROM leave_requests WHERE status='待审批'`)?.c || 0;
    const overdueAr = get(`SELECT COUNT(*) AS c, ROUND(SUM(total_amount-paid_amount),2) AS amount FROM invoices
      WHERE invoice_type='AR' AND status NOT IN ('已收','已核销','已作废') AND due_date < date('now','localtime')`);
    const lowStock = get(`SELECT COUNT(*) AS c FROM (
      SELECT i.id FROM items i LEFT JOIN stock_balances sb ON sb.item_id=i.id
      WHERE i.status='启用' GROUP BY i.id HAVING COALESCE(SUM(sb.qty),0) < i.safety_stock)`)?.c || 0;
    return { approvals: rows, leave, overdueAr, lowStock };
  }, { perm: 'dashboard.view' });

  router.get('/api/dashboard/alerts', async () => {
    const lowStock = all(`SELECT i.code, i.name, i.spec, i.uom, i.safety_stock,
        ROUND(COALESCE(SUM(sb.qty),0),2) AS qty
      FROM items i LEFT JOIN stock_balances sb ON sb.item_id = i.id
      WHERE i.status='启用' GROUP BY i.id HAVING qty < i.safety_stock
      ORDER BY (i.safety_stock - qty) DESC LIMIT 8`);
    const overdue = all(`SELECT id, invoice_no, partner_id, total_amount - paid_amount AS remain, due_date,
        (SELECT name FROM customers WHERE id = invoices.partner_id) AS partner_name
      FROM invoices WHERE invoice_type='AR' AND status NOT IN ('已收','已核销','已作废')
        AND due_date < date('now','localtime') ORDER BY due_date LIMIT 8`);
    return { lowStock, overdue };
  }, { perm: 'dashboard.view' });

  router.get('/api/dashboard/production', async () => {
    const statusRows = all(`SELECT status, COUNT(*) AS count FROM work_orders GROUP BY status`);
    const recent = all(`SELECT w.id, w.order_no, w.qty, w.completed_qty, w.status, w.planned_end,
        i.code AS item_code, i.name AS item_name
      FROM work_orders w JOIN items i ON i.id = w.item_id ORDER BY w.id DESC LIMIT 8`);
    return { statusRows, recent };
  }, { perm: 'dashboard.view' });

  router.get('/api/dashboard/cashflow', async () => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = monthRange(-i);
      const inflow = get(`SELECT ROUND(COALESCE(SUM(amount),0),2) AS v FROM payments
        WHERE payment_type='RECEIPT' AND payment_date BETWEEN ? AND ?`, m.start, m.end)?.v || 0;
      const outflow = get(`SELECT ROUND(COALESCE(SUM(amount),0),2) AS v FROM payments
        WHERE payment_type='PAYMENT' AND payment_date BETWEEN ? AND ?`, m.start, m.end)?.v || 0;
      months.push({ period: m.period, inflow, outflow, net: Math.round((inflow - outflow) * 100) / 100 });
    }
    return months;
  }, { perm: 'dashboard.view' });
}
