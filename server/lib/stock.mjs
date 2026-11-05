import { get, run, all } from '../db.mjs';
import { round2, ApiError } from '../http.mjs';

/** 读取某物料在某仓库的库存余额 */
export function getBalance(itemId, warehouseId) {
  return get('SELECT * FROM stock_balances WHERE item_id = ? AND warehouse_id = ?', itemId, warehouseId) || {
    item_id: itemId, warehouse_id: warehouseId, qty: 0, reserved_qty: 0, avg_cost: 0,
  };
}

export function itemCost(itemId) {
  const r = get('SELECT SUM(qty) AS qty, SUM(qty * avg_cost) AS cost FROM stock_balances WHERE item_id = ?', itemId);
  if (!r || !r.qty) return 0;
  return round2((r.cost || 0) / r.qty);
}

function upsertBalance(itemId, warehouseId, qty, avgCost) {
  const exist = get('SELECT 1 AS x FROM stock_balances WHERE item_id = ? AND warehouse_id = ?', itemId, warehouseId);
  if (exist) {
    run("UPDATE stock_balances SET qty = ?, avg_cost = ?, updated_at = datetime('now','localtime') WHERE item_id = ? AND warehouse_id = ?",
      round2(qty), round2(avgCost), itemId, warehouseId);
  } else {
    run('INSERT INTO stock_balances(item_id, warehouse_id, qty, reserved_qty, avg_cost) VALUES(?,?,?,?,?)',
      itemId, warehouseId, round2(qty), 0, round2(avgCost));
  }
}

/**
 * 入库：按移动加权平均更新余额，并写库存流水
 * @returns {{unitCost:number, amount:number, balanceQty:number, balanceCost:number}}
 */
export function stockIn({ itemId, warehouseId, qty, unitCost = 0, bizDate, docType, docId, docNo, batchNo, remark, userId }) {
  const bal = getBalance(itemId, warehouseId);
  const inQty = round2(qty);
  const cost = unitCost > 0 ? round2(unitCost) : round2(bal.avg_cost || 0);
  const amount = round2(inQty * cost);
  const newQty = round2((bal.qty || 0) + inQty);
  const oldQty = round2(bal.qty || 0);
  const oldCost = round2(oldQty * (bal.avg_cost || 0));
  // 旧结存为负（先出后入）时，不能按负数摊薄，直接采用本次入库成本
  const newAvg = oldQty > 0 && newQty > 0 ? round2((oldCost + amount) / newQty) : cost;
  upsertBalance(itemId, warehouseId, newQty, newAvg);
  const balanceCost = round2(newQty * newAvg);
  run(`INSERT INTO stock_ledger(biz_date, doc_type, doc_id, doc_no, item_id, warehouse_id, batch_no, direction,
        qty_in, qty_out, unit_cost, amount, balance_qty, balance_cost, remark, created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    bizDate, docType, docId ?? null, docNo ?? '', itemId, warehouseId, batchNo ?? '', 'IN',
    inQty, 0, cost, amount, newQty, balanceCost, remark ?? '', userId ?? null);
  return { unitCost: cost, amount, balanceQty: newQty, balanceCost };
}

/**
 * 出库：按当前移动加权平均成本计价，并写库存流水
 */
export function stockOut({ itemId, warehouseId, qty, bizDate, docType, docId, docNo, batchNo, remark, userId }) {
  const bal = getBalance(itemId, warehouseId);
  const outQty = round2(qty);
  const newQty = round2((bal.qty || 0) - outQty);
  // 参数 allow_negative_stock=0 时禁止负库存出库（管理员可在系统参数切换）
  const allowNeg = get("SELECT value FROM settings WHERE key = 'allow_negative_stock'")?.value;
  if (allowNeg === '0' && newQty < -0.00001) {
    const item = get('SELECT code, name FROM items WHERE id = ?', itemId);
    const wh = get('SELECT name FROM warehouses WHERE id = ?', warehouseId);
    throw new ApiError(`库存不足：${item?.code || ''} ${item?.name || ''} 在「${wh?.name || ''}」当前可用 ${round2(bal.qty || 0)}，本次出库 ${outQty}（已启用“不允许负库存”）`, 400, 'STOCK_NOT_ENOUGH');
  }
  const cost = round2(bal.avg_cost || 0);
  const amount = round2(outQty * cost);
  upsertBalance(itemId, warehouseId, newQty, bal.avg_cost || cost);
  const balanceCost = round2(newQty * (bal.avg_cost || cost));
  run(`INSERT INTO stock_ledger(biz_date, doc_type, doc_id, doc_no, item_id, warehouse_id, batch_no, direction,
        qty_in, qty_out, unit_cost, amount, balance_qty, balance_cost, remark, created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    bizDate, docType, docId ?? null, docNo ?? '', itemId, warehouseId, batchNo ?? '', 'OUT',
    0, outQty, cost, amount, newQty, balanceCost, remark ?? '', userId ?? null);
  return { unitCost: cost, amount, balanceQty: newQty, balanceCost };
}

/** 库存余额列表（含物料信息） */
export function stockBalanceList({ keyword = '', warehouseId = null, categoryId = null, onlyNonZero = true, limit = 500 } = {}) {
  const where = [];
  const params = [];
  if (warehouseId) { where.push('sb.warehouse_id = ?'); params.push(Number(warehouseId)); }
  if (categoryId) { where.push('i.category_id = ?'); params.push(Number(categoryId)); }
  if (keyword) {
    where.push('(i.code LIKE ? OR i.name LIKE ? OR i.spec LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (onlyNonZero) where.push('(sb.qty <> 0)');
  const sql = `
    SELECT sb.item_id, sb.warehouse_id, sb.qty, sb.reserved_qty, sb.avg_cost, sb.updated_at,
           i.code AS item_code, i.name AS item_name, i.spec, i.uom, i.item_type, i.safety_stock,
           w.name AS warehouse_name,
           ROUND(sb.qty * sb.avg_cost, 2) AS amount
    FROM stock_balances sb
    JOIN items i ON i.id = sb.item_id
    JOIN warehouses w ON w.id = sb.warehouse_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY i.code, w.code LIMIT ?`;
  params.push(Number(limit) || 500);
  return all(sql, ...params);
}

/** 库存总览（按物料汇总） */
export function stockSummary({ keyword = '', limit = 500 } = {}) {
  const params = [];
  let where = '';
  if (keyword) {
    where = 'WHERE (i.code LIKE ? OR i.name LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  const sql = `
    SELECT i.id AS item_id, i.code AS item_code, i.name AS item_name, i.spec, i.uom, i.item_type,
           i.safety_stock, i.price_purchase,
           COALESCE(SUM(sb.qty), 0) AS total_qty,
           ROUND(COALESCE(SUM(sb.qty * sb.avg_cost), 0), 2) AS total_amount,
           CASE WHEN COALESCE(SUM(sb.qty),0) < i.safety_stock THEN 1 ELSE 0 END AS below_safety
    FROM items i LEFT JOIN stock_balances sb ON sb.item_id = i.id
    ${where}
    GROUP BY i.id ORDER BY i.code LIMIT ?`;
  params.push(Number(limit) || 500);
  return all(sql, ...params);
}

/** 库存预警 */
export function stockAlerts() {
  return all(`
    SELECT i.id, i.code, i.name, i.spec, i.uom, i.safety_stock, i.reorder_point,
           ROUND(COALESCE(SUM(sb.qty), 0), 2) AS qty
    FROM items i LEFT JOIN stock_balances sb ON sb.item_id = i.id
    WHERE i.status = '启用'
    GROUP BY i.id
    HAVING qty < i.safety_stock
    ORDER BY (i.safety_stock - qty) DESC
    LIMIT 50`);
}

/** 库存流水查询 */
export function stockLedger({ itemId, warehouseId, startDate, endDate, docType, page = 1, pageSize = 50 }) {
  const where = [];
  const params = [];
  if (itemId) { where.push('sl.item_id = ?'); params.push(Number(itemId)); }
  if (warehouseId) { where.push('sl.warehouse_id = ?'); params.push(Number(warehouseId)); }
  if (docType) { where.push('sl.doc_type = ?'); params.push(docType); }
  if (startDate) { where.push('sl.biz_date >= ?'); params.push(startDate); }
  if (endDate) { where.push('sl.biz_date <= ?'); params.push(endDate); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = get(`SELECT COUNT(*) AS c FROM stock_ledger sl ${w}`, ...params)?.c || 0;
  const rows = all(`
    SELECT sl.*, i.code AS item_code, i.name AS item_name, i.spec, w.name AS warehouse_name
    FROM stock_ledger sl
    JOIN items i ON i.id = sl.item_id
    JOIN warehouses w ON w.id = sl.warehouse_id
    ${w} ORDER BY sl.biz_date DESC, sl.id DESC LIMIT ? OFFSET ?`,
    ...params, pageSize, (page - 1) * pageSize);
  return { rows, total };
}

/** 期初/期末库存金额（用于财务与报表） */
export function inventoryValue(warehouseId = null) {
  const params = [];
  let where = '';
  if (warehouseId) { where = 'WHERE sb.warehouse_id = ?'; params.push(Number(warehouseId)); }
  const r = get(`SELECT ROUND(SUM(sb.qty * sb.avg_cost), 2) AS amount, COUNT(*) AS sku_count
                 FROM stock_balances sb ${where}`, ...params);
  return r || { amount: 0, sku_count: 0 };
}
