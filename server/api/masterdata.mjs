import { all, get } from '../db.mjs';
import { registerResource, referenced } from '../lib/resource.mjs';

export function register(router) {
  // ---------- 物料分类 ----------
  registerResource(router, {
    base: '/api/masterdata/item-categories', table: 'item_categories', label: '物料分类',
    module: 'basedata', fields: ['code', 'name', 'parent_id', 'sort', 'status'],
    search: ['code', 'name'], filters: ['parent_id', 'status'], order: 'sort asc, code asc',
    unique: ['code'], sortable: ['code', 'name', 'sort'],
    beforeDelete: (row) => {
      const child = get('SELECT COUNT(*) AS c FROM item_categories WHERE parent_id = ?', row.id);
      if (child.c > 0) return '存在下级分类，不能删除';
      const used = get('SELECT COUNT(*) AS c FROM items WHERE category_id = ?', row.id);
      if (used.c > 0) return `该分类下还有 ${used.c} 个物料，不能删除`;
      return null;
    },
  });

  // ---------- 计量单位 ----------
  registerResource(router, {
    base: '/api/masterdata/uoms', table: 'uoms', label: '计量单位',
    module: 'basedata', fields: ['code', 'name', 'rate'], search: ['code', 'name'],
    order: 'id asc', unique: ['code'],
  });

  // ---------- 税率 ----------
  registerResource(router, {
    base: '/api/masterdata/tax-rates', table: 'tax_rates', label: '税率',
    module: 'basedata', fields: ['code', 'name', 'rate'], search: ['code', 'name'],
    order: 'rate asc', unique: ['code'],
  });

  // ---------- 仓库 ----------
  registerResource(router, {
    base: '/api/masterdata/warehouses', table: 'warehouses', label: '仓库',
    module: 'basedata', fields: ['code', 'name', 'type', 'address', 'manager_id', 'phone', 'status', 'remark'],
    search: ['code', 'name'], filters: ['type', 'status'], order: 'code asc', unique: ['code'],
    toApi: (r) => ({ ...r, manager_name: get('SELECT name FROM employees WHERE id = ?', r.manager_id)?.name || null }),
    beforeDelete: (row) => referenced('仓库', row.id, [
      { table: 'documents', column: 'warehouse_id', label: '业务单据' },
      { table: 'stock_balances', column: 'warehouse_id', label: '库存余额' },
    ]),
  });

  // ---------- 物料 ----------
  registerResource(router, {
    base: '/api/masterdata/items', table: 'items', label: '物料',
    module: 'basedata',
    fields: ['code', 'name', 'spec', 'category_id', 'item_type', 'uom', 'brand', 'barcode', 'origin',
      'price_purchase', 'price_sale', 'cost', 'tax_rate', 'safety_stock', 'max_stock', 'reorder_point',
      'batch_control', 'shelf_life_days', 'shelf_no', 'image', 'status', 'remark'],
    search: ['code', 'name', 'spec', 'barcode', 'brand'], filters: ['category_id', 'item_type', 'status'],
    order: 'code asc', unique: ['code'], sortable: ['code', 'name', 'price_sale', 'price_purchase', 'created_at'],
    listSql: `SELECT i.*, c.name AS category_name,
                (SELECT ROUND(SUM(sb.qty),2) FROM stock_balances sb WHERE sb.item_id = i.id) AS stock_qty,
                (SELECT ROUND(SUM(sb.qty * sb.avg_cost),2) FROM stock_balances sb WHERE sb.item_id = i.id) AS stock_amount
              FROM items i LEFT JOIN item_categories c ON c.id = i.category_id`,
    toApi: (r) => ({ ...r, batch_control: Number(r.batch_control) || 0 }),
    beforeDelete: (row) => referenced('物料', row.id, [
      { table: 'document_lines', column: 'item_id', label: '业务单据明细' },
      { table: 'bom_lines', column: 'item_id', label: 'BOM' },
      { table: 'stock_ledger', column: 'item_id', label: '库存流水' },
      { table: 'work_orders', column: 'item_id', label: '生产工单' },
    ]),
  });

  // ---------- 客户 ----------
  registerResource(router, {
    base: '/api/masterdata/customers', table: 'customers', label: '客户',
    module: 'basedata',
    fields: ['code', 'name', 'short_name', 'category', 'level', 'region', 'industry', 'address', 'contact',
      'phone', 'email', 'tax_no', 'bank_name', 'bank_account', 'credit_limit', 'credit_days', 'salesman_id', 'status', 'remark'],
    search: ['code', 'name', 'short_name', 'contact', 'phone'], filters: ['category', 'level', 'region', 'status', 'salesman_id'],
    order: 'code asc', unique: ['code'], sortable: ['code', 'name', 'credit_limit', 'created_at'],
    listSql: `SELECT c.*, e.name AS salesman_name,
                (SELECT ROUND(SUM(i.total_amount - i.paid_amount), 2) FROM invoices i
                  WHERE i.invoice_type='AR' AND i.partner_id = c.id AND i.status NOT IN ('已收','已核销','已作废')) AS ar_balance
              FROM customers c LEFT JOIN employees e ON e.id = c.salesman_id`,
    beforeDelete: (row) => referenced('客户', row.id, [
      { table: 'documents', column: 'partner_id', label: '业务单据' },
      { table: 'invoices', column: 'partner_id', label: '发票' },
    ]),
  });

  // ---------- 供应商 ----------
  registerResource(router, {
    base: '/api/masterdata/suppliers', table: 'suppliers', label: '供应商',
    module: 'basedata',
    fields: ['code', 'name', 'short_name', 'category', 'region', 'address', 'contact', 'phone', 'email',
      'tax_no', 'bank_name', 'bank_account', 'payment_terms', 'credit_days', 'rating', 'status', 'remark'],
    search: ['code', 'name', 'short_name', 'contact', 'phone'], filters: ['category', 'region', 'status', 'rating'],
    order: 'code asc', unique: ['code'], sortable: ['code', 'name', 'rating', 'created_at'],
    listSql: `SELECT s.*,
                (SELECT ROUND(SUM(i.total_amount - i.paid_amount), 2) FROM invoices i
                  WHERE i.invoice_type='AP' AND i.partner_id = s.id AND i.status NOT IN ('已付','已核销','已作废')) AS ap_balance
              FROM suppliers s`,
    beforeDelete: (row) => referenced('供应商', row.id, [
      { table: 'documents', column: 'partner_id', label: '业务单据' },
      { table: 'invoices', column: 'partner_id', label: '发票' },
    ]),
  });

  // ---------- 部门 ----------
  registerResource(router, {
    base: '/api/masterdata/departments', table: 'departments', label: '部门',
    module: 'basedata', fields: ['code', 'name', 'parent_id', 'manager_id', 'cost_center', 'sort', 'status'],
    search: ['code', 'name'], filters: ['parent_id', 'status'], order: 'sort asc, code asc', unique: ['code'],
    toApi: (r) => ({
      ...r,
      manager_name: get('SELECT name FROM employees WHERE id = ?', r.manager_id)?.name || null,
      parent_name: r.parent_id ? get('SELECT name FROM departments WHERE id = ?', r.parent_id)?.name || null : null,
      employee_count: get("SELECT COUNT(*) AS c FROM employees WHERE department_id = ? AND status='在职'", r.id)?.c || 0,
    }),
    beforeDelete: (row) => {
      const child = get('SELECT COUNT(*) AS c FROM departments WHERE parent_id = ?', row.id);
      if (child.c > 0) return '存在下级部门，不能删除';
      const emp = get('SELECT COUNT(*) AS c FROM employees WHERE department_id = ?', row.id);
      if (emp.c > 0) return '部门下还有员工，不能删除';
      return null;
    },
  });

  // ---------- 员工 ----------
  registerResource(router, {
    base: '/api/masterdata/employees', table: 'employees', label: '员工',
    module: 'basedata',
    fields: ['code', 'name', 'department_id', 'position', 'employee_type', 'gender', 'birthday', 'id_card',
      'phone', 'email', 'address', 'hire_date', 'leave_date', 'base_salary', 'bank_name', 'bank_account',
      'education', 'status', 'remark'],
    search: ['code', 'name', 'phone', 'position'], filters: ['department_id', 'status', 'employee_type'],
    order: 'code asc', unique: ['code'], sortable: ['code', 'name', 'hire_date', 'base_salary'],
    listSql: `SELECT e.*, d.name AS department_name FROM employees e LEFT JOIN departments d ON d.id = e.department_id`,
    beforeDelete: (row) => referenced('员工', row.id, [
      { table: 'documents', column: 'salesperson_id', label: '业务单据' },
      { table: 'attendances', column: 'employee_id', label: '考勤记录' },
    ]),
  });

  // ---------- 工作中心 ----------
  registerResource(router, {
    base: '/api/masterdata/work-centers', table: 'work_centers', label: '工作中心',
    module: 'basedata', fields: ['code', 'name', 'type', 'capacity', 'cost_rate', 'status'],
    search: ['code', 'name'], order: 'code asc', unique: ['code'],
  });

  // ---------- 工序 ----------
  registerResource(router, {
    base: '/api/masterdata/processes', table: 'processes', label: '工序',
    module: 'basedata', fields: ['code', 'name', 'work_center_id', 'standard_hours', 'description'],
    search: ['code', 'name'], order: 'code asc', unique: ['code'],
  });

  // ---------- BOM（含明细） ----------
  const bomFields = ['code', 'name', 'item_id', 'version', 'output_qty', 'scrap_rate', 'process_id', 'status', 'remark'];

  router.get('/api/masterdata/boms', async (ctx) => {
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(200, Number(ctx.query.pageSize) || 20);
    const keyword = ctx.query.keyword || '';
    const where = [];
    const params = [];
    if (keyword) { where.push('(b.code LIKE ? OR b.name LIKE ? OR i.name LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
    if (ctx.query.status) { where.push('b.status = ?'); params.push(ctx.query.status); }
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = get(`SELECT COUNT(*) AS c FROM boms b LEFT JOIN items i ON i.id=b.item_id ${w}`, ...params)?.c || 0;
    const rows = all(`SELECT b.*, i.code AS item_code, i.name AS item_name, i.spec, i.uom,
        (SELECT COUNT(*) FROM bom_lines bl WHERE bl.bom_id = b.id) AS line_count
      FROM boms b LEFT JOIN items i ON i.id = b.item_id ${w}
      ORDER BY b.code LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
    return { rows, total, page, pageSize };
  }, { perm: 'basedata.view' });

  router.get('/api/masterdata/boms/:id', async (ctx) => {
    const bom = get('SELECT * FROM boms WHERE id = ?', Number(ctx.params.id));
    if (!bom) return null;
    const item = get('SELECT code, name, spec, uom FROM items WHERE id = ?', bom.item_id);
    const lines = all(`SELECT bl.*, i.code AS item_code, i.name AS item_name, i.spec, i.uom, i.price_purchase
      FROM bom_lines bl JOIN items i ON i.id = bl.item_id WHERE bl.bom_id = ? ORDER BY bl.seq`, bom.id);
    return { ...bom, item, lines };
  }, { perm: 'basedata.view' });

  router.post('/api/masterdata/boms', async (ctx) => {
    const b = ctx.body || {};
    if (!b.code || !b.item_id) throw Object.assign(new Error('BOM编码与成品物料不能为空'), { status: 400 });
    const lines = Array.isArray(b.lines) ? b.lines : [];
    if (!lines.length) throw Object.assign(new Error('BOM 明细不能为空'), { status: 400 });
    const { run, tx } = await import('../db.mjs');
    const id = tx(() => {
      const r = run(`INSERT INTO boms(code,name,item_id,version,output_qty,scrap_rate,process_id,status,remark)
        VALUES(?,?,?,?,?,?,?,?,?)`, b.code, b.name || '', b.item_id, b.version || 'V1.0', b.output_qty || 1, b.scrap_rate || 0,
        b.process_id || null, b.status || '启用', b.remark || '');
      const bomId = r.lastInsertRowid;
      lines.forEach((l, i) => {
        run('INSERT INTO bom_lines(bom_id,item_id,qty,loss_rate,seq,remark) VALUES(?,?,?,?,?,?)',
          bomId, l.item_id, l.qty || 1, l.loss_rate || 0, i + 1, l.remark || '');
      });
      return bomId;
    });
    return { id };
  }, { perm: 'basedata.create' });

  router.put('/api/masterdata/boms/:id', async (ctx) => {
    const b = ctx.body || {};
    const id = Number(ctx.params.id);
    const { run, tx } = await import('../db.mjs');
    tx(() => {
      run(`UPDATE boms SET code=?,name=?,item_id=?,version=?,output_qty=?,scrap_rate=?,process_id=?,status=?,remark=? WHERE id=?`,
        b.code, b.name || '', b.item_id, b.version || 'V1.0', b.output_qty || 1, b.scrap_rate || 0,
        b.process_id || null, b.status || '启用', b.remark || '', id);
      run('DELETE FROM bom_lines WHERE bom_id = ?', id);
      (b.lines || []).forEach((l, i) => {
        run('INSERT INTO bom_lines(bom_id,item_id,qty,loss_rate,seq,remark) VALUES(?,?,?,?,?,?)',
          id, l.item_id, l.qty || 1, l.loss_rate || 0, i + 1, l.remark || '');
      });
    });
    return { id };
  }, { perm: 'basedata.edit' });

  router.delete('/api/masterdata/boms/:id', async (ctx) => {
    const id = Number(ctx.params.id);
    const { run, tx, get: g } = await import('../db.mjs');
    const used = g('SELECT COUNT(*) AS c FROM work_orders WHERE bom_id = ?', id);
    if (used.c > 0) throw Object.assign(new Error('该 BOM 已被生产工单引用，不能删除'), { status: 400 });
    tx(() => { run('DELETE FROM bom_lines WHERE bom_id = ?', id); run('DELETE FROM boms WHERE id = ?', id); });
    return { id };
  }, { perm: 'basedata.delete' });

  // ---------- 会计科目 ----------
  registerResource(router, {
    base: '/api/masterdata/accounts', table: 'accounts', label: '会计科目',
    module: 'finance', fields: ['code', 'name', 'category', 'direction', 'parent_code', 'level', 'is_leaf', 'status'],
    search: ['code', 'name'], filters: ['category', 'status', 'is_leaf'], order: 'code asc', unique: ['code'],
    sortable: ['code', 'name', 'category'],
  });
}
