/**
 * 人力资源 API
 * - 人事总览（在职人数、部门分布、出勤率、薪资、请假、入离职）
 * - 考勤列表 / 生成 / 修改
 * - 薪资列表 / 生成 / 单条确认 / 批量确认
 * - 请假申请、修改、审批
 * - 部门人事成本统计
 */
import { all, get, run, tx } from '../db.mjs';
import { ApiError, paginate, round2, todayStr } from '../http.mjs';
import { audit } from '../auth.mjs';

const ATT_STATUS = ['正常', '迟到', '早退', '缺勤', '请假', '出差', '加班'];
const PRESENT_STATUS = ['正常', '迟到', '早退', '加班', '出差'];
const LEAVE_TYPES = ['事假', '病假', '年假', '调休', '婚假', '产假', '丧假'];

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function monthRange(dateStr = todayStr()) {
  const [y, m] = String(dateStr).split('-').map(Number);
  return {
    year: y,
    month: m,
    start: `${y}-${pad2(m)}-01`,
    end: ymd(new Date(y, m, 0)),
    period: `${y}-${pad2(m)}`,
  };
}

function idOf(ctx, label = '记录') {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(`${label}ID不合法`);
  return id;
}

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

/** 当前登录用户对应的员工ID（用于审批人） */
function currentEmployeeId(ctx) {
  return get('SELECT employee_id FROM users WHERE id = ?', ctx.user.id)?.employee_id || null;
}

/** 员工下拉校验 */
function assertEmployee(employeeId) {
  const emp = get('SELECT * FROM employees WHERE id = ?', Number(employeeId));
  if (!emp) throw new ApiError('员工不存在');
  return emp;
}

/** 单号/期间校验 */
function assertPeriod(period, label = '薪资期间') {
  const p = String(period || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) throw new ApiError(`${label}格式应为 yyyy-MM`);
  return p;
}

export function register(router) {
  // ============================================================
  // 人事总览
  // ============================================================
  router.get('/api/hr/overview', async (ctx) => {
    const m = monthRange();
    const headcount = get("SELECT COUNT(*) AS c FROM employees WHERE status = '在职'")?.c || 0;
    const totalEmployees = get('SELECT COUNT(*) AS c FROM employees')?.c || 0;
    const departments = all(
      `SELECT d.id, d.code, d.name, d.sort,
              COUNT(e.id) AS employee_count,
              ROUND(COALESCE(SUM(e.base_salary),0),2) AS salary_cost
         FROM departments d
         LEFT JOIN employees e ON e.department_id = d.id AND e.status = '在职'
        WHERE d.status = 'ENABLED'
        GROUP BY d.id ORDER BY d.sort, d.id`
    );
    const att = get(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status IN (${PRESENT_STATUS.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN status = '缺勤' THEN 1 ELSE 0 END) AS absent,
              SUM(CASE WHEN status = '请假' THEN 1 ELSE 0 END) AS leave_count,
              ROUND(COALESCE(SUM(overtime_hours),0),2) AS overtime_hours
         FROM attendances WHERE work_date BETWEEN ? AND ?`,
      ...PRESENT_STATUS, m.start, m.end
    ) || { total: 0, present: 0, absent: 0, leave_count: 0, overtime_hours: 0 };
    const attendanceRate = Number(att.total) > 0 ? round2((Number(att.present) / Number(att.total)) * 100) : 0;

    const payroll = get(
      'SELECT ROUND(COALESCE(SUM(net_pay),0),2) AS net, ROUND(COALESCE(SUM(tax),0),2) AS tax, COUNT(*) AS count FROM payrolls WHERE period = ?',
      m.period
    ) || { net: 0, tax: 0, count: 0 };
    const latestPayroll = get(
      `SELECT period, ROUND(COALESCE(SUM(net_pay),0),2) AS net, COUNT(*) AS count
         FROM payrolls GROUP BY period ORDER BY period DESC LIMIT 1`
    );
    const pendingLeaves = get("SELECT COUNT(*) AS c FROM leave_requests WHERE status = '待审批'")?.c || 0;
    const leaveStats = Object.fromEntries(
      all('SELECT status, COUNT(*) AS count FROM leave_requests GROUP BY status').map((r) => [r.status, r.count])
    );
    const hires = get('SELECT COUNT(*) AS c FROM employees WHERE hire_date BETWEEN ? AND ?', m.start, m.end)?.c || 0;
    const departures = get('SELECT COUNT(*) AS c FROM employees WHERE leave_date BETWEEN ? AND ?', m.start, m.end)?.c || 0;
    const attendanceToday = get(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status IN (${PRESENT_STATUS.map(() => '?').join(',')}) THEN 1 ELSE 0 END) AS present
         FROM attendances WHERE work_date = ?`,
      ...PRESENT_STATUS, todayStr()
    ) || { total: 0, present: 0 };
    const salaryCost = round2(departments.reduce((s, d) => s + Number(d.salary_cost || 0), 0));

    return {
      period: m.period,
      headcount,
      totalEmployees,
      departmentCount: departments.length,
      departments,
      salaryCost,
      attendance: {
        period: m.period,
        total: Number(att.total) || 0,
        present: Number(att.present) || 0,
        absent: Number(att.absent) || 0,
        leave: Number(att.leave_count) || 0,
        rate: attendanceRate,
        overtimeHours: round2(att.overtime_hours),
        today: {
          total: Number(attendanceToday.total) || 0,
          present: Number(attendanceToday.present) || 0,
        },
      },
      payroll: {
        period: m.period,
        totalNet: round2(payroll.net),
        totalTax: round2(payroll.tax),
        count: Number(payroll.count) || 0,
        latestPeriod: latestPayroll?.period || null,
        latestTotalNet: round2(latestPayroll?.net || 0),
        latestCount: Number(latestPayroll?.count) || 0,
      },
      pendingLeaves,
      leaveStats,
      hires,
      departures,
      hireNet: Number(hires) - Number(departures),
    };
  }, { perm: 'hr.view' });

  // ============================================================
  // 考勤列表
  // ============================================================
  router.get('/api/hr/attendances', async (ctx) => {
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [];
    const params = [];
    if (ctx.query.employeeId) { where.push('a.employee_id = ?'); params.push(Number(ctx.query.employeeId)); }
    if (ctx.query.startDate) { where.push('a.work_date >= ?'); params.push(ctx.query.startDate); }
    if (ctx.query.endDate) { where.push('a.work_date <= ?'); params.push(ctx.query.endDate); }
    if (ctx.query.status) { where.push('a.status = ?'); params.push(ctx.query.status); }
    if (ctx.query.departmentId) { where.push('e.department_id = ?'); params.push(Number(ctx.query.departmentId)); }
    if (ctx.query.keyword) {
      where.push('(e.name LIKE ? OR e.code LIKE ?)');
      const kw = `%${ctx.query.keyword}%`;
      params.push(kw, kw);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = get(
      `SELECT COUNT(*) AS c FROM attendances a JOIN employees e ON e.id = a.employee_id ${w}`,
      ...params
    )?.c || 0;
    const rows = all(
      `SELECT a.*, e.code AS employee_code, e.name AS employee_name, e.position,
              e.department_id, d.name AS department_name
         FROM attendances a
         JOIN employees e ON e.id = a.employee_id
         LEFT JOIN departments d ON d.id = e.department_id
         ${w}
        ORDER BY a.work_date DESC, e.code ASC, a.id DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, offset
    );
    const summary = Object.fromEntries(
      all(
        `SELECT a.status, COUNT(*) AS count FROM attendances a JOIN employees e ON e.id = a.employee_id ${w} GROUP BY a.status`,
        ...params
      ).map((r) => [r.status, r.count])
    );
    return { rows, total, page, pageSize, summary };
  }, { perm: 'hr.view' });

  // ============================================================
  // 批量生成考勤（周一至周五，跳过已有记录）
  // ============================================================
  router.post('/api/hr/attendances/generate', async (ctx) => {
    const body = ctx.body || {};
    const year = Number(body.year);
    const month = Number(body.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ApiError('请提供正确的年份（2000-2100）');
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new ApiError('请提供正确的月份（1-12）');
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    if (year > curY || (year === curY && month > curM)) throw new ApiError('不能为未来月份生成考勤');
    const m = monthRange(`${year}-${pad2(month)}-01`);
    const limitDate = year === curY && month === curM ? todayStr() : m.end;
    const employees = all("SELECT id FROM employees WHERE status = '在职' ORDER BY id");
    if (!employees.length) throw new ApiError('没有在职员工，无法生成考勤');

    let workdays = 0;
    let generated = 0;
    tx(() => {
      const cur = new Date(year, month - 1, 1);
      while (ymd(cur) <= limitDate) {
        const wd = cur.getDay();
        if (wd !== 0 && wd !== 6) {
          workdays++;
          const dateStr = ymd(cur);
          for (const emp of employees) {
            const roll = Math.random();
            let status = '正常';
            if (roll < 0.9) status = '正常';
            else if (roll < 0.93) status = '迟到';
            else if (roll < 0.95) status = '早退';
            else if (roll < 0.97) status = '请假';
            else if (roll < 0.99) status = '出差';
            else status = '加班';
            const checkIn = status === '迟到' ? `09:${10 + Math.floor(Math.random() * 40)}` : `08:${50 + Math.floor(Math.random() * 10)}`;
            const checkOut = status === '加班' ? `20:${30 + Math.floor(Math.random() * 20)}` : `18:0${Math.floor(Math.random() * 9)}`;
            const workHours = status === '请假' || status === '缺勤' ? 0 : status === '加班' ? 10.5 : 8;
            const overtime = status === '加班' ? 2.5 : 0;
            const r = run(
              `INSERT OR IGNORE INTO attendances(employee_id, work_date, status, check_in, check_out, work_hours, overtime_hours, remark)
               VALUES(?,?,?,?,?,?,?,?)`,
              emp.id, dateStr, status, checkIn, checkOut, workHours, overtime, status === '请假' ? '事假 1 天' : ''
            );
            generated += r.changes;
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
    });
    const expected = workdays * employees.length;
    audit(ctx.user, '生成考勤', 'hr', 'attendances', `${year}-${pad2(month)}`, `生成 ${generated} 条`, ctx.ip);
    return {
      year, month, period: m.period, workdays,
      employees: employees.length,
      expected,
      generated,
      skipped: expected - generated,
    };
  }, { perm: 'hr.create' });

  // ============================================================
  // 修改考勤
  // ============================================================
  router.put('/api/hr/attendances/:id', async (ctx) => {
    const id = idOf(ctx, '考勤记录');
    const row = get('SELECT * FROM attendances WHERE id = ?', id);
    if (!row) throw new ApiError('考勤记录不存在', 404, 'NOT_FOUND');
    const body = ctx.body || {};
    const status = body.status === undefined ? row.status : String(body.status);
    if (!ATT_STATUS.includes(status)) throw new ApiError(`考勤状态只能是 ${ATT_STATUS.join('/')}`);
    const checkIn = body.check_in === undefined ? row.check_in : body.check_in;
    const checkOut = body.check_out === undefined ? row.check_out : body.check_out;
    const remark = body.remark === undefined ? row.remark : String(body.remark || '');
    let workHours = body.work_hours === undefined ? Number(row.work_hours) || 0 : Number(body.work_hours) || 0;
    let overtimeHours = body.overtime_hours === undefined ? Number(row.overtime_hours) || 0 : Number(body.overtime_hours) || 0;
    if (body.work_hours === undefined && body.status !== undefined) {
      if (status === '请假' || status === '缺勤') workHours = 0;
      else if (status === '加班') { workHours = Math.max(workHours, 10.5); overtimeHours = Math.max(overtimeHours, 2.5); }
      else if (workHours === 0) workHours = 8;
    }
    run(
      'UPDATE attendances SET status = ?, check_in = ?, check_out = ?, work_hours = ?, overtime_hours = ?, remark = ? WHERE id = ?',
      status, checkIn, checkOut, round2(workHours), round2(overtimeHours), remark, id
    );
    audit(ctx.user, '修改考勤', 'hr', 'attendances', id, `${row.work_date} ${status}`, ctx.ip);
    return get('SELECT * FROM attendances WHERE id = ?', id);
  }, { perm: 'hr.edit' });

  // ============================================================
  // 薪资列表（含汇总）
  // ============================================================
  router.get('/api/hr/payrolls', async (ctx) => {
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [];
    const params = [];
    if (ctx.query.period) { where.push('p.period = ?'); params.push(assertPeriod(ctx.query.period)); }
    if (ctx.query.employeeId) { where.push('p.employee_id = ?'); params.push(Number(ctx.query.employeeId)); }
    if (ctx.query.status) { where.push('p.status = ?'); params.push(ctx.query.status); }
    if (ctx.query.departmentId) { where.push('e.department_id = ?'); params.push(Number(ctx.query.departmentId)); }
    if (ctx.query.keyword) {
      where.push('(e.name LIKE ? OR e.code LIKE ?)');
      const kw = `%${ctx.query.keyword}%`;
      params.push(kw, kw);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = get(
      `SELECT COUNT(*) AS c FROM payrolls p JOIN employees e ON e.id = p.employee_id ${w}`,
      ...params
    )?.c || 0;
    const rows = all(
      `SELECT p.*, e.code AS employee_code, e.name AS employee_name, e.position,
              e.department_id, d.name AS department_name
         FROM payrolls p
         JOIN employees e ON e.id = p.employee_id
         LEFT JOIN departments d ON d.id = e.department_id
         ${w}
        ORDER BY p.period DESC, e.code ASC, p.id DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, offset
    );
    const summary = get(
      `SELECT ROUND(COALESCE(SUM(p.net_pay),0),2) AS total_net,
              ROUND(COALESCE(SUM(p.tax),0),2) AS total_tax,
              ROUND(COALESCE(SUM(p.social_insurance + p.housing_fund),0),2) AS total_insurance,
              COUNT(*) AS count
         FROM payrolls p JOIN employees e ON e.id = p.employee_id ${w}`,
      ...params
    ) || { total_net: 0, total_tax: 0, total_insurance: 0, count: 0 };
    return {
      rows, total, page, pageSize,
      summary: {
        total_net: round2(summary.total_net),
        total_tax: round2(summary.total_tax),
        total_insurance: round2(summary.total_insurance),
        count: Number(summary.count) || 0,
      },
    };
  }, { perm: 'hr.view' });

  // ============================================================
  // 生成薪资（按 base_salary 计算绩效/加班/补贴/社保/公积金/个税）
  // ============================================================
  router.post('/api/hr/payrolls/generate', async (ctx) => {
    const body = ctx.body || {};
    const period = assertPeriod(body.period);
    const employees = all("SELECT * FROM employees WHERE status = '在职' ORDER BY id");
    if (!employees.length) throw new ApiError('没有在职员工，无法生成薪资');
    const m = monthRange(`${period}-01`);
    const overtimeMap = new Map(
      all(
        `SELECT employee_id, ROUND(COALESCE(SUM(overtime_hours),0),2) AS hours
           FROM attendances WHERE work_date BETWEEN ? AND ? GROUP BY employee_id`,
        m.start, m.end
      ).map((r) => [r.employee_id, r.hours])
    );
    const existing = new Set(all('SELECT employee_id FROM payrolls WHERE period = ?', period).map((r) => r.employee_id));
    let generated = 0;
    let skipped = 0;
    let totalNet = 0;
    let totalTax = 0;
    tx(() => {
      for (const emp of employees) {
        if (existing.has(emp.id)) { skipped++; continue; }
        const base = round2(emp.base_salary || 0);
        const performance = round2(base * (0.05 + Math.random() * 0.1)); // 绩效 5%~15%
        const overtimeHours = Number(overtimeMap.get(emp.id) || 0);
        const overtimePay = round2((base / 21.75 / 8) * overtimeHours * 1.5);
        const allowance = [300, 500, 800][Number(emp.id) % 3];
        const social = round2(base * 0.105);
        const fund = round2(base * 0.05);
        const taxable = round2(base + performance + overtimePay + allowance - social - fund - 5000);
        const tax = taxable > 0 ? round2(taxable * 0.03) : 0; // 简化个税：超额 3%
        const net = round2(base + performance + overtimePay + allowance - social - fund - tax);
        run(
          `INSERT INTO payrolls(period, employee_id, base_salary, performance_bonus, overtime_pay, allowance,
              social_insurance, housing_fund, tax, other_deduction, net_pay, status, remark)
           VALUES(?,?,?,?,?,?,?,?,?,0,?,'草稿',?)`,
          period, emp.id, base, performance, overtimePay, allowance, social, fund, tax, net,
          `绩效 ${round2((performance / (base || 1)) * 100)}%`
        );
        generated++;
        totalNet = round2(totalNet + net);
        totalTax = round2(totalTax + tax);
      }
    });
    audit(ctx.user, '生成薪资', 'hr', 'payrolls', period, `生成 ${generated} 条`, ctx.ip);
    return { period, employees: employees.length, generated, skipped, totalNet, totalTax };
  }, { perm: 'hr.create' });

  // ============================================================
  // 确认单条薪资
  // ============================================================
  router.post('/api/hr/payrolls/:id/confirm', async (ctx) => {
    const id = idOf(ctx, '薪资记录');
    const row = get('SELECT * FROM payrolls WHERE id = ?', id);
    if (!row) throw new ApiError('薪资记录不存在', 404, 'NOT_FOUND');
    if (row.status !== '草稿') throw new ApiError(`薪资记录当前状态为「${row.status}」，只有草稿可以确认`);
    run("UPDATE payrolls SET status = '已确认' WHERE id = ?", id);
    audit(ctx.user, '确认薪资', 'hr', 'payrolls', id, `${row.period} 员工 ${row.employee_id}`, ctx.ip);
    return get('SELECT * FROM payrolls WHERE id = ?', id);
  }, { perm: 'hr.approve' });

  // ============================================================
  // 批量确认薪资
  // ============================================================
  router.post('/api/hr/payrolls/batch-confirm', async (ctx) => {
    const period = assertPeriod((ctx.body || {}).period);
    const drafts = all("SELECT id, net_pay FROM payrolls WHERE period = ? AND status = '草稿'", period);
    if (!drafts.length) throw new ApiError(`期间 ${period} 没有待确认的薪资记录`);
    tx(() => {
      run("UPDATE payrolls SET status = '已确认' WHERE period = ? AND status = '草稿'", period);
    });
    audit(ctx.user, '批量确认薪资', 'hr', 'payrolls', period, `确认 ${drafts.length} 条`, ctx.ip);
    return {
      period,
      confirmed: drafts.length,
      totalNet: round2(drafts.reduce((s, r) => s + Number(r.net_pay || 0), 0)),
    };
  }, { perm: 'hr.approve' });

  // ============================================================
  // 请假申请
  // ============================================================
  router.get('/api/hr/leaves', async (ctx) => {
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [];
    const params = [];
    if (ctx.query.status) { where.push('l.status = ?'); params.push(ctx.query.status); }
    if (ctx.query.employeeId) { where.push('l.employee_id = ?'); params.push(Number(ctx.query.employeeId)); }
    if (ctx.query.leaveType) { where.push('l.leave_type = ?'); params.push(ctx.query.leaveType); }
    if (ctx.query.departmentId) { where.push('e.department_id = ?'); params.push(Number(ctx.query.departmentId)); }
    if (ctx.query.startDate) { where.push('l.end_date >= ?'); params.push(ctx.query.startDate); }
    if (ctx.query.endDate) { where.push('l.start_date <= ?'); params.push(ctx.query.endDate); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = get(
      `SELECT COUNT(*) AS c FROM leave_requests l JOIN employees e ON e.id = l.employee_id ${w}`,
      ...params
    )?.c || 0;
    const rows = all(
      `SELECT l.*, e.code AS employee_code, e.name AS employee_name, e.position,
              e.department_id, d.name AS department_name, ap.name AS approver_name
         FROM leave_requests l
         JOIN employees e ON e.id = l.employee_id
         LEFT JOIN departments d ON d.id = e.department_id
         LEFT JOIN employees ap ON ap.id = l.approver_id
         ${w}
        ORDER BY CASE l.status WHEN '待审批' THEN 1 ELSE 2 END, l.created_at DESC, l.id DESC
        LIMIT ? OFFSET ?`,
      ...params, pageSize, offset
    );
    const summary = Object.fromEntries(
      all('SELECT status, COUNT(*) AS count FROM leave_requests GROUP BY status').map((r) => [r.status, r.count])
    );
    return { rows, total, page, pageSize, summary };
  }, { perm: 'hr.view' });

  router.post('/api/hr/leaves', async (ctx) => {
    const body = ctx.body || {};
    const emp = assertEmployee(body.employee_id);
    const leaveType = body.leave_type || '事假';
    if (!LEAVE_TYPES.includes(leaveType)) throw new ApiError(`请假类型只能是 ${LEAVE_TYPES.join('/')}`);
    const startDate = String(body.start_date || '');
    const endDate = String(body.end_date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new ApiError('请假开始日期格式应为 YYYY-MM-DD');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new ApiError('请假结束日期格式应为 YYYY-MM-DD');
    if (endDate < startDate) throw new ApiError('请假结束日期不能早于开始日期');
    let days = round2(body.days);
    if (!(days > 0)) days = Math.max(0.5, countWeekdays(startDate, endDate) || 1);
    const r = run(
      `INSERT INTO leave_requests(employee_id, leave_type, start_date, end_date, days, reason, status, approver_id)
       VALUES(?,?,?,?,?,?,'待审批',NULL)`,
      emp.id, leaveType, startDate, endDate, days, String(body.reason || '')
    );
    audit(ctx.user, '请假申请', 'hr', 'leave_requests', r.lastInsertRowid, `${emp.name} ${leaveType} ${startDate}~${endDate}`, ctx.ip);
    return get(
      `SELECT l.*, e.name AS employee_name, e.code AS employee_code FROM leave_requests l
         JOIN employees e ON e.id = l.employee_id WHERE l.id = ?`,
      r.lastInsertRowid
    );
  }, { perm: 'hr.create' });

  router.put('/api/hr/leaves/:id', async (ctx) => {
    const id = idOf(ctx, '请假单');
    const row = get('SELECT * FROM leave_requests WHERE id = ?', id);
    if (!row) throw new ApiError('请假单不存在', 404, 'NOT_FOUND');
    if (row.status !== '待审批') throw new ApiError(`请假单当前状态为「${row.status}」，只有待审批的请假单可以修改`);
    const body = ctx.body || {};
    const emp = body.employee_id ? assertEmployee(body.employee_id) : { id: row.employee_id };
    const leaveType = body.leave_type ?? row.leave_type;
    if (!LEAVE_TYPES.includes(leaveType)) throw new ApiError(`请假类型只能是 ${LEAVE_TYPES.join('/')}`);
    const startDate = body.start_date ?? row.start_date;
    const endDate = body.end_date ?? row.end_date;
    if (String(endDate) < String(startDate)) throw new ApiError('请假结束日期不能早于开始日期');
    const days = body.days === undefined ? row.days : round2(body.days) || Math.max(0.5, countWeekdays(startDate, endDate) || 1);
    run(
      `UPDATE leave_requests SET employee_id = ?, leave_type = ?, start_date = ?, end_date = ?, days = ?, reason = ? WHERE id = ?`,
      emp.id, leaveType, startDate, endDate, days, body.reason === undefined ? row.reason : String(body.reason || ''), id
    );
    audit(ctx.user, '修改请假', 'hr', 'leave_requests', id, `${startDate}~${endDate}`, ctx.ip);
    return get(
      `SELECT l.*, e.name AS employee_name FROM leave_requests l JOIN employees e ON e.id = l.employee_id WHERE l.id = ?`,
      id
    );
  }, { perm: 'hr.edit' });

  // 删除请假单（仅待审批/已驳回）
  router.delete('/api/hr/leaves/:id', async (ctx) => {
    const id = idOf(ctx, '请假单');
    const row = get('SELECT * FROM leave_requests WHERE id = ?', id);
    if (!row) throw new ApiError('请假单不存在', 404, 'NOT_FOUND');
    if (!['待审批', '已驳回'].includes(row.status)) throw new ApiError(`请假单当前状态为「${row.status}」，只有待审批或已驳回的请假单可以删除`);
    run('DELETE FROM leave_requests WHERE id = ?', id);
    audit(ctx.user, '删除请假', 'hr', 'leave_requests', id, `${row.start_date}~${row.end_date}`, ctx.ip);
    return { id };
  }, { perm: 'hr.edit' });

  router.post('/api/hr/leaves/:id/approve', async (ctx) => {
    const id = idOf(ctx, '请假单');
    const row = get('SELECT * FROM leave_requests WHERE id = ?', id);
    if (!row) throw new ApiError('请假单不存在', 404, 'NOT_FOUND');
    if (row.status !== '待审批') throw new ApiError(`请假单当前状态为「${row.status}」，不能重复审批`);
    const approved = (ctx.body || {}).approved;
    const status = approved === false || approved === 'false' || approved === 0 ? '已驳回' : '已批准';
    run('UPDATE leave_requests SET status = ?, approver_id = ? WHERE id = ?', status, currentEmployeeId(ctx), id);
    audit(ctx.user, status === '已批准' ? '批准请假' : '驳回请假', 'hr', 'leave_requests', id, `${row.start_date}~${row.end_date}`, ctx.ip);
    return get(
      `SELECT l.*, e.name AS employee_name, ap.name AS approver_name
         FROM leave_requests l JOIN employees e ON e.id = l.employee_id
         LEFT JOIN employees ap ON ap.id = l.approver_id WHERE l.id = ?`,
      id
    );
  }, { perm: 'hr.approve' });

  // ============================================================
  // 部门人事成本统计
  // ============================================================
  router.get('/api/hr/departments/stats', async (ctx) => {
    const latestPeriod = ctx.query.period
      ? assertPeriod(ctx.query.period)
      : (get('SELECT period FROM payrolls GROUP BY period ORDER BY period DESC LIMIT 1')?.period || monthRange().period);
    const rows = all(
      `SELECT d.id AS department_id, d.code, d.name, d.cost_center, d.sort,
              COUNT(e.id) AS employee_count,
              SUM(CASE WHEN e.employee_type = '正式员工' THEN 1 ELSE 0 END) AS formal_count,
              SUM(CASE WHEN e.gender = '男' THEN 1 ELSE 0 END) AS male_count,
              SUM(CASE WHEN e.gender = '女' THEN 1 ELSE 0 END) AS female_count,
              ROUND(COALESCE(SUM(e.base_salary),0),2) AS total_base_salary,
              ROUND(COALESCE(AVG(e.base_salary),0),2) AS avg_salary,
              ROUND(COALESCE(MAX(e.base_salary),0),2) AS max_salary,
              (SELECT ROUND(COALESCE(SUM(p.net_pay),0),2) FROM payrolls p JOIN employees e2 ON e2.id = p.employee_id
                WHERE e2.department_id = d.id AND p.period = ?) AS payroll_net,
              (SELECT COUNT(*) FROM payrolls p JOIN employees e2 ON e2.id = p.employee_id
                WHERE e2.department_id = d.id AND p.period = ?) AS payroll_count
         FROM departments d
         LEFT JOIN employees e ON e.department_id = d.id AND e.status = '在职'
        WHERE d.status = 'ENABLED'
        GROUP BY d.id ORDER BY d.sort, d.id`,
      latestPeriod, latestPeriod
    );
    const totals = {
      departmentCount: rows.length,
      employeeCount: rows.reduce((s, r) => s + Number(r.employee_count || 0), 0),
      totalBaseSalary: round2(rows.reduce((s, r) => s + Number(r.total_base_salary || 0), 0)),
      payrollNet: round2(rows.reduce((s, r) => s + Number(r.payroll_net || 0), 0)),
    };
    return { period: latestPeriod, rows, totals };
  }, { perm: 'hr.view' });
}
