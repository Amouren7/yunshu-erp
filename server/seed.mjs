/**
 * 云枢ERP 种子数据
 * 生成：组织/人员/权限、基础资料、12个月历史业务单据（销售/采购/生产/库存/资金）、
 *       财务凭证、应收应付、CRM、考勤薪资、通知等。
 * 用法：npm run seed
 */
import { migrate, run, get, all, exec, tx, isSeeded } from './db.mjs';
import { hashPassword, makeSalt } from './auth.mjs';
import { ensureNumberSeries, nextDocNo } from './lib/numbering.mjs';
import { applyEffect, postMaterialIssue, postProductionCompletion } from './lib/posting.mjs';
import { postVoucher } from './lib/gl.mjs';

migrate();

// ---------------- 工具 ----------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261023);
const rint = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pickMany = (arr, n) => [...arr].sort(() => rnd() - 0.5).slice(0, n);
const chance = (p) => rnd() < p;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n, len = 2) => String(n).padStart(len, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dstr = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

const TODAY = new Date();
const TODAY_STR = ymd(TODAY);
const START = (() => { const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - 11, 1); return d; })();

function monthList() {
  const list = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const y = d.getFullYear(), m = d.getMonth() + 1;
    list.push({
      y, m, period: `${y}-${pad(m)}`,
      start: dstr(y, m, 1),
      end: dstr(y, m, last.getDate()),
      lastDay: last.getDate(),
      factor: [0.82, 0.95, 0.72, 0.9, 1.02, 0.98, 1.05, 1.12, 1.0, 1.18, 1.1, 1.22][11 - i],
    });
  }
  return list;
}
const MONTHS = monthList();
const isCurrentMonth = (m) => m.period === `${TODAY.getFullYear()}-${pad(TODAY.getMonth() + 1)}`;
const dayIn = (m, day) => Math.min(day, isCurrentMonth(m) ? Math.max(1, TODAY.getDate()) : m.lastDay);

// ---------------- 清库 ----------------
const TABLES = [
  'payment_allocations', 'payments', 'invoices', 'voucher_lines', 'vouchers', 'accounts',
  'stock_ledger', 'stock_balances', 'document_logs', 'document_lines', 'documents',
  'work_order_operations', 'work_order_materials', 'work_orders',
  'bom_lines', 'boms', 'processes', 'work_centers',
  'attendances', 'payrolls', 'leave_requests',
  'crm_activities', 'contracts', 'opportunities', 'leads',
  'items', 'item_categories', 'uoms', 'tax_rates', 'currencies', 'warehouses',
  'customers', 'suppliers', 'employees', 'departments',
  'sessions', 'audit_logs', 'notices', 'settings', 'gl_mappings', 'number_series',
  'users', 'roles',
];
for (const t of TABLES) { try { exec(`DELETE FROM ${t}`); } catch { /* ignore */ } }
try { exec('DELETE FROM sqlite_sequence'); } catch { /* ignore */ }

// ---------------- 系统 ----------------
const ROLE_DEFS = [
  { code: 'ADMIN', name: '系统管理员', scope: 'all', perms: ['*'], desc: '拥有全部权限' },
  { code: 'SALES_MGR', name: '销售经理', scope: 'all', desc: '销售全流程 + 客户关系',
    perms: ['dashboard.view', 'basedata.view', 'sales.*', 'inventory.view', 'crm.*', 'reports.*', 'purchase.view', 'finance.view'] },
  { code: 'SALES', name: '销售专员', scope: 'self', desc: '销售开单与客户跟进',
    perms: ['dashboard.view', 'basedata.view', 'sales.view', 'sales.create', 'sales.edit', 'sales.submit', 'crm.view', 'crm.create', 'crm.edit', 'reports.view'] },
  { code: 'PURCHASE', name: '采购经理', scope: 'dept', desc: '采购与供应商管理',
    perms: ['dashboard.view', 'basedata.*', 'purchase.*', 'inventory.view', 'reports.*', 'finance.view', 'production.view'] },
  { code: 'STOCK', name: '仓库管理员', scope: 'all', desc: '出入库、盘点与调拨',
    perms: ['dashboard.view', 'basedata.view', 'inventory.*', 'purchase.view', 'sales.view', 'production.view'] },
  { code: 'FINANCE', name: '财务会计', scope: 'all', desc: '总账、应收应付、报表',
    perms: ['dashboard.view', 'basedata.view', 'finance.*', 'reports.*', 'sales.view', 'purchase.view', 'inventory.view', 'production.view'] },
  { code: 'HR', name: '人事行政', scope: 'all', desc: '人事、考勤、薪资',
    perms: ['dashboard.view', 'basedata.view', 'hr.*', 'system.view'] },
  { code: 'GUEST', name: '只读访客', scope: 'all', desc: '仅可查看业务数据',
    perms: ['dashboard.view', 'basedata.view', 'sales.view', 'purchase.view', 'inventory.view', 'production.view', 'finance.view', 'hr.view', 'crm.view', 'reports.view'] },
];
const roleId = {};
for (const r of ROLE_DEFS) {
  const salt = makeSalt();
  roleId[r.code] = run('INSERT INTO roles(code,name,description,permissions,data_scope) VALUES(?,?,?,?,?)',
    r.code, r.name, r.desc, JSON.stringify(r.perms), r.scope).lastInsertRowid;
}

// 部门
const DEPTS = [
  ['D001', '总经办', null, 1], ['D002', '销售中心', null, 2], ['D003', '销售一部', 'D002', 3],
  ['D004', '销售二部', 'D002', 4], ['D005', '采购部', null, 5], ['D006', '生产部', null, 6],
  ['D007', '品质部', null, 7], ['D008', '仓储物流部', null, 8], ['D009', '财务部', null, 9],
  ['D010', '人事行政部', null, 10], ['D011', '研发部', null, 11],
];
const deptId = {};
for (const [code, name, parent, sort] of DEPTS) {
  deptId[code] = run('INSERT INTO departments(code,name,parent_id,cost_center,sort,status) VALUES(?,?,?,?,?,?)',
    code, name, parent ? deptId[parent] : null, `CC-${code}`, sort, 'ENABLED').lastInsertRowid;
}

// 员工
const EMPLOYEES = [
  ['E001', '张伟', 'D001', '总经理', '男', 45000, '2019-03-01', '本科'],
  ['E002', '陈静', 'D002', '销售总监', '女', 28000, '2019-06-15', '本科'],
  ['E003', '李强', 'D003', '销售经理', '男', 18000, '2020-04-10', '本科'],
  ['E004', '王芳', 'D004', '销售经理', '女', 17500, '2020-08-20', '大专'],
  ['E005', '刘洋', 'D003', '销售代表', '男', 9500, '2021-03-15', '大专'],
  ['E006', '赵敏', 'D004', '销售代表', '女', 9200, '2021-07-01', '本科'],
  ['E007', '孙悦', 'D004', '销售代表', '女', 8800, '2022-02-14', '本科'],
  ['E008', '周婷', 'D009', '财务经理', '女', 20000, '2019-09-01', '本科'],
  ['E009', '吴迪', 'D009', '会计', '女', 11000, '2021-05-06', '本科'],
  ['E010', '郑涛', 'D009', '出纳', '男', 8000, '2022-03-01', '大专'],
  ['E011', '王磊', 'D005', '采购经理', '男', 19000, '2019-11-11', '本科'],
  ['E012', '冯雪', 'D005', '采购专员', '女', 9500, '2021-09-13', '本科'],
  ['E013', '陈龙', 'D005', '采购专员', '男', 9000, '2022-06-20', '大专'],
  ['E014', '杨帆', 'D006', '生产经理', '男', 22000, '2019-05-20', '本科'],
  ['E015', '黄丽', 'D006', '生产计划员', '女', 10000, '2021-01-11', '大专'],
  ['E016', '徐明', 'D006', '车间主管', '男', 12000, '2020-07-06', '中专'],
  ['E017', '朱琳', 'D006', '装配工', '女', 6500, '2022-04-18', '中专'],
  ['E018', '胡军', 'D006', '装配工', '男', 6800, '2022-04-18', '中专'],
  ['E019', '林悦', 'D007', '品质经理', '女', 16000, '2020-02-24', '本科'],
  ['E020', '高翔', 'D007', '质检员', '男', 7500, '2022-08-01', '大专'],
  ['E021', '罗刚', 'D008', '仓储主管', '男', 11000, '2020-10-12', '大专'],
  ['E022', '梁静', 'D008', '仓管员', '女', 7000, '2022-05-09', '高中'],
  ['E023', '宋磊', 'D011', '研发经理', '男', 30000, '2019-07-15', '硕士'],
  ['E024', '谢婷', 'D011', '硬件工程师', '女', 18000, '2021-04-01', '本科'],
  ['E025', '唐宇', 'D011', '嵌入式工程师', '男', 20000, '2020-12-01', '本科'],
  ['E026', '何静', 'D010', '人事经理', '女', 15000, '2020-01-06', '本科'],
  ['E027', '邓超', 'D010', '行政专员', '男', 7000, '2022-09-01', '大专'],
];
const empId = {};
for (const [code, name, dept, position, gender, salary, hire, edu] of EMPLOYEES) {
  empId[code] = run(`INSERT INTO employees(code,name,department_id,position,employee_type,gender,birthday,phone,email,
      hire_date,base_salary,bank_name,bank_account,education,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'在职')`,
    code, name, deptId[dept], position, '正式员工', gender,
    `19${rint(78, 98)}-${pad(rint(1, 12))}-${pad(rint(1, 28))}`,
    `138${rint(10000000, 99999999)}`, `${code.toLowerCase()}@yunsu-erp.com`,
    hire, salary, '招商银行深圳分行', `6225${rint(10000000, 99999999)}${rint(1000, 9999)}`, edu).lastInsertRowid;
}

const USERS = [
  ['admin', 'admin123', '张伟', 'ADMIN', 'D001', 'E001', '总经理'],
  ['chenjing', 'sales123', '陈静', 'SALES_MGR', 'D002', 'E002', '销售总监'],
  ['liqiang', 'sales456', '李强', 'SALES', 'D003', 'E003', '销售经理'],
  ['wanglei', 'buy123', '王磊', 'PURCHASE', 'D005', 'E011', '采购经理'],
  ['zhaomin', 'stock123', '赵敏', 'STOCK', 'D004', 'E006', '销售代表(兼仓管)'],
  ['zhouting', 'fin123', '周婷', 'FINANCE', 'D009', 'E008', '财务经理'],
  ['sunyue', 'hr123', '孙悦', 'HR', 'D010', 'E026', '人事经理'],
  ['guest', 'guest123', '访客用户', 'GUEST', 'D001', 'E027', '行政专员'],
];
for (const [username, pwd, name, role, dept, emp, position] of USERS) {
  const salt = makeSalt();
  run(`INSERT INTO users(username,password_hash,salt,name,role_id,department_id,employee_id,phone,email,status)
       VALUES(?,?,?,?,?,?,?,?,?,'ENABLED')`,
    username, hashPassword(pwd, salt), salt, name, roleId[role], deptId[dept], empId[emp],
    `139${rint(10000000, 99999999)}`, `${username}@yunsu-erp.com`);
}
const admin = { id: 1, name: '张伟' };
const CREATOR_NAMES = { 1: '张伟', 2: '陈静', 3: '李强', 4: '王磊', 5: '赵敏', 6: '周婷', 7: '孙悦' };
const usersByRole = {
  admin: { id: 1, name: '张伟' },
  sales: { id: 2, name: '陈静' },
  purchase: { id: 4, name: '王磊' },
  stock: { id: 5, name: '赵敏' },
  finance: { id: 6, name: '周婷' },
};

// 系统参数
const SETTINGS = [
  ['company_name', '云枢科技（深圳）有限公司', '公司名称'],
  ['company_tel', '0755-8688 6688', '联系电话'],
  ['company_address', '深圳市南山区科技园科苑路 15 号云枢大厦 12 层', '公司地址'],
  ['company_bank', '招商银行深圳科技园支行', '开户银行'],
  ['company_bank_account', '7559 0688 1234 5678', '银行账号'],
  ['company_tax_no', '91440300MA5F8XYZ2K', '纳税人识别号'],
  ['fiscal_year_start', '01', '会计年度起始月'],
  ['allow_negative_stock', '1', '允许负库存'],
  ['default_tax_rate', '13', '默认税率'],
];
for (const [k, v, label] of SETTINGS) run('INSERT INTO settings(key,value,label) VALUES(?,?,?)', k, v, label);

// ---------------- 基础资料 ----------------
const UOMS = [['PCS', '个'], ['SET', '套'], ['BOX', '盒'], ['PC', '片'], ['M', '米'], ['KG', '千克'], ['BAG', '包'], ['BOOK', '本']];
for (const [code, name] of UOMS) run('INSERT INTO uoms(code,name,rate) VALUES(?,?,1)', code, name);
const TAX_RATES = [['TAX13', '增值税13%', 13], ['TAX9', '增值税9%', 9], ['TAX6', '增值税6%', 6], ['TAX3', '增值税3%', 3], ['TAX0', '免税', 0]];
for (const [code, name, rate] of TAX_RATES) run('INSERT INTO tax_rates(code,name,rate) VALUES(?,?,?)', code, name, rate);
for (const [code, name, symbol, rate, base] of [['CNY', '人民币', '¥', 1, 1], ['USD', '美元', '$', 7.12, 0], ['EUR', '欧元', '€', 7.78, 0]]) {
  run('INSERT INTO currencies(code,name,symbol,rate,is_base) VALUES(?,?,?,?,?)', code, name, symbol, rate, base);
}

const CATEGORIES = [
  ['C01', '智能网关'], ['C02', '传感器'], ['C03', '工业一体机'],
  ['C04', '半成品组件'], ['C05', '电子元器件'], ['C06', '结构件'], ['C07', '包装材料'],
];
const catId = {};
for (const [code, name] of CATEGORIES) catId[code] = run('INSERT INTO item_categories(code,name,sort,status) VALUES(?,?,?,\'ENABLED\')', code, name, Number(code.slice(1))).lastInsertRowid;

const WAREHOUSES = [
  ['WH01', '原料仓库', '原料仓', 'A区 1-3 号库位'],
  ['WH02', '成品仓库', '成品仓', 'B区 1-2 号库位'],
  ['WH03', '半成品仓库', '半成品仓', 'C区 1 号库位'],
  ['WH04', '不良品仓库', '不良品仓', 'D区 1 号库位'],
];
const whId = {};
for (const [code, name, type, addr] of WAREHOUSES) {
  whId[code] = run('INSERT INTO warehouses(code,name,type,address,manager_id,status,remark) VALUES(?,?,?,?,?,\'ENABLED\',?)',
    code, name, type, addr, empId.E021, '').lastInsertRowid;
}

// 物料定义: code, name, spec, category, type, uom, 采购价, 销售价, 税率, 安全库存
const ITEMS = [
  ['FG-GW1000', '智能物联网网关', 'WG-1000 / 4G / 双网口', 'C01', '成品', '台', 0, 1680, 13, 30],
  ['FG-GW2000', '边缘计算网关', 'GW-2000 / 4核 / 8G', 'C01', '成品', '台', 0, 3280, 13, 15],
  ['FG-RT300', '无线温湿度传感器', 'RT-300 / LoRa / 电池供电', 'C02', '成品', '台', 0, 460, 13, 80],
  ['FG-RT500', '无线振动传感器', 'RT-500 / LoRa / 三轴', 'C02', '成品', '台', 0, 780, 13, 40],
  ['FG-HMI700', '工业触摸屏一体机', 'HMI-700 / 7寸 / IP65', 'C03', '成品', '台', 0, 4580, 13, 10],
  ['SF-PCBA100', '网关主板组件', 'PCBA-WG1000 / RK3568', 'C04', '半成品', '片', 620, 0, 13, 120],
  ['SF-PCBA200', '边缘网关主板组件', 'PCBA-GW2000 / RK3568 / 8G', 'C04', '半成品', '片', 1350, 0, 13, 60],
  ['RM-CPU01', '核心板', 'RK3568 / 2G+16G', 'C05', '原料', '片', 320, 0, 13, 300],
  ['RM-4G01', '4G通信模组', 'EC20-CE / 全网通', 'C05', '原料', '片', 95, 0, 13, 300],
  ['RM-PWR01', '电源模块', '5V/2A 工业级', 'C05', '原料', '个', 38, 0, 13, 300],
  ['RM-CASE01', '铝合金外壳', '150×100×35mm 阳极氧化', 'C06', '原料', '个', 55, 0, 13, 400],
  ['RM-PCB01', 'PCB板', '6层 1.6mm 沉金', 'C05', '原料', '张', 45, 0, 13, 400],
  ['RM-ANT01', '4G天线', 'SMA 全频段', 'C05', '原料', '根', 12, 0, 13, 500],
  ['RM-NET01', '网口变压器', 'H1102NL', 'C05', '原料', '个', 8, 0, 13, 600],
  ['RM-CABLE01', '线材组件', '端子线束 1.2m', 'C05', '原料', '套', 15, 0, 13, 300],
  ['RM-SCREW01', '螺丝包', 'M3×8 不锈钢 20颗', 'C06', '原料', '包', 2, 0, 13, 500],
  ['RM-SENSOR01', '温湿度传感器探头', 'SHT30 / -40~125℃', 'C05', '原料', '个', 26, 0, 13, 400],
  ['RM-ACC01', '加速度传感器', 'ADXL345 / 三轴', 'C05', '原料', '个', 48, 0, 13, 200],
  ['RM-LCD01', '7寸工业液晶屏', '1024×600 / 高亮', 'C05', '原料', '块', 780, 0, 13, 50],
  ['RM-TOUCH01', '电容触摸屏', '7寸 工业级', 'C05', '原料', '块', 320, 0, 13, 50],
  ['RM-HMI-CPU', '工控主板', 'A40i / 2G+16G', 'C05', '原料', '块', 1500, 0, 13, 30],
  ['PK-BOX01', '彩盒包装', '250×180×60mm', 'C07', '包装物', '个', 3.5, 0, 13, 500],
  ['PK-MANUAL01', '使用说明书', 'A5 彩色 16页', 'C07', '包装物', '本', 0.8, 0, 13, 500],
  ['PK-FOAM01', '珍珠棉内衬', '定制 成型', 'C07', '包装物', '套', 1.2, 0, 13, 500],
];
const itemId = {};
const itemInfo = {};
for (const [code, name, spec, cat, type, uom, buy, sale, tax, safety] of ITEMS) {
  const id = run(`INSERT INTO items(code,name,spec,category_id,item_type,uom,brand,barcode,origin,
      price_purchase,price_sale,cost,tax_rate,safety_stock,max_stock,reorder_point,batch_control,status,remark)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    code, name, spec, catId[cat], type, uom, '云枢', `69${rint(100000000, 999999999)}`, '深圳',
    buy, sale, buy, tax, safety, safety * 5, safety * 2, type === '原料' ? 1 : 0, '启用', '').lastInsertRowid;
  itemId[code] = id;
  itemInfo[code] = { id, code, name, spec, uom, type, buy, sale, tax, safety };
}

// 客户
const CUSTOMERS = [
  ['深圳华控自动化有限公司', '华南', '华南', '智能制造', 'A', 800000, 30],
  ['广州智联设备科技有限公司', '华南', '华南', '物联网', 'B', 400000, 30],
  ['东莞市精密制造有限公司', '华南', '华南', '精密制造', 'B', 300000, 45],
  ['苏州工业互联网科技有限公司', '华东', '华东', '工业互联网', 'A', 1000000, 60],
  ['佛山市电气集团有限公司', '华南', '华南', '电气设备', 'B', 500000, 30],
  ['上海赛博智能科技有限公司', '华东', '华东', '机器人', 'A', 900000, 45],
  ['杭州云工场信息技术有限公司', '华东', '华东', '云计算', 'B', 350000, 30],
  ['宁波海天智能装备有限公司', '华东', '华东', '装备制造', 'B', 450000, 60],
  ['成都蓉城电子科技有限公司', '西南', '西南', '电子制造', 'C', 200000, 30],
  ['武汉光谷智造科技有限公司', '华中', '华中', '智能制造', 'B', 380000, 30],
  ['北京中科智控技术有限公司', '华北', '华北', '自动化', 'A', 1200000, 60],
  ['天津晟通装备制造有限公司', '华北', '华北', '装备制造', 'C', 180000, 30],
  ['西安丝路电子科技有限公司', '西北', '西北', '电子制造', 'C', 150000, 30],
  ['长沙中联智能科技有限公司', '华中', '华中', '工程机械', 'B', 420000, 45],
  ['青岛海纳工业设备有限公司', '华东', '华东', '工业设备', 'C', 220000, 30],
  ['厦门鹭岛物联科技有限公司', '华南', '华南', '物联网', 'C', 160000, 30],
  ['重庆渝能自动化有限公司', '西南', '西南', '自动化', 'C', 190000, 45],
  ['合肥科创电子有限公司', '华东', '华东', '电子制造', 'C', 240000, 30],
  ['郑州中原自动化有限公司', '华中', '华中', '自动化', 'C', 210000, 30],
  ['惠州精密电子有限公司', '华南', '华南', '电子制造', 'B', 330000, 30],
  ['深圳市南山智造有限公司', '华南', '华南', '智能制造', 'B', 460000, 45],
  ['香港云联科技有限公司', '海外', '香港', '贸易', 'C', 300000, 60],
];
const customerId = [];
const customerInfo = [];
for (const [i, [name, region, area, industry, level, credit, days]] of CUSTOMERS.entries()) {
  const code = `KH${pad(i + 1, 4)}`;
  const id = run(`INSERT INTO customers(code,name,short_name,category,level,region,industry,address,contact,phone,email,
      tax_no,credit_limit,credit_days,salesman_id,status,remark,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'正常',?,?)`,
    code, name, name.slice(0, 4), level === 'A' ? '重点客户' : level === 'B' ? '普通客户' : '终端客户',
    level, area, industry, `${region}·${pick(['科技园', '高新区', '产业园', '工业区'])}${rint(1, 20)}路${rint(1, 200)}号`,
    pick(['王经理', '李总', '张工', '刘主管', '陈经理', '赵总']),
    `1${rint(30, 89)}${rint(10000000, 99999999)}`, `contact${i + 1}@example.com`,
    `9144${rint(1000000000, 9999999999)}`, credit, days,
    empId[pick(['E003', 'E004', 'E005', 'E006', 'E007'])], '合作稳定',
    `${pick([2020, 2021, 2022])}-${pad(rint(1, 12))}-${pad(rint(1, 28))}`).lastInsertRowid;
  customerId.push(id);
  customerInfo.push({ id, name, level, days, region: area, code });
}

// 供应商
const SUPPLIERS = [
  ['深圳市鑫源电子科技有限公司', '电子元器件', '华南', '月结30天', 'A'],
  ['东莞联发五金制品有限公司', '结构件', '华南', '月结30天', 'B'],
  ['苏州半导体贸易有限公司', '电子元器件', '华东', '月结60天', 'A'],
  ['惠州精密结构件有限公司', '结构件', '华南', '月结30天', 'B'],
  ['广州线材科技有限公司', '线材', '华南', '月结30天', 'B'],
  ['上海元器供应链有限公司', '电子元器件', '华东', '月结60天', 'A'],
  ['深圳市华强北电子元件商行', '电子元器件', '华南', '现款现货', 'C'],
  ['中山市电源科技有限公司', '电源模块', '华南', '月结30天', 'B'],
  ['佛山市包材印务有限公司', '包装材料', '华南', '月结30天', 'C'],
  ['昆山精密模具有限公司', '模具', '华东', '月结60天', 'B'],
  ['天津市连接器制造有限公司', '连接器', '华北', '月结30天', 'C'],
  ['杭州传感器件有限公司', '传感器', '华东', '月结45天', 'B'],
];
const supplierId = [];
const supplierInfo = [];
for (const [i, [name, category, region, terms, rating]] of SUPPLIERS.entries()) {
  const code = `GY${pad(i + 1, 4)}`;
  const id = run(`INSERT INTO suppliers(code,name,short_name,category,region,address,contact,phone,email,tax_no,
      bank_name,bank_account,payment_terms,credit_days,rating,status,remark,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'正常',?,?)`,
    code, name, name.slice(0, 4), category, region,
    `${region}·${pick(['工业园', '科技园', '产业园'])}${rint(1, 30)}号`, pick(['吴经理', '郑总', '孙工', '周主管']),
    `1${rint(30, 89)}${rint(10000000, 99999999)}`, `supplier${i + 1}@example.com`,
    `9144${rint(1000000000, 9999999999)}`, '中国银行', `6217${rint(10000000, 99999999)}${rint(1000, 9999)}`,
    terms, Number(String(terms).replace(/\D/g, '')) || 30, rating, '长期合作',
    `${pick([2020, 2021, 2022])}-${pad(rint(1, 12))}-${pad(rint(1, 28))}`).lastInsertRowid;
  supplierId.push(id);
  supplierInfo.push({ id, name, rating });
}

// 供应商 -> 物料映射
const SUPPLY_MAP = {
  'RM-CPU01': '深圳市鑫源电子科技有限公司', 'RM-4G01': '上海元器供应链有限公司',
  'RM-PCB01': '苏州半导体贸易有限公司', 'RM-NET01': '苏州半导体贸易有限公司',
  'RM-PWR01': '中山市电源科技有限公司', 'RM-CASE01': '东莞联发五金制品有限公司',
  'RM-SCREW01': '东莞联发五金制品有限公司', 'RM-CABLE01': '广州线材科技有限公司',
  'RM-ANT01': '广州线材科技有限公司', 'RM-SENSOR01': '杭州传感器件有限公司',
  'RM-ACC01': '杭州传感器件有限公司', 'RM-LCD01': '上海元器供应链有限公司',
  'RM-TOUCH01': '上海元器供应链有限公司', 'RM-HMI-CPU': '深圳市鑫源电子科技有限公司',
  'PK-BOX01': '佛山市包材印务有限公司', 'PK-MANUAL01': '佛山市包材印务有限公司',
  'PK-FOAM01': '佛山市包材印务有限公司', 'SF-PCBA100': '深圳市鑫源电子科技有限公司',
  'SF-PCBA200': '深圳市鑫源电子科技有限公司',
};
const supplierByName = Object.fromEntries(supplierInfo.map((s) => [s.name, s]));

// ---------- 追加主数据（让演示数据更接近真实企业规模） ----------
const EXTRA_CUSTOMERS = [
  ['深圳市鹏城智造有限公司', '华南', '华南', '智能制造', 'B', 360000, 30],
  ['广州市南沙工业互联网有限公司', '华南', '华南', '工业互联网', 'C', 180000, 30],
  ['东莞市松山湖电子科技有限公司', '华南', '华南', '电子制造', 'B', 320000, 45],
  ['珠海市横琴智能装备有限公司', '华南', '华南', '装备制造', 'C', 160000, 30],
  ['上海市临港自动化有限公司', '华东', '华东', '自动化', 'B', 420000, 45],
  ['南京市江宁智控科技有限公司', '华东', '华东', '工业控制', 'C', 210000, 30],
  ['苏州市工业园区精密仪器有限公司', '华东', '华东', '精密仪器', 'B', 380000, 60],
  ['成都市天府新区智能制造有限公司', '西南', '西南', '智能制造', 'C', 150000, 30],
];
for (const [i, [name, region, area, industry, level, credit, days]] of EXTRA_CUSTOMERS.entries()) {
  const code = `KH${pad(CUSTOMERS.length + i + 1, 4)}`;
  const id = run(`INSERT INTO customers(code,name,short_name,category,level,region,industry,address,contact,phone,email,
      tax_no,credit_limit,credit_days,salesman_id,status,remark,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'正常',?,?)`,
    code, name, name.slice(0, 4), level === 'A' ? '重点客户' : level === 'B' ? '普通客户' : '终端客户',
    level, area, industry, `${region}·${pick(['科技园', '高新区', '产业园'])}${rint(1, 20)}路${rint(1, 200)}号`,
    pick(['王经理', '李总', '张工', '刘主管', '陈经理']),
    `1${rint(30, 89)}${rint(10000000, 99999999)}`, `extra${i + 1}@example.com`,
    `9144${rint(1000000000, 9999999999)}`, credit, days,
    empId[pick(['E003', 'E004', 'E005', 'E006', 'E007'])], '新客户',
    `${TODAY.getFullYear()}-${pad(rint(1, Math.max(1, TODAY.getMonth() + 1)))}-${pad(rint(1, 28))}`).lastInsertRowid;
  customerId.push(id);
  customerInfo.push({ id, name, level, days, region: area, code });
}
const EXTRA_SUPPLIERS = [
  ['深圳市宝安电子材料有限公司', '电子元器件', '华南', '月结30天', 'B'],
  ['东莞市长安五金电子有限公司', '结构件', '华南', '月结30天', 'C'],
  ['上海市嘉定传感器有限公司', '传感器', '华东', '月结60天', 'B'],
  ['广州市南沙包装制品有限公司', '包装材料', '华南', '月结30天', 'C'],
];
for (const [i, [name, category, region, terms, rating]] of EXTRA_SUPPLIERS.entries()) {
  const code = `GY${pad(SUPPLIERS.length + i + 1, 4)}`;
  const id = run(`INSERT INTO suppliers(code,name,short_name,category,region,address,contact,phone,email,tax_no,
      bank_name,bank_account,payment_terms,credit_days,rating,status,remark,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'正常',?,?)`,
    code, name, name.slice(0, 4), category, region,
    `${region}·工业园${rint(1, 30)}号`, pick(['吴经理', '郑总', '孙工']),
    `1${rint(30, 89)}${rint(10000000, 99999999)}`, `extra-sup${i + 1}@example.com`,
    `9144${rint(1000000000, 9999999999)}`, '中国银行', `6217${rint(10000000, 99999999)}${rint(1000, 9999)}`,
    terms, Number(String(terms).replace(/\D/g, '')) || 30, rating, '新供应商',
    `${TODAY.getFullYear()}-${pad(rint(1, Math.max(1, TODAY.getMonth() + 1)))}-${pad(rint(1, 28))}`).lastInsertRowid;
  supplierId.push(id);
  supplierInfo.push({ id, name, rating });
}
const EXTRA_ITEMS = [
  ['RM-LABEL01', '产品标签纸', '60×40mm 铜版纸', 'C07', '包装物', '卷', 6, 0, 13, 100],
  ['RM-BAG01', '防静电包装袋', '200×300mm 屏蔽袋', 'C07', '包装物', '个', 1.2, 0, 13, 500],
  ['RM-TIE01', '尼龙扎带', '3×100mm 白色', 'C07', '包装物', '包', 4.5, 0, 13, 100],
  ['RM-GLOVE01', '防静电手套', 'PU 涂层 均码', 'C07', '包装物', '双', 2.8, 0, 13, 200],
  ['RM-PAPER01', '办公打印纸', 'A4 70g 500张', 'C07', '包装物', '包', 22, 0, 13, 50],
  ['RM-CLEAN01', '清洁剂', '无水乙醇 500ml', 'C07', '包装物', '瓶', 12, 0, 13, 60],
];
for (const [i, [code, name, spec, cat, type, uom, buy, sale, tax, safety]] of EXTRA_ITEMS.entries()) {
  const id = run(`INSERT INTO items(code,name,spec,category_id,item_type,uom,brand,barcode,origin,
      price_purchase,price_sale,cost,tax_rate,safety_stock,max_stock,reorder_point,batch_control,status,remark)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    code, name, spec, catId[cat], type, uom, '云枢', `69${rint(100000000, 999999999)}`, '深圳',
    buy, sale, buy, tax, safety, safety * 4, safety * 2, 0, '启用', '').lastInsertRowid;
  itemId[code] = id;
  itemInfo[code] = { id, code, name, spec, uom, type, buy, sale, tax, safety };
}

// 工作中心 / 工序
const workCenters = [['WC01', 'SMT 贴片中心', 8, 220], ['WC02', '组装线', 8, 120], ['WC03', '测试中心', 8, 90], ['WC04', '包装线', 8, 60]];
const wcId = {};
for (const [code, name, cap, rate] of workCenters) {
  wcId[code] = run('INSERT INTO work_centers(code,name,type,capacity,cost_rate,status) VALUES(?,?,?,?,?,\'ENABLED\')',
    code, name, '加工中心', cap, rate).lastInsertRowid;
}
const processes = [['P01', 'SMT贴片', 'WC01', 0.5], ['P02', '回流焊', 'WC01', 0.3], ['P03', '组装', 'WC02', 1.2], ['P04', '老化测试', 'WC03', 0.8], ['P05', '包装', 'WC04', 0.3]];
const processId = {};
for (const [code, name, wc, hours] of processes) {
  processId[code] = run('INSERT INTO processes(code,name,work_center_id,standard_hours,description) VALUES(?,?,?,?,?)',
    code, name, wcId[wc], hours, '').lastInsertRowid;
}

// BOM
const BOMS = [
  { code: 'BOM-GW1000', name: '智能物联网网关 BOM', item: 'FG-GW1000', lines: [['SF-PCBA100', 1], ['RM-PWR01', 1], ['RM-CASE01', 1], ['RM-ANT01', 2], ['RM-CABLE01', 1], ['RM-SCREW01', 1], ['PK-BOX01', 1], ['PK-MANUAL01', 1], ['PK-FOAM01', 1]] },
  { code: 'BOM-GW2000', name: '边缘计算网关 BOM', item: 'FG-GW2000', lines: [['SF-PCBA200', 1], ['RM-PWR01', 1], ['RM-CASE01', 1], ['RM-ANT01', 2], ['RM-CABLE01', 1], ['RM-SCREW01', 1], ['PK-BOX01', 1], ['PK-MANUAL01', 1], ['PK-FOAM01', 1]] },
  { code: 'BOM-RT300', name: '温湿度传感器 BOM', item: 'FG-RT300', lines: [['RM-SENSOR01', 1], ['RM-PCB01', 0.2], ['RM-CASE01', 0.5], ['PK-BOX01', 1], ['PK-MANUAL01', 1]] },
  { code: 'BOM-RT500', name: '振动传感器 BOM', item: 'FG-RT500', lines: [['RM-ACC01', 1], ['RM-PCB01', 0.3], ['RM-CASE01', 0.5], ['PK-BOX01', 1], ['PK-MANUAL01', 1]] },
  { code: 'BOM-HMI700', name: '工业触摸屏一体机 BOM', item: 'FG-HMI700', lines: [['RM-LCD01', 1], ['RM-TOUCH01', 1], ['RM-HMI-CPU', 1], ['RM-CASE01', 1], ['RM-PWR01', 1], ['PK-BOX01', 1], ['PK-MANUAL01', 1]] },
  { code: 'BOM-PCBA100', name: '网关主板组件 BOM', item: 'SF-PCBA100', lines: [['RM-CPU01', 1], ['RM-4G01', 1], ['RM-PCB01', 1], ['RM-NET01', 2]] },
  { code: 'BOM-PCBA200', name: '边缘网关主板组件 BOM', item: 'SF-PCBA200', lines: [['RM-CPU01', 2], ['RM-4G01', 2], ['RM-PCB01', 1], ['RM-NET01', 4]] },
];
const bomId = {};
const bomLines = {};
for (const b of BOMS) {
  const id = run('INSERT INTO boms(code,name,item_id,version,output_qty,scrap_rate,process_id,status,remark) VALUES(?,?,?,?,?,?,?,?,?)',
    b.code, b.name, itemId[b.item], 'V1.0', 1, 2, processId.P03, '启用', '').lastInsertRowid;
  bomId[b.item] = id;
  bomLines[b.item] = b.lines;
  b.lines.forEach(([code, qty], i) => {
    run('INSERT INTO bom_lines(bom_id,item_id,qty,loss_rate,seq,remark) VALUES(?,?,?,?,?,?)',
      id, itemId[code], qty, 1, i + 1, '');
  });
}

// 会计科目（小企业会计准则）
const ACCOUNTS = [
  ['1001', '库存现金', 'ASSET', 'DEBIT'], ['1002', '银行存款', 'ASSET', 'DEBIT'],
  ['1012', '其他货币资金', 'ASSET', 'DEBIT'], ['1121', '应收票据', 'ASSET', 'DEBIT'],
  ['1122', '应收账款', 'ASSET', 'DEBIT'], ['1123', '预付账款', 'ASSET', 'DEBIT'],
  ['1221', '其他应收款', 'ASSET', 'DEBIT'], ['1231', '坏账准备', 'ASSET', 'CREDIT'],
  ['1401', '材料采购', 'ASSET', 'DEBIT'], ['1402', '在途物资', 'ASSET', 'DEBIT'],
  ['1403', '原材料', 'ASSET', 'DEBIT'], ['1405', '库存商品', 'ASSET', 'DEBIT'],
  ['1407', '商品进销差价', 'ASSET', 'CREDIT'], ['1408', '委托加工物资', 'ASSET', 'DEBIT'],
  ['1411', '周转材料', 'ASSET', 'DEBIT'], ['1471', '存货跌价准备', 'ASSET', 'CREDIT'],
  ['1601', '固定资产', 'ASSET', 'DEBIT'], ['1602', '累计折旧', 'ASSET', 'CREDIT'],
  ['1604', '在建工程', 'ASSET', 'DEBIT'], ['1701', '无形资产', 'ASSET', 'DEBIT'],
  ['1702', '累计摊销', 'ASSET', 'CREDIT'], ['1801', '长期待摊费用', 'ASSET', 'DEBIT'],
  ['1901', '待处理财产损溢', 'ASSET', 'DEBIT'],
  ['2001', '短期借款', 'LIABILITY', 'CREDIT'], ['2201', '应付票据', 'LIABILITY', 'CREDIT'],
  ['2202', '应付账款', 'LIABILITY', 'CREDIT'], ['2203', '预收账款', 'LIABILITY', 'CREDIT'],
  ['2211', '应付职工薪酬', 'LIABILITY', 'CREDIT'], ['2221', '应交税费', 'LIABILITY', 'CREDIT'],
  ['2231', '应付利息', 'LIABILITY', 'CREDIT'], ['2241', '其他应付款', 'LIABILITY', 'CREDIT'],
  ['2401', '递延收益', 'LIABILITY', 'CREDIT'],
  ['4001', '实收资本', 'EQUITY', 'CREDIT'], ['4002', '资本公积', 'EQUITY', 'CREDIT'],
  ['4101', '盈余公积', 'EQUITY', 'CREDIT'], ['4103', '本年利润', 'EQUITY', 'CREDIT'],
  ['4104', '利润分配', 'EQUITY', 'CREDIT'],
  ['5001', '生产成本', 'COST', 'DEBIT'], ['5101', '制造费用', 'COST', 'DEBIT'],
  ['5201', '劳务成本', 'COST', 'DEBIT'], ['5301', '研发支出', 'COST', 'DEBIT'],
  ['6001', '主营业务收入', 'INCOME', 'CREDIT'], ['6051', '其他业务收入', 'INCOME', 'CREDIT'],
  ['6111', '投资收益', 'INCOME', 'CREDIT'], ['6301', '营业外收入', 'INCOME', 'CREDIT'],
  ['6401', '主营业务成本', 'EXPENSE', 'DEBIT'], ['6402', '其他业务成本', 'EXPENSE', 'DEBIT'],
  ['6403', '税金及附加', 'EXPENSE', 'DEBIT'], ['6601', '销售费用', 'EXPENSE', 'DEBIT'],
  ['6602', '管理费用', 'EXPENSE', 'DEBIT'], ['6603', '财务费用', 'EXPENSE', 'DEBIT'],
  ['6604', '研发费用', 'EXPENSE', 'DEBIT'], ['6711', '营业外支出', 'EXPENSE', 'DEBIT'],
  ['6801', '所得税费用', 'EXPENSE', 'DEBIT'],
  ['222101', '应交税费—应交增值税（销项税额）', 'LIABILITY', 'CREDIT', '2221'],
  ['222102', '应交税费—应交增值税（进项税额）', 'LIABILITY', 'DEBIT', '2221'],
  ['222103', '应交税费—应交增值税（已交税金）', 'LIABILITY', 'DEBIT', '2221'],
  ['222104', '应交税费—应交企业所得税', 'LIABILITY', 'CREDIT', '2221'],
  ['222105', '应交税费—应交个人所得税', 'LIABILITY', 'CREDIT', '2221'],
];
for (const [code, name, category, direction, parent] of ACCOUNTS) {
  run('INSERT INTO accounts(code,name,category,direction,parent_code,level,is_leaf,status) VALUES(?,?,?,?,?,?,?,?)',
    code, name, category, direction, parent || null, parent ? 2 : 1, 1, '启用');
}
run("UPDATE accounts SET is_leaf = 0 WHERE code = '2221'");
const GL = {
  AR: '1122', AP: '2202', REVENUE: '6001', COGS: '6401', INVENTORY: '1405', RAW_MATERIAL: '1403',
  TAX_OUTPUT: '222101', TAX_INPUT: '222102', CASH: '1001', BANK: '1002', WIP: '5001', OVERHEAD: '5101',
  ASSET_PENDING: '1901', SALARY: '2211', FIN_EXPENSE: '6603', OTHER_INCOME: '6301', OTHER_EXPENSE: '6711',
};
for (const [k, v] of Object.entries(GL)) run('INSERT INTO gl_mappings(key,account_code,description) VALUES(?,?,?)', k, v, k);

ensureNumberSeries();

// ---------------- 单据生成 ----------------
let docSeqWarn = 0;
function headerDefaults(docType, { partnerId, warehouseId, toWarehouseId, date, extra = {} }) {
  const t = partnerId ? (docType === 'PO' || docType === 'GRN' || docType === 'PR' ? 'supplier' : 'customer') : null;
  let partner = null;
  if (t === 'customer') partner = get('SELECT * FROM customers WHERE id = ?', Number(partnerId));
  if (t === 'supplier') partner = get('SELECT * FROM suppliers WHERE id = ?', Number(partnerId));
  return {
    partner_type: t, partner_id: partnerId ?? null,
    contact: partner?.contact || '', phone: partner?.phone || '', address: partner?.address || '',
    salesperson_id: ['SO', 'DN', 'SR'].includes(docType) ? pick([empId.E003, empId.E004, empId.E005, empId.E006, empId.E007]) : null,
    department_id: ['SO', 'DN', 'SR'].includes(docType) ? deptId.D003 : docType === 'PO' || docType === 'GRN' ? deptId.D005 : null,
    warehouse_id: warehouseId ?? null, to_warehouse_id: toWarehouseId ?? null,
    currency: 'CNY', exchange_rate: 1,
    payment_terms: partner?.payment_terms || (partner?.credit_days ? `月结${partner.credit_days}天` : '月结30天'),
    due_date: null, project: '', remark: '',
    doc_date: date, ...extra,
  };
}

function insertDoc({ docType, date, partnerId, warehouseId, toWarehouseId, lines, extra = {}, status = 'APPROVED', source = {}, createdBy = 1 }) {
  const t = get('SELECT 1');
  const header = headerDefaults(docType, { partnerId, warehouseId, toWarehouseId, date, extra });
  const docNo = nextDocNo(docType, date);
  const isInvoiceMode = docType === 'RC' || docType === 'PY';
  const prepared = lines.map((l, i) => {
    if (isInvoiceMode) {
      const amt = r2(l.amount);
      return {
        line_no: i + 1, item_id: null, item_code: '', item_name: l.invoice_no || '核销发票',
        spec: '', uom: '', qty: 1, price: amt, discount_rate: 0, amount: amt,
        tax_rate: 0, tax_amount: 0, total_amount: amt, cost: 0, cost_amount: 0,
        warehouse_id: null, batch_no: '', delivered_qty: 0, invoiced_qty: 0,
        source_line_id: null, remark: l.remark || '',
        extra_json: JSON.stringify({ invoice_id: l.invoice_id }),
      };
    }
    const info = l.item_id ? get('SELECT * FROM items WHERE id = ?', Number(l.item_id)) : null;
    const qty = Number(l.qty) || 0;
    const price = Number(l.price) || 0;
    const disc = Number(l.discount_rate) || 0;
    const taxRate = Number(l.tax_rate ?? info?.tax_rate ?? 13);
    const amount = r2(qty * price * (1 - disc / 100));
    const taxAmount = r2(amount * taxRate / 100);
    return {
      line_no: i + 1, item_id: l.item_id, item_code: info?.code || '', item_name: info?.name || '',
      spec: info?.spec || '', uom: info?.uom || '', qty, price, discount_rate: disc, amount,
      tax_rate: taxRate, tax_amount: taxAmount, total_amount: r2(amount + taxAmount),
      cost: 0, cost_amount: 0, warehouse_id: l.warehouse_id ?? null, batch_no: l.batch_no || '',
      production_date: null, expiry_date: null, delivered_qty: 0, invoiced_qty: 0,
      source_line_id: l.source_line_id || null, remark: l.remark || '', extra_json: '{}',
    };
  });
  const subtotal = r2(prepared.reduce((s, l) => s + l.amount, 0));
  const taxAmount = r2(prepared.reduce((s, l) => s + l.tax_amount, 0));
  const totalAmount = r2(subtotal + taxAmount);
  const cols = ['doc_no', 'doc_type', 'doc_date', 'status', 'partner_type', 'partner_id', 'contact', 'phone',
    'address', 'salesperson_id', 'department_id', 'warehouse_id', 'to_warehouse_id', 'currency', 'exchange_rate',
    'payment_terms', 'due_date', 'project', 'source_type', 'source_id', 'source_no', 'remark',
    'subtotal', 'discount_amount', 'tax_amount', 'total_amount', 'extra_json', 'created_by', 'created_by_name',
    'approved_by', 'approved_at'];
  const vals = [docNo, docType, date, status, header.partner_type, header.partner_id, header.contact, header.phone,
    header.address, header.salesperson_id, header.department_id, header.warehouse_id, header.to_warehouse_id,
    header.currency, 1, header.payment_terms, header.due_date, header.project,
    source.source_type || null, source.source_id || null, source.source_no || null, header.remark,
    subtotal, 0, taxAmount, totalAmount, JSON.stringify(extra), createdBy,
    CREATOR_NAMES[createdBy] || '系统', status === 'APPROVED' ? 1 : null,
    status === 'APPROVED' ? `${date} 10:00:00` : null];
  const r = run(`INSERT INTO documents(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...vals);
  const docId = r.lastInsertRowid;
  const lineKeys = ['doc_id', 'line_no', 'item_id', 'item_code', 'item_name', 'spec', 'uom', 'qty', 'price',
    'discount_rate', 'amount', 'tax_rate', 'tax_amount', 'total_amount', 'cost', 'cost_amount', 'warehouse_id',
    'batch_no', 'production_date', 'expiry_date', 'delivered_qty', 'invoiced_qty', 'source_line_id', 'remark', 'extra_json'];
  for (const l of prepared) {
    run(`INSERT INTO document_lines(${lineKeys.join(',')}) VALUES (${lineKeys.map(() => '?').join(',')})`,
      docId, ...lineKeys.slice(1).map((k) => l[k]));
  }
  const doc = get('SELECT * FROM documents WHERE id = ?', docId);
  const linesDb = all('SELECT * FROM document_lines WHERE doc_id = ? ORDER BY line_no', docId);
  // 操作日志
  const creatorName = CREATOR_NAMES[createdBy] || '系统';
  run('INSERT INTO document_logs(doc_id,action,from_status,to_status,user_id,user_name,remark,created_at) VALUES(?,?,?,?,?,?,?,?)',
    docId, '创建', null, 'DRAFT', createdBy, creatorName, `新建${docType}单据`, `${date} 08:30:00`);
  if (status === 'SUBMITTED') {
    run('INSERT INTO document_logs(doc_id,action,from_status,to_status,user_id,user_name,remark,created_at) VALUES(?,?,?,?,?,?,?,?)',
      docId, '提交', 'DRAFT', 'SUBMITTED', createdBy, creatorName, '提交审批', `${date} 09:00:00`);
  }
  if (status === 'APPROVED') {
    run('INSERT INTO document_logs(doc_id,action,from_status,to_status,user_id,user_name,remark,created_at) VALUES(?,?,?,?,?,?,?,?)',
      docId, '提交', 'DRAFT', 'SUBMITTED', createdBy, creatorName, '提交审批', `${date} 09:00:00`);
    run('INSERT INTO document_logs(doc_id,action,from_status,to_status,user_id,user_name,remark,created_at) VALUES(?,?,?,?,?,?,?,?)',
      docId, '审核', 'SUBMITTED', 'APPROVED', 1, '张伟', '审核通过，已过账', `${date} 10:00:00`);
  }
  if (status === 'APPROVED') {
    doc.effect = { SO: null, DN: 'SALES_DELIVERY', SR: 'SALES_RETURN', PO: null, GRN: 'PURCHASE_RECEIPT', PR: 'PURCHASE_RETURN', TR: 'TRANSFER', ADJ: 'ADJUSTMENT', OI: 'OTHER_IN', OO: 'OTHER_OUT', RC: 'RECEIPT', PY: 'PAYMENT' }[docType];
    if (doc.effect) {
      const user = createdBy === 1 ? { id: 1, name: '张伟' } : usersByRole[createdBy] || { id: createdBy, name: '系统' };
      applyEffect(doc, linesDb, user);
    }
  }
  return { doc, lines: linesDb };
}

/** 生产工单：领料 + 完工入库 */
function createAndCompleteWorkOrder({ itemCode, qty, startDate, endDate, createdBy = 1 }) {
  const info = itemInfo[itemCode];
  const bom = bomLines[itemCode] || [];
  const orderNo = nextDocNo('MO', startDate);
  const woId = run(`INSERT INTO work_orders(order_no,item_id,bom_id,qty,completed_qty,scrap_qty,warehouse_id,material_wh_id,
      planned_start,planned_end,actual_start,actual_end,priority,status,remark,created_by,created_by_name,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'COMPLETED',?,1,'系统',?)`,
    orderNo, info.id, bomId[itemCode] || null, qty, qty, 0,
    info.type === '半成品' ? whId.WH03 : whId.WH02, whId.WH01, startDate, endDate, startDate, endDate, '普通', '', startDate + ' 08:00:00').lastInsertRowid;

  const user = { id: createdBy, name: createdBy === 1 ? '张伟' : '系统' };
  let materialCost = 0;
  const materialRows = [];
  for (const [code, per] of bom) {
    const mi = itemInfo[code];
    if (!mi) continue;
    const required = r2(qty * per * 1.02);
    const wh = mi.type === '半成品' ? whId.WH03 : whId.WH01;
    const rec = run('INSERT INTO work_order_materials(wo_id,item_id,item_code,item_name,uom,required_qty,issued_qty,unit_cost,warehouse_id) VALUES(?,?,?,?,?,?,?,?,?)',
      woId, mi.id, mi.code, mi.name, mi.uom, required, 0, 0, wh);
    const res = postMaterialIssue({ workOrder: { id: woId, order_no: orderNo }, itemId: mi.id, qty: required, warehouseId: wh, date: startDate, user });
    run('UPDATE work_order_materials SET issued_qty = ?, unit_cost = ? WHERE id = ?', required, res.unitCost, rec.lastInsertRowid);
    materialCost += res.amount;
    materialRows.push(required);
  }
  const unitCost = r2((materialCost * 1.18) / Math.max(1, qty)); // 材料 + 制造费用
  postProductionCompletion({
    workOrder: { id: woId, order_no: orderNo }, itemId: info.id, qty, unitCost,
    warehouseId: info.type === '半成品' ? whId.WH03 : whId.WH02, date: endDate, user,
  });
  run('INSERT INTO work_order_operations(wo_id,seq,process_name,work_center_id,planned_hours,actual_hours,status,operator) VALUES(?,1,?,?,?,?,?,?)',
    woId, 'SMT贴片', wcId.WC01, qty * 0.05, qty * 0.055, '已完成', '徐明');
  run('INSERT INTO work_order_operations(wo_id,seq,process_name,work_center_id,planned_hours,actual_hours,status,operator) VALUES(?,2,?,?,?,?,?,?)',
    woId, '组装', wcId.WC02, qty * 0.12, qty * 0.125, '已完成', '朱琳');
  run('INSERT INTO work_order_operations(wo_id,seq,process_name,work_center_id,planned_hours,actual_hours,status,operator) VALUES(?,3,?,?,?,?,?,?)',
    woId, '老化测试', wcId.WC03, qty * 0.08, qty * 0.08, '已完成', '高翔');
  return { id: woId, orderNo, unitCost };
}

/** 生产工单（未完工状态）：用于演示下达、领料、完工等操作流程 */
function createOpenWorkOrder({ itemCode, qty, status = 'RELEASED', issueRatio = 0, startDate, endDate, createdBy = 1 }) {
  const info = itemInfo[itemCode];
  const bom = bomLines[itemCode] || [];
  const orderNo = nextDocNo('MO', startDate);
  const woId = run(`INSERT INTO work_orders(order_no,item_id,bom_id,qty,completed_qty,scrap_qty,warehouse_id,material_wh_id,
      planned_start,planned_end,actual_start,actual_end,priority,status,remark,created_by,created_by_name,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    orderNo, info.id, bomId[itemCode] || null, qty, 0, 0,
    info.type === '半成品' ? whId.WH03 : whId.WH02, whId.WH01, startDate, endDate,
    status === 'IN_PROGRESS' ? startDate : null, null,
    status === 'IN_PROGRESS' ? '高' : '普通', status, '', createdBy, CREATOR_NAMES[createdBy] || '系统', `${TODAY_STR} 08:00:00`).lastInsertRowid;
  const user = { id: createdBy, name: CREATOR_NAMES[createdBy] || '系统' };
  for (const [code, per] of bom) {
    const mi = itemInfo[code];
    if (!mi) continue;
    const required = r2(qty * per * 1.02);
    const wh = mi.type === '半成品' ? whId.WH03 : whId.WH01;
    const rec = run('INSERT INTO work_order_materials(wo_id,item_id,item_code,item_name,uom,required_qty,issued_qty,unit_cost,warehouse_id) VALUES(?,?,?,?,?,?,?,?,?)',
      woId, mi.id, mi.code, mi.name, mi.uom, required, 0, 0, wh);
    if (issueRatio > 0) {
      const issueQty = r2(required * issueRatio);
      const res = postMaterialIssue({ workOrder: { id: woId, order_no: orderNo }, itemId: mi.id, qty: issueQty, warehouseId: wh, date: startDate, user });
      run('UPDATE work_order_materials SET issued_qty = ?, unit_cost = ? WHERE id = ?', issueQty, res.unitCost, rec.lastInsertRowid);
    }
  }
  run('INSERT INTO work_order_operations(wo_id,seq,process_name,work_center_id,planned_hours,actual_hours,status,operator) VALUES(?,1,?,?,?,?,?,?)',
    woId, 'SMT贴片', wcId.WC01, qty * 0.05, status === 'IN_PROGRESS' ? qty * 0.03 : 0, status === 'IN_PROGRESS' ? '进行中' : '待开始', '徐明');
  run('INSERT INTO work_order_operations(wo_id,seq,process_name,work_center_id,planned_hours,actual_hours,status,operator) VALUES(?,2,?,?,?,?,?,?)',
    woId, '组装', wcId.WC02, qty * 0.12, 0, '待开始', '朱琳');
  run('INSERT INTO work_order_operations(wo_id,seq,process_name,work_center_id,planned_hours,actual_hours,status,operator) VALUES(?,3,?,?,?,?,?,?)',
    woId, '老化测试', wcId.WC03, qty * 0.08, 0, '待开始', '高翔');
  return woId;
}

// ---------------- 历史业务 ----------------
const PRODUCT_PLAN = {
  'FG-GW1000': 330, 'FG-GW2000': 130, 'FG-RT300': 650, 'FG-RT500': 330, 'FG-HMI700': 65,
};
const AR_INVOICES_BY_MONTH = {};
const AP_INVOICES_BY_MONTH = {};

console.log('  正在生成 12 个月历史业务数据 ...');
const t0 = Date.now();

tx(() => {
  // 期初投资
  postVoucher({
    date: TODAY_STR < '2026-01-01' ? `${TODAY.getFullYear() - 1}-11-01` : `${TODAY.getFullYear()}-01-01`,
    period: (TODAY_STR < '2026-01-01' ? `${TODAY.getFullYear() - 1}-11` : `${TODAY.getFullYear()}-01`),
    sourceType: 'OPENING', sourceId: 0, summary: '期初建账：实收资本与固定资产',
    voucherType: 'MANUAL', user: { id: 1, name: '张伟' },
    lines: [
      { account_code: '1002', summary: '期初银行存款', debit: 8000000, credit: 0 },
      { account_code: '1601', summary: '期初固定资产', debit: 1500000, credit: 0 },
      { account_code: '4001', summary: '实收资本', debit: 0, credit: 8000000 },
      { account_code: '1002', summary: '购置固定资产', debit: 0, credit: 1500000 },
    ],
  });

  for (let mi = 0; mi < MONTHS.length; mi++) {
    const m = MONTHS[mi];
    const factor = m.factor;
    const targetQty = Object.fromEntries(Object.entries(PRODUCT_PLAN).map(([k, v]) => [k, Math.max(1, Math.round(v * factor))]));

    // 1) 原材料采购入库（先采购，保证后续生产有料）
    const rawNeed = {};
    for (const [fg, qty] of Object.entries(targetQty)) {
      for (const [code, per] of (bomLines[fg] || [])) {
        if (itemInfo[code]?.type === '成品' || itemInfo[code]?.type === '半成品') continue;
        rawNeed[code] = (rawNeed[code] || 0) + qty * per;
      }
    }
    // 半成品消耗的原料也算进去（PCBA 生产需要）
    for (const [code, qty] of Object.entries(targetQty)) {
      if (!code.startsWith('FG-')) continue;
      for (const [sf, per] of (bomLines[code] || [])) {
        if (itemInfo[sf]?.type !== '半成品') continue;
        for (const [rc, rper] of (bomLines[sf] || [])) {
          rawNeed[rc] = (rawNeed[rc] || 0) + qty * per * rper;
        }
      }
    }
    const bySupplier = {};
    for (const [code, need] of Object.entries(rawNeed)) {
      const qty = Math.max(1, Math.round(need * 1.18));
      const supName = SUPPLY_MAP[code];
      if (!supName) continue;
      const sup = supplierByName[supName];
      if (!sup) continue;
      bySupplier[sup.id] = bySupplier[sup.id] || [];
      bySupplier[sup.id].push({ code, qty, price: itemInfo[code].buy, tax: 13 });
    }
    for (const [supId, lines] of Object.entries(bySupplier)) {
      const poDate = dstr(m.y, m.m, dayIn(m, 1));
      const poLines = lines.map((l) => ({ item_id: itemId[l.code], qty: l.qty, price: l.price, tax_rate: 13 }));
      const po = insertDoc({ docType: 'PO', date: poDate, partnerId: Number(supId), warehouseId: whId.WH01, lines: poLines, createdBy: 4 });
      const grnDate = dstr(m.y, m.m, dayIn(m, 2));
      const grnLines = po.lines.map((l) => ({
        item_id: l.item_id, qty: l.qty, price: l.price, tax_rate: 13, source_line_id: l.id,
      }));
      const grn = insertDoc({
        docType: 'GRN', date: grnDate, partnerId: Number(supId), warehouseId: whId.WH01, lines: grnLines,
        source: { source_type: 'PO', source_id: po.doc.id, source_no: po.doc.doc_no }, createdBy: 5,
      });
      const apInv = get(`SELECT * FROM invoices WHERE doc_id = ? AND invoice_type='AP'`, grn.doc.id);
      if (apInv) {
        apInv.partner_name = supplierInfo.find((s) => s.id === Number(supId))?.name;
        AP_INVOICES_BY_MONTH[mi] = AP_INVOICES_BY_MONTH[mi] || [];
        AP_INVOICES_BY_MONTH[mi].push(apInv);
      }
    }

    // 2) 半成品生产（PCBA）：原料仓领料 → 半成品仓入库
    for (const [code, formula] of [['SF-PCBA100', (q) => Math.round(q * 1.06)], ['SF-PCBA200', (q) => Math.round(q * 1.06)]]) {
      const need = code === 'SF-PCBA100' ? formula(targetQty['FG-GW1000']) : formula(targetQty['FG-GW2000']);
      const batches = need > 200 ? 2 : 1;
      for (let b = 0; b < batches; b++) {
        const qty = Math.round(need / batches);
        createAndCompleteWorkOrder({
          itemCode: code, qty,
          startDate: dstr(m.y, m.m, dayIn(m, 3 + b * 2)),
          endDate: dstr(m.y, m.m, dayIn(m, 4 + b * 2)),
        });
      }
    }

    // 3) 成品生产
    for (const [code, qty] of Object.entries(targetQty)) {
      const batches = qty > 250 ? 3 : qty > 80 ? 2 : 1;
      for (let b = 0; b < batches; b++) {
        const q = Math.max(1, Math.round(qty / batches));
        createAndCompleteWorkOrder({
          itemCode: code, qty: q,
          startDate: dstr(m.y, m.m, dayIn(m, 6 + b * 3)),
          endDate: dstr(m.y, m.m, dayIn(m, 8 + b * 3)),
        });
      }
    }

    // 4) 销售发货
    const salesOrders = Math.max(6, Math.round(11 * factor));
    let remaining = { ...targetQty };
    for (let s = 0; s < salesOrders; s++) {
      const cust = pick(customerInfo);
      const codes = Object.keys(targetQty).filter((c) => remaining[c] > 0);
      if (!codes.length) break;
      const nLines = Math.min(codes.length, rint(1, 3));
      const chosen = pickMany(codes, nLines);
      const soLines = [];
      for (const code of chosen) {
        const remain = remaining[code];
        const qty = s === salesOrders - 1 ? remain : Math.max(1, Math.min(remain, Math.round(remain / 2)));
        remaining[code] = Math.max(0, remain - qty);
        const info = itemInfo[code];
        const disc = chance(0.25) ? pick([2, 3, 5]) : 0;
        soLines.push({ item_id: itemId[code], qty, price: info.sale, tax_rate: 13, discount_rate: disc });
      }
        const day = dayIn(m, 14 + Math.floor((s / salesOrders) * 14));
      const so = insertDoc({
        docType: 'SO', date: dstr(m.y, m.m, day), partnerId: cust.id, warehouseId: whId.WH02,
        lines: soLines, createdBy: 3,
        extra: { x_sale_type: '标准销售', x_order_source: pick(['业务员', '官网', '老客户转介绍', '展会']) },
      });
      const dnLines = so.lines.map((l) => ({
        item_id: l.item_id, qty: l.qty, price: l.price, tax_rate: l.tax_rate, discount_rate: l.discount_rate,
        source_line_id: l.id,
      }));
      const dn = insertDoc({
        docType: 'DN', date: dstr(m.y, m.m, Math.min(day + rint(0, 2), isCurrentMonth(m) ? TODAY.getDate() : m.lastDay)),
        partnerId: cust.id, warehouseId: whId.WH02, lines: dnLines,
        source: { source_type: 'SO', source_id: so.doc.id, source_no: so.doc.doc_no }, createdBy: 3,
        extra: { x_logistics: pick(['顺丰速运', '德邦物流', '京东物流', '中通快运']), x_tracking_no: `SF${rint(1000000000, 9999999999)}` },
      });
      const arInv = get(`SELECT * FROM invoices WHERE doc_id = ? AND invoice_type='AR'`, dn.doc.id);
      if (arInv) {
        arInv.partner_name = cust.name;
        AR_INVOICES_BY_MONTH[mi] = AR_INVOICES_BY_MONTH[mi] || [];
        AR_INVOICES_BY_MONTH[mi].push(arInv);
      }
    }

    // 5) 偶发业务：调拨 / 盘点 / 其他出入库 / 退货
    if (chance(0.7)) {
      const code = pick(['FG-GW1000', 'FG-RT300', 'FG-GW2000']);
      insertDoc({
        docType: 'TR', date: dstr(m.y, m.m, dayIn(m, 20)), warehouseId: whId.WH02, toWarehouseId: whId.WH01,
        lines: [{ item_id: itemId[code], qty: rint(2, 8) }], createdBy: 5, extra: { x_handler: '赵敏' },
      });
    }
    if (chance(0.5)) {
      const code = pick(['FG-RT300', 'FG-RT500', 'RM-PCB01']);
      const bal = get('SELECT SUM(qty) AS q FROM stock_balances WHERE item_id = ?', itemId[code])?.q || 0;
      insertDoc({
        docType: 'ADJ', date: dstr(m.y, m.m, dayIn(m, 27)), warehouseId: whId.WH02,
        lines: [{ item_id: itemId[code], qty: Math.max(0, Math.round(bal * 0.995)) }], createdBy: 5,
        extra: { x_stocktake_type: '循环盘点', x_handler: '罗刚' },
      });
    }
    if (chance(0.4)) {
      insertDoc({
        docType: 'OI', date: dstr(m.y, m.m, dayIn(m, 15)), warehouseId: whId.WH02,
        lines: [{ item_id: itemId['FG-RT300'], qty: rint(2, 10), price: itemInfo['FG-RT300'].buy || 210 }],
        createdBy: 5, extra: { x_in_type: '样品入库' },
      });
    }
    if (chance(0.35)) {
      insertDoc({
        docType: 'OO', date: dstr(m.y, m.m, dayIn(m, 18)), warehouseId: whId.WH02,
        lines: [{ item_id: itemId['FG-GW1000'], qty: rint(1, 3) }], createdBy: 5, extra: { x_out_type: '样品出库' },
      });
    }
    if (chance(0.45)) {
      const cust = pick(customerInfo);
      insertDoc({
        docType: 'SR', date: dstr(m.y, m.m, dayIn(m, 24)), partnerId: cust.id, warehouseId: whId.WH02,
        lines: [{ item_id: itemId['FG-RT300'], qty: rint(1, 4), price: itemInfo['FG-RT300'].sale, tax_rate: 13 }],
        createdBy: 3, extra: { x_return_reason: '质量问题' },
      });
    }
    if (chance(0.3)) {
      const sup = pick(supplierInfo);
      insertDoc({
        docType: 'PR', date: dstr(m.y, m.m, dayIn(m, 21)), partnerId: sup.id, warehouseId: whId.WH01,
        lines: [{ item_id: itemId['RM-PCB01'], qty: rint(2, 10), price: itemInfo['RM-PCB01'].buy, tax_rate: 13 }],
        createdBy: 5, extra: { x_return_reason: '规格不符' },
      });
    }

    // 6) 收款 / 付款（结算上月及本月到期发票）
    const settleAR = all(`SELECT * FROM invoices WHERE invoice_type='AR' AND status NOT IN ('已收','已核销','已作废')
        AND due_date <= ? ORDER BY due_date LIMIT 14`, m.end);
    for (const inv of settleAR) {
      if (!chance(0.85)) continue;
      const remain = r2(inv.total_amount - inv.paid_amount);
      if (remain <= 0) continue;
      const amt = chance(0.75) ? remain : r2(remain * 0.5);
      const cust = customerInfo.find((c) => c.id === inv.partner_id);
      insertDoc({
        docType: 'RC', date: dstr(m.y, m.m, dayIn(m, rint(15, 28))), partnerId: inv.partner_id,
        lines: [{ invoice_id: inv.id, amount: amt }], createdBy: 6,
        extra: { x_settle_method: '银行转账', x_bank_account: '招商银行 7559****5678' },
      });
    }
    const settleAP = all(`SELECT * FROM invoices WHERE invoice_type='AP' AND status NOT IN ('已付','已核销','已作废')
        AND due_date <= ? ORDER BY due_date LIMIT 10`, m.end);
    for (const inv of settleAP) {
      if (!chance(0.9)) continue;
      const remain = r2(inv.total_amount - inv.paid_amount);
      if (remain <= 0) continue;
      insertDoc({
        docType: 'PY', date: dstr(m.y, m.m, dayIn(m, rint(20, 28))), partnerId: inv.partner_id,
        lines: [{ invoice_id: inv.id, amount: remain }], createdBy: 6,
        extra: { x_settle_method: '银行转账', x_bank_account: '招商银行 7559****5678' },
      });
    }

    // 7) 月度费用凭证
    const salaryTotal = r2(EMPLOYEES.reduce((s, e) => s + e[5], 0));
    const monthDate = dstr(m.y, m.m, dayIn(m, 25));
    const period = m.period;
    const user = { id: 6, name: '周婷' };
    postVoucher({
      date: dstr(m.y, m.m, dayIn(m, 28)), period, sourceType: 'SALARY', sourceId: mi + 1, summary: `${period} 计提工资`, user,
      lines: [
        { account_code: '6602', summary: '管理费用—工资', debit: r2(salaryTotal * 0.62), credit: 0 },
        { account_code: '6601', summary: '销售费用—工资', debit: r2(salaryTotal * 0.26), credit: 0 },
        { account_code: '6604', summary: '研发费用—工资', debit: r2(salaryTotal * 0.12), credit: 0 },
        { account_code: '2211', summary: '应付职工薪酬', debit: 0, credit: salaryTotal },
      ],
    });
    postVoucher({
      date: dstr(m.y, m.m, dayIn(m, 2)), period, sourceType: 'SALARY_PAY', sourceId: mi + 1, summary: `${period} 发放工资`, user,
      lines: [
        { account_code: '2211', summary: '发放职工薪酬', debit: salaryTotal, credit: 0 },
        { account_code: '1002', summary: '银行代发工资', debit: 0, credit: salaryTotal },
      ],
    });
    postVoucher({
      date: monthDate, period, sourceType: 'FEE', sourceId: mi + 1, summary: `${period} 折旧`, user,
      lines: [
        { account_code: '6602', summary: '管理费用—折旧', debit: 25000, credit: 0 },
        { account_code: '1602', summary: '累计折旧', debit: 0, credit: 25000 },
      ],
    });
    postVoucher({
      date: monthDate, period, sourceType: 'FEE', sourceId: mi + 1, summary: `${period} 房租水电`, user,
      lines: [
        { account_code: '6602', summary: '管理费用—房租水电', debit: 128000, credit: 0 },
        { account_code: '1002', summary: '银行支付房租', debit: 0, credit: 128000 },
      ],
    });
    postVoucher({
      date: monthDate, period, sourceType: 'FEE', sourceId: mi + 1, summary: `${period} 销售运费及市场费用`, user,
      lines: [
        { account_code: '6601', summary: '销售费用—运费/推广', debit: 96000, credit: 0 },
        { account_code: '1002', summary: '银行支付', debit: 0, credit: 96000 },
      ],
    });
    postVoucher({
      date: monthDate, period, sourceType: 'FEE', sourceId: mi + 1, summary: `${period} 研发材料及差旅`, user,
      lines: [
        { account_code: '6604', summary: '研发费用', debit: 85000, credit: 0 },
        { account_code: '6602', summary: '管理费用—差旅招待', debit: 42000, credit: 0 },
        { account_code: '1002', summary: '银行支付', debit: 0, credit: 127000 },
      ],
    });
  }

  // ---------------- 当前待办单据（演示审批流） ----------------
  const cur = MONTHS[MONTHS.length - 1];
  const draftDay = Math.max(1, TODAY.getDate() - 2);
  for (let i = 0; i < 2; i++) {
    const cust = customerInfo[i];
    const so = insertDoc({
      docType: 'SO', date: dstr(cur.y, cur.m, draftDay), partnerId: cust.id, warehouseId: whId.WH02,
      lines: [{ item_id: itemId['FG-GW2000'], qty: rint(5, 20), price: itemInfo['FG-GW2000'].sale, tax_rate: 13 }],
      status: 'DRAFT', createdBy: 3, extra: { x_sale_type: '标准销售', x_order_source: '官网' },
    });
    if (i === 0) {
      run("UPDATE documents SET status='SUBMITTED', submitted_by=3, submitted_at=datetime('now','localtime') WHERE id=?", so.doc.id);
    }
  }
  const poSup = supplierInfo[0];
  insertDoc({
    docType: 'PO', date: dstr(cur.y, cur.m, Math.max(1, TODAY.getDate() - 1)), partnerId: poSup.id, warehouseId: whId.WH01,
    lines: [{ item_id: itemId['RM-CPU01'], qty: 400, price: itemInfo['RM-CPU01'].buy, tax_rate: 13 }],
    status: 'SUBMITTED', createdBy: 4, extra: { x_purchase_type: '原材料采购' },
  });
  insertDoc({
    docType: 'TR', date: dstr(cur.y, cur.m, Math.max(1, TODAY.getDate() - 1)), warehouseId: whId.WH02,
    toWarehouseId: whId.WH03, lines: [{ item_id: itemId['FG-RT500'], qty: 6 }], status: 'DRAFT', createdBy: 5,
  });
  insertDoc({
    docType: 'ADJ', date: dstr(cur.y, cur.m, Math.max(1, TODAY.getDate() - 3)), warehouseId: whId.WH01,
    lines: [{ item_id: itemId['RM-ANT01'], qty: 900 }], status: 'DRAFT', createdBy: 5,
    extra: { x_stocktake_type: '抽盘', x_handler: '罗刚' },
  });
  // ---------------- 历史单据状态多元化（演示各类状态与审批流） ----------------
  const soShipped = all("SELECT id FROM documents WHERE doc_type='SO' AND status='FULL_SHIPPED' ORDER BY id DESC LIMIT 30");
  soShipped.slice(0, 16).forEach((d) => run("UPDATE documents SET status='COMPLETED', closed_at=doc_date WHERE id=?", d.id));
  soShipped.slice(16, 22).forEach((d) => run("UPDATE documents SET status='CLOSED', closed_at=doc_date WHERE id=?", d.id));
  const poReceived = all("SELECT id FROM documents WHERE doc_type='PO' AND status='FULL_RECEIVED' ORDER BY id DESC LIMIT 20");
  poReceived.slice(0, 10).forEach((d) => run("UPDATE documents SET status='COMPLETED', closed_at=doc_date WHERE id=?", d.id));
  poReceived.slice(10, 15).forEach((d) => run("UPDATE documents SET status='CLOSED', closed_at=doc_date WHERE id=?", d.id));
  // 部分发货 / 部分入库演示（回退已执行数量，仅影响展示状态）
  for (const row of all("SELECT d.id FROM documents d WHERE d.doc_type='SO' AND d.status='FULL_SHIPPED' AND (SELECT COUNT(*) FROM document_lines l WHERE l.doc_id=d.id) >= 2 ORDER BY d.id DESC LIMIT 4")) {
    const line = get('SELECT * FROM document_lines WHERE doc_id=? ORDER BY line_no LIMIT 1', row.id);
    if (line && line.delivered_qty > 0) {
      run('UPDATE document_lines SET delivered_qty=? WHERE id=?', Math.max(0, Math.round(line.delivered_qty * 0.55)), line.id);
      run("UPDATE documents SET status='PARTIAL_SHIPPED', closed_at=NULL WHERE id=?", row.id);
    }
  }
  for (const row of all("SELECT d.id FROM documents d WHERE d.doc_type='PO' AND d.status='FULL_RECEIVED' AND (SELECT COUNT(*) FROM document_lines l WHERE l.doc_id=d.id) >= 2 ORDER BY d.id DESC LIMIT 4")) {
    const line = get('SELECT * FROM document_lines WHERE doc_id=? ORDER BY line_no LIMIT 1', row.id);
    if (line && line.delivered_qty > 0) {
      run('UPDATE document_lines SET delivered_qty=? WHERE id=?', Math.max(0, Math.round(line.delivered_qty * 0.5)), line.id);
      run("UPDATE documents SET status='PARTIAL_RECEIVED', closed_at=NULL WHERE id=?", row.id);
    }
  }
  // 已作废示例
  for (const row of all("SELECT id FROM documents WHERE status='DRAFT' AND doc_type IN ('OI','OO','TR') ORDER BY id DESC LIMIT 2")) {
    run("UPDATE documents SET status='VOID', voided_at=datetime('now','localtime') WHERE id=?", row.id);
  }

  // 未完结生产工单（演示下达/领料/完工流程与排产看板）
  const openDay = Math.max(1, TODAY.getDate() - 6);
  createOpenWorkOrder({
    itemCode: 'FG-HMI700', qty: 30, status: 'RELEASED', issueRatio: 0,
    startDate: dstr(TODAY.getFullYear(), TODAY.getMonth() + 1, Math.min(28, openDay + 4)),
    endDate: dstr(TODAY.getFullYear(), TODAY.getMonth() + 1, Math.min(28, openDay + 9)),
  });
  createOpenWorkOrder({
    itemCode: 'FG-GW2000', qty: 40, status: 'IN_PROGRESS', issueRatio: 0.6,
    startDate: dstr(TODAY.getFullYear(), TODAY.getMonth() + 1, Math.max(1, openDay)),
    endDate: dstr(TODAY.getFullYear(), TODAY.getMonth() + 1, Math.min(28, openDay + 6)),
  });
  createOpenWorkOrder({
    itemCode: 'FG-RT300', qty: 120, status: 'RELEASED', issueRatio: 0,
    startDate: dstr(TODAY.getFullYear(), TODAY.getMonth() + 1, Math.min(28, openDay + 6)),
    endDate: dstr(TODAY.getFullYear(), TODAY.getMonth() + 1, Math.min(28, openDay + 12)),
  });
  createOpenWorkOrder({
    itemCode: 'FG-RT500', qty: 60, status: 'DRAFT', issueRatio: 0,
    startDate: dstr(TODAY.getFullYear(), TODAY.getMonth() + 1, Math.min(28, openDay + 8)),
    endDate: dstr(TODAY.getFullYear(), TODAY.getMonth() + 1, Math.min(28, openDay + 14)),
  });

  // 制单人与业务员归属对齐（用于演示"本人数据范围"：销售专员只能看到自己负责/创建的单据）
  const SALES_USER_BY_EMP = { 3: 3, 2: 2 }; // 员工 → 用户：李强(3)→liqiang、陈静(2)→chenjing，其余归管理员
  for (const d of all("SELECT id, salesperson_id FROM documents WHERE doc_type IN ('SO','DN','SR')")) {
    const uid = SALES_USER_BY_EMP[d.salesperson_id] || 1;
    run('UPDATE documents SET created_by = ?, created_by_name = ? WHERE id = ?', uid, CREATOR_NAMES[uid] || '张伟', d.id);
    run('UPDATE document_logs SET user_id = ?, user_name = ? WHERE doc_id = ?', uid, CREATOR_NAMES[uid] || '张伟', d.id);
  }

  console.log(`  历史单据生成完成，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
});

// ---------------- CRM ----------------
const LEAD_NAMES = ['智慧园区物联网改造', '工业设备远程运维', '生产线数据采集', '能耗监测系统', '冷链温湿度监控',
  '智能仓储升级', '设备预测性维护', '工厂数字化看板', 'AGV调度系统', '环境监测平台',
  '配电房智能巡检', '食品追溯系统', '水务管网监测', '光伏电站监控'];
for (const [i, name] of LEAD_NAMES.entries()) {
  run(`INSERT INTO leads(name,company,contact,phone,email,source,status,owner_id,expected_amount,next_follow_at,remark,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    name, customerInfo[i % customerInfo.length].name, pick(['王经理', '李工', '张总']), `1${rint(30, 89)}${rint(10000000, 99999999)}`,
    `lead${i + 1}@example.com`, pick(['官网咨询', '展会', '电话拜访', '转介绍', '广告投放']),
    pick(['待跟进', '已联系', '已确认商机', '待跟进', '已转客户']), empId[pick(['E003', 'E004', 'E005', 'E006'])],
    rint(50, 800) * 1000, dstr(TODAY.getFullYear(), TODAY.getMonth() + 1, Math.min(28, TODAY.getDate() + rint(1, 7))),
    '客户对工业物联网方案有明确需求', `${TODAY.getFullYear()}-${pad(rint(1, TODAY.getMonth() + 1))}-${pad(rint(1, 28))}`);
}
for (let i = 0; i < 9; i++) {
  const c = customerInfo[i];
  const stage = pick(['初步接洽', '需求确认', '方案报价', '商务谈判', '赢单', '输单']);
  run(`INSERT INTO opportunities(name,customer_id,amount,stage,probability,expected_close_date,owner_id,status,remark,created_at)
    VALUES(?,?,?,?,?,?,?,?,'',?)`,
    `${c.name.slice(0, 6)}${pick(['智能网关采购', '传感器部署', '工控机项目', '数字化改造'])}`, c.id,
    rint(80, 900) * 1000, stage, { 初步接洽: 20, 需求确认: 40, 方案报价: 60, 商务谈判: 80, 赢单: 100, 输单: 0 }[stage],
    dstr(TODAY.getFullYear(), TODAY.getMonth() + 1, Math.min(28, TODAY.getDate() + rint(5, 40))),
    empId[pick(['E003', 'E004', 'E005', 'E006', 'E007'])], stage === '赢单' ? '已赢单' : stage === '输单' ? '已输单' : '进行中',
    `${TODAY.getFullYear()}-${pad(rint(1, TODAY.getMonth() + 1))}-${pad(rint(1, 28))}`);
}
// 商机阶段分布（含赢单/输单）
run("UPDATE opportunities SET stage='赢单', probability=100, status='已赢单' WHERE id IN (SELECT id FROM opportunities ORDER BY id LIMIT 2)");
run("UPDATE opportunities SET stage='输单', probability=0, status='已输单' WHERE id IN (SELECT id FROM opportunities ORDER BY id DESC LIMIT 1)");
for (let i = 0; i < 30; i++) {
  const refType = pick(['LEAD', 'CUSTOMER', 'OPPORTUNITY']);
  const refId = refType === 'LEAD' ? i + 1 : refType === 'CUSTOMER' ? customerId[i % customerId.length] : (i % 9) + 1;
  run(`INSERT INTO crm_activities(ref_type,ref_id,activity_type,subject,content,activity_at,owner_id,created_at)
    VALUES(?,?,?,?,?,?,?,?)`,
    refType, refId, pick(['电话沟通', '上门拜访', '邮件往来', '会议', '演示']),
    pick(['初次联系', '方案沟通', '报价跟进', '合同细节确认', '售后回访']),
    pick(['客户反馈良好，等待内部评审', '已发送方案与报价单', '约定下周现场演示', '确认采购预算与时间节点', '客户对交付周期有要求']),
    `${dstr(TODAY.getFullYear(), Math.max(1, TODAY.getMonth() + 1 - rint(0, 1)), rint(1, 28))} ${pad(rint(9, 18))}:${pad(rint(0, 59))}`,
    empId[pick(['E003', 'E004', 'E005', 'E006', 'E007'])],
    `${TODAY.getFullYear()}-${pad(rint(1, TODAY.getMonth() + 1))}-${pad(rint(1, 28))} 10:00:00`);
}
for (let i = 0; i < 6; i++) {
  const c = customerInfo[i * 2];
  run(`INSERT INTO contracts(contract_no,name,customer_id,amount,sign_date,start_date,end_date,status,owner_id,remark,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    `HT${TODAY.getFullYear()}${pad(i + 1, 4)}`, `${c.name.slice(0, 6)}年度框架采购合同`, c.id,
    rint(200, 1500) * 1000, dstr(TODAY.getFullYear(), Math.max(1, TODAY.getMonth() - rint(0, 3)), rint(1, 28)),
    dstr(TODAY.getFullYear(), 1, 1), dstr(TODAY.getFullYear(), 12, 31),
    pick(['执行中', '执行中', '已完成']), empId[pick(['E003', 'E004'])], '框架采购协议',
    `${TODAY_STR} 09:00:00`);
}

// ---------------- HR 考勤 / 薪资 ----------------
const curMonth = TODAY.getMonth() + 1;
const workDays = [];
for (let d = 1; d <= TODAY.getDate(); d++) {
  const dt = new Date(TODAY.getFullYear(), curMonth - 1, d);
  const wd = dt.getDay();
  if (wd !== 0 && wd !== 6) workDays.push(d);
}
for (const code of Object.keys(empId)) {
  for (const d of workDays) {
    const status = chance(0.92) ? '正常' : pick(['迟到', '早退', '请假', '出差', '加班']);
    run(`INSERT OR IGNORE INTO attendances(employee_id,work_date,status,check_in,check_out,work_hours,overtime_hours,remark)
      VALUES(?,?,?,?,?,?,?,?)`,
      empId[code], dstr(TODAY.getFullYear(), curMonth, d), status,
      status === '迟到' ? '09:1' + rint(0, 9) : '08:5' + rint(0, 9),
      status === '加班' ? '20:3' + rint(0, 9) : '18:0' + rint(0, 9),
      status === '请假' || status === '缺勤' ? 0 : status === '加班' ? 10.5 : 8,
      status === '加班' ? 2.5 : 0, status === '请假' ? '事假 1 天' : '');
  }
}
for (let back = 1; back <= 2; back++) {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - back, 1);
  const period = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  for (const code of Object.keys(empId)) {
    const emp = EMPLOYEES.find((e) => e[0] === code);
    const base = emp[5];
    const bonus = r2(base * (0.05 + rnd() * 0.15));
    const overtime = r2(base / 21.75 / 8 * rint(0, 12) * 1.5);
    const allowance = pick([300, 500, 800]);
    const social = r2(base * 0.105);
    const fund = r2(base * 0.05);
    const taxable = base + bonus + overtime + allowance - social - fund - 5000;
    const tax = taxable > 0 ? r2(taxable * 0.03) : 0;
    const net = r2(base + bonus + overtime + allowance - social - fund - tax);
    run(`INSERT INTO payrolls(period,employee_id,base_salary,performance_bonus,overtime_pay,allowance,
        social_insurance,housing_fund,tax,other_deduction,net_pay,status,remark)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,'已发放','')`,
      period, empId[code], base, bonus, overtime, allowance, social, fund, tax, 0, net);
  }
}
for (let i = 0; i < 5; i++) {
  const code = pick(Object.keys(empId));
  const start = new Date(TODAY.getFullYear(), TODAY.getMonth(), Math.max(1, TODAY.getDate() - rint(1, 10)));
  const end = new Date(start.getTime() + rint(1, 2) * 86400000);
  run(`INSERT INTO leave_requests(employee_id,leave_type,start_date,end_date,days,reason,status,approver_id,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`,
    empId[code], pick(['事假', '病假', '年假', '调休']), ymd(start), ymd(end), rint(1, 2),
    pick(['个人事务', '身体不适', '家庭安排', '年假出行']), pick(['待审批', '已批准', '已批准']), empId.E026,
    `${ymd(start)} 09:30:00`);
}

// ---------------- 通知 / 审计 ----------------
const NOTICES = [
  ['系统上线通知', '云枢ERP V1.0 已正式上线，请各部门于本周内完成基础资料核对。', 'INFO'],
  ['月末结账提醒', '本月财务结账截止日为次月 3 日，请及时提交未审核单据。', 'WARN'],
  ['库存预警', '部分物料库存低于安全库存，请仓储与采购协同补货。', 'DANGER'],
  ['销售例会', '本周五下午 3 点召开销售例会，地点：12 楼大会议室。', 'INFO'],
];
for (const [title, content, level] of NOTICES) {
  run('INSERT INTO notices(title,content,level,is_read,created_at) VALUES(?,?,?,0,?)', title, content, level, `${TODAY_STR} 09:00:00`);
}
const AUDIT_SAMPLE = [
  [1, '张伟', '登录', 'system', 'users', '1'],
  [2, '陈静', '审核', 'sales', 'DN', '发货单审核'],
  [4, '王磊', '新建', 'purchase', 'PO', '采购订单创建'],
  [6, '周婷', '过账', 'finance', 'VOUCHER', '应收凭证生成'],
  [5, '赵敏', '审核', 'inventory', 'TR', '调拨单审核'],
];
for (const [uid, name, action, mod, entity, detail] of AUDIT_SAMPLE) {
  run('INSERT INTO audit_logs(user_id,user_name,action,module,entity,entity_id,detail,ip,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
    uid, name, action, mod, entity, '', detail, '127.0.0.1', `${TODAY_STR} 0${rint(8, 9)}:${pad(rint(0, 59))}:00`);
}

console.log('  正在汇总统计 ...');
const stats = {
  users: get('SELECT COUNT(*) AS c FROM users')?.c,
  customers: get('SELECT COUNT(*) AS c FROM customers')?.c,
  suppliers: get('SELECT COUNT(*) AS c FROM suppliers')?.c,
  items: get('SELECT COUNT(*) AS c FROM items')?.c,
  documents: get('SELECT COUNT(*) AS c FROM documents')?.c,
  document_lines: get('SELECT COUNT(*) AS c FROM document_lines')?.c,
  invoices: get('SELECT COUNT(*) AS c FROM invoices')?.c,
  vouchers: get('SELECT COUNT(*) AS c FROM vouchers')?.c,
  stock_ledger: get('SELECT COUNT(*) AS c FROM stock_ledger')?.c,
  work_orders: get('SELECT COUNT(*) AS c FROM work_orders')?.c,
};
console.log('  数据统计:', JSON.stringify(stats));
console.log('  种子数据生成完成 ✅');
console.log('  登录账号: admin / admin123（系统管理员）');
