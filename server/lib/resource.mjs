import { get, run, all } from '../db.mjs';
import { ApiError, pick, orderBy, paginate } from '../http.mjs';
import { audit, hasPermission } from '../auth.mjs';

/**
 * 注册一个标准资源（列表/详情/新建/编辑/删除/下拉选项）
 * cfg: {
 *   base: '/api/masterdata/items', table: 'items', label: '物料',
 *   module: 'basedata',            // 权限前缀
 *   fields: [...],                 // 允许写入的列
 *   search: ['code','name'],       // 关键字搜索列
 *   filters: ['status','category_id'],
 *   order: 'code asc', sortable: [...],
 *   unique: ['code'],
 *   listSql / toApi(row) / beforeSave(data, ctx) / beforeDelete(row) / options: {value, label, sub}
 * }
 */
export function registerResource(router, cfg) {
  const {
    base, table, label = table, module = 'basedata', fields = [], search = [], filters = [],
    order = 'id desc', sortable = [], unique = [], options = { value: 'id', label: 'name', sub: 'code' },
    toApi = (r) => r, beforeSave, beforeDelete, canDelete = true, listSql, countSql,
  } = cfg;

  const q = (s) => `"${String(s).replace(/"/g, '')}"`;
  const permOf = (action) => `${module}.${action}`;

  const getRow = (id) => {
    const row = get(`SELECT * FROM ${q(table)} WHERE id = ?`, Number(id));
    if (!row) throw new ApiError(`${label}不存在`, 404, 'NOT_FOUND');
    return row;
  };

  // 下拉选项（供其他页面选择器使用）
  router.get(`${base}/options`, async (ctx) => {
    const keyword = ctx.query.keyword || '';
    const limit = Math.min(200, Number(ctx.query.limit) || 50);
    const where = [];
    const params = [];
    const extraWhere = cfg.optionsWhere;
    const searchCols = options.search || search.slice(0, 2);
    if (keyword && searchCols.length) {
      where.push('(' + searchCols.map((c) => `${q(c)} LIKE ?`).join(' OR ') + ')');
      searchCols.forEach(() => params.push(`%${keyword}%`));
    }
    if (ctx.query.exclude) { where.push('id <> ?'); params.push(Number(ctx.query.exclude)); }
    if (extraWhere) { where.push(extraWhere); }
    const rows = all(`SELECT * FROM ${q(table)} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT ?`,
      ...params, limit);
    return rows.map((r) => toApi({
      value: r[options.value],
      label: options.labelExpr ? options.labelExpr(r) : `${r[options.label] ?? r.name}${r[options.sub] ? ' · ' + r[options.sub] : ''}`,
      raw: cfg.optionsRich ? r : undefined,
    }));
  }, { perm: permOf('view') });

  // 列表
  router.get(base, async (ctx) => {
    const { page, pageSize, offset } = paginate(ctx.req);
    const where = [];
    const params = [];
    if (ctx.query.keyword) {
      const kw = String(ctx.query.keyword);
      const cols = search.length ? search : ['name'];
      where.push('(' + cols.map((c) => `${q(c)} LIKE ?`).join(' OR ') + ')');
      cols.forEach(() => params.push(`%${kw}%`));
    }
    for (const f of filters) {
      const v = ctx.query[f];
      if (v !== undefined && v !== '' && v !== 'ALL') {
        if (f.endsWith('_like')) {
          where.push(`${q(f.slice(0, -5))} LIKE ?`);
          params.push(`%${v}%`);
        } else if (String(v).includes(',')) {
          const arr = String(v).split(',').filter(Boolean);
          where.push(`${q(f)} IN (${arr.map(() => '?').join(',')})`);
          params.push(...arr);
        } else {
          where.push(`${q(f)} = ?`);
          params.push(v);
        }
      }
    }
    if (cfg.extraFilters) {
      const ef = cfg.extraFilters(ctx.query);
      if (ef?.where) { where.push(ef.where); params.push(...(ef.params || [])); }
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = countSql
      ? get(countSql, ...params)?.c ?? 0
      : get(`SELECT COUNT(*) AS c FROM ${q(table)} ${w}`, ...params)?.c ?? 0;
    const sortCols = sortable.length ? sortable : fields.length ? fields : ['id'];
    const ob = orderBy(ctx.query.sort, sortCols, order);
    let rows;
    if (listSql) {
      rows = all(`${listSql} ${w} ORDER BY ${ob} LIMIT ? OFFSET ?`, ...params, pageSize, offset);
    } else {
      rows = all(`SELECT * FROM ${q(table)} ${w} ORDER BY ${ob} LIMIT ? OFFSET ?`, ...params, pageSize, offset);
    }
    return { rows: rows.map(toApi), total, page, pageSize };
  }, { perm: permOf('view') });

  router.get(`${base}/:id`, async (ctx) => {
    const row = getRow(ctx.params.id);
    const result = { ...toApi(row) };
    if (cfg.detail) Object.assign(result, cfg.detail(row) || {});
    return result;
  }, { perm: permOf('view') });

  router.post(base, async (ctx) => {
    const body = ctx.body || {};
    let data = pick(body, fields);
    if (beforeSave) data = beforeSave(data, { user: ctx.user, existing: null, isNew: true, body });
    for (const u of unique) {
      if (data[u] === undefined) continue;
      const dup = get(`SELECT id FROM ${q(table)} WHERE ${q(u)} = ?`, data[u]);
      if (dup) throw new ApiError(`${label}编码「${data[u]}」已存在`);
    }
    const keys = Object.keys(data);
    if (!keys.length) throw new ApiError('没有可保存的字段');
    const sql = `INSERT INTO ${q(table)} (${keys.map(q).join(',')}) VALUES (${keys.map(() => '?').join(',')})`;
    const r = run(sql, ...keys.map((k) => data[k]));
    audit(ctx.user, '新建', module, table, r.lastInsertRowid, JSON.stringify(data), ctx.ip);
    if (cfg.afterSave) cfg.afterSave(r.lastInsertRowid, data, ctx.user);
    return { id: r.lastInsertRowid, ...data };
  }, { perm: permOf('create') });

  router.put(`${base}/:id`, async (ctx) => {
    const row = getRow(ctx.params.id);
    let data = pick(ctx.body || {}, fields);
    if (beforeSave) data = beforeSave(data, { user: ctx.user, existing: row, isNew: false, body: ctx.body || {} });
    for (const u of unique) {
      if (data[u] === undefined) continue;
      const dup = get(`SELECT id FROM ${q(table)} WHERE ${q(u)} = ? AND id <> ?`, data[u], row.id);
      if (dup) throw new ApiError(`${label}编码「${data[u]}」已存在`);
    }
    const keys = Object.keys(data);
    if (keys.length) {
      run(`UPDATE ${q(table)} SET ${keys.map((k) => `${q(k)} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => data[k]), row.id);
    }
    audit(ctx.user, '修改', module, table, row.id, JSON.stringify(data), ctx.ip);
    if (cfg.afterSave) cfg.afterSave(row.id, data, ctx.user);
    return { id: row.id, ...data };
  }, { perm: permOf('edit') });

  router.delete(`${base}/:id`, async (ctx) => {
    const row = getRow(ctx.params.id);
    if (!canDelete) throw new ApiError(`${label}不支持删除`, 400);
    if (beforeDelete) {
      const msg = beforeDelete(row);
      if (msg) throw new ApiError(msg, 400, 'REFERENCED');
    }
    run(`DELETE FROM ${q(table)} WHERE id = ?`, row.id);
    audit(ctx.user, '删除', module, table, row.id, row[unique[0] || 'id'], ctx.ip);
    return { id: row.id };
  }, { perm: permOf('delete') });

  // 批量删除
  router.post(`${base}/batch-delete`, async (ctx) => {
    const ids = Array.isArray(ctx.body?.ids) ? ctx.body.ids : [];
    if (!ids.length) throw new ApiError('请选择要删除的记录');
    const results = [];
    for (const id of ids) {
      try {
        const row = getRow(id);
        if (beforeDelete) {
          const msg = beforeDelete(row);
          if (msg) { results.push({ id, ok: false, message: msg }); continue; }
        }
        run(`DELETE FROM ${q(table)} WHERE id = ?`, row.id);
        results.push({ id, ok: true });
      } catch (e) {
        results.push({ id, ok: false, message: e.message });
      }
    }
    return { results, deleted: results.filter((r) => r.ok).length };
  }, { perm: permOf('delete') });
}

/** 引用检查：返回被引用的说明文本，未引用返回 null */
export function referenced(entity, id, refs) {
  for (const { table, column, label } of refs) {
    const r = get(`SELECT COUNT(*) AS c FROM ${table} WHERE ${column} = ?`, Number(id));
    if (r?.c > 0) return `该${entity}已被${label}引用（${r.c} 条），不能删除`;
  }
  return null;
}
