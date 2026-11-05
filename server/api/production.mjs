/**
 * 生产管理 API
 * - 工单看板 / 工单 CRUD / 下达·开工·领料·完工·关闭·作废
 * - BOM 展开生成领料清单与工序
 * - 简易 MRP（工单 + 未发货销售订单 净需求对比库存）
 * - 工作中心负荷 / 排产看板
 *
 * 领料与完工必须调用 lib/posting.mjs 的过账函数，保证库存流水与凭证联动。
 */
import { all, get, run, tx } from '../db.mjs';
import { ApiError, paginate, round2, todayStr } from '../http.mjs';
import { audit } from '../auth.mjs';
import { nextDocNo } from '../lib/numbering.mjs';
import { postMaterialIssue, postProductionCompletion } from '../lib/posting.mjs';
import { itemCost } from '../lib/stock.mjs';

const WO_STATUS = {
  DRAFT: '草稿',
  RELEASED: '已下达',
  IN_PROGRESS: '生产中',
  COMPLETED: '已完工',
  CLOSED: '已关闭',
  VOID: '已作废',
};
const PRIORITIES = ['低', '普通', '高', '紧急'];

// 各状态可执行的动作（供详情页按钮）
const WO_ACTIONS = {
  DRAFT: [{ action: 'release', label: '下达', primary: true }, { action: 'void', label: '作废', confirm: true }],
  RELEASED: [
    { action: 'start', label: '开工', primary: true },
    { action: 'issue', label: '领料' },
    { action: 'void', label: '作废', confirm: true },
  ],
  IN_PROGRESS: [
    { action: 'issue', label: '领料' },
    { action: 'complete', label: '报完工', primary: true, confirm: true },
  ],
  COMPLETED: [{ action: 'close', label: '关闭', confirm: true }],
  CLOSED: [],
  VOID: [],
};

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** 当前月份（或指定日期所在月份）的起止 */
function monthRange(dateStr = todayStr()) {
  const [y, m] = String(dateStr).split('-').map(Number);
  const start = `${y}-${pad2(m)}-01`;
  const end = ymd(new Date(y, m, 0));
  return { start, end, period: `${y}-${pad2(m)}` };
}

/** 统计区间内工作日（周一~周五）数量 */
function countWeekdays(startDate, endDate) {
  const cur = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  let n = 0;
  while (cur <= end) {
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

function idOf(ctx) {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError('参数不合法（工单ID）');
  return id;
}

/** 状态过滤：支持单值或逗号分隔多值 */
function statusFilter(value, allowed, field = 'w.status') {
  if (!value || value === 'ALL') return { sql: null, params: [] };
  const list = String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => allowed.includes(s));
  if (!list.length) return { sql: null, params: [] };
  return { sql: `${field} IN (${list.map(() => '?').join(',')})`, params: list };
}

/** 取启用 BOM */
function enabledBom(itemId) {
  return get("SELECT * FROM boms WHERE item_id = ? AND status = '启用' ORDER BY id DESC LIMIT 1", itemId);
}

/** 按 BOM 展开领料清单并写入工单工序（在事务内调用，先清空再写） */
function writeMaterialsAndOperations(woId, bom, qty, materialWhId) {
  run('DELETE FROM work_order_materials WHERE wo_id = ?', woId);
  run('DELETE FROM work_order_operations WHERE wo_id = ?', woId);
  if (!bom) return;
  const outQty = Number(bom.output_qty) > 0 ? Number(bom.output_qty) : 1;
  const lines = all(
    `SELECT bl.item_id, bl.qty, bl.loss_rate, bl.seq, bl.remark,
            i.code, i.name, i.uom, i.item_type, i.price_purchase, i.cost
       FROM bom_lines bl JOIN items i ON i.id = bl.item_id
      WHERE bl.bom_id = ? ORDER BY bl.seq`,
    bom.id
  );
  for (const l of lines) {
    const required = round2((Number(qty) || 0) * (Number(l.qty) || 0) * (1 + (Number(l.loss_rate) || 0) / 100) / outQty);
    const unitCost = round2(itemCost(l.item_id) || Number(l.price_purchase) || Number(l.cost) || 0);
    run(
      `INSERT INTO work_order_materials(wo_id, item_id, item_code, item_name, uom, required_qty, issued_qty, unit_cost, warehouse_id, remark)
       VALUES(?,?,?,?,?,?,0,?,?,?)`,
      woId, l.item_id, l.code, l.name, l.uom, required, unitCost, materialWhId, l.remark || ''
    );
  }
  // 按 BOM 关联的工序生成工单工序（计划工时 = 工单数量 × 标准工时 / BOM 产出数量）
  const proc = bom.process_id ? get('SELECT * FROM processes WHERE id = ?', bom.process_id) : null;
  if (proc) {
    const plannedHours = round2((Number(qty) || 0) * (Number(proc.standard_hours) || 0) / outQty);
    run(
      `INSERT INTO work_order_operations(wo_id, seq, process_name, work_center_id, planned_hours, actual_hours, status, operator, remark)
       VALUES(?,1,?,?,?,0,'待开始','','')`,
      woId, proc.name, proc.work_center_id || null, plannedHours
    );
  }
}

/** 工单详情（含物料、工序、BOM） */
function getWorkOrderFull(id) {
  const wo = get(
    `SELECT w.*, i.code AS item_code, i.name AS item_name, i.spec, i.uom, i.item_type,
            wc.name AS warehouse_name, mc.name AS material_wh_name
       FROM work_orders w
       JOIN items i ON i.id = w.item_id
       LEFT JOIN warehouses wc ON wc.id = w.warehouse_id
       LEFT JOIN warehouses mc ON mc.id = w.material_wh_id
      WHERE w.id = ?`,
    id
  );
  if (!wo) throw new ApiError('生产工单不存在', 404, 'NOT_FOUND');

  const materials = all(
    `SELECT m.*, i.spec AS item_spec, i.item_type AS item_type, w.name AS warehouse_name
       FROM work_order_materials m
       LEFT JOIN items i ON i.id = m.item_id
       LEFT JOIN warehouses w ON w.id = m.warehouse_id
      WHERE m.wo_id = ? ORDER BY m.id`,
    id
  ).map((m) => {
    const required = round2(m.required_qty);
    const issued = round2(m.issued_qty);
    return {
      ...m,
      remain_qty: round2(Math.max(0, required - issued)),
      issued_amount: round2(issued * (Number(m.unit_cost) || 0)),
      issue_rate: required > 0 ? round2((issued / required) * 100) : 0,
    };
  });

  const operations = all(
    `SELECT o.*, c.code AS work_center_code, c.name AS work_center_name, c.capacity AS work_center_capacity
       FROM work_order_operations o
       LEFT JOIN work_centers c ON c.id = o.work_center_id
      WHERE o.wo_id = ? ORDER BY o.seq, o.id`,
    id
  );

  const bom = wo.bom_id ? get('SELECT * FROM boms WHERE id = ?', wo.bom_id) : null;
  const bomDetail = bom
    ? {
        ...bom,
        process_name: bom.process_id ? get('SELECT name FROM processes WHERE id = ?', bom.process_id)?.name || null : null,
        lines: all(
          `SELECT bl.*, i.code AS item_code, i.name AS item_name, i.spec, i.uom, i.item_type, i.price_purchase
             FROM bom_lines bl JOIN items i ON i.id = bl.item_id
            WHERE bl.bom_id = ? ORDER BY bl.seq`,
          bom.id
        ),
      }
    : null;

  const qty = Number(wo.qty) || 0;
  const completedQty = Number(wo.completed_qty) || 0;
  const materialIssuedAmount = round2(materials.reduce((s, m) => s + m.issued_amount, 0));

  return {
    ...wo,
    status_label: WO_STATUS[wo.status] || wo.status,
    progress: qty > 0 ? round2(Math.min(100, (completedQty / qty) * 100)) : 0,
    remaining_qty: round2(Math.max(0, qty - completedQty)),
    material_issued_amount: materialIssuedAmount,
    bom,
    bom_detail: bomDetail,
    materials,
    operations,
    actions: WO_ACTIONS[wo.status] || [],
  };
}

/** 校验工单基础字段 */
function normalizeWorkOrderBody(body, base = {}) {
  const qty = body.qty === undefined ? base.qty : round2(body.qty);
  if (!(Number(qty) > 0)) throw new ApiError('生产数量必须大于 0');
  const plannedStart = body.planned_start ?? base.planned_start ?? todayStr();
  const plannedEnd = body.planned_end ?? base.planned_end ?? plannedStart;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(plannedStart))) throw new ApiError('计划开始日期格式应为 YYYY-MM-DD');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(plannedEnd))) throw new ApiError('计划完成日期格式应为 YYYY-MM-DD');
  if (String(plannedEnd) < String(plannedStart)) throw new ApiError('计划完成日期不能早于计划开始日期');
  const priority = body.priority ?? base.priority ?? '普通';
  if (!PRIORITIES.includes(priority)) throw new ApiError(`优先级只能是 ${PRIORITIES.join('/')}`);
  return {
    qty,
    planned_start: plannedStart,
    planned_end: plannedEnd,
    priority,
    warehouse_id: body.warehouse_id === undefined ? base.warehouse_id ?? null : Number(body.warehouse_id) || null,
    material_wh_id: body.material_wh_id === undefined ? base.material_wh_id ?? null : Number(body.material_wh_id) || null,
    remark: body.remark === undefined ? base.remark ?? '' : String(body.remark || ''),
  };
}

function defaultWarehouseId(item) {
  const type = item?.item_type === '半成品' ? '半成品仓' : '成品仓';
  return (
    get("SELECT id FROM warehouses WHERE type = ? AND status = 'ENABLED' ORDER BY id LIMIT 1", type)?.id ||
    get("SELECT id FROM warehouses WHERE status = 'ENABLED' ORDER BY id LIMIT 1")?.id ||
    null
  );
}
function defaultMaterialWhId() {
  return (
    get("SELECT id FROM warehouses WHERE type = '原料仓' AND status = 'ENABLED' ORDER BY id LIMIT 1")?.id ||
    get("SELECT id FROM warehouses WHERE status = 'ENABLED' ORDER BY id LIMIT 1")?.id ||
    null
  );
}

/** 检查仓库是否存在 */
function assertWarehouse(id, label) {
  if (!id) return null;
  const wh = get("SELECT id, name FROM warehouses WHERE id = ? AND status = 'ENABLED'", Number(id));
  if (!wh) throw new ApiError(`${label}不存在或已停用`);
  return wh;
}

export function register(router) {
  // ============================================================
  // 生产总览
  // ============================================================
  router.get('/api/production/overview', async () => {
    const counts = Object.fromEntries(
      all('SELECT status, COUNT(*) AS count FROM work_orders GROUP BY status').map((r) => [r.status, r.count])
    );
    const statusCounts = Object.keys(WO_STATUS).map((s) => ({
      status: s,
      label: WO_STATUS[s],
      count: counts[s] || 0,
    }));
    const total = Object.values(counts).reduce((a, b) => a + Number(b || 0), 0);
    const releasing = (counts.RELEASED || 0) + (counts.IN_PROGRESS || 0);

    const m = monthRange();
    const completed = get(
      `SELECT ROUND(COALESCE(SUM(completed_qty),0),2) AS qty, COUNT(*) AS orders
         FROM work_orders
        WHERE actual_end BETWEEN ? AND ? AND status IN ('COMPLETED','CLOSED')`,
      m.start, m.end
    ) || { qty: 0, orders: 0 };
    const materialAmount =
      get(
        `SELECT ROUND(COALESCE(SUM(amount),0),2) AS v FROM stock_ledger
          WHERE doc_type = 'MO' AND direction = 'OUT' AND biz_date BETWEEN ? AND ?`,
        m.start, m.end
      )?.v || 0;
    const completionAmount =
      get(
        `SELECT ROUND(COALESCE(SUM(amount),0),2) AS v FROM stock_ledger
          WHERE doc_type = 'MO' AND direction = 'IN' AND biz_date BETWEEN ? AND ?`,
        m.start, m.end
      )?.v || 0;

    const cap = get(
      `SELECT ROUND(COALESCE(SUM(o.planned_hours),0),2) AS planned, ROUND(COALESCE(SUM(o.actual_hours),0),2) AS actual,
              COUNT(*) AS operation_count
         FROM work_order_operations o
         JOIN work_orders w ON w.id = o.wo_id
        WHERE (w.planned_start BETWEEN ? AND ? OR w.planned_end BETWEEN ? AND ?)
          AND w.status <> 'VOID'`,
      m.start, m.end, m.start, m.end
    ) || { planned: 0, actual: 0, operation_count: 0 };
    const capacityRate = Number(cap.planned) > 0 ? round2((Number(cap.actual) / Number(cap.planned)) * 100) : 0;

    const bomCount = get("SELECT COUNT(*) AS c FROM boms WHERE status = '启用'")?.c || 0;
    const materialShortage = get(
      `SELECT COUNT(*) AS c FROM (
         SELECT m.item_id,
                ROUND(SUM(m.required_qty - m.issued_qty),2) AS need,
                (SELECT ROUND(COALESCE(SUM(sb.qty),0),2) FROM stock_balances sb WHERE sb.item_id = m.item_id) AS stock
           FROM work_order_materials m JOIN work_orders w ON w.id = m.wo_id
          WHERE w.status IN ('DRAFT','RELEASED','IN_PROGRESS')
          GROUP BY m.item_id
         HAVING need > stock)`
    )?.c || 0;

    return {
      period: m.period,
      total,
      producing: releasing,
      statusCounts,
      statusMap: counts,
      month: {
        period: m.period,
        completedQty: round2(completed.qty),
        completedOrders: Number(completed.orders) || 0,
        materialAmount: round2(materialAmount),
        completionAmount: round2(completionAmount),
      },
      capacity: {
        plannedHours: round2(cap.planned),
        actualHours: round2(cap.actual),
        operationCount: Number(cap.operation_count) || 0,
        rate: capacityRate,
      },
      bomCount,
      materialShortage,
      workOrderCount: total,
    };
  }, { perm: 'production.view' });

  // ============================================================
  // 工单列表
  // ============================================================
  router.get('/api/production/work-orders', async (ctx) => {
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [];
    const params = [];
    const sf = statusFilter(ctx.query.status, Object.keys(WO_STATUS));
    if (sf.sql) { where.push(sf.sql); params.push(...sf.params); }
    if (ctx.query.keyword) {
      where.push('(w.order_no LIKE ? OR i.code LIKE ? OR i.name LIKE ?)');
      const kw = `%${ctx.query.keyword}%`;
      params.push(kw, kw, kw);
    }
    if (ctx.query.itemId) { where.push('w.item_id = ?'); params.push(Number(ctx.query.itemId)); }
    if (ctx.query.startDate) { where.push('COALESCE(w.planned_start, w.created_at) >= ?'); params.push(ctx.query.startDate); }
    if (ctx.query.endDate) { where.push('COALESCE(w.planned_start, w.created_at) <= ?'); params.push(ctx.query.endDate); }
    if (ctx.query.priority) { where.push('w.priority = ?'); params.push(ctx.query.priority); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = get(
      `SELECT COUNT(*) AS c FROM work_orders w JOIN items i ON i.id = w.item_id ${w}`,
      ...params
    )?.c || 0;
    const rows = all(
      `SELECT w.*, i.code AS item_code, i.name AS item_name, i.spec, i.uom, i.item_type,
              wc.name AS warehouse_name, mc.name AS material_wh_name,
              b.code AS bom_code,
              (SELECT COUNT(*) FROM work_order_materials m WHERE m.wo_id = w.id) AS material_count
         FROM work_orders w
         JOIN items i ON i.id = w.item_id
         LEFT JOIN warehouses wc ON wc.id = w.warehouse_id
         LEFT JOIN warehouses mc ON mc.id = w.material_wh_id
         LEFT JOIN boms b ON b.id = w.bom_id
         ${w}
        ORDER BY w.id DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, offset
    ).map((r) => ({
      ...r,
      status_label: WO_STATUS[r.status] || r.status,
      progress: Number(r.qty) > 0 ? round2(Math.min(100, (Number(r.completed_qty) / Number(r.qty)) * 100)) : 0,
    }));
    return { rows, total, page, pageSize };
  }, { perm: 'production.view' });

  // ============================================================
  // 工单详情
  // ============================================================
  router.get('/api/production/work-orders/:id', async (ctx) => {
    return getWorkOrderFull(idOf(ctx));
  }, { perm: 'production.view' });

  // ============================================================
  // 新建工单（自动展开 BOM 物料与工序）
  // ============================================================
  router.post('/api/production/work-orders', async (ctx) => {
    const body = ctx.body || {};
    const itemId = Number(body.item_id);
    if (!Number.isInteger(itemId) || itemId <= 0) throw new ApiError('请选择要生产的物料');
    const item = get('SELECT * FROM items WHERE id = ?', itemId);
    if (!item) throw new ApiError('物料不存在');
    if (item.status !== '启用') throw new ApiError('该物料已停用，不能创建生产工单');

    const payload = normalizeWorkOrderBody(body);
    const bom = enabledBom(itemId);
    if (!bom) throw new ApiError('该物料未配置启用的 BOM，无法创建生产工单');

    const warehouse = assertWarehouse(payload.warehouse_id ?? defaultWarehouseId(item), '完工入库仓库');
    const materialWh = assertWarehouse(payload.material_wh_id ?? defaultMaterialWhId(), '领料仓库');
    const orderNo = nextDocNo('MO', payload.planned_start);

    const id = tx(() => {
      const r = run(
        `INSERT INTO work_orders(order_no, item_id, bom_id, qty, completed_qty, scrap_qty, warehouse_id, material_wh_id,
             planned_start, planned_end, actual_start, actual_end, priority, status, source_type, source_id, source_no,
             remark, created_by, created_by_name)
         VALUES(?,?,?,?,0,0,?,?,?,?,NULL,NULL,?,?,?,?,?,?,?,?)`,
        orderNo, itemId, bom.id, payload.qty, warehouse?.id || null, materialWh?.id || null,
        payload.planned_start, payload.planned_end, payload.priority, 'DRAFT',
        body.source_type || null, body.source_id || null, body.source_no || '',
        payload.remark, ctx.user.id, ctx.user.name
      );
      writeMaterialsAndOperations(r.lastInsertRowid, bom, payload.qty, materialWh?.id || null);
      return r.lastInsertRowid;
    });
    audit(ctx.user, '新建', 'production', 'work_orders', id, `生产工单 ${orderNo}`, ctx.ip);
    return getWorkOrderFull(id);
  }, { perm: 'production.create' });

  // ============================================================
  // 修改工单（仅草稿）
  // ============================================================
  router.put('/api/production/work-orders/:id', async (ctx) => {
    const id = idOf(ctx);
    const wo = get('SELECT * FROM work_orders WHERE id = ?', id);
    if (!wo) throw new ApiError('生产工单不存在', 404, 'NOT_FOUND');
    if (wo.status !== 'DRAFT') {
      throw new ApiError(`工单当前状态为「${WO_STATUS[wo.status] || wo.status}」，只有草稿可以修改`);
    }
    const body = ctx.body || {};
    const payload = normalizeWorkOrderBody(body, wo);
    const warehouse = payload.warehouse_id ? assertWarehouse(payload.warehouse_id, '完工入库仓库') : null;
    const materialWh = payload.material_wh_id ? assertWarehouse(payload.material_wh_id, '领料仓库') : null;
    const bom = wo.bom_id ? get('SELECT * FROM boms WHERE id = ?', wo.bom_id) : null;

    tx(() => {
      run(
        `UPDATE work_orders SET qty = ?, planned_start = ?, planned_end = ?, priority = ?, remark = ?,
             warehouse_id = ?, material_wh_id = ? WHERE id = ?`,
        payload.qty, payload.planned_start, payload.planned_end, payload.priority, payload.remark,
        warehouse ? warehouse.id : wo.warehouse_id, materialWh ? materialWh.id : wo.material_wh_id, id
      );
      // 数量或仓库变化时重新展开物料与工序（草稿阶段尚未领料）
      writeMaterialsAndOperations(id, bom, payload.qty, materialWh ? materialWh.id : wo.material_wh_id);
    });
    audit(ctx.user, '修改', 'production', 'work_orders', id, `生产工单 ${wo.order_no}`, ctx.ip);
    return getWorkOrderFull(id);
  }, { perm: 'production.edit' });

  // ============================================================
  // 删除工单（仅草稿）
  // ============================================================
  router.delete('/api/production/work-orders/:id', async (ctx) => {
    const id = idOf(ctx);
    const wo = get('SELECT * FROM work_orders WHERE id = ?', id);
    if (!wo) throw new ApiError('生产工单不存在', 404, 'NOT_FOUND');
    if (wo.status !== 'DRAFT') {
      throw new ApiError(`工单当前状态为「${WO_STATUS[wo.status] || wo.status}」，只有草稿可以删除`);
    }
    tx(() => {
      run('DELETE FROM work_order_materials WHERE wo_id = ?', id);
      run('DELETE FROM work_order_operations WHERE wo_id = ?', id);
      run('DELETE FROM work_orders WHERE id = ?', id);
    });
    audit(ctx.user, '删除', 'production', 'work_orders', id, `生产工单 ${wo.order_no}`, ctx.ip);
    return { id };
  }, { perm: 'production.delete' });

  // ============================================================
  // 工单动作：下达 / 开工 / 领料 / 完工 / 关闭 / 作废
  // ============================================================
  router.post('/api/production/work-orders/:id/action', async (ctx) => {
    const id = idOf(ctx);
    const wo = get('SELECT * FROM work_orders WHERE id = ?', id);
    if (!wo) throw new ApiError('生产工单不存在', 404, 'NOT_FOUND');
    const body = ctx.body || {};
    const action = String(body.action || '').trim();
    const actionDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || '')) ? body.date : todayStr();
    const statusLabel = WO_STATUS[wo.status] || wo.status;

    if (!['release', 'start', 'issue', 'complete', 'close', 'void'].includes(action)) {
      throw new ApiError('未知的工单动作');
    }

    if (action === 'release') {
      if (wo.status !== 'DRAFT') throw new ApiError(`工单当前状态为「${statusLabel}」，只有草稿可以下达`);
      run("UPDATE work_orders SET status = 'RELEASED' WHERE id = ?", id);
      audit(ctx.user, '下达', 'production', 'work_orders', id, `工单 ${wo.order_no} 下达`, ctx.ip);
    } else if (action === 'start') {
      if (wo.status !== 'RELEASED') throw new ApiError(`工单当前状态为「${statusLabel}」，只有已下达的工单可以开工`);
      tx(() => {
        run("UPDATE work_orders SET status = 'IN_PROGRESS', actual_start = COALESCE(actual_start, ?) WHERE id = ?", actionDate, id);
        run("UPDATE work_order_operations SET status = '进行中' WHERE wo_id = ? AND id = (SELECT id FROM work_order_operations WHERE wo_id = ? ORDER BY seq, id LIMIT 1)", id, id);
      });
      audit(ctx.user, '开工', 'production', 'work_orders', id, `工单 ${wo.order_no} 开工`, ctx.ip);
    } else if (action === 'issue') {
      if (!['RELEASED', 'IN_PROGRESS'].includes(wo.status)) {
        throw new ApiError(`工单当前状态为「${statusLabel}」，只有已下达或生产中的工单可以领料`);
      }
      const reqLines = Array.isArray(body.lines) ? body.lines : null;
      if (reqLines && !reqLines.length) throw new ApiError('请选择要领料的物料行');
      const result = tx(() => {
        const mats = all('SELECT * FROM work_order_materials WHERE wo_id = ? ORDER BY id', id);
        if (!mats.length) throw new ApiError('该工单没有领料明细，无法领料');
        let issuedCount = 0;
        let issuedAmount = 0;
        for (const m of mats) {
          let issueQty;
          if (reqLines) {
            const hit = reqLines.find((x) => Number(x.id ?? x.material_id ?? x.line_id) === m.id);
            if (!hit) continue;
            issueQty = round2(hit.qty);
          } else {
            issueQty = round2(Number(m.required_qty) - Number(m.issued_qty));
          }
          if (!(issueQty > 0)) continue;
          const remain = round2(Number(m.required_qty) - Number(m.issued_qty));
          if (issueQty > remain + 0.001) {
            throw new ApiError(`物料「${m.item_name || m.item_code}」领料数量超出未领数量（剩余 ${remain}）`);
          }
          const whId = m.warehouse_id || wo.material_wh_id;
          if (!whId) throw new ApiError(`物料「${m.item_name || m.item_code}」未指定领料仓库`);
          const res = postMaterialIssue({
            workOrder: { id: wo.id, order_no: wo.order_no },
            itemId: m.item_id,
            qty: issueQty,
            warehouseId: whId,
            date: actionDate,
            user: ctx.user,
          });
          run(
            `UPDATE work_order_materials SET issued_qty = ROUND(issued_qty + ?, 2), unit_cost = ? WHERE id = ?`,
            issueQty, res.unitCost, m.id
          );
          issuedCount++;
          issuedAmount = round2(issuedAmount + res.amount);
        }
        if (!issuedCount) throw new ApiError('所有物料均已领完，无需再次领料');
        run(
          `UPDATE work_orders SET status = 'IN_PROGRESS', actual_start = COALESCE(actual_start, ?) WHERE id = ?`,
          actionDate, id
        );
        run("UPDATE work_order_operations SET status = '进行中' WHERE wo_id = ? AND status = '待开始'", id);
        return { issuedCount, issuedAmount };
      });
      audit(ctx.user, '领料', 'production', 'work_orders', id, `工单 ${wo.order_no} 领料 ${result.issuedCount} 行 / ${result.issuedAmount}`, ctx.ip);
    } else if (action === 'complete') {
      if (wo.status !== 'IN_PROGRESS') {
        throw new ApiError(`工单当前状态为「${statusLabel}」，只有生产中的工单可以报完工（请先开工/领料）`);
      }
      const remaining = round2(Number(wo.qty) - Number(wo.completed_qty));
      if (remaining <= 0) throw new ApiError('该工单已全部完工');
      const qty = body.qty === undefined || body.qty === null || body.qty === '' ? remaining : round2(body.qty);
      if (!(qty > 0)) throw new ApiError('完工数量必须大于 0');
      if (qty > remaining + 0.001) throw new ApiError(`完工数量不能超过未完工数量 ${remaining}`);
      const issuedAmount = round2(
        get('SELECT ROUND(COALESCE(SUM(issued_qty * unit_cost),0),2) AS v FROM work_order_materials WHERE wo_id = ?', id)?.v || 0
      );
      // 单位成本 = 已领料金额 × 1.18 / 本次完工数量（材料 + 制造费用）
      let unitCost = round2((issuedAmount * 1.18) / qty);
      if (!(unitCost > 0)) {
        const item = get('SELECT price_purchase, cost FROM items WHERE id = ?', wo.item_id);
        unitCost = round2(itemCost(wo.item_id) || item?.cost || item?.price_purchase || 0);
      }
      const whId = wo.warehouse_id || defaultWarehouseId(get('SELECT item_type FROM items WHERE id = ?', wo.item_id));
      if (!whId) throw new ApiError('工单未指定完工入库仓库');
      tx(() => {
        postProductionCompletion({
          workOrder: { id: wo.id, order_no: wo.order_no },
          itemId: wo.item_id,
          qty,
          unitCost,
          warehouseId: whId,
          date: actionDate,
          user: ctx.user,
        });
        const completed = round2(Number(wo.completed_qty) + qty);
        const finished = completed >= round2(Number(wo.qty)) - 0.001;
        run(
          `UPDATE work_orders SET completed_qty = ?, status = ?, actual_end = ? WHERE id = ?`,
          completed, finished ? 'COMPLETED' : 'IN_PROGRESS', finished ? actionDate : wo.actual_end, id
        );
        if (finished) {
          run(
            `UPDATE work_order_operations SET status = '已完成',
                    actual_hours = CASE WHEN actual_hours = 0 OR actual_hours IS NULL THEN planned_hours ELSE actual_hours END
              WHERE wo_id = ?`,
            id
          );
        } else {
          run("UPDATE work_order_operations SET status = '进行中' WHERE wo_id = ? AND status = '待开始'", id);
        }
      });
      audit(ctx.user, '完工', 'production', 'work_orders', id, `工单 ${wo.order_no} 完工 ${qty}，单位成本 ${unitCost}`, ctx.ip);
    } else if (action === 'close') {
      if (wo.status !== 'COMPLETED') throw new ApiError(`工单当前状态为「${statusLabel}」，只有已完工的工单可以关闭`);
      run("UPDATE work_orders SET status = 'CLOSED' WHERE id = ?", id);
      audit(ctx.user, '关闭', 'production', 'work_orders', id, `工单 ${wo.order_no} 关闭`, ctx.ip);
    } else if (action === 'void') {
      if (!['DRAFT', 'RELEASED'].includes(wo.status)) {
        throw new ApiError(`工单当前状态为「${statusLabel}」，只有草稿或已下达的工单可以作废`);
      }
      run("UPDATE work_orders SET status = 'VOID' WHERE id = ?", id);
      audit(ctx.user, '作废', 'production', 'work_orders', id, `工单 ${wo.order_no} 作废`, ctx.ip);
    }

    return getWorkOrderFull(id);
  }, { perm: 'production.approve' });

  // ============================================================
  // 简易 MRP：未完工工单 + 未发货销售订单 净需求 vs 库存
  // ============================================================
  router.get('/api/production/materials-requirements', async (ctx) => {
    const limit = Math.min(500, Number(ctx.query.limit) || 200);
    const keyword = String(ctx.query.keyword || '').trim();
    const demand = new Map();
    const itemCache = new Map();
    const getItem = (itemId) => {
      if (!itemCache.has(itemId)) {
        itemCache.set(
          itemId,
          get('SELECT id, code, name, spec, uom, item_type, cost, price_purchase, safety_stock FROM items WHERE id = ?', itemId)
        );
      }
      return itemCache.get(itemId);
    };
    const addDemand = (itemId, qty, kind, sourceNo) => {
      const item = getItem(itemId);
      if (!item || !(Number(qty) > 0)) return;
      const bucket = demand.get(itemId) || { item, wo_qty: 0, so_qty: 0, sources: [] };
      if (kind === 'wo') bucket.wo_qty = round2(bucket.wo_qty + qty);
      else bucket.so_qty = round2(bucket.so_qty + qty);
      if (sourceNo && bucket.sources.length < 6 && !bucket.sources.includes(sourceNo)) bucket.sources.push(sourceNo);
      demand.set(itemId, bucket);
    };
    // 1) 未完工工单的未领料需求
    const woMaterials = all(
      `SELECT m.item_id, ROUND(SUM(m.required_qty - m.issued_qty),2) AS remain, MIN(w.order_no) AS order_no
         FROM work_order_materials m JOIN work_orders w ON w.id = m.wo_id
        WHERE w.status IN ('DRAFT','RELEASED','IN_PROGRESS') AND m.required_qty > m.issued_qty
        GROUP BY m.item_id`
    );
    for (const r of woMaterials) addDemand(r.item_id, r.remain, 'wo', r.order_no);
    // 2) 未发货销售订单需求（成品按 BOM 逐层展开到原料）
    const soLines = all(
      `SELECT d.doc_no, l.item_id, ROUND(l.qty - l.delivered_qty, 2) AS remain
         FROM documents d JOIN document_lines l ON l.doc_id = d.id
        WHERE d.doc_type = 'SO' AND d.status IN ('APPROVED','PARTIAL_SHIPPED')
          AND (l.qty - l.delivered_qty) > 0`
    );
    const expandSo = (itemId, qty, docNo, depth = 0) => {
      if (!(qty > 0) || depth > 5) return;
      const item = getItem(itemId);
      if (!item) return;
      addDemand(itemId, qty, 'so', docNo);
      if (item.item_type !== '成品' && item.item_type !== '半成品') return;
      const bom = enabledBom(itemId);
      if (!bom) return;
      const outQty = Number(bom.output_qty) > 0 ? Number(bom.output_qty) : 1;
      const lines = all('SELECT item_id, qty, loss_rate FROM bom_lines WHERE bom_id = ?', bom.id);
      for (const l of lines) {
        const childQty = round2((qty * Number(l.qty) * (1 + (Number(l.loss_rate) || 0) / 100)) / outQty);
        expandSo(l.item_id, childQty, docNo, depth + 1);
      }
    };
    for (const so of soLines) expandSo(so.item_id, so.remain, so.doc_no);

    const stockMap = new Map(
      all('SELECT item_id, ROUND(COALESCE(SUM(qty),0),2) AS qty FROM stock_balances GROUP BY item_id').map((r) => [r.item_id, r.qty])
    );
    let rows = [];
    for (const [itemId, bucket] of demand) {
      const item = bucket.item;
      const demandQty = round2(bucket.wo_qty + bucket.so_qty);
      const stockQty = round2(stockMap.get(itemId) || 0);
      const shortage = round2(Math.max(0, demandQty - stockQty));
      const surplus = round2(Math.max(0, stockQty - demandQty));
      const unitCost = round2(itemCost(itemId) || item.price_purchase || item.cost || 0);
      const action = shortage > 0 ? (item.item_type === '成品' || item.item_type === '半成品' ? '生产' : '采购') : '无';
      rows.push({
        item_id: itemId,
        item_code: item.code,
        item_name: item.name,
        spec: item.spec,
        uom: item.uom,
        item_type: item.item_type,
        safety_stock: item.safety_stock,
        wo_demand: bucket.wo_qty,
        so_demand: bucket.so_qty,
        demand_qty: demandQty,
        stock_qty: stockQty,
        shortage_qty: shortage,
        surplus_qty: surplus,
        suggested_action: action,
        suggested_qty: shortage,
        unit_cost: unitCost,
        shortage_amount: round2(shortage * unitCost),
        sources: bucket.sources,
        status: shortage > 0 ? '缺口' : '充足',
      });
    }
    if (keyword) {
      const kw = keyword.toLowerCase();
      rows = rows.filter(
        (r) =>
          String(r.item_code).toLowerCase().includes(kw) ||
          String(r.item_name).toLowerCase().includes(kw) ||
          String(r.spec || '').toLowerCase().includes(kw)
      );
    }
    rows.sort((a, b) => b.shortage_qty - a.shortage_qty || b.demand_qty - a.demand_qty);
    const shortageRows = rows.filter((r) => r.shortage_qty > 0);
    return {
      rows: rows.slice(0, limit),
      total: rows.length,
      shortageCount: shortageRows.length,
      summary: {
        demandItems: rows.length,
        shortageItems: shortageRows.length,
        purchaseItems: shortageRows.filter((r) => r.suggested_action === '采购').length,
        productionItems: shortageRows.filter((r) => r.suggested_action === '生产').length,
        purchaseAmount: round2(shortageRows.filter((r) => r.suggested_action === '采购').reduce((s, r) => s + r.shortage_amount, 0)),
        productionQty: round2(shortageRows.filter((r) => r.suggested_action === '生产').reduce((s, r) => s + r.suggested_qty, 0)),
        soOrderCount: new Set(soLines.map((r) => r.doc_no)).size,
        woCount: get("SELECT COUNT(*) AS c FROM work_orders WHERE status IN ('DRAFT','RELEASED','IN_PROGRESS')")?.c || 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }, { perm: 'production.view' });

  // ============================================================
  // 工作中心负荷
  // ============================================================
  router.get('/api/production/work-center-load', async (ctx) => {
    const m = monthRange();
    const rangeEnd = m.end < todayStr() ? m.end : todayStr();
    // 产能按整月工作日口径（便于与全月计划工时对比）
    const monthWorkdays = Math.max(1, countWeekdays(m.start, m.end));
    const centers = all('SELECT * FROM work_centers ORDER BY code');
    const agg = all(
      `SELECT o.work_center_id,
              ROUND(COALESCE(SUM(o.planned_hours),0),2) AS planned_hours,
              ROUND(COALESCE(SUM(o.actual_hours),0),2) AS actual_hours,
              COUNT(DISTINCT o.wo_id) AS order_count,
              COUNT(*) AS operation_count
         FROM work_order_operations o
         JOIN work_orders w ON w.id = o.wo_id
        WHERE w.status <> 'VOID'
          AND (w.planned_start BETWEEN ? AND ? OR w.planned_end BETWEEN ? AND ?)
        GROUP BY o.work_center_id`,
      m.start, m.end, m.start, m.end
    );
    const aggMap = new Map(agg.map((r) => [r.work_center_id, r]));
    const rows = centers.map((c) => {
      const a = aggMap.get(c.id) || { planned_hours: 0, actual_hours: 0, order_count: 0, operation_count: 0 };
      const capacityHours = round2((Number(c.capacity) || 0) * monthWorkdays);
      return {
        work_center_id: c.id,
        code: c.code,
        name: c.name,
        type: c.type,
        capacity: Number(c.capacity) || 0,
        cost_rate: Number(c.cost_rate) || 0,
        planned_hours: round2(a.planned_hours),
        actual_hours: round2(a.actual_hours),
        order_count: Number(a.order_count) || 0,
        operation_count: Number(a.operation_count) || 0,
        workdays: monthWorkdays,
        capacity_hours: capacityHours,
        load_rate: capacityHours > 0 ? round2((Number(a.planned_hours) / capacityHours) * 100) : 0,
        utilization: Number(a.planned_hours) > 0 ? round2((Number(a.actual_hours) / Number(a.planned_hours)) * 100) : 0,
        cost_amount: round2(Number(a.actual_hours) * (Number(c.cost_rate) || 0)),
      };
    });
    const totalPlanned = round2(rows.reduce((s, r) => s + r.planned_hours, 0));
    const totalActual = round2(rows.reduce((s, r) => s + r.actual_hours, 0));
    const totalCapacity = round2(rows.reduce((s, r) => s + r.capacity_hours, 0));
    return {
      period: m.period,
      startDate: m.start,
      endDate: m.end,
      workdays: monthWorkdays,
      rows,
      summary: {
        plannedHours: totalPlanned,
        actualHours: totalActual,
        capacityHours: totalCapacity,
        loadRate: totalCapacity > 0 ? round2((totalPlanned / totalCapacity) * 100) : 0,
        utilization: totalPlanned > 0 ? round2((totalActual / totalPlanned) * 100) : 0,
        costAmount: round2(rows.reduce((s, r) => s + r.cost_amount, 0)),
      },
      elapsedWorkdays: Math.max(1, countWeekdays(m.start, rangeEnd)),
    };
  }, { perm: 'production.view' });

  // ============================================================
  // 排产看板：进行中 / 已下达工单按计划日期排序
  // ============================================================
  router.get('/api/production/schedule', async (ctx) => {
    const today = todayStr();
    const sf = statusFilter(
      ctx.query.status && ctx.query.status !== 'ALL' ? ctx.query.status : 'RELEASED,IN_PROGRESS',
      ['RELEASED', 'IN_PROGRESS']
    );
    const rows = all(
      `SELECT w.*, i.code AS item_code, i.name AS item_name, i.spec, i.uom,
              (SELECT COUNT(*) FROM work_order_operations o WHERE o.wo_id = w.id) AS operation_count,
              (SELECT COUNT(*) FROM work_order_operations o WHERE o.wo_id = w.id AND o.status = '已完成') AS operation_done,
              (SELECT COUNT(*) FROM work_order_materials m WHERE m.wo_id = w.id) AS material_count,
              (SELECT COUNT(*) FROM work_order_materials m WHERE m.wo_id = w.id AND m.issued_qty >= m.required_qty) AS material_issued_count
         FROM work_orders w JOIN items i ON i.id = w.item_id
        WHERE ${sf.sql || "w.status IN ('RELEASED','IN_PROGRESS')"}
        ORDER BY w.planned_start ASC,
                 CASE w.priority WHEN '紧急' THEN 1 WHEN '高' THEN 2 WHEN '普通' THEN 3 ELSE 4 END,
                 w.id ASC`,
      ...sf.params
    ).map((r) => {
      const plannedEnd = r.planned_end || r.planned_start || today;
      const days = Math.ceil((new Date(`${plannedEnd}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
      return {
        ...r,
        status_label: WO_STATUS[r.status] || r.status,
        progress: Number(r.qty) > 0 ? round2(Math.min(100, (Number(r.completed_qty) / Number(r.qty)) * 100)) : 0,
        days_left: days,
        overdue: days < 0,
        material_issued_rate:
          Number(r.material_count) > 0 ? round2((Number(r.material_issued_count) / Number(r.material_count)) * 100) : 0,
      };
    });
    const summary = {
      total: rows.length,
      released: rows.filter((r) => r.status === 'RELEASED').length,
      inProgress: rows.filter((r) => r.status === 'IN_PROGRESS').length,
      overdue: rows.filter((r) => r.overdue).length,
      urgent: rows.filter((r) => r.priority === '紧急' || r.priority === '高').length,
    };
    // 按计划日期分组，方便看板泳道展示
    const groups = [];
    for (const r of rows) {
      const key = r.planned_start || '未排期';
      let g = groups.find((x) => x.date === key);
      if (!g) { g = { date: key, count: 0, rows: [] }; groups.push(g); }
      g.count++;
      g.rows.push(r);
    }
    return { rows, total: rows.length, summary, groups };
  }, { perm: 'production.view' });
}
