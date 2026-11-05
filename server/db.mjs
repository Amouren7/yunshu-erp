import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.ERP_DATA_DIR || path.join(__dirname, 'data');
export const DB_FILE = path.join(DATA_DIR, 'erp.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

// ---- 结果统一：node:sqlite 返回 null prototype 对象，转普通对象并处理 BigInt ----
function normalize(row) {
  if (row == null) return row;
  const out = {};
  for (const k of Object.keys(row)) {
    const v = row[k];
    out[k] = typeof v === 'bigint' ? Number(v) : v;
  }
  return out;
}

// node:sqlite 不接受 undefined / NaN，统一规整为 null（并保留 Error 以便定位）
function safeParams(params) {
  return params.map((p, i) => {
    if (p === undefined) return null;
    if (typeof p === 'number' && !Number.isFinite(p)) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

export function all(sql, ...params) {
  return db.prepare(sql).all(...safeParams(params)).map(normalize);
}
export function get(sql, ...params) {
  const r = db.prepare(sql).get(...safeParams(params));
  return r == null ? null : normalize(r);
}
export function run(sql, ...params) {
  const r = db.prepare(sql).run(...safeParams(params));
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}
export function exec(sql) {
  db.exec(sql);
}

/** 事务包装（同步）。fn 内抛错自动回滚。 */
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

export function migrate() {
  let version = 0;
  try { version = Number(get('PRAGMA user_version')?.user_version ?? 0); } catch { version = 0; }
  if (version < 1) {
    const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
    exec(sql);
    exec('PRAGMA user_version = 1');
    return true;
  }
  return false;
}

export function isSeeded() {
  const r = get('SELECT COUNT(*) AS c FROM users');
  return (r?.c ?? 0) > 0;
}
