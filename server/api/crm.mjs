/**
 * 客户关系（CRM）API
 * - 总览（线索转化、商机漏斗、合同、客户、跟进）
 * - 线索 CRUD / 转为客户（KH+序号）
 * - 商机 CRUD / 阶段推进（自动赢率）
 * - 跟进记录 CRUD
 * - 合同 CRUD（自动合同编号）
 * - 客户贡献排行
 */
import { all, get, run, tx } from '../db.mjs';
import { ApiError, paginate, round2, todayStr } from '../http.mjs';
import { audit } from '../auth.mjs';
import { nextDocNo } from '../lib/numbering.mjs';

const LEAD_SOURCES = ['官网咨询', '展会', '电话拜访', '转介绍', '广告投放', '陌生拜访', '电商平台'];
const LEAD_STATUS = ['待跟进', '已联系', '已确认商机', '已转客户', '已流失'];
const OPP_STAGES = ['初步接洽', '需求确认', '方案报价', '商务谈判', '赢单', '输单'];
const STAGE_PROBABILITY = {
  初步接洽: 20,
  需求确认: 40,
  方案报价: 60,
  商务谈判: 80,
  赢单: 100,
  输单: 0,
};
const OPP_STATUS = ['进行中', '已赢单', '已输单'];
const ACTIVITY_TYPES = ['电话沟通', '上门拜访', '邮件往来', '会议', '演示', '其他'];
const REF_TYPES = ['LEAD', 'CUSTOMER', 'OPPORTUNITY'];
const CONTRACT_STATUS = ['草稿', '执行中', '已完成', '已终止'];

const SALES_STATUSES = ['APPROVED', 'PARTIAL_SHIPPED', 'FULL_SHIPPED', 'COMPLETED'];

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const nowStr = () => {
  const d = new Date();
  return `${ymd(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

function monthRange(dateStr = todayStr()) {
  const [y, m] = String(dateStr).split('-').map(Number);
  return { start: `${y}-${pad2(m)}-01`, end: ymd(new Date(y, m, 0)), period: `${y}-${pad2(m)}` };
}

function idOf(ctx, label = '记录') {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(`${label}ID不合法`);
  return id;
}

function isDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
}

/** 当前登录用户关联的员工ID（业务员/负责人） */
function currentEmployeeId(ctx) {
  return get('SELECT employee_id FROM users WHERE id = ?', ctx.user.id)?.employee_id || null;
}

function assertEmployeeExists(employeeId, label = '负责人') {
  if (!employeeId) return null;
  const emp = get('SELECT id, name FROM employees WHERE id = ?', Number(employeeId));
  if (!emp) throw new ApiError(`${label}不存在`);
  return emp.id;
}

function assertCustomer(customerId) {
  const c = get('SELECT * FROM customers WHERE id = ?', Number(customerId));
  if (!c) throw new ApiError('客户不存在');
  return c;
}

/** 下一个客户编码：KH + 4位序号 */
function nextCustomerCode() {
  const r = get("SELECT MAX(CAST(SUBSTR(code, 3) AS INTEGER)) AS n FROM customers WHERE code LIKE 'KH%'");
  const n = (Number(r?.n) || 0) + 1;
  return `KH${String(n).padStart(4, '0')}`;
}

function defaultDateRange(ctx, months = 12) {
  const endDate = isDate(ctx.query.endDate) ? ctx.query.endDate : todayStr();
  let startDate = isDate(ctx.query.startDate) ? ctx.query.startDate : null;
  if (!startDate) {
    const d = new Date(`${endDate}T00:00:00`);
    d.setMonth(d.getMonth() - (months - 1));
    d.setDate(1);
    startDate = ymd(d);
  }
  return { startDate, endDate };
}

export function register(router) {
  // ============================================================
  // CRM 总览
  // ============================================================
  router.get('/api/crm/overview', async () => {
    const m = monthRange();
    const leadRows = all('SELECT status, COUNT(*) AS count, ROUND(COALESCE(SUM(expected_amount),0),2) AS amount FROM leads GROUP BY status');
    const leadStats = Object.fromEntries(leadRows.map((r) => [r.status, { count: r.count, amount: r.amount }]));
    const leadTotal = leadRows.reduce((s, r) => s + Number(r.count || 0), 0);
    const converted = Number(leadStats['已转客户']?.count || 0);
    const lost = Number(leadStats['已流失']?.count || 0);
    const conversionRate = leadTotal > 0 ? round2((converted / leadTotal) * 100) : 0;

    const oppRows = all('SELECT stage, COUNT(*) AS count, ROUND(COALESCE(SUM(amount),0),2) AS amount FROM opportunities GROUP BY stage');
    const oppMap = Object.fromEntries(oppRows.map((r) => [r.stage, r]));
    const funnel = OPP_STAGES.map((stage) => {
      const row = oppMap[stage] || { count: 0, amount: 0 };
      return {
        stage,
        count: Number(row.count) || 0,
        amount: round2(row.amount),
        probability: STAGE_PROBABILITY[stage],
        weighted_amount: round2((Number(row.amount) || 0) * STAGE_PROBABILITY[stage] / 100),
      };
    });
    const oppTotal = get('SELECT COUNT(*) AS count, ROUND(COALESCE(SUM(amount),0),2) AS amount FROM opportunities') || { count: 0, amount: 0 };
    const wonOpp = get("SELECT COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS amount FROM opportunities WHERE stage = '赢单'");
    const winRate = Number(oppTotal.count) > 0 ? round2((Number(wonOpp.c) / Number(oppTotal.count)) * 100) : 0;

    const newCustomers = get('SELECT COUNT(*) AS c FROM customers WHERE substr(created_at, 1, 7) = ?', m.period)?.c || 0;
    const customerTotal = get("SELECT COUNT(*) AS c FROM customers WHERE status = '正常'")?.c || 0;
    const contracts = get('SELECT COUNT(*) AS count, ROUND(COALESCE(SUM(amount),0),2) AS amount FROM contracts') || { count: 0, amount: 0 };
    const executing = get("SELECT COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS amount FROM contracts WHERE status = '执行中'");
    const pendingFollow = get("SELECT COUNT(*) AS c FROM leads WHERE status = '待跟进'")?.c || 0;
    const dueFollow = get(
      "SELECT COUNT(*) AS c FROM leads WHERE status IN ('待跟进','已联系') AND next_follow_at IS NOT NULL AND next_follow_at <= ?",
      todayStr()
    )?.c || 0;
    const activities = get(
      'SELECT COUNT(*) AS c FROM crm_activities WHERE substr(COALESCE(activity_at, created_at), 1, 7) = ?',
      m.period
    )?.c || 0;

    return {
      period: m.period,
      leads: { total: leadTotal, converted, lost, active: leadTotal - converted - lost, conversionRate, byStatus: leadStats },
      opportunities: {
        total: Number(oppTotal.count) || 0,
        amount: round2(oppTotal.amount),
        wonCount: Number(wonOpp.c) || 0,
        wonAmount: round2(wonOpp.amount),
        winRate,
        funnel,
      },
      newCustomers,
      customers: customerTotal,
      contracts: {
        count: Number(contracts.count) || 0,
        amount: round2(contracts.amount),
        executingCount: Number(executing.c) || 0,
        executingAmount: round2(executing.amount),
      },
      followUp: { pending: pendingFollow, due: dueFollow },
      activities: { thisMonth: Number(activities) || 0 },
    };
  }, { perm: 'crm.view' });

  // ============================================================
  // 线索
  // ============================================================
  router.get('/api/crm/leads', async (ctx) => {
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [];
    const params = [];
    if (ctx.query.status) { where.push('l.status = ?'); params.push(ctx.query.status); }
    if (ctx.query.source) { where.push('l.source = ?'); params.push(ctx.query.source); }
    if (ctx.query.ownerId) { where.push('l.owner_id = ?'); params.push(Number(ctx.query.ownerId)); }
    if (ctx.query.keyword) {
      where.push('(l.name LIKE ? OR l.company LIKE ? OR l.contact LIKE ? OR l.phone LIKE ?)');
      const kw = `%${ctx.query.keyword}%`;
      params.push(kw, kw, kw, kw);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = get(`SELECT COUNT(*) AS c FROM leads l ${w}`, ...params)?.c || 0;
    const rows = all(
      `SELECT l.*, e.name AS owner_name, e.code AS owner_code
         FROM leads l LEFT JOIN employees e ON e.id = l.owner_id
         ${w} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, offset
    );
    const summary = Object.fromEntries(
      all('SELECT status, COUNT(*) AS count FROM leads GROUP BY status').map((r) => [r.status, r.count])
    );
    return { rows, total, page, pageSize, summary };
  }, { perm: 'crm.view' });

  router.post('/api/crm/leads', async (ctx) => {
    const body = ctx.body || {};
    const name = String(body.name || '').trim();
    if (!name) throw new ApiError('线索名称不能为空');
    const status = body.status || '待跟进';
    if (!LEAD_STATUS.includes(status)) throw new ApiError(`线索状态只能是 ${LEAD_STATUS.join('/')}`);
    const source = body.source || LEAD_SOURCES[0];
    const ownerId = body.owner_id === undefined ? currentEmployeeId(ctx) : assertEmployeeExists(body.owner_id, '负责人');
    if (body.next_follow_at && !isDate(body.next_follow_at)) throw new ApiError('下次跟进日期格式应为 YYYY-MM-DD');
    const r = run(
      `INSERT INTO leads(name, company, contact, phone, email, source, status, owner_id, expected_amount, next_follow_at, remark)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      name, String(body.company || ''), String(body.contact || ''), String(body.phone || ''), String(body.email || ''),
      source, status, ownerId, round2(body.expected_amount), body.next_follow_at || null, String(body.remark || '')
    );
    audit(ctx.user, '新建', 'crm', 'leads', r.lastInsertRowid, `线索 ${name}`, ctx.ip);
    return get('SELECT * FROM leads WHERE id = ?', r.lastInsertRowid);
  }, { perm: 'crm.create' });

  router.put('/api/crm/leads/:id', async (ctx) => {
    const id = idOf(ctx, '线索');
    const row = get('SELECT * FROM leads WHERE id = ?', id);
    if (!row) throw new ApiError('线索不存在', 404, 'NOT_FOUND');
    const body = ctx.body || {};
    if (body.name !== undefined && !String(body.name).trim()) throw new ApiError('线索名称不能为空');
    if (body.status !== undefined && !LEAD_STATUS.includes(body.status)) {
      throw new ApiError(`线索状态只能是 ${LEAD_STATUS.join('/')}`);
    }
    if (body.next_follow_at && !isDate(body.next_follow_at)) throw new ApiError('下次跟进日期格式应为 YYYY-MM-DD');
    const ownerId = body.owner_id === undefined ? row.owner_id : assertEmployeeExists(body.owner_id, '负责人');
    run(
      `UPDATE leads SET name = ?, company = ?, contact = ?, phone = ?, email = ?, source = ?, status = ?,
              owner_id = ?, expected_amount = ?, next_follow_at = ?, remark = ? WHERE id = ?`,
      body.name !== undefined ? String(body.name).trim() : row.name,
      body.company !== undefined ? String(body.company || '') : row.company,
      body.contact !== undefined ? String(body.contact || '') : row.contact,
      body.phone !== undefined ? String(body.phone || '') : row.phone,
      body.email !== undefined ? String(body.email || '') : row.email,
      body.source !== undefined ? String(body.source || '') : row.source,
      body.status !== undefined ? body.status : row.status,
      ownerId,
      body.expected_amount !== undefined ? round2(body.expected_amount) : row.expected_amount,
      body.next_follow_at !== undefined ? body.next_follow_at || null : row.next_follow_at,
      body.remark !== undefined ? String(body.remark || '') : row.remark,
      id
    );
    audit(ctx.user, '修改', 'crm', 'leads', id, `线索 ${row.name}`, ctx.ip);
    return get('SELECT * FROM leads WHERE id = ?', id);
  }, { perm: 'crm.edit' });

  router.delete('/api/crm/leads/:id', async (ctx) => {
    const id = idOf(ctx, '线索');
    const row = get('SELECT * FROM leads WHERE id = ?', id);
    if (!row) throw new ApiError('线索不存在', 404, 'NOT_FOUND');
    if (row.status === '已转客户') throw new ApiError('该线索已转为客户，不能删除');
    tx(() => {
      run("DELETE FROM crm_activities WHERE ref_type = 'LEAD' AND ref_id = ?", id);
      run('DELETE FROM leads WHERE id = ?', id);
    });
    audit(ctx.user, '删除', 'crm', 'leads', id, `线索 ${row.name}`, ctx.ip);
    return { id };
  }, { perm: 'crm.delete' });

  // 线索转客户
  router.post('/api/crm/leads/:id/convert', async (ctx) => {
    const id = idOf(ctx, '线索');
    const lead = get('SELECT * FROM leads WHERE id = ?', id);
    if (!lead) throw new ApiError('线索不存在', 404, 'NOT_FOUND');
    if (lead.status === '已转客户') throw new ApiError('该线索已转为客户');
    const name = lead.company || lead.name;
    if (!name) throw new ApiError('线索缺少公司/客户名称，无法转为客户');
    const code = nextCustomerCode();
    const dup = get('SELECT id FROM customers WHERE name = ?', name);
    if (dup) throw new ApiError(`客户「${name}」已存在，无需重复转换`);
    const customerId = tx(() => {
      const r = run(
        `INSERT INTO customers(code, name, short_name, category, level, region, industry, address, contact, phone, email,
             credit_limit, credit_days, salesman_id, status, remark, created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,0,30,?,?,?, datetime('now','localtime'))`,
        code, name, name.slice(0, 6), '普通客户', 'B', null, null, '',
        String(lead.contact || ''), String(lead.phone || ''), String(lead.email || ''),
        lead.owner_id || null, '正常', `由线索「${lead.name}」转化`
      );
      run("UPDATE leads SET status = '已转客户' WHERE id = ?", id);
      run('UPDATE opportunities SET customer_id = ? WHERE lead_id = ? AND (customer_id IS NULL OR customer_id = 0)', r.lastInsertRowid, id);
      return r.lastInsertRowid;
    });
    audit(ctx.user, '线索转客户', 'crm', 'leads', id, `线索 ${lead.name} → 客户 ${code}`, ctx.ip);
    return {
      lead_id: id,
      customer_id: customerId,
      code,
      customer: get('SELECT * FROM customers WHERE id = ?', customerId),
      lead: get('SELECT * FROM leads WHERE id = ?', id),
    };
  }, { perm: 'crm.edit' });

  // ============================================================
  // 商机
  // ============================================================
  router.get('/api/crm/opportunities', async (ctx) => {
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [];
    const params = [];
    if (ctx.query.stage) { where.push('o.stage = ?'); params.push(ctx.query.stage); }
    if (ctx.query.status) { where.push('o.status = ?'); params.push(ctx.query.status); }
    if (ctx.query.customerId) { where.push('o.customer_id = ?'); params.push(Number(ctx.query.customerId)); }
    if (ctx.query.ownerId) { where.push('o.owner_id = ?'); params.push(Number(ctx.query.ownerId)); }
    if (ctx.query.keyword) {
      where.push('(o.name LIKE ? OR c.name LIKE ?)');
      const kw = `%${ctx.query.keyword}%`;
      params.push(kw, kw);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = get(
      `SELECT COUNT(*) AS c FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id ${w}`,
      ...params
    )?.c || 0;
    const rows = all(
      `SELECT o.*, c.name AS customer_name, c.code AS customer_code, c.level AS customer_level,
              e.name AS owner_name
         FROM opportunities o
         LEFT JOIN customers c ON c.id = o.customer_id
         LEFT JOIN employees e ON e.id = o.owner_id
         ${w} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, offset
    );
    const summary = get(
      `SELECT COUNT(*) AS count, ROUND(COALESCE(SUM(o.amount),0),2) AS amount,
              ROUND(COALESCE(SUM(o.amount * o.probability / 100),0),2) AS weighted_amount
         FROM opportunities o LEFT JOIN customers c ON c.id = o.customer_id ${w}`,
      ...params
    ) || { count: 0, amount: 0, weighted_amount: 0 };
    return {
      rows, total, page, pageSize,
      summary: { count: Number(summary.count) || 0, amount: round2(summary.amount), weighted_amount: round2(summary.weighted_amount) },
    };
  }, { perm: 'crm.view' });

  router.post('/api/crm/opportunities', async (ctx) => {
    const body = ctx.body || {};
    const name = String(body.name || '').trim();
    if (!name) throw new ApiError('商机名称不能为空');
    const stage = body.stage || '初步接洽';
    if (!OPP_STAGES.includes(stage)) throw new ApiError(`商机阶段只能是 ${OPP_STAGES.join('/')}`);
    if (body.customer_id) assertCustomer(body.customer_id);
    const ownerId = body.owner_id === undefined ? currentEmployeeId(ctx) : assertEmployeeExists(body.owner_id, '负责人');
    const probability = body.probability === undefined ? STAGE_PROBABILITY[stage] : Math.max(0, Math.min(100, Number(body.probability) || 0));
    const status = body.status || (stage === '赢单' ? '已赢单' : stage === '输单' ? '已输单' : '进行中');
    if (!OPP_STATUS.includes(status)) throw new ApiError(`商机状态只能是 ${OPP_STATUS.join('/')}`);
    if (body.expected_close_date && !isDate(body.expected_close_date)) throw new ApiError('预计成交日期格式应为 YYYY-MM-DD');
    const r = run(
      `INSERT INTO opportunities(name, customer_id, lead_id, amount, stage, probability, expected_close_date, owner_id, status, remark)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      name, body.customer_id ? Number(body.customer_id) : null, body.lead_id ? Number(body.lead_id) : null,
      round2(body.amount), stage, probability, body.expected_close_date || null, ownerId, status, String(body.remark || '')
    );
    audit(ctx.user, '新建', 'crm', 'opportunities', r.lastInsertRowid, `商机 ${name}`, ctx.ip);
    return get('SELECT * FROM opportunities WHERE id = ?', r.lastInsertRowid);
  }, { perm: 'crm.create' });

  router.put('/api/crm/opportunities/:id', async (ctx) => {
    const id = idOf(ctx, '商机');
    const row = get('SELECT * FROM opportunities WHERE id = ?', id);
    if (!row) throw new ApiError('商机不存在', 404, 'NOT_FOUND');
    const body = ctx.body || {};
    if (body.name !== undefined && !String(body.name).trim()) throw new ApiError('商机名称不能为空');
    const stage = body.stage !== undefined ? body.stage : row.stage;
    if (!OPP_STAGES.includes(stage)) throw new ApiError(`商机阶段只能是 ${OPP_STAGES.join('/')}`);
    if (body.customer_id) assertCustomer(body.customer_id);
    let probability = body.probability !== undefined ? Math.max(0, Math.min(100, Number(body.probability) || 0)) : row.probability;
    let status = body.status !== undefined ? body.status : row.status;
    if (body.stage !== undefined && body.probability === undefined) probability = STAGE_PROBABILITY[stage];
    if (body.stage !== undefined && body.status === undefined) {
      status = stage === '赢单' ? '已赢单' : stage === '输单' ? '已输单' : '进行中';
    }
    if (!OPP_STATUS.includes(status)) throw new ApiError(`商机状态只能是 ${OPP_STATUS.join('/')}`);
    if (body.expected_close_date && !isDate(body.expected_close_date)) throw new ApiError('预计成交日期格式应为 YYYY-MM-DD');
    const ownerId = body.owner_id === undefined ? row.owner_id : assertEmployeeExists(body.owner_id, '负责人');
    run(
      `UPDATE opportunities SET name = ?, customer_id = ?, lead_id = ?, amount = ?, stage = ?, probability = ?,
              expected_close_date = ?, owner_id = ?, status = ?, remark = ? WHERE id = ?`,
      body.name !== undefined ? String(body.name).trim() : row.name,
      body.customer_id !== undefined ? (body.customer_id ? Number(body.customer_id) : null) : row.customer_id,
      body.lead_id !== undefined ? (body.lead_id ? Number(body.lead_id) : null) : row.lead_id,
      body.amount !== undefined ? round2(body.amount) : row.amount,
      stage, probability,
      body.expected_close_date !== undefined ? body.expected_close_date || null : row.expected_close_date,
      ownerId, status,
      body.remark !== undefined ? String(body.remark || '') : row.remark,
      id
    );
    audit(ctx.user, '修改', 'crm', 'opportunities', id, `商机 ${row.name}`, ctx.ip);
    return get('SELECT * FROM opportunities WHERE id = ?', id);
  }, { perm: 'crm.edit' });

  router.delete('/api/crm/opportunities/:id', async (ctx) => {
    const id = idOf(ctx, '商机');
    const row = get('SELECT * FROM opportunities WHERE id = ?', id);
    if (!row) throw new ApiError('商机不存在', 404, 'NOT_FOUND');
    tx(() => {
      run("DELETE FROM crm_activities WHERE ref_type = 'OPPORTUNITY' AND ref_id = ?", id);
      run('DELETE FROM opportunities WHERE id = ?', id);
    });
    audit(ctx.user, '删除', 'crm', 'opportunities', id, `商机 ${row.name}`, ctx.ip);
    return { id };
  }, { perm: 'crm.delete' });

  // 商机阶段推进
  router.post('/api/crm/opportunities/:id/stage', async (ctx) => {
    const id = idOf(ctx, '商机');
    const row = get('SELECT * FROM opportunities WHERE id = ?', id);
    if (!row) throw new ApiError('商机不存在', 404, 'NOT_FOUND');
    const stage = String((ctx.body || {}).stage || '');
    if (!OPP_STAGES.includes(stage)) throw new ApiError(`商机阶段只能是 ${OPP_STAGES.join('/')}`);
    const probability = STAGE_PROBABILITY[stage];
    const status = stage === '赢单' ? '已赢单' : stage === '输单' ? '已输单' : '进行中';
    run('UPDATE opportunities SET stage = ?, probability = ?, status = ? WHERE id = ?', stage, probability, status, id);
    audit(ctx.user, '商机推进', 'crm', 'opportunities', id, `${row.stage} → ${stage}`, ctx.ip);
    return get('SELECT * FROM opportunities WHERE id = ?', id);
  }, { perm: 'crm.edit' });

  // ============================================================
  // 跟进记录
  // ============================================================
  router.get('/api/crm/activities', async (ctx) => {
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [];
    const params = [];
    if (ctx.query.refType) { where.push('a.ref_type = ?'); params.push(String(ctx.query.refType).toUpperCase()); }
    if (ctx.query.refId) { where.push('a.ref_id = ?'); params.push(Number(ctx.query.refId)); }
    if (ctx.query.activityType) { where.push('a.activity_type = ?'); params.push(ctx.query.activityType); }
    if (ctx.query.ownerId) { where.push('a.owner_id = ?'); params.push(Number(ctx.query.ownerId)); }
    if (ctx.query.startDate) { where.push('COALESCE(a.activity_at, a.created_at) >= ?'); params.push(ctx.query.startDate); }
    if (ctx.query.endDate) { where.push('COALESCE(a.activity_at, a.created_at) <= ?'); params.push(`${ctx.query.endDate} 23:59:59`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = get(`SELECT COUNT(*) AS c FROM crm_activities a ${w}`, ...params)?.c || 0;
    const rows = all(
      `SELECT a.*, e.name AS owner_name,
              COALESCE(ld.name, cu.name, op.name) AS ref_name
         FROM crm_activities a
         LEFT JOIN employees e ON e.id = a.owner_id
         LEFT JOIN leads ld ON a.ref_type = 'LEAD' AND ld.id = a.ref_id
         LEFT JOIN customers cu ON a.ref_type = 'CUSTOMER' AND cu.id = a.ref_id
         LEFT JOIN opportunities op ON a.ref_type = 'OPPORTUNITY' AND op.id = a.ref_id
         ${w}
        ORDER BY COALESCE(a.activity_at, a.created_at) DESC, a.id DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, offset
    );
    return { rows, total, page, pageSize };
  }, { perm: 'crm.view' });

  function assertRef(refType, refId) {
    const type = String(refType || '').toUpperCase();
    if (!REF_TYPES.includes(type)) throw new ApiError(`跟进对象类型只能是 ${REF_TYPES.join('/')}`);
    const id = Number(refId);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError('请选择跟进对象');
    const table = type === 'LEAD' ? 'leads' : type === 'CUSTOMER' ? 'customers' : 'opportunities';
    const exists = get(`SELECT id FROM ${table} WHERE id = ?`, id);
    if (!exists) throw new ApiError('跟进对象不存在');
    return { type, id };
  }

  router.post('/api/crm/activities', async (ctx) => {
    const body = ctx.body || {};
    const ref = assertRef(body.ref_type, body.ref_id);
    const activityType = body.activity_type || '电话沟通';
    if (!ACTIVITY_TYPES.includes(activityType)) throw new ApiError(`跟进方式只能是 ${ACTIVITY_TYPES.join('/')}`);
    const ownerId = body.owner_id === undefined ? currentEmployeeId(ctx) : assertEmployeeExists(body.owner_id, '负责人');
    const activityAt = body.activity_at && /^\d{4}-\d{2}-\d{2}/.test(body.activity_at) ? body.activity_at : nowStr();
    const r = run(
      `INSERT INTO crm_activities(ref_type, ref_id, activity_type, subject, content, activity_at, owner_id)
       VALUES(?,?,?,?,?,?,?)`,
      ref.type, ref.id, activityType, String(body.subject || ''), String(body.content || ''), activityAt, ownerId
    );
    audit(ctx.user, '新建跟进', 'crm', 'crm_activities', r.lastInsertRowid, `${ref.type}#${ref.id} ${activityType}`, ctx.ip);
    return get('SELECT * FROM crm_activities WHERE id = ?', r.lastInsertRowid);
  }, { perm: 'crm.create' });

  router.put('/api/crm/activities/:id', async (ctx) => {
    const id = idOf(ctx, '跟进记录');
    const row = get('SELECT * FROM crm_activities WHERE id = ?', id);
    if (!row) throw new ApiError('跟进记录不存在', 404, 'NOT_FOUND');
    const body = ctx.body || {};
    let ref = { type: row.ref_type, id: row.ref_id };
    if (body.ref_type !== undefined || body.ref_id !== undefined) ref = assertRef(body.ref_type ?? row.ref_type, body.ref_id ?? row.ref_id);
    const activityType = body.activity_type ?? row.activity_type;
    if (!ACTIVITY_TYPES.includes(activityType)) throw new ApiError(`跟进方式只能是 ${ACTIVITY_TYPES.join('/')}`);
    const ownerId = body.owner_id === undefined ? row.owner_id : assertEmployeeExists(body.owner_id, '负责人');
    run(
      `UPDATE crm_activities SET ref_type = ?, ref_id = ?, activity_type = ?, subject = ?, content = ?, activity_at = ?, owner_id = ?
        WHERE id = ?`,
      ref.type, ref.id, activityType,
      body.subject !== undefined ? String(body.subject || '') : row.subject,
      body.content !== undefined ? String(body.content || '') : row.content,
      body.activity_at !== undefined ? body.activity_at || null : row.activity_at,
      ownerId, id
    );
    audit(ctx.user, '修改跟进', 'crm', 'crm_activities', id, `${ref.type}#${ref.id}`, ctx.ip);
    return get('SELECT * FROM crm_activities WHERE id = ?', id);
  }, { perm: 'crm.edit' });

  router.delete('/api/crm/activities/:id', async (ctx) => {
    const id = idOf(ctx, '跟进记录');
    const row = get('SELECT * FROM crm_activities WHERE id = ?', id);
    if (!row) throw new ApiError('跟进记录不存在', 404, 'NOT_FOUND');
    run('DELETE FROM crm_activities WHERE id = ?', id);
    audit(ctx.user, '删除跟进', 'crm', 'crm_activities', id, `${row.ref_type}#${row.ref_id}`, ctx.ip);
    return { id };
  }, { perm: 'crm.delete' });

  // ============================================================
  // 合同
  // ============================================================
  router.get('/api/crm/contracts', async (ctx) => {
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [];
    const params = [];
    if (ctx.query.status) { where.push('ct.status = ?'); params.push(ctx.query.status); }
    if (ctx.query.customerId) { where.push('ct.customer_id = ?'); params.push(Number(ctx.query.customerId)); }
    if (ctx.query.keyword) {
      where.push('(ct.contract_no LIKE ? OR ct.name LIKE ? OR c.name LIKE ?)');
      const kw = `%${ctx.query.keyword}%`;
      params.push(kw, kw, kw);
    }
    if (ctx.query.startDate) { where.push('ct.sign_date >= ?'); params.push(ctx.query.startDate); }
    if (ctx.query.endDate) { where.push('ct.sign_date <= ?'); params.push(ctx.query.endDate); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = get(
      `SELECT COUNT(*) AS c FROM contracts ct LEFT JOIN customers c ON c.id = ct.customer_id ${w}`,
      ...params
    )?.c || 0;
    const rows = all(
      `SELECT ct.*, c.name AS customer_name, c.code AS customer_code, c.level AS customer_level, e.name AS owner_name
         FROM contracts ct
         LEFT JOIN customers c ON c.id = ct.customer_id
         LEFT JOIN employees e ON e.id = ct.owner_id
         ${w} ORDER BY ct.id DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, offset
    );
    const summary = get(
      `SELECT COUNT(*) AS count, ROUND(COALESCE(SUM(ct.amount),0),2) AS total_amount,
              ROUND(COALESCE(AVG(ct.amount),0),2) AS avg_amount,
              SUM(CASE WHEN ct.status = '执行中' THEN 1 ELSE 0 END) AS executing_count,
              ROUND(COALESCE(SUM(CASE WHEN ct.status = '执行中' THEN ct.amount ELSE 0 END),0),2) AS executing_amount
         FROM contracts ct LEFT JOIN customers c ON c.id = ct.customer_id ${w}`,
      ...params
    ) || { count: 0, total_amount: 0, avg_amount: 0, executing_count: 0, executing_amount: 0 };
    return {
      rows, total, page, pageSize,
      summary: {
        count: Number(summary.count) || 0,
        total_amount: round2(summary.total_amount),
        avg_amount: round2(summary.avg_amount),
        executing_count: Number(summary.executing_count) || 0,
        executing_amount: round2(summary.executing_amount),
      },
    };
  }, { perm: 'crm.view' });

  router.post('/api/crm/contracts', async (ctx) => {
    const body = ctx.body || {};
    const name = String(body.name || '').trim();
    if (!name) throw new ApiError('合同名称不能为空');
    const customer = assertCustomer(body.customer_id);
    const status = body.status || '执行中';
    if (!CONTRACT_STATUS.includes(status)) throw new ApiError(`合同状态只能是 ${CONTRACT_STATUS.join('/')}`);
    const signDate = body.sign_date || todayStr();
    if (!isDate(signDate)) throw new ApiError('签约日期格式应为 YYYY-MM-DD');
    if (body.start_date && !isDate(body.start_date)) throw new ApiError('合同开始日期格式应为 YYYY-MM-DD');
    if (body.end_date && !isDate(body.end_date)) throw new ApiError('合同结束日期格式应为 YYYY-MM-DD');
    if (body.start_date && body.end_date && body.end_date < body.start_date) throw new ApiError('合同结束日期不能早于开始日期');
    const contractNo = body.contract_no ? String(body.contract_no).trim() : nextDocNo('CONTRACT', signDate);
    const dup = get('SELECT id FROM contracts WHERE contract_no = ?', contractNo);
    if (dup) throw new ApiError(`合同编号「${contractNo}」已存在`);
    const ownerId = body.owner_id === undefined ? currentEmployeeId(ctx) : assertEmployeeExists(body.owner_id, '负责人');
    const r = run(
      `INSERT INTO contracts(contract_no, name, customer_id, amount, sign_date, start_date, end_date, status, owner_id, remark)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      contractNo, name, customer.id, round2(body.amount), signDate,
      body.start_date || null, body.end_date || null, status, ownerId, String(body.remark || '')
    );
    audit(ctx.user, '新建', 'crm', 'contracts', r.lastInsertRowid, `合同 ${contractNo} ${name}`, ctx.ip);
    return get('SELECT * FROM contracts WHERE id = ?', r.lastInsertRowid);
  }, { perm: 'crm.create' });

  router.put('/api/crm/contracts/:id', async (ctx) => {
    const id = idOf(ctx, '合同');
    const row = get('SELECT * FROM contracts WHERE id = ?', id);
    if (!row) throw new ApiError('合同不存在', 404, 'NOT_FOUND');
    const body = ctx.body || {};
    if (body.name !== undefined && !String(body.name).trim()) throw new ApiError('合同名称不能为空');
    const customerId = body.customer_id !== undefined ? assertCustomer(body.customer_id).id : row.customer_id;
    const status = body.status ?? row.status;
    if (!CONTRACT_STATUS.includes(status)) throw new ApiError(`合同状态只能是 ${CONTRACT_STATUS.join('/')}`);
    const startDate = body.start_date !== undefined ? body.start_date || null : row.start_date;
    const endDate = body.end_date !== undefined ? body.end_date || null : row.end_date;
    if (startDate && endDate && endDate < startDate) throw new ApiError('合同结束日期不能早于开始日期');
    const ownerId = body.owner_id === undefined ? row.owner_id : assertEmployeeExists(body.owner_id, '负责人');
    run(
      `UPDATE contracts SET name = ?, customer_id = ?, amount = ?, sign_date = ?, start_date = ?, end_date = ?,
              status = ?, owner_id = ?, remark = ? WHERE id = ?`,
      body.name !== undefined ? String(body.name).trim() : row.name,
      customerId,
      body.amount !== undefined ? round2(body.amount) : row.amount,
      body.sign_date !== undefined ? body.sign_date : row.sign_date,
      startDate, endDate, status, ownerId,
      body.remark !== undefined ? String(body.remark || '') : row.remark,
      id
    );
    audit(ctx.user, '修改', 'crm', 'contracts', id, `合同 ${row.contract_no}`, ctx.ip);
    return get('SELECT * FROM contracts WHERE id = ?', id);
  }, { perm: 'crm.edit' });

  router.delete('/api/crm/contracts/:id', async (ctx) => {
    const id = idOf(ctx, '合同');
    const row = get('SELECT * FROM contracts WHERE id = ?', id);
    if (!row) throw new ApiError('合同不存在', 404, 'NOT_FOUND');
    run('DELETE FROM contracts WHERE id = ?', id);
    audit(ctx.user, '删除', 'crm', 'contracts', id, `合同 ${row.contract_no}`, ctx.ip);
    return { id };
  }, { perm: 'crm.delete' });

  // ============================================================
  // 客户贡献排行（DN 汇总）
  // ============================================================
  router.get('/api/crm/customers/rank', async (ctx) => {
    const { startDate, endDate } = defaultDateRange(ctx, 12);
    const limit = Math.min(100, Number(ctx.query.limit) || 20);
    const statusSql = SALES_STATUSES.map(() => '?').join(',');
    const rows = all(
      `SELECT d.partner_id AS customer_id, c.code AS customer_code, c.name AS customer_name, c.level, c.region,
              COUNT(DISTINCT d.id) AS order_count,
              ROUND(COALESCE(SUM(d.subtotal),0),2) AS amount,
              ROUND(COALESCE(SUM(d.total_amount),0),2) AS total_amount,
              ROUND(COALESCE(SUM(d.cost_amount),0),2) AS cost_amount,
              ROUND(COALESCE(SUM(d.subtotal - d.cost_amount),0),2) AS profit,
              ROUND(COALESCE(AVG(d.total_amount),0),2) AS avg_order_amount,
              MAX(d.doc_date) AS last_order_date
         FROM documents d JOIN customers c ON c.id = d.partner_id
        WHERE d.doc_type = 'DN' AND d.status IN (${statusSql}) AND d.doc_date BETWEEN ? AND ?
          AND d.partner_id IS NOT NULL
        GROUP BY d.partner_id
        ORDER BY total_amount DESC LIMIT ?`,
      ...SALES_STATUSES, startDate, endDate, limit
    ).map((r, i) => ({
      ...r,
      rank: i + 1,
      profit_rate: Number(r.amount) > 0 ? round2((Number(r.profit) / Number(r.amount)) * 100) : 0,
    }));
    const totalAmount = round2(rows.reduce((s, r) => s + Number(r.total_amount || 0), 0));
    return {
      startDate, endDate, rows, total: rows.length,
      summary: { customerCount: rows.length, totalAmount, topCustomer: rows[0]?.customer_name || null },
    };
  }, { perm: 'crm.view' });
}
