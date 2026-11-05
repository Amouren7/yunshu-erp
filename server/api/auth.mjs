import { get, run } from '../db.mjs';
import { ApiError } from '../http.mjs';
import { login, logout, publicUser, authenticate, audit, hashPassword, makeSalt } from '../auth.mjs';

export function register(router) {
  router.post('/api/auth/login', async (ctx) => {
    const { username, password } = ctx.body || {};
    if (!username || !password) throw new ApiError('请输入用户名和密码');
    const result = login(username, password);
    audit(result.user, '登录', 'system', 'users', result.user.id, '登录成功', ctx.ip);
    return result;
  }, { public: true });

  router.post('/api/auth/logout', async (ctx) => {
    logout(ctx.token);
    return { ok: true };
  }, { public: true });

  router.get('/api/auth/me', async (ctx) => {
    const { user } = authenticate(ctx.req);
    if (!user) throw new ApiError('未登录', 401);
    return user;
  }, { public: true });

  router.post('/api/auth/password', async (ctx) => {
    const { oldPassword, newPassword } = ctx.body || {};
    if (!oldPassword || !newPassword) throw new ApiError('请填写原密码与新密码');
    if (String(newPassword).length < 6) throw new ApiError('新密码至少 6 位');
    const row = get('SELECT * FROM users WHERE id = ?', ctx.user.id);
    const salt = row.salt;
    if (hashPassword(oldPassword, salt) !== row.password_hash) throw new ApiError('原密码不正确');
    const newSalt = makeSalt();
    run('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', hashPassword(newPassword, newSalt), newSalt, row.id);
    return { ok: true, message: '密码修改成功，请重新登录' };
  });
}
