import { all, get } from '../db.mjs';
import { ApiError } from '../http.mjs';
import { stockBalanceList, stockSummary, stockLedger, stockAlerts, inventoryValue } from '../lib/stock.mjs';

export function register(router) {
  router.get('/api/inventory/balances', async (ctx) => {
    return stockBalanceList({
      keyword: ctx.query.keyword || '',
      warehouseId: ctx.query.warehouseId || null,
      categoryId: ctx.query.categoryId || null,
      onlyNonZero: ctx.query.onlyNonZero !== '0',
      limit: Number(ctx.query.limit) || 1000,
    });
  }, { perm: 'inventory.view' });

  router.get('/api/inventory/summary', async (ctx) => {
    return stockSummary({ keyword: ctx.query.keyword || '', limit: Number(ctx.query.limit) || 1000 });
  }, { perm: 'inventory.view' });

  router.get('/api/inventory/ledger', async (ctx) => {
    const page = Math.max(1, Number(ctx.query.page) || 1);
    const pageSize = Math.min(200, Number(ctx.query.pageSize) || 50);
    return stockLedger({
      itemId: ctx.query.itemId || null,
      warehouseId: ctx.query.warehouseId || null,
      docType: ctx.query.docType || null,
      startDate: ctx.query.startDate || null,
      endDate: ctx.query.endDate || null,
      page, pageSize,
    });
  }, { perm: 'inventory.view' });

  router.get('/api/inventory/alerts', async () => {
    return stockAlerts();
  }, { perm: 'inventory.view' });

  router.get('/api/inventory/value', async (ctx) => {
    return inventoryValue(ctx.query.warehouseId || null);
  }, { perm: 'inventory.view' });

  // 快捷库存查询：给单据录入用
  router.get('/api/inventory/item-stock', async (ctx) => {
    const itemId = Number(ctx.query.itemId);
    const warehouseId = Number(ctx.query.warehouseId || 0);
    if (!itemId) throw new ApiError('缺少 itemId');
    const rows = warehouseId
      ? all(`SELECT sb.warehouse_id, w.name AS warehouse_name, sb.qty, sb.avg_cost, ROUND(sb.qty*sb.avg_cost,2) AS amount
             FROM stock_balances sb JOIN warehouses w ON w.id = sb.warehouse_id
             WHERE sb.item_id = ? AND sb.warehouse_id = ?`, itemId, warehouseId)
      : all(`SELECT sb.warehouse_id, w.name AS warehouse_name, sb.qty, sb.avg_cost, ROUND(sb.qty*sb.avg_cost,2) AS amount
             FROM stock_balances sb JOIN warehouses w ON w.id = sb.warehouse_id
             WHERE sb.item_id = ?`, itemId);
    return rows;
  }, { perm: 'inventory.view' });

  // 批次/有效期列表（简化：从库存流水聚合）
  router.get('/api/inventory/batches', async (ctx) => {
    const keyword = ctx.query.keyword || '';
    return all(`
      SELECT sl.batch_no, sl.item_id, i.code AS item_code, i.name AS item_name, i.spec, i.uom,
             sl.warehouse_id, w.name AS warehouse_name,
             ROUND(SUM(sl.qty_in) - SUM(sl.qty_out), 2) AS qty,
             MAX(sl.biz_date) AS last_date
      FROM stock_ledger sl
      JOIN items i ON i.id = sl.item_id
      JOIN warehouses w ON w.id = sl.warehouse_id
      WHERE sl.batch_no <> '' AND (i.code LIKE ? OR i.name LIKE ? OR sl.batch_no LIKE ?)
      GROUP BY sl.item_id, sl.warehouse_id, sl.batch_no
      HAVING qty <> 0 ORDER BY sl.batch_no LIMIT 500`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }, { perm: 'inventory.view' });
}
