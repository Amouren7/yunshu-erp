import { get, run, all, tx } from '../db.mjs';
import { ApiError } from '../http.mjs';
import { DOC_TYPES } from '../lib/docTypes.mjs';
import { nextDocNo, peekDocNo } from '../lib/numbering.mjs';
import { applyEffect } from '../lib/posting.mjs';
import { audit, hasPermission } from '../auth.mjs';
import {
  splitHeader, getDocumentFull, validateDocument, transitionDocTo, docTotals, lineCalc,
  enrichItemLines, listDocuments,
} from '../lib/docService.mjs';

const DOC_COLUMNS = [
  'partner_type', 'partner_id', 'contact', 'phone', 'address', 'salesperson_id', 'department_id',
  'warehouse_id', 'to_warehouse_id', 'currency', 'exchange_rate', 'payment_terms', 'due_date',
  'project', 'source_type', 'source_id', 'source_no', 'remark',];

function buildLines(rawLines, docType) {
  const t = DOC_TYPES[docType];
  const mode = t.lines?.mode || 'items';
  if (mode === 'invoices') {
    return rawLines.map((l, i) => {
      const amt = Math.round((Number(l.amount ?? l.total_amount) || 0) * 100) / 100;
      return {
        line_no: i + 1,
        item_id: null,
        item_code: '',
        item_name: l.invoice_no || l.item_name || `核销第${i + 1}行`,
        spec: '',
        uom: '',
        qty: 1,
        price: amt,
        discount_rate: 0,
        amount: amt,
        tax_rate: 0,
        tax_amount: 0,
        total_amount: amt,
        remark: l.remark || '',
        extra_json: JSON.stringify({ invoice_id: l.invoice_id ?? l.extra?.invoice_id }),
      };
    });
  }
  const enriched = enrichItemLines(rawLines);
  return enriched.map((l, i) => {
    const c = lineCalc(l);
    return {
      line_no: i + 1,
      item_id: l.item_id,
      item_code: l.item_code,
      item_name: l.item_name,
      spec: l.spec,
      uom: l.uom,
      qty: c.qty,
      price: c.price,
      discount_rate: c.discountRate,
      amount: c.amount,
      tax_rate: c.taxRate,
      tax_amount: c.taxAmount,
      total_amount: c.totalAmount,
      cost: Number(l.cost) || 0,
      cost_amount: 0,
      warehouse_id: l.warehouse_id || null,
      batch_no: l.batch_no || '',
      production_date: l.production_date || null,
      expiry_date: l.expiry_date || null,
      delivered_qty: 0,
      invoiced_qty: 0,
      source_line_id: l.source_line_id || null,
      remark: l.remark || '',
      extra_json: JSON.stringify(l.extra || {}),
    };
  });
}

function insertLines(docId, lines) {
  const keys = ['doc_id', 'line_no', 'item_id', 'item_code', 'item_name', 'spec', 'uom', 'qty', 'price',
    'discount_rate', 'amount', 'tax_rate', 'tax_amount', 'total_amount', 'cost', 'cost_amount', 'warehouse_id',
    'batch_no', 'production_date', 'expiry_date', 'delivered_qty', 'invoiced_qty', 'source_line_id', 'remark', 'extra_json'];
  for (const l of lines) {
    run(`INSERT INTO document_lines(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
      docId, ...keys.slice(1).map((k) => l[k] ?? null));
  }
}

function logAction(docId, action, fromStatus, toStatus, user, remark) {
  run('INSERT INTO document_logs(doc_id, action, from_status, to_status, user_id, user_name, remark) VALUES(?,?,?,?,?,?,?)',
    docId, action, fromStatus ?? null, toStatus ?? null, user?.id ?? null, user?.name ?? 'system', remark ?? '');
}

function prepareDocument(docType, body) {
  const t = DOC_TYPES[docType];
  const { cols, extra } = splitHeader(body);
  const header = {
    doc_date: body.doc_date || new Date().toISOString().slice(0, 10),
    ...cols,
    ...extra,
  };
  header.partner_type = t.partnerType ?? null;
  if (!header.currency) header.currency = 'CNY';
  if (!header.exchange_rate) header.exchange_rate = 1;
  if (header.partner_id) {
    const table = t.partnerType === 'supplier' ? 'suppliers' : t.partnerType === 'customer' ? 'customers' : null;
    if (table) {
      const p = get(`SELECT * FROM ${table} WHERE id = ?`, Number(header.partner_id));
      if (p) {
        if (!header.contact) header.contact = p.contact || '';
        if (!header.phone) header.phone = p.phone || '';
        if (!header.address) header.address = p.address || '';
        if (header.partner_type === 'customer' && !header.payment_terms) header.payment_terms = p.credit_days ? `月结${p.credit_days}天` : '月结30天';
        if (header.partner_type === 'supplier' && !header.payment_terms) header.payment_terms = p.payment_terms || '月结30天';
      }
    }
  }
  const lines = buildLines(Array.isArray(body.lines) ? body.lines : [], docType);
  validateDocument({ docType, header, lines });
  const totals = mode2Totals(docType, lines);
  Object.assign(header, totals);
  return { header, lines, extra };
}

function mode2Totals(docType, lines) {
  if ((DOC_TYPES[docType].lines?.mode || 'items') === 'invoices') {
    const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    return { subtotal: total, discount_amount: 0, tax_amount: 0, total_amount: total };
  }
  return docTotals(lines);
}

export function register(router) {
  /** 数据范围（all / dept / self） */
  function scopeOf(user) {
    const perms = user?.permissions || [];
    if (!user || perms.includes('*') || !user.dataScope || user.dataScope === 'all') return null;
    if (user.dataScope === 'dept' && user.departmentId) {
      return { where: '(d.department_id = ? OR d.created_by IN (SELECT id FROM users WHERE department_id = ?))', params: [user.departmentId, user.departmentId] };
    }
    return { where: '(d.salesperson_id = ? OR d.created_by = ?)', params: [user.employeeId || -1, user.id] };
  }

  /** 单据查看权限 + 数据范围校验 */
  function assertDocScope(user, doc) {
    const perms = user.permissions || [];
    if (!user || perms.includes('*') || !user.dataScope || user.dataScope === 'all') return;
    if (user.dataScope === 'dept') {
      const creator = doc.created_by ? get('SELECT department_id FROM users WHERE id = ?', doc.created_by) : null;
      if (doc.department_id !== user.departmentId && creator?.department_id !== user.departmentId && doc.created_by !== user.id) {
        throw new ApiError('无权操作该单据（超出数据范围）', 403, 'OUT_OF_SCOPE');
      }
      return;
    }
    if (doc.salesperson_id !== user.employeeId && doc.created_by !== user.id) {
      throw new ApiError('无权操作该单据（超出数据范围）', 403, 'OUT_OF_SCOPE');
    }
  }

  function assertDocAccess(user, doc) {
    const t = DOC_TYPES[doc?.doc_type];
    if (!t) throw new ApiError('未知单据类型', 400);
    if (!hasPermission(user, `${t.module}.view`)) throw new ApiError(`无权限查看${t.name}`, 403, 'FORBIDDEN');
    assertDocScope(user, doc);
  }
  // ---------- 单据号预览 ----------
  router.get('/api/documents/next-no', async (ctx) => {
    const { docType, date } = ctx.query;
    if (!docType || !DOC_TYPES[docType]) throw new ApiError('缺少或非法的 docType');
    const t = DOC_TYPES[docType];
    if (!hasPermission(ctx.user, `${t.module}.view`) && !hasPermission(ctx.user, `${t.module}.create`)) {
      throw new ApiError(`无权限查看${t.name}单号`, 403, 'FORBIDDEN');
    }
    return { doc_no: peekDocNo(docType, date || new Date().toISOString().slice(0, 10)) };
  });

  // ---------- 从源单生成：读取可引用明细 ----------
  router.get('/api/documents/pull', async (ctx) => {
    const sourceId = Number(ctx.query.sourceId);
    const targetType = ctx.query.docType;
    if (!sourceId) throw new ApiError('缺少源单');
    const src = getDocumentFull(sourceId);
    const t = DOC_TYPES[targetType];
    if (!t) throw new ApiError('未知单据类型');
    assertDocAccess(ctx.user, src);
    if (!hasPermission(ctx.user, `${t.module}.create`) && !hasPermission(ctx.user, `${t.module}.edit`)) {
      throw new ApiError(`无权限从源单生成${t.name}`, 403, 'FORBIDDEN');
    }
    const isReturn = ['SR', 'PR'].includes(targetType);
    const lines = src.lines.map((l) => {
      const remaining = isReturn ? l.delivered_qty : Math.max(0, (l.qty || 0) - (l.delivered_qty || 0));
      return {
        ...l,
        remain_qty: Math.round(remaining * 100) / 100,
        qty: Math.round(remaining * 100) / 100,
      };
    }).filter((l) => l.remain_qty > 0);
    return {
      source: src,
      lines,
      header: {
        partner_id: src.partner_id,
        contact: src.contact,
        phone: src.phone,
        address: src.address,
        warehouse_id: src.warehouse_id,
        to_warehouse_id: src.to_warehouse_id,
        salesperson_id: src.salesperson_id,
        department_id: src.department_id,
        payment_terms: src.payment_terms,
        currency: src.currency,
        source_type: src.doc_type,
        source_id: src.id,
        source_no: src.doc_no,
      },
    };
  });

  // ---------- 列表 ----------
  router.get('/api/documents', async (ctx) => {
    const docType = ctx.query.docType;
    if (!docType || !DOC_TYPES[docType]) throw new ApiError('缺少或非法的 docType');
    const t = DOC_TYPES[docType];
    if (!hasPermission(ctx.user, `${t.module}.view`)) throw new ApiError(`无权限查看${t.name}`, 403, 'FORBIDDEN');
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(200, Number(ctx.query.pageSize) || 20);
    return listDocuments({
      docType, page, pageSize,
      status: ctx.query.status,
      partnerId: ctx.query.partnerId,
      warehouseId: ctx.query.warehouseId,
      salespersonId: ctx.query.salespersonId,
      keyword: ctx.query.keyword,
      startDate: ctx.query.startDate,
      endDate: ctx.query.endDate,
      minAmount: ctx.query.minAmount,
      maxAmount: ctx.query.maxAmount,
      scope: scopeOf(ctx.user),
      extraWhere: ctx.query.onlyUnfinished === '1'
        ? "d.status NOT IN ('COMPLETED','CLOSED','VOID','FULL_SHIPPED','FULL_RECEIVED')" : null,
    });
  });

  // ---------- 详情 ----------
  router.get('/api/documents/:id', async (ctx) => {
    const doc = getDocumentFull(ctx.params.id);
    assertDocAccess(ctx.user, doc);
    const t = DOC_TYPES[doc.doc_type];
    const perms = ctx.user.permissions || [];
    const isAdmin = perms.includes('*');
    const canPerm = (p) => isAdmin || perms.includes(p) || perms.includes(`${t.module}.*`);
    doc.actions = t.transitions
      .filter((tr) => tr.from.includes(doc.status))
      .filter((tr) => canPerm(`${t.module}.${tr.perm}`) || canPerm(`${t.module}.edit`))
      .map((tr) => ({ action: tr.action, label: tr.label, to: tr.to, confirm: !!tr.confirm, primary: !!tr.primary }));
    doc.canEdit = doc.status === 'DRAFT' && canPerm(`${t.module}.edit`);
    doc.docTypeMeta = { name: t.name, docNoLabel: t.docNoLabel };
    return doc;
  });

  // ---------- 新建 ----------
  router.post('/api/documents', async (ctx) => {
    const body = ctx.body || {};
    const docType = body.doc_type;
    const t = DOC_TYPES[docType];
    if (!t) throw new ApiError('未知单据类型');
    const perm = `${t.module}.create`;
    if (!hasPermission(ctx.user, perm)) throw new ApiError(`无权限新建${t.name}（需要 ${perm}）`, 403);

    let payload = body;
    // 支持仅传 source_id：由服务端生成整单
    if (body.source_id && !(body.lines || []).length) {
      const src = getDocumentFull(body.source_id);
      assertDocAccess(ctx.user, src);
      const isReturn = ['SR', 'PR'].includes(docType);
      const lines = src.lines.map((l) => ({
        ...l,
        qty: isReturn ? l.delivered_qty : Math.max(0, (l.qty || 0) - (l.delivered_qty || 0)),
        source_line_id: l.id,
      })).filter((l) => l.qty > 0);
      payload = {
        ...body,
        doc_date: body.doc_date || new Date().toISOString().slice(0, 10),
        partner_id: src.partner_id,
        contact: src.contact, phone: src.phone, address: src.address,
        warehouse_id: src.warehouse_id, to_warehouse_id: src.to_warehouse_id,
        salesperson_id: src.salesperson_id, department_id: src.department_id,
        payment_terms: src.payment_terms, currency: src.currency,
        source_type: src.doc_type, source_id: src.id, source_no: src.doc_no,
        lines,
      };
    }

    const { header, lines } = prepareDocument(docType, payload);
    const docNo = nextDocNo(docType, header.doc_date);
    const docId = tx(() => {
      const cols = ['doc_no', 'doc_type', 'doc_date', 'status', ...DOC_COLUMNS, 'subtotal', 'discount_amount',
        'tax_amount', 'total_amount', 'extra_json', 'created_by', 'created_by_name'];
      const vals = [
        docNo, docType, header.doc_date, 'DRAFT',
        ...DOC_COLUMNS.map((c) => header[c] ?? (c === 'currency' ? 'CNY' : null)),
        header.subtotal, header.discount_amount, header.tax_amount, header.total_amount,
        JSON.stringify(header.extra || {}),
        ctx.user.id, ctx.user.name,
      ];
      const r = run(`INSERT INTO documents(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...vals);
      insertLines(r.lastInsertRowid, lines);
      logAction(r.lastInsertRowid, '创建', null, 'DRAFT', ctx.user, `新建${t.name}`);
      return r.lastInsertRowid;
    });
    audit(ctx.user, '新建', t.module, docType, docId, `${t.name} ${docNo}`, ctx.ip);
    const d = getDocumentFull(docId);
    return { id: docId, doc_no: docNo, doc: d };
  });

  // ---------- 修改 ----------
  router.put('/api/documents/:id', async (ctx) => {
    const doc = get('SELECT * FROM documents WHERE id = ?', Number(ctx.params.id));
    if (!doc) throw new ApiError('单据不存在', 404);
    const t = DOC_TYPES[doc.doc_type];
    if (!hasPermission(ctx.user, `${t.module}.edit`)) throw new ApiError('无权限修改该单据', 403);
    assertDocScope(ctx.user, doc);
    if (doc.status !== 'DRAFT') throw new ApiError(`${t.name}当前状态为 ${doc.status}，只有草稿可以修改`);
    const body = ctx.body || {};
    const { header, lines } = prepareDocument(doc.doc_type, { ...body, doc_date: body.doc_date || doc.doc_date });
    tx(() => {
      run(`UPDATE documents SET doc_date=?, partner_id=?, contact=?, phone=?, address=?, salesperson_id=?,
            department_id=?, warehouse_id=?, to_warehouse_id=?, currency=?, exchange_rate=?, payment_terms=?,
            due_date=?, project=?, source_type=?, source_id=?, source_no=?, remark=?,
            subtotal=?, discount_amount=?, tax_amount=?, total_amount=?, extra_json=?,
            updated_at=datetime('now','localtime') WHERE id=?`,
        header.doc_date, header.partner_id ?? null, header.contact ?? null, header.phone ?? null, header.address ?? null,
        header.salesperson_id ?? null, header.department_id ?? null, header.warehouse_id ?? null,
        header.to_warehouse_id ?? null, header.currency, header.exchange_rate, header.payment_terms ?? null,
        header.due_date ?? null, header.project ?? null, header.source_type ?? null, header.source_id ?? null,
        header.source_no ?? null, header.remark ?? null, header.subtotal, header.discount_amount,
        header.tax_amount, header.total_amount, JSON.stringify(header.extra || {}), doc.id);
      run('DELETE FROM document_lines WHERE doc_id = ?', doc.id);
      insertLines(doc.id, lines);
      logAction(doc.id, '修改', 'DRAFT', 'DRAFT', ctx.user, `修改${t.name}`);
    });
    audit(ctx.user, '修改', t.module, doc.doc_type, doc.id, `${t.name} ${doc.doc_no}`, ctx.ip);
    return getDocumentFull(doc.id);
  });

  // ---------- 删除 ----------
  router.delete('/api/documents/:id', async (ctx) => {
    const doc = get('SELECT * FROM documents WHERE id = ?', Number(ctx.params.id));
    if (!doc) throw new ApiError('单据不存在', 404);
    const t = DOC_TYPES[doc.doc_type];
    if (!hasPermission(ctx.user, `${t.module}.delete`)) throw new ApiError('无权限删除该单据', 403);
    assertDocScope(ctx.user, doc);
    if (!['DRAFT', 'VOID'].includes(doc.status)) throw new ApiError('只有草稿或已作废单据可以删除');
    tx(() => {
      run('DELETE FROM document_lines WHERE doc_id = ?', doc.id);
      run('DELETE FROM document_logs WHERE doc_id = ?', doc.id);
      run('DELETE FROM documents WHERE id = ?', doc.id);
    });
    audit(ctx.user, '删除', t.module, doc.doc_type, doc.id, `${t.name} ${doc.doc_no}`, ctx.ip);
    return { id: doc.id };
  });

  // ---------- 单据动作（提交/审核/作废/关闭） ----------
  router.post('/api/documents/:id/action', async (ctx) => {
    const doc = get('SELECT * FROM documents WHERE id = ?', Number(ctx.params.id));
    if (!doc) throw new ApiError('单据不存在', 404);
    const { action, remark } = ctx.body || {};
    const t = DOC_TYPES[doc.doc_type];
    assertDocScope(ctx.user, doc);
    const tr = transitionDocTo(doc, action, ctx.user);
    const lines = all('SELECT * FROM document_lines WHERE doc_id = ? ORDER BY line_no', doc.id);
    if (action === 'approve' && lines.length === 0) throw new ApiError('单据无明细，无法审核');
    if (action === 'approve') {
      const totals = mode2Totals(doc.doc_type, lines);
      if (Math.abs(totals.total_amount - doc.total_amount) > 0.01) {
        run('UPDATE documents SET subtotal=?, tax_amount=?, total_amount=? WHERE id=?',
          totals.subtotal, totals.tax_amount, totals.total_amount, doc.id);
        doc.subtotal = totals.subtotal; doc.tax_amount = totals.tax_amount; doc.total_amount = totals.total_amount;
      }
    }
    tx(() => {
      const updates = [];
      const params = [];
      if (action === 'submit') {
        updates.push('status = ?', 'submitted_by = ?', "submitted_at = datetime('now','localtime')");
        params.push('SUBMITTED', ctx.user.id);
      } else if (action === 'approve') {
        updates.push('status = ?', 'approved_by = ?', "approved_at = datetime('now','localtime')");
        params.push('APPROVED', ctx.user.id);
      } else if (action === 'void') {
        updates.push('status = ?', "voided_at = datetime('now','localtime')");
        params.push('VOID');
      } else if (action === 'close') {
        updates.push('status = ?', "closed_at = datetime('now','localtime')");
        params.push('CLOSED');
      }
      params.push(doc.id);
      run(`UPDATE documents SET ${updates.join(', ')} WHERE id = ?`, ...params);
      logAction(doc.id, tr.label, doc.status, tr.to, ctx.user, remark || '');
      if (action === 'approve' && t.effect) {
        const fresh = get('SELECT * FROM documents WHERE id = ?', doc.id);
        fresh.effect = t.effect;
        applyEffect(fresh, lines, ctx.user);
      }
    });
    audit(ctx.user, tr.label, t.module, doc.doc_type, doc.id, `${t.name} ${doc.doc_no} ${tr.label}`, ctx.ip);
    return getDocumentFull(doc.id);
  });

  // ---------- 打印计数 ----------
  router.post('/api/documents/:id/printed', async (ctx) => {
    run('UPDATE documents SET print_count = print_count + 1 WHERE id = ?', Number(ctx.params.id));
    return { ok: true };
  });

  // ---------- 待办统计（各模块首页用） ----------
  router.get('/api/documents/todo', async (ctx) => {
    const rows = all(`SELECT doc_type, status, COUNT(*) AS count FROM documents
      WHERE status IN ('SUBMITTED') GROUP BY doc_type, status`);
    return rows;
  });
}
