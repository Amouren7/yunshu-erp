/**
 * 系统管理 API
 * - 用户（列表/新建/编辑/删除/重置密码，密码使用 auth.mjs 的 scrypt 散列）
 * - 角色与权限（内置角色不可删除）
 * - 参数设置（settings 键值表读写）
 * - 审计日志
 * - 单据号规则（number_series）
 * - 通知公告
 * - 系统信息（版本/数据量/数据库大小/Node 版本/启动时间）
 * - 总账映射（gl_mappings）
 */
import fs from 'node:fs';
import { all, get, run, tx, DB_FILE } from '../db.mjs';
import { ApiError, paginate } from '../http.mjs';
import { audit, hashPassword, makeSalt } from '../auth.mjs';
import { peekDocNo } from '../lib/numbering.mjs';
import { clearCache as clearGlCache } from '../lib/gl.mjs';
import { DOC_TYPES } from '../lib/docTypes.mjs';

const BUILTIN_ROLES = ['ADMIN', 'SALES_MGR', 'SALES', 'PURCHASE', 'STOCK', 'FINANCE', 'HR', 'GUEST'];
const DATA_SCOPES = ['all', 'dept', 'self'];
const NOTICE_LEVELS = ['INFO', 'WARN', 'DANGER'];
const USER_STATUS = ['ENABLED', 'DISABLED'];

const SERIES_LABELS = {
  SO: '销售订单', DN: '销售发货单', SR: '销售退货单', PO: '采购订单', GRN: '采购入库单',
  PR: '采购退货单', TR: '库存调拨单', ADJ: '库存盘点单', OI: '其他入库单', OO: '其他出库单',
  RC: '收款单', PY: '付款单', MO: '生产工单', AR: '应收发票', AP: '应付发票',
  CONTRACT: '销售合同', VOUCHER: '记账凭证',
};

function idOf(ctx, label = '记录') {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(`${label}ID不合法`);
  return id;
}

function safeJsonArray(text) {
  try {
    const v = JSON.parse(text || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function cleanUser(row) {
  if (!row) return row;
  const { password_hash, salt, ...rest } = row;
  return rest;
}

function validateUsername(username) {
  const u = String(username || '').trim();
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(u)) throw new ApiError('用户名需为 3-32 位字母、数字、下划线、点或短横线');
  return u;
}

function validatePassword(password) {
  const p = String(password || '');
  if (p.length < 6) throw new ApiError('密码长度不能少于 6 位');
  if (p.length > 64) throw new ApiError('密码长度不能超过 64 位');
  return p;
}

function validatePermissions(input) {
  if (input === undefined) return undefined;
  if (!Array.isArray(input)) throw new ApiError('权限列表必须是数组');
  const perms = input.map((p) => String(p || '').trim()).filter(Boolean);
  if (perms.length > 200) throw new ApiError('权限项过多');
  return perms;
}

/** 当前用户关联员工ID */
function currentEmployeeId(ctx) {
  return get('SELECT employee_id FROM users WHERE id = ?', ctx.user.id)?.employee_id || null;
}

export function register(router) {
  // ============================================================
  // 用户管理
  // ============================================================
  router.get('/api/system/users', async (ctx) => {
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [];
    const params = [];
    if (ctx.query.keyword) {
      where.push('(u.username LIKE ? OR u.name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)');
      const kw = `%${ctx.query.keyword}%`;
      params.push(kw, kw, kw, kw);
    }
    if (ctx.query.status) { where.push('u.status = ?'); params.push(ctx.query.status); }
    if (ctx.query.roleId) { where.push('u.role_id = ?'); params.push(Number(ctx.query.roleId)); }
    if (ctx.query.departmentId) { where.push('u.department_id = ?'); params.push(Number(ctx.query.departmentId)); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = get(`SELECT COUNT(*) AS c FROM users u ${w}`, ...params)?.c || 0;
    const rows = all(
      `SELECT u.id, u.username, u.name, u.role_id, u.department_id, u.employee_id, u.phone, u.email, u.avatar,
              u.status, u.last_login_at, u.created_at,
              r.code AS role_code, r.name AS role_name, d.name AS department_name, e.position AS employee_position
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         LEFT JOIN departments d ON d.id = u.department_id
         LEFT JOIN employees e ON e.id = u.employee_id
         ${w} ORDER BY u.id ASC LIMIT ? OFFSET ?`,
      ...params, pageSize, offset
    );
    return { rows, total, page, pageSize };
  }, { perm: 'system.view' });

  router.post('/api/system/users', async (ctx) => {
    const body = ctx.body || {};
    const username = validateUsername(body.username);
    const password = validatePassword(body.password);
    const name = String(body.name || '').trim();
    if (!name) throw new ApiError('姓名不能为空');
    if (get('SELECT id FROM users WHERE username = ?', username)) throw new ApiError(`用户名「${username}」已存在`);
    const roleId = Number(body.role_id) || null;
    if (roleId && !get('SELECT id FROM roles WHERE id = ?', roleId)) throw new ApiError('所选角色不存在');
    const deptId = body.department_id ? Number(body.department_id) : null;
    if (deptId && !get('SELECT id FROM departments WHERE id = ?', deptId)) throw new ApiError('所选部门不存在');
    const employeeId = body.employee_id ? Number(body.employee_id) : null;
    if (employeeId && !get('SELECT id FROM employees WHERE id = ?', employeeId)) throw new ApiError('关联员工不存在');
    const status = body.status || 'ENABLED';
    if (!USER_STATUS.includes(status)) throw new ApiError(`用户状态只能是 ${USER_STATUS.join('/')}`);
    const salt = makeSalt();
    const r = run(
      `INSERT INTO users(username, password_hash, salt, name, role_id, department_id, employee_id, phone, email, avatar, status)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      username, hashPassword(password, salt), salt, name, roleId, deptId, employeeId,
      String(body.phone || ''), String(body.email || ''), String(body.avatar || ''), status
    );
    audit(ctx.user, '新建', 'system', 'users', r.lastInsertRowid, `用户 ${username}`, ctx.ip);
    return cleanUser(get('SELECT * FROM users WHERE id = ?', r.lastInsertRowid));
  }, { perm: 'system.create' });

  router.put('/api/system/users/:id', async (ctx) => {
    const id = idOf(ctx, '用户');
    const row = get('SELECT * FROM users WHERE id = ?', id);
    if (!row) throw new ApiError('用户不存在', 404, 'NOT_FOUND');
    const body = ctx.body || {};
    const isAdmin = row.username === 'admin';
    let username = row.username;
    if (body.username !== undefined && String(body.username).trim() !== row.username) {
      if (isAdmin) throw new ApiError('系统管理员账号的用户名不能修改');
      username = validateUsername(body.username);
      if (get('SELECT id FROM users WHERE username = ? AND id <> ?', username, id)) {
        throw new ApiError(`用户名「${username}」已存在`);
      }
    }
    const name = body.name !== undefined ? String(body.name || '').trim() : row.name;
    if (!name) throw new ApiError('姓名不能为空');
    const roleId = body.role_id !== undefined ? Number(body.role_id) || null : row.role_id;
    if (roleId && !get('SELECT id FROM roles WHERE id = ?', roleId)) throw new ApiError('所选角色不存在');
    const deptId = body.department_id !== undefined ? (body.department_id ? Number(body.department_id) : null) : row.department_id;
    if (deptId && !get('SELECT id FROM departments WHERE id = ?', deptId)) throw new ApiError('所选部门不存在');
    const employeeId = body.employee_id !== undefined ? (body.employee_id ? Number(body.employee_id) : null) : row.employee_id;
    if (employeeId && !get('SELECT id FROM employees WHERE id = ?', employeeId)) throw new ApiError('关联员工不存在');
    const status = body.status !== undefined ? body.status : row.status;
    if (!USER_STATUS.includes(status)) throw new ApiError(`用户状态只能是 ${USER_STATUS.join('/')}`);
    if (isAdmin && status !== 'ENABLED') throw new ApiError('系统管理员账号不能停用');
    let passwordHash = row.password_hash;
    let salt = row.salt;
    if (body.password !== undefined && body.password !== '') {
      const password = validatePassword(body.password);
      salt = makeSalt();
      passwordHash = hashPassword(password, salt);
    }
    run(
      `UPDATE users SET username = ?, password_hash = ?, salt = ?, name = ?, role_id = ?, department_id = ?, employee_id = ?,
              phone = ?, email = ?, avatar = ?, status = ? WHERE id = ?`,
      username, passwordHash, salt, name, roleId, deptId, employeeId,
      body.phone !== undefined ? String(body.phone || '') : row.phone,
      body.email !== undefined ? String(body.email || '') : row.email,
      body.avatar !== undefined ? String(body.avatar || '') : row.avatar,
      status, id
    );
    if (status !== 'ENABLED') run('DELETE FROM sessions WHERE user_id = ?', id);
    audit(ctx.user, '修改', 'system', 'users', id, `用户 ${username}`, ctx.ip);
    return cleanUser(get('SELECT * FROM users WHERE id = ?', id));
  }, { perm: 'system.edit' });

  router.delete('/api/system/users/:id', async (ctx) => {
    const id = idOf(ctx, '用户');
    const row = get('SELECT * FROM users WHERE id = ?', id);
    if (!row) throw new ApiError('用户不存在', 404, 'NOT_FOUND');
    if (row.username === 'admin') throw new ApiError('系统管理员账号（admin）不能删除');
    if (id === ctx.user.id) throw new ApiError('不能删除当前登录的账号');
    tx(() => {
      run('DELETE FROM sessions WHERE user_id = ?', id);
      run('DELETE FROM users WHERE id = ?', id);
    });
    audit(ctx.user, '删除', 'system', 'users', id, `用户 ${row.username}`, ctx.ip);
    return { id };
  }, { perm: 'system.delete' });

  router.post('/api/system/users/:id/reset-password', async (ctx) => {
    const id = idOf(ctx, '用户');
    const row = get('SELECT * FROM users WHERE id = ?', id);
    if (!row) throw new ApiError('用户不存在', 404, 'NOT_FOUND');
    const password = validatePassword((ctx.body || {}).password);
    const salt = makeSalt();
    run('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', hashPassword(password, salt), salt, id);
    run('DELETE FROM sessions WHERE user_id = ?', id);
    audit(ctx.user, '重置密码', 'system', 'users', id, `用户 ${row.username}`, ctx.ip);
    return { id, username: row.username, reset: true };
  }, { perm: 'system.edit' });

  // ============================================================
  // 角色与权限
  // ============================================================
  router.get('/api/system/roles', async () => {
    const rows = all(
      `SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
         FROM roles r ORDER BY r.id`
    );
    return rows.map((r) => ({
      ...r,
      permissions: safeJsonArray(r.permissions),
      builtin: BUILTIN_ROLES.includes(r.code),
    }));
  }, { perm: 'system.view' });

  router.post('/api/system/roles', async (ctx) => {
    const body = ctx.body || {};
    const code = String(body.code || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,30}$/.test(code)) throw new ApiError('角色编码需为 2-31 位大写字母、数字或下划线');
    const name = String(body.name || '').trim();
    if (!name) throw new ApiError('角色名称不能为空');
    if (get('SELECT id FROM roles WHERE code = ?', code)) throw new ApiError(`角色编码「${code}」已存在`);
    const permissions = validatePermissions(body.permissions) || [];
    const dataScope = body.data_scope || 'self';
    if (!DATA_SCOPES.includes(dataScope)) throw new ApiError(`数据范围只能是 ${DATA_SCOPES.join('/')}`);
    const status = body.status || 'ENABLED';
    const r = run(
      'INSERT INTO roles(code, name, description, permissions, data_scope, status) VALUES(?,?,?,?,?,?)',
      code, name, String(body.description || ''), JSON.stringify(permissions), dataScope, status
    );
    audit(ctx.user, '新建', 'system', 'roles', r.lastInsertRowid, `角色 ${code}`, ctx.ip);
    return { ...get('SELECT * FROM roles WHERE id = ?', r.lastInsertRowid), permissions };
  }, { perm: 'system.create' });

  router.put('/api/system/roles/:id', async (ctx) => {
    const id = idOf(ctx, '角色');
    const row = get('SELECT * FROM roles WHERE id = ?', id);
    if (!row) throw new ApiError('角色不存在', 404, 'NOT_FOUND');
    const body = ctx.body || {};
    const builtin = BUILTIN_ROLES.includes(row.code);
    let code = row.code;
    if (body.code !== undefined && String(body.code).trim().toUpperCase() !== row.code) {
      if (builtin) throw new ApiError('内置角色编码不能修改');
      code = String(body.code).trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9_]{1,30}$/.test(code)) throw new ApiError('角色编码需为 2-31 位大写字母、数字或下划线');
      if (get('SELECT id FROM roles WHERE code = ? AND id <> ?', code, id)) throw new ApiError(`角色编码「${code}」已存在`);
    }
    const name = body.name !== undefined ? String(body.name || '').trim() : row.name;
    if (!name) throw new ApiError('角色名称不能为空');
    const permissions = validatePermissions(body.permissions);
    const dataScope = body.data_scope ?? row.data_scope;
    if (!DATA_SCOPES.includes(dataScope)) throw new ApiError(`数据范围只能是 ${DATA_SCOPES.join('/')}`);
    const status = body.status ?? row.status;
    run(
      'UPDATE roles SET code = ?, name = ?, description = ?, permissions = ?, data_scope = ?, status = ? WHERE id = ?',
      code, name,
      body.description !== undefined ? String(body.description || '') : row.description,
      permissions === undefined ? row.permissions : JSON.stringify(permissions),
      dataScope, status, id
    );
    audit(ctx.user, '修改', 'system', 'roles', id, `角色 ${code}`, ctx.ip);
    const fresh = get('SELECT * FROM roles WHERE id = ?', id);
    return { ...fresh, permissions: safeJsonArray(fresh.permissions), builtin };
  }, { perm: 'system.edit' });

  router.delete('/api/system/roles/:id', async (ctx) => {
    const id = idOf(ctx, '角色');
    const row = get('SELECT * FROM roles WHERE id = ?', id);
    if (!row) throw new ApiError('角色不存在', 404, 'NOT_FOUND');
    if (BUILTIN_ROLES.includes(row.code)) throw new ApiError(`内置角色「${row.name}」不能删除`);
    const used = get('SELECT COUNT(*) AS c FROM users WHERE role_id = ?', id)?.c || 0;
    if (used > 0) throw new ApiError(`该角色下还有 ${used} 个用户，不能删除`);
    run('DELETE FROM roles WHERE id = ?', id);
    audit(ctx.user, '删除', 'system', 'roles', id, `角色 ${row.code}`, ctx.ip);
    return { id };
  }, { perm: 'system.delete' });

  // ============================================================
  // 参数设置
  // ============================================================
  router.get('/api/system/settings', async () => {
    const rows = all('SELECT key, value, label, updated_at FROM settings ORDER BY key');
    return { rows, settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  }, { perm: 'system.view' });

  router.put('/api/system/settings', async (ctx) => {
    const body = ctx.body || {};
    const entries = [];
    const pushEntry = (key, value, label) => {
      const k = String(key || '').trim();
      if (!/^[A-Za-z0-9_.-]{1,64}$/.test(k)) throw new ApiError(`参数键「${k}」不合法`);
      entries.push({ key: k, value: value === null || value === undefined ? '' : String(value), label: label === undefined ? undefined : String(label || '') });
    };
    const source = body.settings ?? body.items ?? body.data;
    if (Array.isArray(source)) {
      for (const item of source) {
        if (!item || typeof item !== 'object') throw new ApiError('参数项格式不正确');
        pushEntry(item.key ?? item.name, item.value, item.label);
      }
    } else if (source && typeof source === 'object') {
      for (const [k, v] of Object.entries(source)) pushEntry(k, v);
    } else {
      for (const [k, v] of Object.entries(body)) {
        if (['settings', 'items', 'data'].includes(k)) continue;
        if (typeof v === 'object') continue;
        pushEntry(k, v);
      }
    }
    if (!entries.length) throw new ApiError('没有可保存的参数');

    tx(() => {
      for (const e of entries) {
        const exist = get('SELECT key FROM settings WHERE key = ?', e.key);
        if (exist) {
          if (e.label === undefined) {
            run("UPDATE settings SET value = ?, updated_at = datetime('now','localtime') WHERE key = ?", e.value, e.key);
          } else {
            run("UPDATE settings SET value = ?, label = ?, updated_at = datetime('now','localtime') WHERE key = ?", e.value, e.label, e.key);
          }
        } else {
          run('INSERT INTO settings(key, value, label) VALUES(?,?,?)', e.key, e.value, e.label === undefined ? e.key : e.label);
        }
      }
    });
    audit(ctx.user, '修改参数', 'system', 'settings', entries.map((e) => e.key).join(','), `${entries.length} 项`, ctx.ip);
    const rows = all('SELECT key, value, label, updated_at FROM settings ORDER BY key');
    return { updated: entries.length, rows, settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  }, { perm: 'system.edit' });

  // ============================================================
  // 审计日志
  // ============================================================
  router.get('/api/system/audit-logs', async (ctx) => {
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [];
    const params = [];
    if (ctx.query.userId) { where.push('a.user_id = ?'); params.push(Number(ctx.query.userId)); }
    if (ctx.query.module) { where.push('a.module = ?'); params.push(ctx.query.module); }
    if (ctx.query.action) { where.push('a.action = ?'); params.push(ctx.query.action); }
    if (ctx.query.entity) { where.push('a.entity = ?'); params.push(ctx.query.entity); }
    if (ctx.query.keyword) {
      where.push('(a.user_name LIKE ? OR a.detail LIKE ? OR a.entity_id LIKE ?)');
      const kw = `%${ctx.query.keyword}%`;
      params.push(kw, kw, kw);
    }
    if (ctx.query.startDate) { where.push('a.created_at >= ?'); params.push(ctx.query.startDate); }
    if (ctx.query.endDate) {
      where.push('a.created_at <= ?');
      params.push(String(ctx.query.endDate).length === 10 ? `${ctx.query.endDate} 23:59:59` : ctx.query.endDate);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = get(`SELECT COUNT(*) AS c FROM audit_logs a ${w}`, ...params)?.c || 0;
    const rows = all(
      `SELECT a.*, u.username AS username FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
        ${w} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      ...params, pageSize, offset
    );
    const modules = all('SELECT DISTINCT module FROM audit_logs WHERE module <> \'\' ORDER BY module').map((r) => r.module);
    const actions = all('SELECT DISTINCT action FROM audit_logs ORDER BY action').map((r) => r.action);
    return { rows, total, page, pageSize, filters: { modules, actions } };
  }, { perm: 'system.view' });

  // ============================================================
  // 单据号规则
  // ============================================================
  router.get('/api/system/number-series', async () => {
    const rows = all('SELECT * FROM number_series ORDER BY doc_type');
    return rows.map((r) => ({
      ...r,
      name: DOC_TYPES[r.doc_type]?.name || SERIES_LABELS[r.doc_type] || r.doc_type,
      preview: peekDocNo(r.doc_type, new Date().toISOString().slice(0, 10)),
    }));
  }, { perm: 'system.view' });

  router.put('/api/system/number-series/:docType', async (ctx) => {
    const docType = String(ctx.params.docType || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,30}$/.test(docType)) throw new ApiError('单据类型编码不合法');
    const body = ctx.body || {};
    const exist = get('SELECT * FROM number_series WHERE doc_type = ?', docType);
    const prefix = body.prefix !== undefined ? String(body.prefix).trim() : exist?.prefix;
    if (!prefix || prefix.length > 20) throw new ApiError('单号前缀不能为空且不超过 20 个字符');
    const pad = body.pad !== undefined ? Number(body.pad) : exist?.pad ?? 4;
    if (!Number.isInteger(pad) || pad < 1 || pad > 10) throw new ApiError('流水号位数需为 1-10 的整数');
    const nextNo = body.next_no !== undefined ? Number(body.next_no) : exist?.next_no ?? 1;
    if (!Number.isInteger(nextNo) || nextNo < 1) throw new ApiError('下一个流水号需为大于 0 的整数');
    const datePattern = body.date_pattern !== undefined ? String(body.date_pattern || '') : exist?.date_pattern ?? 'yyyyMM';
    if (datePattern && !/^[yMd\-/]{0,20}$/.test(datePattern)) throw new ApiError('日期格式只能是 yyyy / MM / dd 组合');
    tx(() => {
      if (exist) {
        run('UPDATE number_series SET prefix = ?, pad = ?, next_no = ?, date_pattern = ? WHERE doc_type = ?',
          prefix, pad, nextNo, datePattern || 'yyyyMM', docType);
      } else {
        run('INSERT INTO number_series(doc_type, prefix, next_no, pad, date_pattern) VALUES(?,?,?,?,?)',
          docType, prefix, nextNo, pad, datePattern || 'yyyyMM');
      }
    });
    audit(ctx.user, '修改单号规则', 'system', 'number_series', docType, `${prefix} / ${pad} / ${nextNo}`, ctx.ip);
    const fresh = get('SELECT * FROM number_series WHERE doc_type = ?', docType);
    return { ...fresh, name: DOC_TYPES[docType]?.name || SERIES_LABELS[docType] || docType, preview: peekDocNo(docType) };
  }, { perm: 'system.edit' });

  // ============================================================
  // 通知公告
  // ============================================================
  router.get('/api/system/notices', async (ctx) => {
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [];
    const params = [];
    if (ctx.query.is_read !== undefined && ctx.query.is_read !== '') {
      where.push('is_read = ?');
      params.push(ctx.query.is_read === '1' || ctx.query.is_read === 'true' ? 1 : 0);
    }
    if (ctx.query.level) { where.push('level = ?'); params.push(ctx.query.level); }
    if (ctx.query.keyword) {
      where.push('(title LIKE ? OR content LIKE ?)');
      const kw = `%${ctx.query.keyword}%`;
      params.push(kw, kw);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = get(`SELECT COUNT(*) AS c FROM notices ${w}`, ...params)?.c || 0;
    const rows = all(`SELECT * FROM notices ${w} ORDER BY is_read ASC, id DESC LIMIT ? OFFSET ?`, ...params, pageSize, offset);
    const unread = get('SELECT COUNT(*) AS c FROM notices WHERE is_read = 0')?.c || 0;
    return { rows, total, page, pageSize, unread };
  }, { perm: 'system.view' });

  router.post('/api/system/notices', async (ctx) => {
    const body = ctx.body || {};
    const title = String(body.title || '').trim();
    if (!title) throw new ApiError('通知标题不能为空');
    const level = body.level || 'INFO';
    if (!NOTICE_LEVELS.includes(level)) throw new ApiError(`通知级别只能是 ${NOTICE_LEVELS.join('/')}`);
    const userId = body.user_id ? Number(body.user_id) : null;
    if (userId && !get('SELECT id FROM users WHERE id = ?', userId)) throw new ApiError('接收用户不存在');
    const r = run(
      'INSERT INTO notices(title, content, level, user_id, is_read) VALUES(?,?,?,?,0)',
      title, String(body.content || ''), level, userId
    );
    audit(ctx.user, '新建通知', 'system', 'notices', r.lastInsertRowid, title, ctx.ip);
    return get('SELECT * FROM notices WHERE id = ?', r.lastInsertRowid);
  }, { perm: 'system.create' });

  router.post('/api/system/notices/:id/read', async (ctx) => {
    const id = idOf(ctx, '通知');
    const row = get('SELECT * FROM notices WHERE id = ?', id);
    if (!row) throw new ApiError('通知不存在', 404, 'NOT_FOUND');
    run('UPDATE notices SET is_read = 1 WHERE id = ?', id);
    return get('SELECT * FROM notices WHERE id = ?', id);
  }, { perm: 'system.edit' });

  router.delete('/api/system/notices/:id', async (ctx) => {
    const id = idOf(ctx, '通知');
    const row = get('SELECT * FROM notices WHERE id = ?', id);
    if (!row) throw new ApiError('通知不存在', 404, 'NOT_FOUND');
    run('DELETE FROM notices WHERE id = ?', id);
    audit(ctx.user, '删除通知', 'system', 'notices', id, row.title, ctx.ip);
    return { id };
  }, { perm: 'system.delete' });

  // ============================================================
  // 系统信息
  // ============================================================
  router.get('/api/system/info', async (ctx) => {
    let dbSize = 0;
    try { dbSize = fs.statSync(DB_FILE).size; } catch { dbSize = 0; }
    const counts = {};
    const tableMap = {
      users: 'users', roles: 'roles', customers: 'customers', suppliers: 'suppliers', items: 'items',
      employees: 'employees', departments: 'departments', documents: 'documents', documentLines: 'document_lines',
      workOrders: 'work_orders', vouchers: 'vouchers', invoices: 'invoices', payments: 'payments',
      stockLedger: 'stock_ledger', leads: 'leads', opportunities: 'opportunities', contracts: 'contracts',
      attendances: 'attendances', payrolls: 'payrolls', leaveRequests: 'leave_requests', notices: 'notices',
      auditLogs: 'audit_logs',
    };
    for (const [key, table] of Object.entries(tableMap)) {
      counts[key] = get(`SELECT COUNT(*) AS c FROM ${table}`)?.c || 0;
    }
    const mem = process.memoryUsage();
    const uptime = Math.round(process.uptime());
    return {
      app: { name: '云枢ERP', version: '1.0.0', edition: '社区版' },
      node: { version: process.version, platform: process.platform, arch: process.arch, pid: process.pid },
      server: {
        port: Number(process.env.ERP_PORT || 8787),
        time: new Date().toISOString(),
        startedAt: new Date(Date.now() - uptime * 1000).toISOString(),
        uptime,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      database: {
        file: DB_FILE,
        size: dbSize,
        sizeMb: Math.round((dbSize / 1024 / 1024) * 100) / 100,
        journalMode: get('PRAGMA journal_mode')?.journal_mode || null,
      },
      memory: {
        rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      },
      counts,
      currentUser: {
        id: ctx.user.id,
        name: ctx.user.name,
        roleName: ctx.user.roleName,
        lastLoginAt: ctx.user.lastLoginAt,
        employeeId: currentEmployeeId(ctx),
      },
    };
  }, { perm: 'system.view' });

  // ============================================================
  // 总账映射（gl_mappings）
  // ============================================================
  router.get('/api/system/gl-mappings', async () => {
    const rows = all(
      `SELECT m.key, m.account_code, m.description, a.name AS account_name, a.category AS account_category
         FROM gl_mappings m LEFT JOIN accounts a ON a.code = m.account_code ORDER BY m.key`
    );
    return rows;
  }, { perm: 'system.view' });

  router.put('/api/system/gl-mappings/:key', async (ctx) => {
    const key = String(ctx.params.key || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,30}$/.test(key)) throw new ApiError('映射键不合法');
    const body = ctx.body || {};
    const accountCode = String(body.account_code || '').trim();
    if (!accountCode) throw new ApiError('请选择会计科目');
    const account = get("SELECT code, name FROM accounts WHERE code = ? AND status = '启用'", accountCode);
    if (!account) throw new ApiError('会计科目不存在或已停用');
    const exist = get('SELECT * FROM gl_mappings WHERE key = ?', key);
    tx(() => {
      if (exist) {
        run('UPDATE gl_mappings SET account_code = ?, description = ? WHERE key = ?',
          accountCode, body.description !== undefined ? String(body.description || '') : exist.description, key);
      } else {
        run('INSERT INTO gl_mappings(key, account_code, description) VALUES(?,?,?)',
          key, accountCode, String(body.description || key));
      }
    });
    clearGlCache();
    audit(ctx.user, '修改总账映射', 'system', 'gl_mappings', key, `${accountCode} ${account.name}`, ctx.ip);
    return get(
      `SELECT m.key, m.account_code, m.description, a.name AS account_name
         FROM gl_mappings m LEFT JOIN accounts a ON a.code = m.account_code WHERE m.key = ?`,
      key
    );
  }, { perm: 'system.edit' });
}
