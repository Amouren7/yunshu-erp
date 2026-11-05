-- ============================================================
-- 云枢ERP (Yunshu ERP) 数据库结构
-- SQLite 3.45+ / node:sqlite
-- 约定：金额 REAL(2位小数)，日期 TEXT('YYYY-MM-DD')，时间戳 TEXT('YYYY-MM-DD HH:MM:SS')
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------- 系统 / 权限 ----------
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  permissions TEXT NOT NULL DEFAULT '[]',   -- JSON array: ["sales.view","sales.order.approve","*"]
  data_scope TEXT NOT NULL DEFAULT 'all',   -- all | dept | self
  status TEXT NOT NULL DEFAULT 'ENABLED',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  name TEXT NOT NULL,
  role_id INTEGER REFERENCES roles(id),
  department_id INTEGER,
  employee_id INTEGER,
  phone TEXT,
  email TEXT,
  avatar TEXT,
  status TEXT NOT NULL DEFAULT 'ENABLED',
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_name TEXT,
  action TEXT NOT NULL,
  module TEXT,
  entity TEXT,
  entity_id TEXT,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  label TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS gl_mappings (
  key TEXT PRIMARY KEY,          -- AR / AP / REVENUE / COGS / INVENTORY / TAX_OUTPUT / TAX_INPUT / CASH / BANK / WIP / OVERHEAD / SALARY / FIN_EXPENSE / DISC_ALLOWED / DISC_RECEIVED / ASSET_PENDING
  account_code TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS number_series (
  doc_type TEXT PRIMARY KEY,
  prefix TEXT NOT NULL,
  next_no INTEGER NOT NULL DEFAULT 1,
  pad INTEGER NOT NULL DEFAULT 4,
  date_pattern TEXT DEFAULT 'yyyyMM'
);

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  level TEXT DEFAULT 'INFO',      -- INFO | WARN | DANGER
  user_id INTEGER,                 -- null = 全员
  is_read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------- 组织 / 人力 ----------
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_id INTEGER,
  manager_id INTEGER,
  cost_center TEXT,
  sort INTEGER DEFAULT 0,
  status TEXT DEFAULT 'ENABLED',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  department_id INTEGER,
  position TEXT,
  employee_type TEXT DEFAULT '正式员工',   -- 正式员工/试用/实习/外包
  gender TEXT,
  birthday TEXT,
  id_card TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  hire_date TEXT,
  leave_date TEXT,
  base_salary REAL DEFAULT 0,
  bank_name TEXT,
  bank_account TEXT,
  education TEXT,
  status TEXT DEFAULT '在职',
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS attendances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  work_date TEXT NOT NULL,
  status TEXT DEFAULT '正常',        -- 正常/迟到/早退/缺勤/请假/出差/加班
  check_in TEXT,
  check_out TEXT,
  work_hours REAL DEFAULT 0,
  overtime_hours REAL DEFAULT 0,
  remark TEXT,
  UNIQUE(employee_id, work_date)
);

CREATE TABLE IF NOT EXISTS payrolls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,             -- yyyy-MM
  employee_id INTEGER NOT NULL,
  base_salary REAL DEFAULT 0,
  performance_bonus REAL DEFAULT 0,
  overtime_pay REAL DEFAULT 0,
  allowance REAL DEFAULT 0,
  social_insurance REAL DEFAULT 0,
  housing_fund REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  other_deduction REAL DEFAULT 0,
  net_pay REAL DEFAULT 0,
  status TEXT DEFAULT '草稿',        -- 草稿/已确认/已发放
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(period, employee_id)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  leave_type TEXT DEFAULT '事假',    -- 事假/病假/年假/调休/婚假/产假
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days REAL DEFAULT 1,
  reason TEXT,
  status TEXT DEFAULT '待审批',      -- 待审批/已批准/已驳回
  approver_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------- 基础数据 ----------
CREATE TABLE IF NOT EXISTS item_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  parent_id INTEGER,
  sort INTEGER DEFAULT 0,
  status TEXT DEFAULT 'ENABLED'
);

CREATE TABLE IF NOT EXISTS uoms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  rate REAL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tax_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  rate REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS currencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT,
  rate REAL NOT NULL DEFAULT 1,
  is_base INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS warehouses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT DEFAULT '成品仓',        -- 原料仓/成品仓/半成品仓/委外仓/不良品仓
  address TEXT,
  manager_id INTEGER,
  phone TEXT,
  status TEXT DEFAULT 'ENABLED',
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  spec TEXT,
  category_id INTEGER,
  item_type TEXT DEFAULT '成品',      -- 原料/半成品/成品/服务/虚拟件
  uom TEXT DEFAULT '个',
  brand TEXT,
  barcode TEXT,
  origin TEXT,
  price_purchase REAL DEFAULT 0,
  price_sale REAL DEFAULT 0,
  cost REAL DEFAULT 0,
  tax_rate REAL DEFAULT 13,
  safety_stock REAL DEFAULT 0,
  max_stock REAL DEFAULT 0,
  reorder_point REAL DEFAULT 0,
  batch_control INTEGER DEFAULT 0,
  shelf_life_days INTEGER DEFAULT 0,
  shelf_no TEXT,
  image TEXT,
  status TEXT DEFAULT '启用',
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT,
  category TEXT DEFAULT '普通客户',    -- 普通客户/重点客户/经销商/终端客户/VIP
  level TEXT DEFAULT 'B',             -- A/B/C
  region TEXT,
  industry TEXT,
  address TEXT,
  contact TEXT,
  phone TEXT,
  email TEXT,
  tax_no TEXT,
  bank_name TEXT,
  bank_account TEXT,
  credit_limit REAL DEFAULT 0,
  credit_days INTEGER DEFAULT 30,
  salesman_id INTEGER,
  status TEXT DEFAULT '正常',
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT,
  category TEXT DEFAULT '普通供应商',   -- 原材料/包装/外协/物流/设备/办公
  region TEXT,
  address TEXT,
  contact TEXT,
  phone TEXT,
  email TEXT,
  tax_no TEXT,
  bank_name TEXT,
  bank_account TEXT,
  payment_terms TEXT DEFAULT '月结30天',
  credit_days INTEGER DEFAULT 30,
  rating TEXT DEFAULT 'B',
  status TEXT DEFAULT '正常',
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS work_centers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT DEFAULT '加工中心',
  capacity REAL DEFAULT 8,            -- 每日可用工时
  cost_rate REAL DEFAULT 0,           -- 小时费率
  status TEXT DEFAULT 'ENABLED'
);

CREATE TABLE IF NOT EXISTS processes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  work_center_id INTEGER,
  standard_hours REAL DEFAULT 0,
  description TEXT
);

CREATE TABLE IF NOT EXISTS boms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT,
  item_id INTEGER NOT NULL,
  version TEXT DEFAULT 'V1.0',
  output_qty REAL DEFAULT 1,
  scrap_rate REAL DEFAULT 0,
  process_id INTEGER,
  status TEXT DEFAULT '启用',
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS bom_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bom_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  loss_rate REAL DEFAULT 0,
  seq INTEGER DEFAULT 1,
  remark TEXT
);

-- ---------- 单据引擎（销售/采购/库存/资金） ----------
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT NOT NULL UNIQUE,
  doc_type TEXT NOT NULL,
  doc_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  partner_type TEXT,                 -- customer | supplier | employee | none
  partner_id INTEGER,
  contact TEXT,
  phone TEXT,
  address TEXT,
  salesperson_id INTEGER,
  department_id INTEGER,
  warehouse_id INTEGER,              -- 主仓库（入库仓/发货仓/调出仓）
  to_warehouse_id INTEGER,           -- 调入仓（调拨）
  currency TEXT DEFAULT 'CNY',
  exchange_rate REAL DEFAULT 1,
  payment_terms TEXT,
  due_date TEXT,
  project TEXT,
  source_type TEXT,
  source_id INTEGER,
  source_no TEXT,
  remark TEXT,
  subtotal REAL DEFAULT 0,           -- 未税金额合计
  discount_amount REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,       -- 价税合计
  paid_amount REAL DEFAULT 0,
  cost_amount REAL DEFAULT 0,        -- 出库/入库成本合计
  extra_json TEXT DEFAULT '{}',
  created_by INTEGER,
  created_by_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  submitted_by INTEGER,
  submitted_at TEXT,
  approved_by INTEGER,
  approved_at TEXT,
  closed_at TEXT,
  voided_at TEXT,
  print_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS document_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL,
  line_no INTEGER DEFAULT 1,
  item_id INTEGER,
  item_code TEXT,
  item_name TEXT,
  spec TEXT,
  uom TEXT,
  qty REAL DEFAULT 0,
  price REAL DEFAULT 0,
  discount_rate REAL DEFAULT 0,
  amount REAL DEFAULT 0,             -- 未税金额
  tax_rate REAL DEFAULT 13,
  tax_amount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,       -- 价税合计
  cost REAL DEFAULT 0,               -- 单位成本（出库时回填）
  cost_amount REAL DEFAULT 0,
  warehouse_id INTEGER,
  batch_no TEXT,
  production_date TEXT,
  expiry_date TEXT,
  delivered_qty REAL DEFAULT 0,      -- 已发货/已入库数量（源单跟踪）
  invoiced_qty REAL DEFAULT 0,
  source_line_id INTEGER,
  remark TEXT,
  extra_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS document_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  user_id INTEGER,
  user_name TEXT,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------- 库存 ----------
CREATE TABLE IF NOT EXISTS stock_balances (
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  qty REAL NOT NULL DEFAULT 0,
  reserved_qty REAL NOT NULL DEFAULT 0,
  avg_cost REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (item_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS stock_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  biz_date TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  doc_id INTEGER,
  doc_no TEXT,
  item_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  batch_no TEXT,
  direction TEXT NOT NULL,           -- IN | OUT
  qty_in REAL DEFAULT 0,
  qty_out REAL DEFAULT 0,
  unit_cost REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  balance_qty REAL DEFAULT 0,
  balance_cost REAL DEFAULT 0,
  remark TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------- 生产 ----------
CREATE TABLE IF NOT EXISTS work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  item_id INTEGER NOT NULL,
  bom_id INTEGER,
  qty REAL NOT NULL DEFAULT 0,
  completed_qty REAL DEFAULT 0,
  scrap_qty REAL DEFAULT 0,
  warehouse_id INTEGER,              -- 完工入库仓
  material_wh_id INTEGER,            -- 领料仓
  planned_start TEXT,
  planned_end TEXT,
  actual_start TEXT,
  actual_end TEXT,
  priority TEXT DEFAULT '普通',       -- 低/普通/高/紧急
  status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT/RELEASED/IN_PROGRESS/COMPLETED/CLOSED/VOID
  source_type TEXT,
  source_id INTEGER,
  source_no TEXT,
  remark TEXT,
  created_by INTEGER,
  created_by_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS work_order_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wo_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  item_code TEXT,
  item_name TEXT,
  uom TEXT,
  required_qty REAL DEFAULT 0,
  issued_qty REAL DEFAULT 0,
  unit_cost REAL DEFAULT 0,
  warehouse_id INTEGER,
  remark TEXT
);

CREATE TABLE IF NOT EXISTS work_order_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wo_id INTEGER NOT NULL,
  seq INTEGER DEFAULT 1,
  process_name TEXT NOT NULL,
  work_center_id INTEGER,
  planned_hours REAL DEFAULT 0,
  actual_hours REAL DEFAULT 0,
  status TEXT DEFAULT '待开始',       -- 待开始/进行中/已完成
  operator TEXT,
  remark TEXT
);

-- ---------- 财务 ----------
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,            -- ASSET/LIABILITY/EQUITY/COST/INCOME/EXPENSE
  direction TEXT NOT NULL,           -- DEBIT / CREDIT
  parent_code TEXT,
  level INTEGER DEFAULT 1,
  is_leaf INTEGER DEFAULT 1,
  status TEXT DEFAULT '启用'
);

CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_no TEXT NOT NULL UNIQUE,
  voucher_date TEXT NOT NULL,
  period TEXT NOT NULL,              -- yyyy-MM
  voucher_type TEXT DEFAULT 'AUTO',  -- AUTO | MANUAL
  source_type TEXT,
  source_id INTEGER,
  summary TEXT,
  total_debit REAL DEFAULT 0,
  total_credit REAL DEFAULT 0,
  status TEXT DEFAULT 'POSTED',      -- DRAFT | POSTED | VOID
  created_by INTEGER,
  created_by_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  posted_at TEXT
);

CREATE TABLE IF NOT EXISTS voucher_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_id INTEGER NOT NULL,
  line_no INTEGER DEFAULT 1,
  account_code TEXT NOT NULL,
  account_name TEXT,
  summary TEXT,
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  partner_type TEXT,
  partner_id INTEGER,
  partner_name TEXT,
  dept_id INTEGER,
  source_line_id INTEGER
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL UNIQUE,
  invoice_type TEXT NOT NULL,        -- AR | AP
  partner_type TEXT NOT NULL,        -- customer | supplier
  partner_id INTEGER NOT NULL,
  doc_id INTEGER,
  doc_no TEXT,
  invoice_date TEXT NOT NULL,
  due_date TEXT,
  currency TEXT DEFAULT 'CNY',
  subtotal REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  status TEXT DEFAULT '未收' ,       -- 未收/部分收款/已收/已核销/已作废 (AP: 未付/部分付款/已付)
  period TEXT,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_no TEXT NOT NULL UNIQUE,
  payment_type TEXT NOT NULL,        -- RECEIPT(收款) | PAYMENT(付款)
  partner_type TEXT NOT NULL,
  partner_id INTEGER NOT NULL,
  payment_date TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  allocated_amount REAL DEFAULT 0,
  method TEXT DEFAULT '银行转账',     -- 银行转账/现金/承兑汇票/微信/支付宝/支票
  bank_account TEXT,
  account_code TEXT DEFAULT '1002',
  status TEXT DEFAULT 'POSTED',      -- DRAFT | POSTED | VOID
  remark TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL,
  invoice_id INTEGER NOT NULL,
  amount REAL NOT NULL DEFAULT 0
);

-- ---------- CRM ----------
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company TEXT,
  contact TEXT,
  phone TEXT,
  email TEXT,
  source TEXT DEFAULT '官网咨询',     -- 官网咨询/展会/电话拜访/转介绍/广告/陌拜
  status TEXT DEFAULT '待跟进',       -- 待跟进/已联系/已确认商机/已转客户/已流失
  owner_id INTEGER,
  expected_amount REAL DEFAULT 0,
  next_follow_at TEXT,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  customer_id INTEGER,
  lead_id INTEGER,
  amount REAL DEFAULT 0,
  stage TEXT DEFAULT '初步接洽',       -- 初步接洽/需求确认/方案报价/商务谈判/赢单/输单
  probability INTEGER DEFAULT 20,
  expected_close_date TEXT,
  owner_id INTEGER,
  status TEXT DEFAULT '进行中',
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS crm_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type TEXT NOT NULL,            -- LEAD | CUSTOMER | OPPORTUNITY
  ref_id INTEGER NOT NULL,
  activity_type TEXT DEFAULT '电话沟通',
  subject TEXT,
  content TEXT,
  activity_at TEXT,
  owner_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  customer_id INTEGER,
  amount REAL DEFAULT 0,
  sign_date TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT DEFAULT '执行中',      -- 草稿/执行中/已完成/已终止
  owner_id INTEGER,
  remark TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------- 索引 ----------
CREATE INDEX IF NOT EXISTS idx_documents_type_date ON documents(doc_type, doc_date);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_partner ON documents(partner_id);
CREATE INDEX IF NOT EXISTS idx_doc_lines_doc ON document_lines(doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_lines_item ON document_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_item ON stock_ledger(item_id, warehouse_id, biz_date);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_doc ON stock_ledger(doc_id);
CREATE INDEX IF NOT EXISTS idx_voucher_lines_voucher ON voucher_lines(voucher_id);
CREATE INDEX IF NOT EXISTS idx_voucher_lines_account ON voucher_lines(account_code);
CREATE INDEX IF NOT EXISTS idx_invoices_partner ON invoices(partner_type, partner_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_item_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_wo_status ON work_orders(status);
