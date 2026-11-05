import crypto from 'node:crypto';
import { get, run, all } from './db.mjs';
import { ApiError } from './http.mjs';

const SESSION_DAYS = 7;

export function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}

export function makeSalt() {
  return crypto.randomBytes(12).toString('hex');
}

export function login(username, password) {
  const user = get('SELECT * FROM users WHERE username = ?', String(username || '').trim());
  if (!user) throw new ApiError('用户名或密码错误', 401, 'AUTH_FAILED');
  if (user.status !== 'ENABLED') throw new ApiError('账号已停用，请联系管理员', 403, 'DISABLED');
  const hash = hashPassword(password, user.salt);
  if (hash !== user.password_hash) throw new ApiError('用户名或密码错误', 401, 'AUTH_FAILED');
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  const exp = `${expires.getFullYear()}-${pad(expires.getMonth() + 1)}-${pad(expires.getDate())} ${pad(expires.getHours())}:${pad(expires.getMinutes())}:${pad(expires.getSeconds())}`;
  run('INSERT INTO sessions(token, user_id, expires_at) VALUES(?,?,?)', token, user.id, exp);
  run("UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?", user.id);
  return { token, expiresAt: exp, user: publicUser(user) };
}

export function logout(token) {
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
}

export function publicUser(user) {
  const role = user.role_id ? get('SELECT * FROM roles WHERE id = ?', user.role_id) : null;
  let permissions = [];
  try { permissions = role ? JSON.parse(role.permissions || '[]') : []; } catch { permissions = []; }
  const dept = user.department_id ? get('SELECT name FROM departments WHERE id = ?', user.department_id) : null;
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    phone: user.phone,
    email: user.email,
    roleId: user.role_id,
    roleCode: role?.code,
    roleName: role?.name,
    dataScope: role?.data_scope || 'all',
    departmentId: user.department_id,
    departmentName: dept?.name || null,
    employeeId: user.employee_id || null,
    permissions,
    lastLoginAt: user.last_login_at,
  };
}

export function hasPermission(user, perm) {
  if (!user) return false;
  const perms = user.permissions || [];
  if (perms.includes('*')) return true;
  if (perms.includes(perm)) return true;
  const [mod] = String(perm).split('.');
  return perms.includes(`${mod}.*`);
}

export function requirePermission(user, perm) {
  if (!hasPermission(user, perm)) {
    throw new ApiError(`无权限执行该操作（需要 ${perm}）`, 403, 'FORBIDDEN');
  }
}

/** 从请求头解析用户 */
export function authenticate(req) {
  const h = req.headers['authorization'] || '';
  let token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) token = new URL(req.url, 'http://localhost').searchParams.get('token') || '';
  if (!token) return { user: null, token: null };
  const s = get('SELECT * FROM sessions WHERE token = ?', token);
  if (!s) return { user: null, token };
  const expired = new Date(String(s.expires_at).replace(' ', 'T')).getTime() < Date.now();
  if (expired) { run('DELETE FROM sessions WHERE token = ?', token); return { user: null, token }; }
  const u = get('SELECT * FROM users WHERE id = ?', s.user_id);
  if (!u || u.status !== 'ENABLED') return { user: null, token };
  return { user: publicUser(u), rawUser: u, token };
}

export function audit(user, action, module, entity, entityId, detail, ip) {
  try {
    run(
      'INSERT INTO audit_logs(user_id,user_name,action,module,entity,entity_id,detail,ip) VALUES(?,?,?,?,?,?,?,?)',
      user?.id ?? null, user?.name ?? 'system', action, module ?? '', entity ?? '', String(entityId ?? ''), detail ?? '', ip ?? ''
    );
  } catch { /* 审计失败不阻断业务 */ }
}

export function listRoles() {
  return all('SELECT id, code, name, description, permissions, data_scope, status FROM roles ORDER BY id');
}
