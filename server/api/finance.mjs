/**
 * ============================================================
 * 云枢ERP · 财务管理 API
 * ------------------------------------------------------------
 * 覆盖：财务总览 / 应收应付发票 / 收付款 / 记账凭证 / 科目树 /
 *       科目余额表 / 明细账 / 利润表 / 资产负债表 / 现金流量表 /
 *       账龄分析 / 应收应付排行 / 科目映射
 *
 * 权限：读接口 finance.view，写接口 finance.create / finance.edit
 * 约定：
 *  1. 金额一律 round2；SQL 全部参数化；排序字段走白名单。
 *  2. 发生额口径（POSTED 凭证）：
 *       - 收入类科目（category=INCOME）金额 = 贷方发生额 - 借方发生额
 *       - 成本费用类科目（COST/EXPENSE）金额 = 借方发生额 - 贷方发生额
 *  3. 资产负债表按「累计发生额」计算期末余额：
 *       - 借方类科目（ASSET/COST/EXPENSE）金额 = 借 - 贷
 *       - 贷方类科目（LIABILITY/EQUITY/INCOME）金额 = 贷 - 借
 *     因此备抵科目（1602 累计折旧、1231 坏账准备）与借方余额的负债明细
 *     （222102 进项税额）会自然带出负号，报表自动平衡。
 *  4. 未分配利润 = 4103 本年利润 + 4104 利润分配 + 未结转损益
 *     （收入类贷方净额 - 费用类借方净额，自建账起累计；系统未做期末结转，
 *      故用该口径还原未分配利润，保证 资产 = 负债 + 所有者权益）。
 *  5. 账龄口径：按发票 due_date 计算逾期天数，未到期（≤0 天）归入 0-30 天档。
 *  6. 现金流量表：取含 1001/1002 的凭证，按对方科目发生额占比把现金收支
 *     分摊到经营/投资/筹资各项目（简化口径）。
 * ============================================================
 */
import { all, get, run, tx } from '../db.mjs';
import { ApiError, paginate, round2, orderBy, todayStr } from '../http.mjs';
import { audit } from '../auth.mjs';
import { mapping, clearCache } from '../lib/gl.mjs';

// ---------------- 常量 ----------------
const CASH_CODES = ['1001', '1002'];                 // 现金及银行存款（现金流量表口径）
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 科目映射键的中文标签（gl_mappings.key） */
const GL_KEY_LABELS = {
  AR: '应收账款', AP: '应付账款', REVENUE: '主营业务收入', COGS: '主营业务成本',
  INVENTORY: '库存商品', RAW_MATERIAL: '原材料', TAX_OUTPUT: '销项税额', TAX_INPUT: '进项税额',
  CASH: '库存现金', BANK: '银行存款', WIP: '生产成本', OVERHEAD: '制造费用',
  ASSET_PENDING: '待处理财产损溢', SALARY: '应付职工薪酬', FIN_EXPENSE: '财务费用',
  OTHER_INCOME: '营业外收入', OTHER_EXPENSE: '营业外支出',
};

/** 账龄区间定义（按逾期天数） */
const AGING_BUCKETS = [
  { key: '0-30', label: '0-30天', max: 30 },
  { key: '31-60', label: '31-60天', max: 60 },
  { key: '61-90', label: '61-90天', max: 90 },
  { key: '90+', label: '90天以上', max: Number.MAX_SAFE_INTEGER },
];

/** 利润表项目定义（items 用于前端直接渲染） */
const INCOME_ITEMS = [
  { key: 'revenue', label: '一、主营业务收入', level: 0 },
  { key: 'other_income', label: '其他业务收入', level: 1 },
  { key: 'operating_revenue', label: '营业收入合计', level: 0, subtotal: true },
  { key: 'cogs', label: '二、主营业务成本', level: 0 },
  { key: 'other_cost', label: '其他业务成本', level: 1 },
  { key: 'operating_cost', label: '营业成本合计', level: 0, subtotal: true },
  { key: 'tax_surcharge', label: '税金及附加', level: 0 },
  { key: 'selling_expense', label: '销售费用', level: 0 },
  { key: 'admin_expense', label: '管理费用', level: 0 },
  { key: 'finance_expense', label: '财务费用', level: 0 },
  { key: 'rd_expense', label: '研发费用', level: 0 },
  { key: 'invest_income', label: '投资收益', level: 0 },
  { key: 'operating_profit', label: '三、营业利润', level: 0, subtotal: true },
  { key: 'non_operating_income', label: '营业外收入', level: 0 },
  { key: 'non_operating_expense', label: '营业外支出', level: 0 },
  { key: 'total_profit', label: '四、利润总额', level: 0, subtotal: true },
  { key: 'income_tax', label: '所得税费用', level: 0 },
  { key: 'net_profit', label: '五、净利润', level: 0, subtotal: true },
];

// ---------------- 基础工具 ----------------
function pad2(n) { return String(n).padStart(2, '0'); }

/** 当前期间（系统日期所在月） */
function currentPeriod() { return todayStr().slice(0, 7); }

/** 校验期间参数 yyyy-MM */
function resolvePeriod(raw, fallback) {
  const p = String(raw || '').trim();
  if (!p) return fallback;
  if (!PERIOD_RE.test(p)) throw new ApiError('period 格式应为 yyyy-MM');
  return p;
}

function monthStart(period) { return `${period}-01`; }

/** 期间最后一天（报表按期末计算，当月无未来数据不影响） */
function monthEnd(period) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${y}-${pad2(m)}-${pad2(d.getDate())}`;
}

function yearStart(period) { return `${period.slice(0, 4)}-01-01`; }

function requireDate(v, label) {
  const s = String(v || '').trim();
  if (!DATE_RE.test(s)) throw new ApiError(`${label}格式应为 YYYY-MM-DD`);
  return s;
}

/**
 * 解析报表区间：优先 period；否则 startDate/endDate；都没有则取当前月。
 * 明细账等场景允许只传一端，缺省端自动补全。
 */
function resolveRange(q, { defaultStart = null, defaultEnd = null } = {}) {
  if (q.period) {
    const period = resolvePeriod(q.period, currentPeriod());
    return { period, startDate: monthStart(period), endDate: monthEnd(period) };
  }
  if (q.startDate || q.endDate) {
    const startDate = q.startDate ? requireDate(q.startDate, 'startDate') : (defaultStart || '1900-01-01');
    const endDate = q.endDate ? requireDate(q.endDate, 'endDate') : (defaultEnd || todayStr());
    if (startDate > endDate) throw new ApiError('startDate 不能晚于 endDate');
    return { period: `${startDate.slice(0, 7)}~${endDate.slice(0, 7)}`, startDate, endDate };
  }
  const period = currentPeriod();
  return { period, startDate: defaultStart || monthStart(period), endDate: defaultEnd || monthEnd(period) };
}

/** 分页参数（默认每页 20；可通过 defaultSize 覆盖，上限仍为 500） */
function pageArgs(req, defaultSize) {
  const pg = paginate(req);
  if (defaultSize && !pg.q.pageSize) {
    return { ...pg, pageSize: defaultSize, offset: (pg.page - 1) * defaultSize };
  }
  return pg;
}

/**
 * 排序字段白名单：raw 形如 'invoice_date desc'，allowed 为「字段名 → 带表别名的 SQL 表达式」。
 * 只允许白名单字段与 asc/desc，防止 ORDER BY 注入，同时解决连表查询的列名歧义。
 */
function sortSql(raw, allowed, fallback) {
  const m = /^([a-zA-Z_][a-zA-Z0-9_]*)(\s+(asc|desc))?$/i.exec(String(raw || '').trim());
  if (!m) return fallback;
  const expr = allowed[m[1]];
  if (!expr) return fallback;
  return `${expr} ${(m[3] || 'desc').toUpperCase()}`;
}

/** 发票未结清状态过滤（AR：未收/部分收款；AP：未付/部分付款） */
function openInvoiceSql(alias, invoiceType) {
  const a = alias ? `${alias}.` : '';
  return invoiceType === 'AP'
    ? `${a}status NOT IN ('已付','已核销','已作废')`
    : `${a}status NOT IN ('已收','已核销','已作废')`;
}

/** 往来单位（客户 / 供应商）信息 */
function partnerOf(partnerType, partnerId) {
  if (!partnerId) return null;
  const id = Number(partnerId);
  if (partnerType === 'supplier') {
    return get(`SELECT id, code, name, short_name, contact, phone, email, tax_no, bank_name, bank_account,
                       credit_days, payment_terms, rating FROM suppliers WHERE id = ?`, id);
  }
  return get(`SELECT id, code, name, short_name, contact, phone, email, tax_no, bank_name, bank_account,
                     credit_days, credit_limit, category, level FROM customers WHERE id = ?`, id);
}

/** 逾期天数（正数=已逾期；按自然日计算） */
function overdueDays(dueDate, base = todayStr()) {
  if (!dueDate) return 0;
  const d = new Date(`${dueDate}T00:00:00`).getTime();
  const b = new Date(`${base}T00:00:00`).getTime();
  if (!Number.isFinite(d) || !Number.isFinite(b)) return 0;
  return Math.round((b - d) / 86400000);
}

/** 科目字典（code → 科目） */
function loadAccounts() {
  const list = all('SELECT code, name, category, direction, parent_code, level, is_leaf, status FROM accounts ORDER BY code');
  return { list, byCode: Object.fromEntries(list.map((a) => [a.code, a])) };
}

/** 区间内各科目借贷发生额（POSTED 凭证） */
function sumsByCode(startDate, endDate) {
  const rows = all(`
    SELECT vl.account_code AS code, ROUND(SUM(vl.debit), 2) AS debit, ROUND(SUM(vl.credit), 2) AS credit
    FROM voucher_lines vl
    JOIN vouchers v ON v.id = vl.voucher_id
    WHERE v.status = 'POSTED' AND v.voucher_date >= ? AND v.voucher_date <= ?
    GROUP BY vl.account_code`, startDate, endDate);
  return Object.fromEntries(rows.map((r) => [r.code, r]));
}

/** 指定日期之前的累计发生额（用于期初余额） */
function sumsBefore(date) {
  const rows = all(`
    SELECT vl.account_code AS code, ROUND(SUM(vl.debit), 2) AS debit, ROUND(SUM(vl.credit), 2) AS credit
    FROM voucher_lines vl
    JOIN vouchers v ON v.id = vl.voucher_id
    WHERE v.status = 'POSTED' AND v.voucher_date < ?
    GROUP BY vl.account_code`, date);
  return Object.fromEntries(rows.map((r) => [r.code, r]));
}

/** 科目正常方向余额（借方正数 / 贷方正数） */
function normalBalance(direction, row) {
  const debit = round2(row?.debit);
  const credit = round2(row?.credit);
  return direction === 'CREDIT' ? round2(credit - debit) : round2(debit - credit);
}

/**
 * 报表金额：借方类科目（资产/成本/费用）取 借-贷，贷方类科目（负债/权益/收入）取 贷-借。
 * 备抵科目与反向余额科目由此自动带出负号。
 */
function reportAmount(category, row) {
  const debit = round2(row?.debit);
  const credit = round2(row?.credit);
  return (category === 'ASSET' || category === 'COST' || category === 'EXPENSE')
    ? round2(debit - credit)
    : round2(credit - debit);
}

/** 单科目报表金额 */
function accountAmount(byCode, sums, code) {
  const a = byCode[code];
  if (!a) return 0;
  return reportAmount(a.category, sums[code]);
}

/** 现金及银行存款余额（累计借-贷，截至 endDate） */
function cashBalanceThrough(endDate) {
  const r = get(`
    SELECT ROUND(COALESCE(SUM(vl.debit - vl.credit), 0), 2) AS v
    FROM voucher_lines vl
    JOIN vouchers v ON v.id = vl.voucher_id
    WHERE v.status = 'POSTED' AND v.voucher_date <= ? AND vl.account_code IN ('1001','1002')`, endDate);
  return round2(r?.v);
}

function cashBalanceBefore(date) {
  const r = get(`
    SELECT ROUND(COALESCE(SUM(vl.debit - vl.credit), 0), 2) AS v
    FROM voucher_lines vl
    JOIN vouchers v ON v.id = vl.voucher_id
    WHERE v.status = 'POSTED' AND v.voucher_date < ? AND vl.account_code IN ('1001','1002')`, date);
  return round2(r?.v);
}

/**
 * 生成手工凭证号：记-yyyymm-0001。
 * 说明：lib/numbering.mjs 的 nextVoucherNo 按「期间内凭证数 + 1」取号，
 * 在并发写入或删除凭证后会与已有序号冲突（UNIQUE 约束），
 * 因此这里改为「当前期间最大序号 + 1」，并在事务内调用以避免竞态。
 */
function nextManualVoucherNo(period) {
  const prefix = `记-${String(period).replace('-', '')}-`;
  const row = get('SELECT MAX(CAST(substr(voucher_no, ?) AS INTEGER)) AS max_seq FROM vouchers WHERE period = ?',
    prefix.length + 1, period);
  let seq = (Number(row?.max_seq) || 0) + 1;
  while (get('SELECT 1 AS x FROM vouchers WHERE voucher_no = ?', `${prefix}${String(seq).padStart(4, '0')}`)) seq += 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

// ---------------- 利润表口径 ----------------
/** 损益类科目金额：收入类取贷方净额，成本费用类取借方净额 */
function plValue(byCode, sums, code) {
  const a = byCode[code];
  if (!a) return 0;
  const s = sums[code];
  if (a.category === 'INCOME') return round2(round2(s?.credit) - round2(s?.debit));
  return round2(round2(s?.debit) - round2(s?.credit));
}

/**
 * 利润表（区间口径）：
 *  营业收入 = 6001 + 6051；营业成本 = 6401 + 6402
 *  营业利润 = 营业收入 - 营业成本 - 6403 税金及附加 - (6601+6602+6603+6604) + 6111 投资收益
 *  利润总额 = 营业利润 + 6301 营业外收入 - 6711 营业外支出
 *  净利润   = 利润总额 - 6801 所得税费用
 */
function buildIncomeStatement(byCode, startDate, endDate) {
  const sums = sumsByCode(startDate, endDate);
  const v = (code) => plValue(byCode, sums, code);
  const revenue = v('6001');
  const otherIncome = v('6051');
  const operatingRevenue = round2(revenue + otherIncome);
  const cogs = v('6401');
  const otherCost = v('6402');
  const operatingCost = round2(cogs + otherCost);
  const taxSurcharge = v('6403');
  const sellingExpense = v('6601');
  const adminExpense = v('6602');
  const financeExpense = v('6603');
  const rdExpense = v('6604');
  const periodExpense = round2(sellingExpense + adminExpense + financeExpense + rdExpense);
  const investIncome = v('6111');
  const operatingProfit = round2(operatingRevenue - operatingCost - taxSurcharge - periodExpense + investIncome);
  const nonOperatingIncome = v('6301');
  const nonOperatingExpense = v('6711');
  const totalProfit = round2(operatingProfit + nonOperatingIncome - nonOperatingExpense);
  const incomeTax = v('6801');
  const netProfit = round2(totalProfit - incomeTax);
  return {
    startDate, endDate,
    revenue, other_income: otherIncome, operating_revenue: operatingRevenue,
    cogs, other_cost: otherCost, operating_cost: operatingCost,
    tax_surcharge: taxSurcharge,
    selling_expense: sellingExpense, admin_expense: adminExpense,
    finance_expense: financeExpense, rd_expense: rdExpense, period_expense: periodExpense,
    invest_income: investIncome, operating_profit: operatingProfit,
    non_operating_income: nonOperatingIncome, non_operating_expense: nonOperatingExpense,
    total_profit: totalProfit, income_tax: incomeTax, net_profit: netProfit,
  };
}

// ---------------- 资产负债表口径 ----------------
/**
 * 资产负债表（截至 asOfDate 的累计发生额）：
 *  金额 = 借-贷（资产/成本/费用类）或 贷-借（负债/权益/收入类）
 *  未分配利润 = 4103 + 4104 + 未结转损益（收入类 - 费用类）
 *  COST 类科目（5001 生产成本等）视为「存货」计入流动资产；
 *  2401 递延收益列入非流动负债。
 */
function buildBalanceSheet(byCode, asOfDate) {
  const sums = sumsByCode('1900-01-01', asOfDate);
  const amt = (code) => accountAmount(byCode, sums, code);
  const sum = (codes) => round2(codes.reduce((t, c) => t + amt(c), 0));

  const currentAssets = [
    { code: '1001+1002+1012', name: '货币资金', amount: sum(['1001', '1002', '1012']) },
    { code: '1121', name: '应收票据', amount: amt('1121') },
    { code: '1122-1231', name: '应收账款', amount: round2(amt('1122') + amt('1231')) },
    { code: '1123', name: '预付账款', amount: amt('1123') },
    { code: '1221', name: '其他应收款', amount: amt('1221') },
    { code: '1401~1471+5001~5301', name: '存货', amount: sum(['1401', '1402', '1403', '1405', '1407', '1408', '1411', '1471', '5001', '5101', '5201', '5301']) },
    { code: '1901', name: '待处理财产损溢', amount: amt('1901') },
  ];
  const nonCurrentAssets = [
    { code: '1601-1602', name: '固定资产净值', amount: round2(amt('1601') + amt('1602')) },
    { code: '1604', name: '在建工程', amount: amt('1604') },
    { code: '1701-1702', name: '无形资产净值', amount: round2(amt('1701') + amt('1702')) },
    { code: '1801', name: '长期待摊费用', amount: amt('1801') },
  ];
  const currentLiabilities = [
    { code: '2001', name: '短期借款', amount: amt('2001') },
    { code: '2201', name: '应付票据', amount: amt('2201') },
    { code: '2202', name: '应付账款', amount: amt('2202') },
    { code: '2203', name: '预收账款', amount: amt('2203') },
    { code: '2211', name: '应付职工薪酬', amount: amt('2211') },
    { code: '2221', name: '应交税费', amount: sum(['2221', '222101', '222102', '222103', '222104', '222105']) },
    { code: '2231', name: '应付利息', amount: amt('2231') },
    { code: '2241', name: '其他应付款', amount: amt('2241') },
  ];
  const nonCurrentLiabilities = [
    { code: '2401', name: '递延收益', amount: amt('2401') },
  ];

  // 未结转损益：收入类贷方净额 - 费用类借方净额（自建账起累计，未做期末结转）
  let unclosedPL = 0;
  for (const a of Object.values(byCode)) {
    if (a.category !== 'INCOME' && a.category !== 'EXPENSE') continue;
    const s = sums[a.code];
    unclosedPL += round2(s?.credit) - round2(s?.debit);
  }
  unclosedPL = round2(unclosedPL);
  const retainedEarnings = round2(amt('4103') + amt('4104') + unclosedPL);
  const equityItems = [
    { code: '4001', name: '实收资本', amount: amt('4001') },
    { code: '4002', name: '资本公积', amount: amt('4002') },
    { code: '4101', name: '盈余公积', amount: amt('4101') },
    { code: '4103+4104', name: '未分配利润', amount: retainedEarnings, note: '含未结转损益' },
  ];

  const sumItems = (items) => round2(items.reduce((t, i) => t + round2(i.amount), 0));
  const currentAssetsTotal = sumItems(currentAssets);
  const nonCurrentAssetsTotal = sumItems(nonCurrentAssets);
  const assetTotal = round2(currentAssetsTotal + nonCurrentAssetsTotal);
  const currentLiabilitiesTotal = sumItems(currentLiabilities);
  const nonCurrentLiabilitiesTotal = sumItems(nonCurrentLiabilities);
  const liabilityTotal = round2(currentLiabilitiesTotal + nonCurrentLiabilitiesTotal);
  const equityTotal = sumItems(equityItems);
  const liabilityEquityTotal = round2(liabilityTotal + equityTotal);
  const diff = round2(assetTotal - liabilityEquityTotal);

  return {
    asOfDate,
    period: asOfDate.slice(0, 7),
    assets: [
      { key: 'CURRENT_ASSETS', name: '流动资产', amount: currentAssetsTotal, items: currentAssets },
      { key: 'NON_CURRENT_ASSETS', name: '非流动资产', amount: nonCurrentAssetsTotal, items: nonCurrentAssets },
    ],
    liabilities: [
      { key: 'CURRENT_LIABILITIES', name: '流动负债', amount: currentLiabilitiesTotal, items: currentLiabilities },
      { key: 'NON_CURRENT_LIABILITIES', name: '非流动负债', amount: nonCurrentLiabilitiesTotal, items: nonCurrentLiabilities },
    ],
    equity: [
      { key: 'EQUITY', name: '所有者权益', amount: equityTotal, items: equityItems },
    ],
    totals: {
      current_assets: currentAssetsTotal,
      non_current_assets: nonCurrentAssetsTotal,
      asset_total: assetTotal,
      current_liabilities: currentLiabilitiesTotal,
      non_current_liabilities: nonCurrentLiabilitiesTotal,
      liability_total: liabilityTotal,
      paid_in_capital: amt('4001'),
      capital_reserve: amt('4002'),
      surplus_reserve: amt('4101'),
      retained_earnings: retainedEarnings,
      unclosed_profit: unclosedPL,
      equity_total: equityTotal,
      liability_equity_total: liabilityEquityTotal,
      diff,
      balanced: Math.abs(diff) <= 0.01,
    },
  };
}

// ---------------- 现金流量表口径 ----------------
/** 现金流入分类规则：按对方科目的贷方（资金来源）归类 */
const CASH_IN_RULES = [
  { bucket: 'sales_in', codes: ['6001', '6051', '1122', '1121', '2203'] },
  { bucket: 'invest_in', codes: ['1601', '1602', '1604', '1701', '1702', '1801'] },
  { bucket: 'equity_in', codes: ['4001', '4002'] },
  { bucket: 'loan_in', codes: ['2001', '2231', '2241'] },
];
/** 现金流出分类规则：按对方科目的借方（资金用途）归类 */
const CASH_OUT_RULES = [
  { bucket: 'purchase_out', codes: ['2202', '2201', '1401', '1402', '1403', '1405', '1407', '1408', '1411', '1471', '5001', '5101', '5201', '5301', '1123'] },
  { bucket: 'salary_out', codes: ['2211'] },
  { bucket: 'tax_out', codes: ['2221', '222101', '222102', '222103', '222104', '222105', '6403', '6801'] },
  { bucket: 'invest_out', codes: ['1601', '1602', '1604', '1701', '1702', '1801'] },
  { bucket: 'financing_out', codes: ['2001', '2231', '2241', '4104'] },
];

function classifyCash(rules, code, fallback) {
  for (const r of rules) if (r.codes.includes(code)) return r.bucket;
  return fallback;
}

/** 把一张凭证的现金收支按对方科目发生额占比分摊到现金流项目 */
function allocateCash(buckets, total, others, side, rules, fallback) {
  if (total <= 0) return;
  const active = others.filter((l) => (Number(l[side]) || 0) > 0);
  if (!active.length) {
    buckets[fallback] = round2(buckets[fallback] + total);
    return;
  }
  const base = active.reduce((s, l) => s + (Number(l[side]) || 0), 0);
  let allocated = 0;
  active.forEach((l, i) => {
    const raw = Number(l[side]) || 0;
    // 末行承接四舍五入差额，保证分摊合计 = 现金收支总额
    const amt = i === active.length - 1 ? round2(total - allocated) : round2((total * raw) / base);
    allocated = round2(allocated + amt);
    const key = classifyCash(rules, l.account_code, fallback);
    buckets[key] = round2(buckets[key] + amt);
  });
}

/**
 * 简化现金流量表：遍历期间内含 1001/1002 的凭证，
 * 现金借方=流入、现金贷方=流出，按对方科目分类。
 */
function buildCashFlow(period) {
  const startDate = monthStart(period);
  const endDate = monthEnd(period);
  const b = {
    sales_in: 0, other_operating_in: 0,
    purchase_out: 0, salary_out: 0, tax_out: 0, other_operating_out: 0,
    invest_in: 0, invest_out: 0,
    equity_in: 0, loan_in: 0, financing_out: 0,
  };
  const voucherIds = all(`
    SELECT DISTINCT v.id FROM vouchers v
    JOIN voucher_lines vl ON vl.voucher_id = v.id
    WHERE v.status = 'POSTED' AND v.voucher_date >= ? AND v.voucher_date <= ?
      AND vl.account_code IN ('1001','1002')`, startDate, endDate);
  for (const { id } of voucherIds) {
    const lines = all('SELECT account_code, debit, credit FROM voucher_lines WHERE voucher_id = ?', id);
    let cashIn = 0;
    let cashOut = 0;
    const others = [];
    for (const l of lines) {
      if (CASH_CODES.includes(l.account_code)) {
        cashIn = round2(cashIn + round2(l.debit));
        cashOut = round2(cashOut + round2(l.credit));
      } else {
        others.push(l);
      }
    }
    allocateCash(b, cashIn, others, 'credit', CASH_IN_RULES, 'other_operating_in');
    allocateCash(b, cashOut, others, 'debit', CASH_OUT_RULES, 'other_operating_out');
  }

  const operatingIn = round2(b.sales_in + b.other_operating_in);
  const operatingOut = round2(b.purchase_out + b.salary_out + b.tax_out + b.other_operating_out);
  const investingIn = round2(b.invest_in);
  const investingOut = round2(b.invest_out);
  const financingIn = round2(b.equity_in + b.loan_in);
  const financingOut = round2(b.financing_out);
  const operatingNet = round2(operatingIn - operatingOut);
  const investingNet = round2(investingIn - investingOut);
  const financingNet = round2(financingIn - financingOut);
  const netIncrease = round2(operatingNet + investingNet + financingNet);
  const openingCash = cashBalanceBefore(startDate);
  const closingCash = cashBalanceThrough(endDate);

  return {
    period, startDate, endDate,
    operating: {
      sales_in: b.sales_in, other_in: b.other_operating_in, inflow: operatingIn,
      purchase_out: b.purchase_out, salary_out: b.salary_out, tax_out: b.tax_out,
      other_out: b.other_operating_out, outflow: operatingOut, net: operatingNet,
    },
    investing: {
      asset_purchase_out: b.invest_out, asset_disposal_in: b.invest_in,
      inflow: investingIn, outflow: investingOut, net: investingNet,
    },
    financing: {
      equity_in: b.equity_in, loan_in: b.loan_in, repay_out: b.financing_out,
      inflow: financingIn, outflow: financingOut, net: financingNet,
    },
    net_increase: netIncrease,
    opening_cash: openingCash,
    closing_cash: closingCash,
    check: { opening_cash: openingCash, closing_cash: closingCash, diff: round2(closingCash - openingCash - netIncrease) },
    items: [
      { group: '经营活动', key: 'sales_in', label: '销售商品、提供劳务收到的现金', amount: b.sales_in },
      { group: '经营活动', key: 'other_in', label: '收到其他与经营活动有关的现金', amount: b.other_operating_in },
      { group: '经营活动', key: 'operating_inflow', label: '经营活动现金流入小计', amount: operatingIn, subtotal: true },
      { group: '经营活动', key: 'purchase_out', label: '购买商品、接受劳务支付的现金', amount: b.purchase_out },
      { group: '经营活动', key: 'salary_out', label: '支付给职工以及为职工支付的现金', amount: b.salary_out },
      { group: '经营活动', key: 'tax_out', label: '支付的各项税费', amount: b.tax_out },
      { group: '经营活动', key: 'other_out', label: '支付其他与经营活动有关的现金', amount: b.other_operating_out },
      { group: '经营活动', key: 'operating_outflow', label: '经营活动现金流出小计', amount: operatingOut, subtotal: true },
      { group: '经营活动', key: 'operating_net', label: '经营活动产生的现金流量净额', amount: operatingNet, subtotal: true },
      { group: '投资活动', key: 'invest_out', label: '购建固定资产、无形资产和其他长期资产支付的现金', amount: investingOut },
      { group: '投资活动', key: 'invest_in', label: '处置固定资产、无形资产和其他长期资产收回的现金净额', amount: investingIn },
      { group: '投资活动', key: 'investing_net', label: '投资活动产生的现金流量净额', amount: investingNet, subtotal: true },
      { group: '筹资活动', key: 'equity_in', label: '吸收投资收到的现金', amount: b.equity_in },
      { group: '筹资活动', key: 'loan_in', label: '取得借款收到的现金', amount: b.loan_in },
      { group: '筹资活动', key: 'financing_out', label: '偿还债务、分配股利、利润或偿付利息支付的现金', amount: financingOut },
      { group: '筹资活动', key: 'financing_net', label: '筹资活动产生的现金流量净额', amount: financingNet, subtotal: true },
      { group: '合计', key: 'net_increase', label: '现金及现金等价物净增加额', amount: netIncrease, subtotal: true },
    ],
  };
}

// ---------------- 发票 / 凭证公共查询 ----------------
const INVOICE_JOINS = `
  FROM invoices i
  LEFT JOIN customers c ON c.id = i.partner_id AND i.partner_type = 'customer'
  LEFT JOIN suppliers s ON s.id = i.partner_id AND i.partner_type = 'supplier'`;

/** 发票列表行（含往来单位、余额、逾期天数、核销笔数） */
function invoiceRowSelect() {
  return `SELECT i.*, COALESCE(c.name, s.name) AS partner_name, COALESCE(c.code, s.code) AS partner_code,
      ROUND(i.total_amount - i.paid_amount, 2) AS remain_amount,
      CAST(COALESCE(julianday(?) - julianday(i.due_date), 0) AS INTEGER) AS overdue_days,
      (SELECT COUNT(*) FROM payment_allocations pa WHERE pa.invoice_id = i.id) AS allocation_count`;
}

/** 凭证详情（含分录、来源单据） */
function voucherFull(id) {
  const voucher = get('SELECT * FROM vouchers WHERE id = ?', Number(id));
  if (!voucher) return null;
  const lines = all(`
    SELECT vl.*, a.category, a.direction
    FROM voucher_lines vl
    LEFT JOIN accounts a ON a.code = vl.account_code
    WHERE vl.voucher_id = ? ORDER BY vl.line_no`, voucher.id);
  let sourceDoc = null;
  if (voucher.source_type && voucher.source_id) {
    sourceDoc = get('SELECT id, doc_no, doc_type, doc_date, status, total_amount FROM documents WHERE id = ?', voucher.source_id);
  }
  return {
    ...voucher,
    line_count: lines.length,
    total_debit: round2(voucher.total_debit),
    total_credit: round2(voucher.total_credit),
    lines,
    source_doc: sourceDoc,
  };
}

// ---------------- 路由 ----------------
export function register(router) {
  // ============================================================
  // 1. 财务总览 KPI
  // ============================================================
  router.get('/api/finance/overview', async (ctx) => {
    const period = resolvePeriod(ctx.query.period, currentPeriod());
    const startDate = monthStart(period);
    const endDate = monthEnd(period);
    const today = todayStr();
    const { byCode } = loadAccounts();

    // 应收/应付余额：发票口径（未结清发票的 价税合计 - 已核销）
    const ar = get(`SELECT ROUND(COALESCE(SUM(total_amount - paid_amount), 0), 2) AS balance, COUNT(*) AS count
      FROM invoices WHERE invoice_type = 'AR' AND ${openInvoiceSql('', 'AR')}`);
    const ap = get(`SELECT ROUND(COALESCE(SUM(total_amount - paid_amount), 0), 2) AS balance, COUNT(*) AS count
      FROM invoices WHERE invoice_type = 'AP' AND ${openInvoiceSql('', 'AP')}`);
    const overdueAr = get(`SELECT ROUND(COALESCE(SUM(total_amount - paid_amount), 0), 2) AS amount, COUNT(*) AS count
      FROM invoices WHERE invoice_type = 'AR' AND ${openInvoiceSql('', 'AR')} AND due_date < ?`, today);
    const overdueAp = get(`SELECT ROUND(COALESCE(SUM(total_amount - paid_amount), 0), 2) AS amount, COUNT(*) AS count
      FROM invoices WHERE invoice_type = 'AP' AND ${openInvoiceSql('', 'AP')} AND due_date < ?`, today);

    // 本月收款 / 本月付款（POSTED 收付款单）
    const receipt = get(`SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS amount, COUNT(*) AS count
      FROM payments WHERE payment_type = 'RECEIPT' AND status = 'POSTED' AND payment_date >= ? AND payment_date <= ?`,
      startDate, endDate);
    const payment = get(`SELECT ROUND(COALESCE(SUM(amount), 0), 2) AS amount, COUNT(*) AS count
      FROM payments WHERE payment_type = 'PAYMENT' AND status = 'POSTED' AND payment_date >= ? AND payment_date <= ?`,
      startDate, endDate);

    // 现金 + 银行存款余额：总账口径（1001/1002 累计借-贷）
    const cash = get(`SELECT
        ROUND(COALESCE(SUM(CASE WHEN vl.account_code = '1001' THEN vl.debit - vl.credit ELSE 0 END), 0), 2) AS cash,
        ROUND(COALESCE(SUM(CASE WHEN vl.account_code = '1002' THEN vl.debit - vl.credit ELSE 0 END), 0), 2) AS bank
      FROM voucher_lines vl JOIN vouchers v ON v.id = vl.voucher_id
      WHERE v.status = 'POSTED' AND vl.account_code IN ('1001','1002')`);

    // 总账口径应收应付（与发票口径对账用）
    const glSums = sumsByCode('1900-01-01', today);
    const arGl = accountAmount(byCode, glSums, mapping('AR') || '1122');
    const apGl = accountAmount(byCode, glSums, mapping('AP') || '2202');

    // 本月损益（利润表口径）
    const pl = buildIncomeStatement(byCode, startDate, endDate);
    const monthCost = round2(pl.operating_cost + pl.tax_surcharge + pl.period_expense);

    return {
      period, startDate, endDate, asOfDate: today,
      // 扁平字段（KPI 卡片直接用）
      ar_balance: ar.balance,
      ap_balance: ap.balance,
      month_receipt: receipt.amount,
      month_payment: payment.amount,
      cash_balance: cash.cash,
      bank_balance: cash.bank,
      cash_total: round2(cash.cash + cash.bank),
      month_income: pl.operating_revenue,
      month_cost: monthCost,
      month_profit: pl.operating_profit,
      month_net_profit: pl.net_profit,
      overdue_ar_amount: overdueAr.amount,
      overdue_ar_count: overdueAr.count,
      overdue_ap_amount: overdueAp.amount,
      overdue_ap_count: overdueAp.count,
      // 分组字段（明细展示用）
      receivable: {
        balance: ar.balance, count: ar.count,
        overdue_amount: overdueAr.amount, overdue_count: overdueAr.count,
        gl_balance: arGl, diff: round2(ar.balance - arGl),
      },
      payable: {
        balance: ap.balance, count: ap.count,
        overdue_amount: overdueAp.amount, overdue_count: overdueAp.count,
        gl_balance: apGl, diff: round2(ap.balance - apGl),
      },
      cash: { cash_balance: cash.cash, bank_balance: cash.bank, total: round2(cash.cash + cash.bank) },
      month: {
        period, receipt: receipt.amount, receipt_count: receipt.count,
        payment: payment.amount, payment_count: payment.count,
        income: pl.operating_revenue, cost: monthCost,
        profit: pl.operating_profit, net_profit: pl.net_profit,
      },
    };
  }, { perm: 'finance.view' });

  // ============================================================
  // 2. 发票列表（AR 应收 / AP 应付）
  // ============================================================
  router.get('/api/finance/invoices', async (ctx) => {
    const { page, pageSize, offset, q } = pageArgs(ctx.req);
    const invoiceType = String(q.invoiceType || '').trim();
    if (invoiceType && invoiceType !== 'AR' && invoiceType !== 'AP') {
      throw new ApiError('invoiceType 只能为 AR 或 AP');
    }
    const where = [];
    const params = [];
    if (invoiceType) { where.push('i.invoice_type = ?'); params.push(invoiceType); }
    if (q.status) {
      const arr = String(q.status).split(',').map((s) => s.trim()).filter(Boolean);
      if (arr.length) { where.push(`i.status IN (${arr.map(() => '?').join(',')})`); params.push(...arr); }
    }
    if (q.partnerId) { where.push('i.partner_id = ?'); params.push(Number(q.partnerId)); }
    if (q.startDate) { where.push('i.invoice_date >= ?'); params.push(requireDate(q.startDate, 'startDate')); }
    if (q.endDate) { where.push('i.invoice_date <= ?'); params.push(requireDate(q.endDate, 'endDate')); }
    if (q.dueStartDate) { where.push('i.due_date >= ?'); params.push(requireDate(q.dueStartDate, 'dueStartDate')); }
    if (q.dueEndDate) { where.push('i.due_date <= ?'); params.push(requireDate(q.dueEndDate, 'dueEndDate')); }
    if (q.overdue === '1') {
      // 未指定发票类型时，分别按 AR/AP 的未结清状态判断，避免把已付 AP 误判为逾期
      where.push(`i.due_date < ? AND ${invoiceType
        ? openInvoiceSql('i', invoiceType)
        : `((i.invoice_type = 'AR' AND ${openInvoiceSql('i', 'AR')}) OR (i.invoice_type = 'AP' AND ${openInvoiceSql('i', 'AP')}))`}`);
      params.push(todayStr());
    }
    if (q.keyword) {
      const k = `%${q.keyword}%`;
      where.push(`(i.invoice_no LIKE ? OR i.doc_no LIKE ? OR i.remark LIKE ?
        OR COALESCE(c.name, s.name) LIKE ? OR COALESCE(c.code, s.code) LIKE ?)`);
      params.push(k, k, k, k, k);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = get(`SELECT COUNT(*) AS c ${INVOICE_JOINS} ${w}`, ...params)?.c || 0;
    // 汇总按筛选条件全量计算（不受分页影响）
    const summary = get(`SELECT ROUND(COALESCE(SUM(i.total_amount), 0), 2) AS total_amount,
        ROUND(COALESCE(SUM(i.paid_amount), 0), 2) AS paid_amount,
        ROUND(COALESCE(SUM(i.total_amount - i.paid_amount), 0), 2) AS remain_amount
      ${INVOICE_JOINS} ${w}`, ...params) || { total_amount: 0, paid_amount: 0, remain_amount: 0 };
    const order = sortSql(q.orderBy, {
      invoice_date: 'i.invoice_date', due_date: 'i.due_date', total_amount: 'i.total_amount',
      paid_amount: 'i.paid_amount', remain_amount: 'i.total_amount - i.paid_amount',
      invoice_no: 'i.invoice_no', id: 'i.id', created_at: 'i.created_at',
    }, 'i.invoice_date DESC, i.id DESC');
    const rows = all(`${invoiceRowSelect()} ${INVOICE_JOINS} ${w}
      ORDER BY ${order} LIMIT ? OFFSET ?`, todayStr(), ...params, pageSize, offset);
    return { rows, total, page, pageSize, summary };
  }, { perm: 'finance.view' });

  // ============================================================
  // 3. 发票详情
  // ============================================================
  router.get('/api/finance/invoices/:id', async (ctx) => {
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError('发票 ID 不合法');
    const inv = get('SELECT * FROM invoices WHERE id = ?', id);
    if (!inv) throw new ApiError('发票不存在', 404, 'NOT_FOUND');
    const partner = partnerOf(inv.partner_type, inv.partner_id);
    // 来源单据：发票由 DN/GRN 生成，单据自身可能还有上游 SO/PO
    const doc = inv.doc_id
      ? get(`SELECT id, doc_no, doc_type, doc_date, status, partner_id, partner_type, subtotal, tax_amount,
                    total_amount, paid_amount, warehouse_id, salesperson_id, source_type, source_id, source_no, remark
             FROM documents WHERE id = ?`, inv.doc_id)
      : null;
    const sourceDoc = doc?.source_id
      ? get('SELECT id, doc_no, doc_type, doc_date, status, total_amount FROM documents WHERE id = ?', doc.source_id)
      : null;
    // 核销记录：payment_allocations → payments
    const allocations = all(`
      SELECT pa.id AS allocation_id, ROUND(pa.amount, 2) AS amount,
             p.id AS payment_id, p.payment_no, p.payment_type, p.payment_date,
             ROUND(p.amount, 2) AS payment_amount, ROUND(p.allocated_amount, 2) AS payment_allocated,
             p.method, p.bank_account, p.account_code, p.status, p.remark, p.created_by
      FROM payment_allocations pa
      JOIN payments p ON p.id = pa.payment_id
      WHERE pa.invoice_id = ?
      ORDER BY p.payment_date, p.id`, id);
    // 关联凭证（按来源单据钻取）
    const vouchers = doc
      ? all(`SELECT id, voucher_no, voucher_date, voucher_type, summary, total_debit, total_credit
             FROM vouchers WHERE source_type = ? AND source_id = ? ORDER BY id`, doc.doc_type, doc.id)
      : [];
    return {
      ...inv,
      total_amount: round2(inv.total_amount),
      paid_amount: round2(inv.paid_amount),
      subtotal: round2(inv.subtotal),
      tax_amount: round2(inv.tax_amount),
      remain_amount: round2(inv.total_amount - inv.paid_amount),
      overdue_days: overdueDays(inv.due_date),
      partner,
      doc,
      source_doc: sourceDoc,
      allocations,
      payments: allocations,
      vouchers,
    };
  }, { perm: 'finance.view' });

  // ============================================================
  // 4. 发票修改（仅允许 due_date / remark）
  // ============================================================
  router.put('/api/finance/invoices/:id', async (ctx) => {
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError('发票 ID 不合法');
    const inv = get('SELECT * FROM invoices WHERE id = ?', id);
    if (!inv) throw new ApiError('发票不存在', 404, 'NOT_FOUND');
    const body = ctx.body || {};
    const allowed = ['due_date', 'remark'];
    const illegal = Object.keys(body).filter((k) => !allowed.includes(k));
    if (illegal.length) throw new ApiError(`不允许修改字段：${illegal.join('、')}（仅支持 due_date / remark）`);
    let due = inv.due_date;
    if (body.due_date !== undefined) {
      due = body.due_date === null || body.due_date === '' ? null : requireDate(body.due_date, 'due_date');
    }
    const remark = body.remark === undefined ? inv.remark : String(body.remark ?? '');
    if (remark.length > 500) throw new ApiError('备注不能超过 500 字');
    run('UPDATE invoices SET due_date = ?, remark = ? WHERE id = ?', due, remark, id);
    audit(ctx.user, '修改', 'finance', 'INVOICE', id, `修改${inv.invoice_type === 'AR' ? '应收' : '应付'}发票 ${inv.invoice_no}`, ctx.ip);
    const updated = get('SELECT * FROM invoices WHERE id = ?', id);
    return {
      ...updated,
      remain_amount: round2(updated.total_amount - updated.paid_amount),
      overdue_days: overdueDays(updated.due_date),
      partner: partnerOf(updated.partner_type, updated.partner_id),
    };
  }, { perm: 'finance.edit' });

  // ============================================================
  // 5. 收付款记录
  // ============================================================
  router.get('/api/finance/payments', async (ctx) => {
    const { page, pageSize, offset, q } = pageArgs(ctx.req);
    const paymentType = String(q.paymentType || '').trim();
    if (paymentType && paymentType !== 'RECEIPT' && paymentType !== 'PAYMENT') {
      throw new ApiError('paymentType 只能为 RECEIPT（收款）或 PAYMENT（付款）');
    }
    const where = [];
    const params = [];
    if (paymentType) { where.push('p.payment_type = ?'); params.push(paymentType); }
    if (q.status) { where.push('p.status = ?'); params.push(q.status); }
    if (q.method) { where.push('p.method = ?'); params.push(q.method); }
    if (q.partnerId) { where.push('p.partner_id = ?'); params.push(Number(q.partnerId)); }
    if (q.startDate) { where.push('p.payment_date >= ?'); params.push(requireDate(q.startDate, 'startDate')); }
    if (q.endDate) { where.push('p.payment_date <= ?'); params.push(requireDate(q.endDate, 'endDate')); }
    if (q.keyword) {
      const k = `%${q.keyword}%`;
      where.push(`(p.payment_no LIKE ? OR p.remark LIKE ? OR p.bank_account LIKE ?
        OR COALESCE(c.name, s.name) LIKE ? OR COALESCE(c.code, s.code) LIKE ?)`);
      params.push(k, k, k, k, k);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const joins = `
      FROM payments p
      LEFT JOIN customers c ON c.id = p.partner_id AND p.partner_type = 'customer'
      LEFT JOIN suppliers s ON s.id = p.partner_id AND p.partner_type = 'supplier'`;
    const total = get(`SELECT COUNT(*) AS c ${joins} ${w}`, ...params)?.c || 0;
    const order = sortSql(q.orderBy, {
      payment_date: 'p.payment_date', amount: 'p.amount', allocated_amount: 'p.allocated_amount',
      payment_no: 'p.payment_no', id: 'p.id', created_at: 'p.created_at',
    }, 'p.payment_date DESC, p.id DESC');
    const rows = all(`SELECT p.*, COALESCE(c.name, s.name) AS partner_name, COALESCE(c.code, s.code) AS partner_code,
        ROUND(p.amount, 2) AS amount, ROUND(p.allocated_amount, 2) AS allocated_amount,
        (SELECT COUNT(*) FROM payment_allocations pa WHERE pa.payment_id = p.id) AS invoice_count
      ${joins} ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, pageSize, offset);
    return { rows, total, page, pageSize };
  }, { perm: 'finance.view' });

  // ============================================================
  // 6. 记账凭证列表
  // ============================================================
  router.get('/api/finance/vouchers', async (ctx) => {
    const { page, pageSize, offset, q } = pageArgs(ctx.req);
    const where = [];
    const params = [];
    if (q.period) { where.push('v.period = ?'); params.push(resolvePeriod(q.period, currentPeriod())); }
    if (q.voucherType) {
      const vt = String(q.voucherType).toUpperCase();
      if (!['AUTO', 'MANUAL'].includes(vt)) throw new ApiError('voucherType 只能为 AUTO 或 MANUAL');
      where.push('v.voucher_type = ?'); params.push(vt);
    }
    if (q.status) { where.push('v.status = ?'); params.push(q.status); }
    if (q.sourceType) { where.push('v.source_type = ?'); params.push(q.sourceType); }
    if (q.startDate) { where.push('v.voucher_date >= ?'); params.push(requireDate(q.startDate, 'startDate')); }
    if (q.endDate) { where.push('v.voucher_date <= ?'); params.push(requireDate(q.endDate, 'endDate')); }
    if (q.keyword) {
      const k = `%${q.keyword}%`;
      where.push('(v.voucher_no LIKE ? OR v.summary LIKE ? OR v.source_type LIKE ?)');
      params.push(k, k, k);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = get(`SELECT COUNT(*) AS c FROM vouchers v ${w}`, ...params)?.c || 0;
    const order = orderBy(q.orderBy, ['voucher_date', 'voucher_no', 'period', 'total_debit', 'created_at', 'id'],
      'v.voucher_date DESC, v.id DESC');
    const rows = all(`SELECT v.*,
        (SELECT COUNT(*) FROM voucher_lines vl WHERE vl.voucher_id = v.id) AS line_count,
        COALESCE(
          (SELECT d.doc_no FROM documents d WHERE d.id = v.source_id AND d.doc_type = v.source_type),
          (SELECT w.order_no FROM work_orders w WHERE v.source_type = 'MO' AND w.id = v.source_id)
        ) AS source_no
      FROM vouchers v ${w}
      ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, pageSize, offset);
    return { rows, total, page, pageSize };
  }, { perm: 'finance.view' });

  // ============================================================
  // 7. 凭证详情
  // ============================================================
  router.get('/api/finance/vouchers/:id', async (ctx) => {
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError('凭证 ID 不合法');
    const voucher = voucherFull(id);
    if (!voucher) throw new ApiError('凭证不存在', 404, 'NOT_FOUND');
    return voucher;
  }, { perm: 'finance.view' });

  // ============================================================
  // 8. 手工凭证录入（校验后直接 POSTED）
  // ============================================================
  router.post('/api/finance/vouchers', async (ctx) => {
    const body = ctx.body || {};
    const date = requireDate(body.voucher_date, 'voucher_date');
    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    if (!rawLines.length) throw new ApiError('凭证分录不能为空');
    if (rawLines.length > 200) throw new ApiError('单张凭证分录不能超过 200 行');
    const summary = String(body.summary || '手工凭证').slice(0, 200);
    const { byCode } = loadAccounts();

    const lines = [];
    let totalDebit = 0;
    let totalCredit = 0;
    rawLines.forEach((l, idx) => {
      const no = idx + 1;
      const code = String(l.account_code || '').trim();
      const acc = byCode[code];
      if (!acc) throw new ApiError(`第 ${no} 行科目不存在：${code || '（空）'}`);
      if (acc.status !== '启用') throw new ApiError(`第 ${no} 行科目 ${code} 已停用，不能使用`);
      const debit = round2(l.debit);
      const credit = round2(l.credit);
      if (debit < 0 || credit < 0) throw new ApiError(`第 ${no} 行金额不能为负数`);
      if (debit === 0 && credit === 0) throw new ApiError(`第 ${no} 行借贷金额不能同时为 0`);
      if (debit > 0 && credit > 0) throw new ApiError(`第 ${no} 行不能同时填写借方和贷方金额`);
      let partnerType = null;
      let partnerId = null;
      let partnerName = null;
      if (l.partner_id !== undefined && l.partner_id !== null && l.partner_id !== '') {
        partnerType = l.partner_type === 'supplier' ? 'supplier' : 'customer';
        const partner = partnerOf(partnerType, l.partner_id);
        if (!partner) throw new ApiError(`第 ${no} 行往来单位不存在`);
        partnerId = Number(l.partner_id);
        partnerName = partner.name;
      }
      lines.push({
        account_code: code,
        account_name: acc.name,
        summary: String(l.summary || summary).slice(0, 200),
        debit, credit, partner_type: partnerType, partner_id: partnerId, partner_name: partnerName,
      });
      totalDebit = round2(totalDebit + debit);
      totalCredit = round2(totalCredit + credit);
    });
    if (totalDebit <= 0) throw new ApiError('凭证金额合计必须大于 0');
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new ApiError(`借贷不平衡：借方合计 ${totalDebit}，贷方合计 ${totalCredit}`);
    }

    const period = date.slice(0, 7);
    const voucherId = tx(() => {
      const voucherNo = nextManualVoucherNo(period);
      const r = run(`INSERT INTO vouchers(voucher_no, voucher_date, period, voucher_type, source_type, source_id,
          summary, total_debit, total_credit, status, created_by, created_by_name, posted_at)
        VALUES(?,?,?,'MANUAL',NULL,NULL,?,?,?,'POSTED',?,?, datetime('now','localtime'))`,
        voucherNo, date, period, summary, totalDebit, totalCredit, ctx.user.id, ctx.user.name);
      const vid = r.lastInsertRowid;
      lines.forEach((l, i) => {
        run(`INSERT INTO voucher_lines(voucher_id, line_no, account_code, account_name, summary, debit, credit,
              partner_type, partner_id, partner_name)
            VALUES(?,?,?,?,?,?,?,?,?,?)`,
          vid, i + 1, l.account_code, l.account_name, l.summary, l.debit, l.credit,
          l.partner_type, l.partner_id, l.partner_name);
      });
      return vid;
    });
    audit(ctx.user, '新建', 'finance', 'VOUCHER', voucherId, `手工凭证 ${date} 借贷各 ${totalDebit}`, ctx.ip);
    return voucherFull(voucherId);
  }, { perm: 'finance.create' });

  // ============================================================
  // 9. 科目树（本期 / 本年 借、贷、余额，父级含下级汇总）
  // ============================================================
  router.get('/api/finance/accounts/tree', async (ctx) => {
    const period = resolvePeriod(ctx.query.period, currentPeriod());
    const startDate = monthStart(period);
    const endDate = monthEnd(period);
    const yStart = yearStart(period);
    const { list } = loadAccounts();
    const opening = sumsBefore(startDate);
    const current = sumsByCode(startDate, endDate);
    const ytd = sumsByCode(yStart, endDate);
    const beforeEnd = sumsBefore(endDate);   // 期末累计余额（自建账起）

    const nodes = new Map();
    for (const a of list) {
      const openBal = normalBalance(a.direction, opening[a.code]);
      const cur = current[a.code];
      const y = ytd[a.code];
      nodes.set(a.code, {
        code: a.code, name: a.name, category: a.category, direction: a.direction,
        parent_code: a.parent_code, level: a.level, is_leaf: a.is_leaf,
        opening_balance: openBal,
        current: {
          debit: round2(cur?.debit), credit: round2(cur?.credit),
          balance: round2(openBal + normalBalance(a.direction, cur)),
        },
        ytd: {
          debit: round2(y?.debit), credit: round2(y?.credit),
          // 本年余额 = 截至期末的累计余额（按科目方向）
          balance: normalBalance(a.direction, beforeEnd[a.code]),
        },
        children: [],
      });
    }
    // 挂树 + 自底向上汇总
    const roots = [];
    for (const node of nodes.values()) {
      const parent = node.parent_code ? nodes.get(node.parent_code) : null;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    const rollup = (node) => {
      for (const child of node.children) {
        rollup(child);
        // 借贷发生额与方向无关，直接累加
        node.current.debit = round2(node.current.debit + child.current.debit);
        node.current.credit = round2(node.current.credit + child.current.credit);
        node.ytd.debit = round2(node.ytd.debit + child.ytd.debit);
        node.ytd.credit = round2(node.ytd.credit + child.ytd.credit);
        // 余额按「父科目方向」换算：子科目方向与父方向不同则取负
        // （例如 2221 应交税费为贷方科目，其子科目 222102 进项税额为借方科目）
        const sign = child.direction === node.direction ? 1 : -1;
        node.opening_balance = round2(node.opening_balance + sign * child.opening_balance);
        node.current.balance = round2(node.current.balance + sign * child.current.balance);
        node.ytd.balance = round2(node.ytd.balance + sign * child.ytd.balance);
      }
    };
    for (const root of roots) rollup(root);
    return { period, startDate, endDate, yearStart: yStart, rows: roots };
  }, { perm: 'finance.view' });

  // ============================================================
  // 10. 科目余额表（试算平衡）
  // ============================================================
  router.get('/api/finance/trial-balance', async (ctx) => {
    const { period, startDate, endDate } = resolveRange(ctx.query);
    const { list } = loadAccounts();
    const opening = sumsBefore(startDate);
    const current = sumsByCode(startDate, endDate);

    const rows = [];
    for (const a of list) {
      const o = opening[a.code];
      const c = current[a.code];
      const openingBalance = normalBalance(a.direction, o);
      const debit = round2(c?.debit);
      const credit = round2(c?.credit);
      const closingBalance = round2(openingBalance + normalBalance(a.direction, c));
      // 无期初、无发生额、无期末的科目不展示
      if (openingBalance === 0 && debit === 0 && credit === 0 && closingBalance === 0) continue;
      rows.push({
        code: a.code, name: a.name, category: a.category, direction: a.direction,
        parent_code: a.parent_code, is_leaf: a.is_leaf,
        opening_balance: openingBalance, debit, credit, closing_balance: closingBalance,
      });
    }
    const totals = rows.reduce((t, r) => {
      if (r.direction === 'DEBIT') {
        t.opening_debit = round2(t.opening_debit + r.opening_balance);
        t.closing_debit = round2(t.closing_debit + r.closing_balance);
      } else {
        t.opening_credit = round2(t.opening_credit + r.opening_balance);
        t.closing_credit = round2(t.closing_credit + r.closing_balance);
      }
      t.debit = round2(t.debit + r.debit);
      t.credit = round2(t.credit + r.credit);
      return t;
    }, { opening_debit: 0, opening_credit: 0, debit: 0, credit: 0, closing_debit: 0, closing_credit: 0 });
    totals.balanced = Math.abs(totals.debit - totals.credit) <= 0.01
      && Math.abs(totals.opening_debit - totals.opening_credit) <= 0.01
      && Math.abs(totals.closing_debit - totals.closing_credit) <= 0.01;
    return { period, startDate, endDate, rows, totals };
  }, { perm: 'finance.view' });

  // ============================================================
  // 11. 明细账（逐笔余额，含期初/期末）
  // ============================================================
  router.get('/api/finance/ledger', async (ctx) => {
    const { page, pageSize, offset, q } = pageArgs(ctx.req, 50);
    const code = String(q.accountCode || '').trim();
    if (!code) throw new ApiError('请指定 accountCode（科目编码）');
    const acc = get('SELECT code, name, category, direction, parent_code, level, is_leaf FROM accounts WHERE code = ?', code);
    if (!acc) throw new ApiError(`科目不存在：${code}`, 404, 'NOT_FOUND');
    const { startDate, endDate } = resolveRange(q, { defaultStart: '1900-01-01', defaultEnd: todayStr() });
    const openingBalance = normalBalance(acc.direction, sumsBefore(startDate)[code]);

    const where = `WHERE vl.account_code = ? AND v.status = 'POSTED' AND v.voucher_date >= ? AND v.voucher_date <= ?`;
    const params = [code, startDate, endDate];
    const total = get(`SELECT COUNT(*) AS c FROM voucher_lines vl JOIN vouchers v ON v.id = vl.voucher_id ${where}`, ...params)?.c || 0;
    const agg = get(`SELECT ROUND(COALESCE(SUM(vl.debit), 0), 2) AS debit, ROUND(COALESCE(SUM(vl.credit), 0), 2) AS credit
      FROM voucher_lines vl JOIN vouchers v ON v.id = vl.voucher_id ${where}`, ...params);
    // 用窗口函数在整段区间上累计「借-贷」，再按页截取，保证翻页后余额连续
    const rows = all(`
      SELECT vl.id, vl.line_no, vl.account_code, vl.summary, ROUND(vl.debit, 2) AS debit, ROUND(vl.credit, 2) AS credit,
             vl.partner_type, vl.partner_id, vl.partner_name,
             v.id AS voucher_id, v.voucher_no, v.voucher_date, v.period, v.voucher_type,
             v.source_type, v.source_id,
             ROUND(SUM(vl.debit - vl.credit) OVER (ORDER BY v.voucher_date, v.id, vl.line_no), 2) AS cum_net
      FROM voucher_lines vl JOIN vouchers v ON v.id = vl.voucher_id
      ${where}
      ORDER BY v.voucher_date, v.id, vl.line_no
      LIMIT ? OFFSET ?`, ...params, pageSize, offset);
    for (const r of rows) {
      r.balance = round2(openingBalance + (acc.direction === 'CREDIT' ? -r.cum_net : r.cum_net));
      delete r.cum_net;
    }
    const closingBalance = round2(openingBalance + normalBalance(acc.direction, agg));
    return {
      account: acc, startDate, endDate,
      opening_balance: openingBalance, closing_balance: closingBalance,
      total_debit: round2(agg?.debit), total_credit: round2(agg?.credit),
      rows, total, page, pageSize,
    };
  }, { perm: 'finance.view' });

  // ============================================================
  // 12. 利润表（本月 + 本年累计）
  // ============================================================
  router.get('/api/finance/income-statement', async (ctx) => {
    const period = resolvePeriod(ctx.query.period, currentPeriod());
    const startDate = monthStart(period);
    const endDate = monthEnd(period);
    const yStart = yearStart(period);
    const { byCode } = loadAccounts();
    const current = buildIncomeStatement(byCode, startDate, endDate);
    const ytd = buildIncomeStatement(byCode, yStart, endDate);
    const items = INCOME_ITEMS.map((d) => ({
      key: d.key, label: d.label, level: d.level || 0, subtotal: !!d.subtotal,
      current: current[d.key], ytd: ytd[d.key],
    }));
    return { period, startDate, endDate, yearStart: yStart, current, ytd, items };
  }, { perm: 'finance.view' });

  // ============================================================
  // 13. 资产负债表（按期末累计余额）
  // ============================================================
  router.get('/api/finance/balance-sheet', async (ctx) => {
    const period = resolvePeriod(ctx.query.period, currentPeriod());
    const asOfDate = ctx.query.asOfDate ? requireDate(ctx.query.asOfDate, 'asOfDate') : monthEnd(period);
    const { byCode } = loadAccounts();
    return { period, ...buildBalanceSheet(byCode, asOfDate) };
  }, { perm: 'finance.view' });

  // ============================================================
  // 14. 现金流量表（简化）
  // ============================================================
  router.get('/api/finance/cash-flow', async (ctx) => {
    const period = resolvePeriod(ctx.query.period, currentPeriod());
    return buildCashFlow(period);
  }, { perm: 'finance.view' });

  // ============================================================
  // 15. 账龄分析（应收 / 应付）
  // ============================================================
  function agingAnalysis(invoiceType) {
    const today = todayStr();
    const invoices = all(`
      SELECT i.id, i.invoice_no, i.invoice_date, i.due_date, i.partner_id,
             ROUND(i.total_amount - i.paid_amount, 2) AS remain_amount,
             COALESCE(c.name, s.name) AS partner_name, COALESCE(c.code, s.code) AS partner_code,
             CAST(COALESCE(julianday(?) - julianday(i.due_date), 0) AS INTEGER) AS overdue_days
      ${INVOICE_JOINS}
      WHERE i.invoice_type = ? AND ${openInvoiceSql('i', invoiceType)}
      ORDER BY i.due_date, i.id`, today, invoiceType);
    const partners = new Map();
    const bucketTotals = Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, { amount: 0, count: 0 }]));
    let totalAmount = 0;
    let totalCount = 0;
    for (const inv of invoices) {
      const remain = round2(inv.remain_amount);
      if (remain <= 0.005) continue;
      const days = Number(inv.overdue_days) || 0;
      const bucket = AGING_BUCKETS.find((b) => days <= b.max) || AGING_BUCKETS[AGING_BUCKETS.length - 1];
      const key = inv.partner_id;
      if (!partners.has(key)) {
        partners.set(key, {
          partner_id: inv.partner_id, partner_code: inv.partner_code, partner_name: inv.partner_name,
          invoice_count: 0, total: 0, max_overdue_days: 0, oldest_due_date: inv.due_date,
          '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0,
        });
      }
      const row = partners.get(key);
      row.invoice_count += 1;
      row.total = round2(row.total + remain);
      row[bucket.key] = round2(row[bucket.key] + remain);
      if (days > row.max_overdue_days) row.max_overdue_days = days;
      if (inv.due_date && (!row.oldest_due_date || inv.due_date < row.oldest_due_date)) row.oldest_due_date = inv.due_date;
      bucketTotals[bucket.key].amount = round2(bucketTotals[bucket.key].amount + remain);
      bucketTotals[bucket.key].count += 1;
      totalAmount = round2(totalAmount + remain);
      totalCount += 1;
    }
    const rows = [...partners.values()].sort((a, b) => b.total - a.total);
    return {
      asOfDate: today,
      invoiceType,
      rows,
      summary: {
        buckets: AGING_BUCKETS.map((b) => ({
          key: b.key, label: b.label,
          amount: bucketTotals[b.key].amount, count: bucketTotals[b.key].count,
          ratio: totalAmount ? Math.round((bucketTotals[b.key].amount / totalAmount) * 1000) / 10 : 0,
        })),
        total: { amount: totalAmount, count: totalCount, partner_count: rows.length },
      },
    };
  }

  router.get('/api/finance/ar-aging', async () => agingAnalysis('AR'), { perm: 'finance.view' });
  router.get('/api/finance/ap-aging', async () => agingAnalysis('AP'), { perm: 'finance.view' });

  // ============================================================
  // 16. 应收 / 应付汇总（Top 20 往来单位余额排行）
  // ============================================================
  function partnerSummary(invoiceType) {
    const today = todayStr();
    const open = openInvoiceSql('i', invoiceType);
    const rows = all(`
      SELECT i.partner_id,
             COALESCE(c.name, s.name) AS partner_name,
             COALESCE(c.code, s.code) AS partner_code,
             COUNT(*) AS invoice_count,
             ROUND(SUM(i.total_amount), 2) AS total_amount,
             ROUND(SUM(i.paid_amount), 2) AS paid_amount,
             ROUND(SUM(i.total_amount - i.paid_amount), 2) AS remain_amount,
             ROUND(SUM(CASE WHEN i.due_date < ? THEN i.total_amount - i.paid_amount ELSE 0 END), 2) AS overdue_amount,
             MIN(i.due_date) AS oldest_due_date,
             MAX(CAST(COALESCE(julianday(?) - julianday(i.due_date), 0) AS INTEGER)) AS max_overdue_days
      ${INVOICE_JOINS}
      WHERE i.invoice_type = ? AND ${open}
      GROUP BY i.partner_id
      HAVING remain_amount > 0.005
      ORDER BY remain_amount DESC
      LIMIT 20`, today, today, invoiceType);
    const summary = get(`SELECT ROUND(COALESCE(SUM(total_amount - paid_amount), 0), 2) AS total_amount,
        COUNT(*) AS invoice_count, COUNT(DISTINCT partner_id) AS partner_count
      FROM invoices i WHERE i.invoice_type = ? AND ${open}`, invoiceType);
    return {
      asOfDate: today, invoiceType, limit: 20, rows,
      summary: {
        total_amount: round2(summary?.total_amount),
        invoice_count: summary?.invoice_count || 0,
        partner_count: summary?.partner_count || 0,
      },
    };
  }

  router.get('/api/finance/receivable-summary', async () => partnerSummary('AR'), { perm: 'finance.view' });
  router.get('/api/finance/payable-summary', async () => partnerSummary('AP'), { perm: 'finance.view' });

  // ============================================================
  // 17. 科目映射表（gl_mappings）
  // ============================================================
  function mappingRows() {
    return all(`SELECT m.key, m.account_code, m.description,
        a.name AS account_name, a.category, a.direction, a.is_leaf, a.status
      FROM gl_mappings m
      LEFT JOIN accounts a ON a.code = m.account_code
      ORDER BY m.key`).map((r) => ({ ...r, label: GL_KEY_LABELS[r.key] || r.key }));
  }

  router.get('/api/finance/gl-mappings', async () => {
    const rows = mappingRows();
    return { rows, total: rows.length };
  }, { perm: 'finance.view' });

  router.put('/api/finance/gl-mappings', async (ctx) => {
    const body = ctx.body || {};
    const key = String(body.key || '').trim();
    const accountCode = String(body.account_code || '').trim();
    if (!key) throw new ApiError('缺少映射键 key');
    if (!accountCode) throw new ApiError('缺少科目编码 account_code');
    const exist = get('SELECT * FROM gl_mappings WHERE key = ?', key);
    if (!exist) throw new ApiError(`未知的映射键：${key}`);
    const acc = get('SELECT code, name, category, direction, is_leaf, status FROM accounts WHERE code = ?', accountCode);
    if (!acc) throw new ApiError(`科目不存在：${accountCode}`);
    if (acc.status !== '启用') throw new ApiError(`科目 ${accountCode} 已停用，不能映射`);
    if (!Number(acc.is_leaf)) throw new ApiError(`科目 ${accountCode} 不是明细科目，请选择最末级科目`);
    run('UPDATE gl_mappings SET account_code = ? WHERE key = ?', accountCode, key);
    clearCache(); // 过账与报表缓存必须失效
    audit(ctx.user, '修改', 'finance', 'GL_MAPPING', key, `科目映射 ${key}: ${exist.account_code} → ${accountCode}`, ctx.ip);
    return mappingRows().find((r) => r.key === key);
  }, { perm: 'finance.edit' });
}
