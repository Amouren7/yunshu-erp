import { get, run } from '../db.mjs';
import { round2, ApiError } from '../http.mjs';
import { stockIn, stockOut, getBalance, itemCost } from './stock.mjs';
import { postVoucher, mapping, inventoryAccount, cashAccount } from './gl.mjs';
import { nextDocNo } from './numbering.mjs';

function parseExtra(s) {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

function partnerName(partnerType, partnerId) {
  if (!partnerType || !partnerId) return '';
  const table = partnerType === 'supplier' ? 'suppliers' : 'customers';
  const r = get(`SELECT name FROM ${table} WHERE id = ?`, partnerId);
  return r?.name || '';
}

function creditDays(partnerType, partnerId, fallback = 30) {
  if (!partnerType || !partnerId) return fallback;
  const table = partnerType === 'supplier' ? 'suppliers' : 'customers';
  const r = get(`SELECT credit_days FROM ${table} WHERE id = ?`, partnerId);
  return r?.credit_days ?? fallback;
}

function addDays(dateStr, days) {
  const d = new Date(String(dateStr || new Date().toISOString().slice(0, 10)) + 'T00:00:00');
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function round2n(v) { return round2(v); }

// ---------------- 发票 ----------------
export function createInvoice({ invoiceType, partnerType, partnerId, doc, date, subtotal, taxAmount, totalAmount, dueDate, status, remark }) {
  const typeNo = invoiceType === 'AR' ? 'AR' : 'AP';
  const no = nextDocNo(typeNo, date);
  const pname = partnerName(partnerType, partnerId);
  const due = dueDate || addDays(date, creditDays(partnerType, partnerId));
  const r = run(`INSERT INTO invoices(invoice_no, invoice_type, partner_type, partner_id, doc_id, doc_no,
      invoice_date, due_date, subtotal, tax_amount, total_amount, paid_amount, status, period, remark)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    no, invoiceType, partnerType, partnerId, doc?.id ?? null, doc?.doc_no ?? '',
    date, due, round2(subtotal), round2(taxAmount), round2(totalAmount), 0, status, String(date).slice(0, 7),
    remark || `${pname} ${doc?.doc_no || ''}`);
  return { id: r.lastInsertRowid, invoice_no: no, due_date: due };
}

function updateInvoiceStatus(invoiceId) {
  const inv = get('SELECT * FROM invoices WHERE id = ?', invoiceId);
  if (!inv) return;
  const paid = round2(inv.paid_amount);
  const total = round2(inv.total_amount);
  let status = inv.status;
  if (total < 0) status = '已核销';
  else if (paid <= 0) status = inv.invoice_type === 'AR' ? '未收' : '未付';
  else if (paid + 0.01 < total) status = inv.invoice_type === 'AR' ? '部分收款' : '部分付款';
  else status = inv.invoice_type === 'AR' ? '已收' : '已付';
  run('UPDATE invoices SET status = ? WHERE id = ?', status, invoiceId);
}

// ---------------- 来源单跟踪 ----------------
function markSourceDelivered(sourceType, sourceId, sourceLineId, qty) {
  if (!sourceId || !sourceLineId) return;
  run('UPDATE document_lines SET delivered_qty = ROUND(delivered_qty + ?, 2) WHERE id = ?', round2(qty), sourceLineId);
}

function refreshOrderStatus(sourceId, sourceType) {
  if (!sourceId || !sourceType) return;
  const lines = get('SELECT SUM(qty) AS qty, SUM(delivered_qty) AS done FROM document_lines WHERE doc_id = ?', sourceId);
  const doc = get('SELECT * FROM documents WHERE id = ?', sourceId);
  if (!doc) return;
  const totalQty = round2(lines?.qty || 0);
  const doneQty = round2(lines?.done || 0);
  let status = doc.status;
  if (totalQty <= 0) return;
  if (sourceType === 'SO') {
    if (doneQty <= 0) status = 'APPROVED';
    else if (doneQty + 0.001 < totalQty) status = 'PARTIAL_SHIPPED';
    else status = 'FULL_SHIPPED';
  } else if (sourceType === 'PO') {
    if (doneQty <= 0) status = 'APPROVED';
    else if (doneQty + 0.001 < totalQty) status = 'PARTIAL_RECEIVED';
    else status = 'FULL_RECEIVED';
  }
  if (status !== doc.status) run('UPDATE documents SET status = ? WHERE id = ?', status, sourceId);
}

function updateSourceOrder({ sourceType, sourceId, line }) {
  if (!sourceId || !line?.source_line_id) return;
  markSourceDelivered(sourceType, sourceId, line.source_line_id, line.qty);
  refreshOrderStatus(sourceId, sourceType);
}

/**
 * 转单数量校验：审核时重新核对来源单剩余可执行数量，避免同一来源行被重复发货/重复入库
 * @param {'out'|'in'} direction out=源单是订单（剩余=qty-delivered_qty）；in=源单是出入库单（剩余=delivered_qty）
 */
export function assertSourceRemaining(lines, direction = 'out') {
  for (const line of lines || []) {
    if (!line.source_line_id) continue;
    const src = get('SELECT id, doc_id, line_no, item_id, qty, delivered_qty FROM document_lines WHERE id = ?', line.source_line_id);
    if (!src) throw new ApiError(`来源单据明细不存在（行 ${line.line_no}），无法执行`);
    const srcDoc = get('SELECT doc_no, doc_type FROM documents WHERE id = ?', src.doc_id);
    const remain = direction === 'out'
      ? round2((Number(src.qty) || 0) - (Number(src.delivered_qty) || 0))
      : round2(Number(src.delivered_qty) || 0);
    if (round2(line.qty) > remain + 0.001) {
      throw new ApiError(`第 ${line.line_no} 行超出源单可执行数量：${srcDoc?.doc_no || ''} 剩余 ${remain}，本单 ${round2(line.qty)}`, 400, 'SOURCE_QTY_EXCEEDED');
    }
  }
}

// ---------------- 各单据过账效果 ----------------
function effectSalesDelivery(doc, lines, user) {
  const period = String(doc.doc_date).slice(0, 7);
  assertSourceRemaining(lines, 'out');
  let totalCost = 0;
  for (const line of lines) {
    const res = stockOut({
      itemId: line.item_id, warehouseId: line.warehouse_id || doc.warehouse_id, qty: line.qty,
      bizDate: doc.doc_date, docType: 'DN', docId: doc.id, docNo: doc.doc_no,
      batchNo: line.batch_no, remark: `销售发货 ${doc.doc_no}`, userId: user?.id,
    });
    totalCost += res.amount;
    run('UPDATE document_lines SET cost = ?, cost_amount = ? WHERE id = ?', res.unitCost, res.amount, line.id);
    line.cost = res.unitCost; line.cost_amount = res.amount;
    updateSourceOrder({ sourceType: 'SO', sourceId: doc.source_id ?? null, line });
  }
  totalCost = round2(totalCost);
  run('UPDATE documents SET cost_amount = ? WHERE id = ?', totalCost, doc.id);

  const pn = partnerName('customer', doc.partner_id);
  const inv = createInvoice({
    invoiceType: 'AR', partnerType: 'customer', partnerId: doc.partner_id, doc,
    date: doc.doc_date, subtotal: doc.subtotal, taxAmount: doc.tax_amount, totalAmount: doc.total_amount,
    dueDate: doc.due_date, status: '未收',
  });
  postVoucher({
    date: doc.doc_date, period, sourceType: 'DN', sourceId: doc.id, summary: `销售出库 ${doc.doc_no} ${pn}`, user,
    lines: [
      { account_code: mapping('AR'), summary: `应收账款 ${pn}`, debit: doc.total_amount, credit: 0, partner_type: 'customer', partner_id: doc.partner_id, partner_name: pn },
      { account_code: mapping('REVENUE'), summary: `主营业务收入 ${doc.doc_no}`, debit: 0, credit: doc.subtotal, partner_type: 'customer', partner_id: doc.partner_id, partner_name: pn },
      { account_code: mapping('TAX_OUTPUT'), summary: `销项税额 ${doc.doc_no}`, debit: 0, credit: doc.tax_amount },
      { account_code: mapping('COGS'), summary: `主营业务成本 ${doc.doc_no}`, debit: totalCost, credit: 0 },
      { account_code: mapping('INVENTORY'), summary: `库存商品出库 ${doc.doc_no}`, debit: 0, credit: totalCost },
    ],
  });
  return { invoiceId: inv.id };
}

function effectSalesReturn(doc, lines, user) {
  const period = String(doc.doc_date).slice(0, 7);
  let totalCost = 0;
  for (const line of lines) {
    const res = stockIn({
      itemId: line.item_id, warehouseId: line.warehouse_id || doc.warehouse_id, qty: line.qty,
      unitCost: line.cost || itemCost(line.item_id), bizDate: doc.doc_date, docType: 'SR', docId: doc.id,
      docNo: doc.doc_no, batchNo: line.batch_no, remark: `销售退货 ${doc.doc_no}`, userId: user?.id,
    });
    totalCost += res.amount;
    run('UPDATE document_lines SET cost = ?, cost_amount = ? WHERE id = ?', res.unitCost, res.amount, line.id);
  }
  totalCost = round2(totalCost);
  run('UPDATE documents SET cost_amount = ? WHERE id = ?', totalCost, doc.id);
  createInvoice({
    invoiceType: 'AR', partnerType: 'customer', partnerId: doc.partner_id, doc,
    date: doc.doc_date, subtotal: -doc.subtotal, taxAmount: -doc.tax_amount, totalAmount: -doc.total_amount,
    status: '已核销', remark: `退货红字 ${doc.doc_no}`,
  });
  const pn = partnerName('customer', doc.partner_id);
  postVoucher({
    date: doc.doc_date, period, sourceType: 'SR', sourceId: doc.id, summary: `销售退货 ${doc.doc_no} ${pn}`, user,
    lines: [
      { account_code: mapping('REVENUE'), summary: `冲减收入 ${doc.doc_no}`, debit: doc.subtotal, credit: 0, partner_type: 'customer', partner_id: doc.partner_id, partner_name: pn },
      { account_code: mapping('TAX_OUTPUT'), summary: `冲减销项税 ${doc.doc_no}`, debit: doc.tax_amount, credit: 0 },
      { account_code: mapping('AR'), summary: `冲减应收 ${pn}`, debit: 0, credit: doc.total_amount, partner_type: 'customer', partner_id: doc.partner_id, partner_name: pn },
      { account_code: mapping('INVENTORY'), summary: `库存商品入库 ${doc.doc_no}`, debit: totalCost, credit: 0 },
      { account_code: mapping('COGS'), summary: `冲减成本 ${doc.doc_no}`, debit: 0, credit: totalCost },
    ],
  });
}

function effectPurchaseReceipt(doc, lines, user) {
  const period = String(doc.doc_date).slice(0, 7);
  assertSourceRemaining(lines, 'out');
  for (const line of lines) {
    const item = get('SELECT item_type FROM items WHERE id = ?', line.item_id);
    const res = stockIn({
      itemId: line.item_id, warehouseId: line.warehouse_id || doc.warehouse_id, qty: line.qty,
      unitCost: line.price, bizDate: doc.doc_date, docType: 'GRN', docId: doc.id, docNo: doc.doc_no,
      batchNo: line.batch_no, remark: `采购入库 ${doc.doc_no}`, userId: user?.id,
    });
    run('UPDATE document_lines SET cost = ?, cost_amount = ? WHERE id = ?', res.unitCost, res.amount, line.id);
    line.cost = res.unitCost;
    updateSourceOrder({ sourceType: 'PO', sourceId: doc.source_id ?? null, line });
    line._itemType = item?.item_type;
  }
  run('UPDATE documents SET cost_amount = ? WHERE id = ?', round2(doc.subtotal), doc.id);

  const pn = partnerName('supplier', doc.partner_id);
  const inv = createInvoice({
    invoiceType: 'AP', partnerType: 'supplier', partnerId: doc.partner_id, doc,
    date: doc.doc_date, subtotal: doc.subtotal, taxAmount: doc.tax_amount, totalAmount: doc.total_amount,
    dueDate: doc.due_date, status: '未付',
  });
  const invAcct = inventoryAccount(lines[0]?._itemType);
  postVoucher({
    date: doc.doc_date, period, sourceType: 'GRN', sourceId: doc.id, summary: `采购入库 ${doc.doc_no} ${pn}`, user,
    lines: [
      { account_code: invAcct, summary: `存货入库 ${doc.doc_no}`, debit: doc.subtotal, credit: 0 },
      { account_code: mapping('TAX_INPUT'), summary: `进项税额 ${doc.doc_no}`, debit: doc.tax_amount, credit: 0 },
      { account_code: mapping('AP'), summary: `应付账款 ${pn}`, debit: 0, credit: doc.total_amount, partner_type: 'supplier', partner_id: doc.partner_id, partner_name: pn },
    ],
  });
  return { invoiceId: inv.id };
}

function effectPurchaseReturn(doc, lines, user) {
  const period = String(doc.doc_date).slice(0, 7);
  for (const line of lines) {
    const res = stockOut({
      itemId: line.item_id, warehouseId: line.warehouse_id || doc.warehouse_id, qty: line.qty,
      bizDate: doc.doc_date, docType: 'PR', docId: doc.id, docNo: doc.doc_no, batchNo: line.batch_no,
      remark: `采购退货 ${doc.doc_no}`, userId: user?.id,
    });
    run('UPDATE document_lines SET cost = ?, cost_amount = ? WHERE id = ?', res.unitCost, res.amount, line.id);
  }
  run('UPDATE documents SET cost_amount = ? WHERE id = ?', round2(doc.subtotal), doc.id);
  createInvoice({
    invoiceType: 'AP', partnerType: 'supplier', partnerId: doc.partner_id, doc,
    date: doc.doc_date, subtotal: -doc.subtotal, taxAmount: -doc.tax_amount, totalAmount: -doc.total_amount,
    status: '已核销', remark: `退货红字 ${doc.doc_no}`,
  });
  const pn = partnerName('supplier', doc.partner_id);
  postVoucher({
    date: doc.doc_date, period, sourceType: 'PR', sourceId: doc.id, summary: `采购退货 ${doc.doc_no} ${pn}`, user,
    lines: [
      { account_code: mapping('AP'), summary: `冲减应付 ${pn}`, debit: doc.total_amount, credit: 0, partner_type: 'supplier', partner_id: doc.partner_id, partner_name: pn },
      { account_code: mapping('INVENTORY'), summary: `冲减存货 ${doc.doc_no}`, debit: 0, credit: doc.subtotal },
      { account_code: mapping('TAX_INPUT'), summary: `进项税转出 ${doc.doc_no}`, debit: 0, credit: doc.tax_amount },
    ],
  });
}

function effectTransfer(doc, lines, user) {
  for (const line of lines) {
    const out = stockOut({
      itemId: line.item_id, warehouseId: doc.warehouse_id, qty: line.qty, bizDate: doc.doc_date,
      docType: 'TR', docId: doc.id, docNo: doc.doc_no, batchNo: line.batch_no, remark: `调拨出库 ${doc.doc_no}`, userId: user?.id,
    });
    stockIn({
      itemId: line.item_id, warehouseId: doc.to_warehouse_id, qty: line.qty, unitCost: out.unitCost,
      bizDate: doc.doc_date, docType: 'TR', docId: doc.id, docNo: doc.doc_no, batchNo: line.batch_no,
      remark: `调拨入库 ${doc.doc_no}`, userId: user?.id,
    });
    run('UPDATE document_lines SET cost = ?, cost_amount = ? WHERE id = ?', out.unitCost, round2(line.qty * out.unitCost), line.id);
  }
}

function effectAdjustment(doc, lines, user) {
  const period = String(doc.doc_date).slice(0, 7);
  let diffCost = 0;
  for (const line of lines) {
    const whId = line.warehouse_id || doc.warehouse_id;
    const bal = getBalance(line.item_id, whId);
    const counted = round2(line.qty);
    const diff = round2(counted - bal.qty);
    const cost = bal.avg_cost || itemCost(line.item_id) || line.price || 0;
    if (diff > 0) {
      const res = stockIn({ itemId: line.item_id, warehouseId: whId, qty: diff, unitCost: cost, bizDate: doc.doc_date,
        docType: 'ADJ', docId: doc.id, docNo: doc.doc_no, remark: `盘盈 ${doc.doc_no}`, userId: user?.id });
      diffCost += res.amount;
    } else if (diff < 0) {
      const res = stockOut({ itemId: line.item_id, warehouseId: whId, qty: -diff, bizDate: doc.doc_date,
        docType: 'ADJ', docId: doc.id, docNo: doc.doc_no, remark: `盘亏 ${doc.doc_no}`, userId: user?.id });
      diffCost -= res.amount;
    }
    run('UPDATE document_lines SET cost = ?, cost_amount = ?, extra_json = ? WHERE id = ?',
      cost, round2(diff * cost), JSON.stringify({ ...parseExtra(line.extra_json), book_qty: bal.qty, diff_qty: diff }), line.id);
    line._diffQty = diff;
  }
  diffCost = round2(diffCost);
  run('UPDATE documents SET cost_amount = ? WHERE id = ?', diffCost, doc.id);
  const lines2 = [];
  if (diffCost > 0) {
    lines2.push({ account_code: mapping('INVENTORY'), summary: `盘盈入库 ${doc.doc_no}`, debit: diffCost, credit: 0 });
    lines2.push({ account_code: mapping('ASSET_PENDING'), summary: `待处理财产损溢 ${doc.doc_no}`, debit: 0, credit: diffCost });
  } else if (diffCost < 0) {
    const v = -diffCost;
    lines2.push({ account_code: mapping('ASSET_PENDING'), summary: `待处理财产损溢 ${doc.doc_no}`, debit: v, credit: 0 });
    lines2.push({ account_code: mapping('INVENTORY'), summary: `盘亏出库 ${doc.doc_no}`, debit: 0, credit: v });
  }
  postVoucher({ date: doc.doc_date, period, sourceType: 'ADJ', sourceId: doc.id, summary: `库存盘点 ${doc.doc_no}`, user, lines: lines2 });
}

function effectOtherIn(doc, lines, user) {
  const period = String(doc.doc_date).slice(0, 7);
  let amount = 0;
  for (const line of lines) {
    const item = get('SELECT item_type, price_purchase, cost FROM items WHERE id = ?', line.item_id);
    const unitCost = line.price > 0 ? line.price : (item?.cost || item?.price_purchase || 0);
    const res = stockIn({ itemId: line.item_id, warehouseId: line.warehouse_id || doc.warehouse_id, qty: line.qty,
      unitCost, bizDate: doc.doc_date, docType: 'OI', docId: doc.id, docNo: doc.doc_no, batchNo: line.batch_no,
      remark: `其他入库 ${doc.doc_no}`, userId: user?.id });
    amount += res.amount;
    run('UPDATE document_lines SET cost = ?, cost_amount = ? WHERE id = ?', res.unitCost, res.amount, line.id);
    line._itemType = item?.item_type;
  }
  amount = round2(amount);
  run('UPDATE documents SET cost_amount = ? WHERE id = ?', amount, doc.id);
  postVoucher({
    date: doc.doc_date, period, sourceType: 'OI', sourceId: doc.id, summary: `其他入库 ${doc.doc_no}`, user,
    lines: [
      { account_code: inventoryAccount(lines[0]?._itemType), summary: `存货增加 ${doc.doc_no}`, debit: amount, credit: 0 },
      { account_code: mapping('ASSET_PENDING'), summary: `待处理财产损溢 ${doc.doc_no}`, debit: 0, credit: amount },
    ],
  });
}

function effectOtherOut(doc, lines, user) {
  const period = String(doc.doc_date).slice(0, 7);
  let amount = 0;
  for (const line of lines) {
    const res = stockOut({ itemId: line.item_id, warehouseId: line.warehouse_id || doc.warehouse_id, qty: line.qty,
      bizDate: doc.doc_date, docType: 'OO', docId: doc.id, docNo: doc.doc_no, batchNo: line.batch_no,
      remark: `其他出库 ${doc.doc_no}`, userId: user?.id });
    amount += res.amount;
    run('UPDATE document_lines SET cost = ?, cost_amount = ? WHERE id = ?', res.unitCost, res.amount, line.id);
    const item = get('SELECT item_type FROM items WHERE id = ?', line.item_id);
    line._itemType = item?.item_type;
  }
  amount = round2(amount);
  run('UPDATE documents SET cost_amount = ? WHERE id = ?', amount, doc.id);
  postVoucher({
    date: doc.doc_date, period, sourceType: 'OO', sourceId: doc.id, summary: `其他出库 ${doc.doc_no}`, user,
    lines: [
      { account_code: mapping('ASSET_PENDING'), summary: `待处理财产损溢 ${doc.doc_no}`, debit: amount, credit: 0 },
      { account_code: inventoryAccount(lines[0]?._itemType), summary: `存货减少 ${doc.doc_no}`, debit: 0, credit: amount },
    ],
  });
}

/**
 * 收款/付款核销校验：核销金额不得超过发票未结余额，防止超额核销导致发票与总账不一致
 */
export function assertInvoiceAllocations(lines, invoiceType) {
  for (const line of lines || []) {
    const extra = parseExtra(line.extra_json);
    const allocation = round2(line.total_amount ?? line.amount);
    if (!extra.invoice_id) {
      if (allocation) throw new ApiError(`第 ${line.line_no} 行未关联发票，无法核销`, 400, 'INVOICE_REQUIRED');
      continue;
    }
    const inv = get('SELECT * FROM invoices WHERE id = ?', extra.invoice_id);
    if (!inv) throw new ApiError(`第 ${line.line_no} 行关联的发票不存在`, 400, 'INVOICE_NOT_FOUND');
    if (inv.invoice_type !== invoiceType) throw new ApiError(`第 ${line.line_no} 行发票类型与单据不匹配`, 400, 'INVOICE_TYPE_MISMATCH');
    const remain = round2(Math.abs(Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0));
    if (allocation > remain + 0.01) {
      throw new ApiError(`第 ${line.line_no} 行核销金额 ${allocation} 超过发票 ${inv.invoice_no} 未结余额 ${remain}`, 400, 'INVOICE_OVER_ALLOCATED');
    }
  }
}

function effectReceipt(doc, lines, user) {
  const period = String(doc.doc_date).slice(0, 7);
  assertInvoiceAllocations(lines, 'AR');
  let total = 0;
  for (const line of lines) {
    const extra = parseExtra(line.extra_json);
    const allocation = round2(line.total_amount ?? line.amount);
    if (!allocation) continue;
    total += allocation;
    const inv = extra.invoice_id ? get('SELECT * FROM invoices WHERE id = ?', extra.invoice_id) : null;
    if (inv) {
      const paid = round2((inv.paid_amount || 0) + allocation);
      run('UPDATE invoices SET paid_amount = ? WHERE id = ?', Math.min(paid, Math.abs(inv.total_amount)), inv.id);
      updateInvoiceStatus(inv.id);
    }
  }
  total = round2(total);
  const payNo = doc.doc_no;
  const r = run(`INSERT INTO payments(payment_no, payment_type, partner_type, partner_id, payment_date, amount,
      allocated_amount, method, account_code, status, remark, created_by)
    VALUES(?,?,?,?,?,?,?,?,?,'POSTED',?,?)`,
    payNo, 'RECEIPT', 'customer', doc.partner_id, doc.doc_date, total, total,
    parseExtra(doc.extra_json).x_settle_method || '银行转账',
    cashAccount(parseExtra(doc.extra_json).x_settle_method), doc.remark || '', user?.id ?? null);
  for (const line of lines) {
    const extra = parseExtra(line.extra_json);
    const allocation = round2(line.total_amount ?? line.amount);
    if (extra.invoice_id && allocation) {
      run('INSERT INTO payment_allocations(payment_id, invoice_id, amount) VALUES(?,?,?)', r.lastInsertRowid, extra.invoice_id, allocation);
    }
  }
  run('UPDATE documents SET paid_amount = ? WHERE id = ?', total, doc.id);
  const pn = partnerName('customer', doc.partner_id);
  const acct = cashAccount(parseExtra(doc.extra_json).x_settle_method);
  postVoucher({
    date: doc.doc_date, period, sourceType: 'RC', sourceId: doc.id, summary: `客户收款 ${doc.doc_no} ${pn}`, user,
    lines: [
      { account_code: acct, summary: `收到货款 ${pn}`, debit: total, credit: 0, partner_type: 'customer', partner_id: doc.partner_id, partner_name: pn },
      { account_code: mapping('AR'), summary: `冲销应收 ${pn}`, debit: 0, credit: total, partner_type: 'customer', partner_id: doc.partner_id, partner_name: pn },
    ],
  });
}

function effectPayment(doc, lines, user) {
  const period = String(doc.doc_date).slice(0, 7);
  assertInvoiceAllocations(lines, 'AP');
  let total = 0;
  for (const line of lines) {
    const extra = parseExtra(line.extra_json);
    const allocation = round2(line.total_amount ?? line.amount);
    if (!allocation) continue;
    total += allocation;
    const inv = extra.invoice_id ? get('SELECT * FROM invoices WHERE id = ?', extra.invoice_id) : null;
    if (inv) {
      const paid = round2((inv.paid_amount || 0) + allocation);
      run('UPDATE invoices SET paid_amount = ? WHERE id = ?', Math.min(paid, Math.abs(inv.total_amount)), inv.id);
      updateInvoiceStatus(inv.id);
    }
  }
  total = round2(total);
  const r = run(`INSERT INTO payments(payment_no, payment_type, partner_type, partner_id, payment_date, amount,
      allocated_amount, method, account_code, status, remark, created_by)
    VALUES(?,?,?,?,?,?,?,?,?,'POSTED',?,?)`,
    doc.doc_no, 'PAYMENT', 'supplier', doc.partner_id, doc.doc_date, total, total,
    parseExtra(doc.extra_json).x_settle_method || '银行转账',
    cashAccount(parseExtra(doc.extra_json).x_settle_method), doc.remark || '', user?.id ?? null);
  for (const line of lines) {
    const extra = parseExtra(line.extra_json);
    const allocation = round2(line.total_amount ?? line.amount);
    if (extra.invoice_id && allocation) {
      run('INSERT INTO payment_allocations(payment_id, invoice_id, amount) VALUES(?,?,?)', r.lastInsertRowid, extra.invoice_id, allocation);
    }
  }
  run('UPDATE documents SET paid_amount = ? WHERE id = ?', total, doc.id);
  const pn = partnerName('supplier', doc.partner_id);
  const acct = cashAccount(parseExtra(doc.extra_json).x_settle_method);
  postVoucher({
    date: doc.doc_date, period, sourceType: 'PY', sourceId: doc.id, summary: `供应商付款 ${doc.doc_no} ${pn}`, user,
    lines: [
      { account_code: mapping('AP'), summary: `冲销应付 ${pn}`, debit: total, credit: 0, partner_type: 'supplier', partner_id: doc.partner_id, partner_name: pn },
      { account_code: acct, summary: `支付货款 ${pn}`, debit: 0, credit: total, partner_type: 'supplier', partner_id: doc.partner_id, partner_name: pn },
    ],
  });
}

const EFFECTS = {
  SALES_DELIVERY: effectSalesDelivery,
  SALES_RETURN: effectSalesReturn,
  PURCHASE_RECEIPT: effectPurchaseReceipt,
  PURCHASE_RETURN: effectPurchaseReturn,
  TRANSFER: effectTransfer,
  ADJUSTMENT: effectAdjustment,
  OTHER_IN: effectOtherIn,
  OTHER_OUT: effectOtherOut,
  RECEIPT: effectReceipt,
  PAYMENT: effectPayment,
};

/** 单据审核时执行过账效果（在事务中调用） */
export function applyEffect(doc, lines, user) {
  if (!doc.effect) return null;
  const fn = EFFECTS[doc.effect];
  if (!fn) throw new Error(`未实现的过账逻辑: ${doc.effect}`);
  return fn(doc, lines, user);
}

/** 生产工单完工入库的过账（由 production API 调用） */
export function postProductionCompletion({ workOrder, itemId, qty, unitCost, warehouseId, date, user }) {
  const period = String(date).slice(0, 7);
  const amount = round2(qty * unitCost);
  stockIn({ itemId, warehouseId, qty, unitCost, bizDate: date, docType: 'MO', docId: workOrder.id,
    docNo: workOrder.order_no, remark: `生产完工入库 ${workOrder.order_no}`, userId: user?.id });
  postVoucher({
    date, period, sourceType: 'MO', sourceId: workOrder.id, summary: `完工入库 ${workOrder.order_no}`, user,
    lines: [
      { account_code: mapping('INVENTORY'), summary: `产成品入库 ${workOrder.order_no}`, debit: amount, credit: 0 },
      { account_code: mapping('WIP'), summary: `结转生产成本 ${workOrder.order_no}`, debit: 0, credit: amount },
    ],
  });
}

/** 生产领料过账 */
export function postMaterialIssue({ workOrder, itemId, qty, warehouseId, date, user }) {
  const period = String(date).slice(0, 7);
  const res = stockOut({ itemId, warehouseId, qty, bizDate: date, docType: 'MO', docId: workOrder.id,
    docNo: workOrder.order_no, remark: `生产领料 ${workOrder.order_no}`, userId: user?.id });
  const item = get('SELECT item_type FROM items WHERE id = ?', itemId);
  postVoucher({
    date, period, sourceType: 'MO', sourceId: workOrder.id, summary: `生产领料 ${workOrder.order_no}`, user,
    lines: [
      { account_code: mapping('WIP'), summary: `领用材料 ${workOrder.order_no}`, debit: res.amount, credit: 0 },
      { account_code: inventoryAccount(item?.item_type), summary: `材料出库 ${workOrder.order_no}`, debit: 0, credit: res.amount },
    ],
  });
  return res;
}

export { partnerName, updateInvoiceStatus, round2n };
