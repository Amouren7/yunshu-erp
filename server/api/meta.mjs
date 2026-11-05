import { all, get } from '../db.mjs';
import { DOC_TYPES, availableActions } from '../lib/docTypes.mjs';

export const MODULES = [
  { key: 'dashboard', name: '工作台' },
  { key: 'basedata', name: '基础资料' },
  { key: 'sales', name: '销售管理' },
  { key: 'purchase', name: '采购管理' },
  { key: 'inventory', name: '库存管理' },
  { key: 'production', name: '生产管理' },
  { key: 'finance', name: '财务管理' },
  { key: 'hr', name: '人力资源' },
  { key: 'crm', name: '客户关系' },
  { key: 'reports', name: '报表中心' },
  { key: 'system', name: '系统管理' },
];

export const ACTIONS = [
  { key: 'view', name: '查看' },
  { key: 'create', name: '新建' },
  { key: 'edit', name: '编辑' },
  { key: 'delete', name: '删除' },
  { key: 'submit', name: '提交' },
  { key: 'approve', name: '审核/审批' },
  { key: 'export', name: '导出' },
];

export const ENUMS = {
  itemTypes: ['原料', '半成品', '成品', '服务', '虚拟件', '包装物'],
  itemStatus: ['启用', '停用'],
  customerCategories: ['普通客户', '重点客户', '经销商', '终端客户', 'VIP客户'],
  customerLevels: ['A', 'B', 'C', 'D'],
  supplierCategories: ['原材料供应商', '包装材料', '外协加工', '物流服务', '设备供应商', '办公用品', '其他'],
  warehouseTypes: ['原料仓', '成品仓', '半成品仓', '不良品仓', '委外仓', '在途仓'],
  regions: ['华南', '华东', '华北', '华中', '西南', '西北', '东北', '海外'],
  paymentTerms: ['现款现货', '货到付款', '月结30天', '月结60天', '月结90天', '预付100%', '预付30%', '预付50%'],
  settleMethods: ['银行转账', '现金', '承兑汇票', '微信', '支付宝', '支票'],
  saleTypes: ['标准销售', '样品销售', '试用借用', '换货销售', '补货'],
  orderSources: ['业务员', '官网', '电话', '展会', '老客户转介绍', '电商平台'],
  purchaseTypes: ['原材料采购', '包装物采购', '外协加工', '设备采购', '办公用品', '备品备件'],
  returnReasons: ['质量问题', '规格不符', '数量差异', '客户取消', '发货错误', '交期延误', '其他'],
  inTypes: ['盘盈入库', '借入入库', '样品入库', '赠品入库', '其他'],
  outTypes: ['盘亏出库', '借出出库', '样品出库', '赠送出库', '研发领用', '其他'],
  stocktakeTypes: ['全盘', '抽盘', '循环盘点'],
  employeeTypes: ['正式员工', '试用期', '实习生', '外包人员'],
  employeeStatus: ['在职', '离职', '停薪留职'],
  attendanceStatus: ['正常', '迟到', '早退', '缺勤', '请假', '出差', '加班'],
  leaveTypes: ['事假', '病假', '年假', '调休', '婚假', '产假', '丧假'],
  leaveStatus: ['待审批', '已批准', '已驳回'],
  payrollStatus: ['草稿', '已确认', '已发放'],
  leadSources: ['官网咨询', '展会', '电话拜访', '转介绍', '广告投放', '陌生拜访', '电商平台'],
  leadStatus: ['待跟进', '已联系', '已确认商机', '已转客户', '已流失'],
  opportunityStages: ['初步接洽', '需求确认', '方案报价', '商务谈判', '赢单', '输单'],
  contractStatus: ['草稿', '执行中', '已完成', '已终止'],
  activityTypes: ['电话沟通', '上门拜访', '邮件往来', '会议', '演示', '其他'],
  education: ['高中及以下', '大专', '本科', '硕士', '博士'],
  woStatus: [
    { value: 'DRAFT', label: '草稿' },
    { value: 'RELEASED', label: '已下达' },
    { value: 'IN_PROGRESS', label: '生产中' },
    { value: 'COMPLETED', label: '已完工' },
    { value: 'CLOSED', label: '已关闭' },
    { value: 'VOID', label: '已作废' },
  ],
  woPriority: ['低', '普通', '高', '紧急'],
  operationStatus: ['待开始', '进行中', '已完成'],
  accountCategories: [
    { value: 'ASSET', label: '资产' },
    { value: 'LIABILITY', label: '负债' },
    { value: 'EQUITY', label: '所有者权益' },
    { value: 'COST', label: '成本' },
    { value: 'INCOME', label: '收入' },
    { value: 'EXPENSE', label: '费用' },
  ],
  invoiceStatus: ['未收', '部分收款', '已收', '未付', '部分付款', '已付', '已核销', '已作废'],
  docTypes: Object.fromEntries(Object.entries(DOC_TYPES).map(([k, v]) => [k, {
    code: v.code, name: v.name, module: v.module, docNoLabel: v.docNoLabel,
    partnerType: v.partnerType, fields: v.fields, lines: v.lines,
    statuses: v.statuses, transitions: v.transitions.map((t) => ({ action: t.action, label: t.label, from: t.from, to: t.to, perm: t.perm, confirm: !!t.confirm, primary: !!t.primary })), sources: v.sources || [],
  }])),
};

export function register(router) {
  // 全局搜索
  router.get('/api/search', async (ctx) => {
    const q = String(ctx.query.q || '').trim();
    if (!q) return { documents: [], customers: [], suppliers: [], items: [] };
    const like = `%${q}%`;
    const PATH_MAP = {
      SO: '/sales/orders', DN: '/sales/deliveries', SR: '/sales/returns',
      PO: '/purchase/orders', GRN: '/purchase/receipts', PR: '/purchase/returns',
      TR: '/inventory/transfers', ADJ: '/inventory/stocktake', OI: '/inventory/other-in', OO: '/inventory/other-out',
      RC: '/finance/receipts', PY: '/finance/payments',
    };
    const documents = all(`SELECT d.id, d.doc_no, d.doc_type, d.doc_date, d.status, d.total_amount,
        COALESCE(c.name, s.name) AS partner_name
      FROM documents d
      LEFT JOIN customers c ON c.id = d.partner_id AND d.partner_type = 'customer'
      LEFT JOIN suppliers s ON s.id = d.partner_id AND d.partner_type = 'supplier'
      WHERE d.doc_no LIKE ? OR d.remark LIKE ?
      ORDER BY d.id DESC LIMIT 8`, like, like).map((r) => ({
      ...r, path: `${PATH_MAP[r.doc_type] || '/dashboard'}/${r.id}`,
      doc_type_name: DOC_TYPES[r.doc_type]?.name || r.doc_type,
    }));
    const customers = all(`SELECT id, code, name, phone FROM customers WHERE code LIKE ? OR name LIKE ? OR short_name LIKE ? LIMIT 5`, like, like, like);
    const suppliers = all(`SELECT id, code, name, phone FROM suppliers WHERE code LIKE ? OR name LIKE ? LIMIT 5`, like, like);
    const items = all(`SELECT id, code, name, spec FROM items WHERE code LIKE ? OR name LIKE ? OR spec LIKE ? LIMIT 5`, like, like, like);
    return { documents, customers, suppliers, items };
  }, { perm: 'dashboard.view' });

  router.get('/api/meta', async () => {
    const settings = Object.fromEntries(all('SELECT key, value FROM settings').map((r) => [r.key, r.value]));
    return {
      app: { name: '云枢ERP', version: '1.0.0', company: settings.company_name || '云枢科技（深圳）有限公司' },
      enums: ENUMS,
      docTypes: ENUMS.docTypes,
      modules: MODULES,
      actions: ACTIONS,
      dicts: {
        uoms: all('SELECT id, code, name FROM uoms ORDER BY id'),
        currencies: all('SELECT * FROM currencies ORDER BY is_base DESC, code'),
        taxRates: all('SELECT * FROM tax_rates ORDER BY rate'),
        itemCategories: all('SELECT id, code, name, parent_id FROM item_categories ORDER BY sort, code'),
        warehouses: all('SELECT id, code, name, type FROM warehouses ORDER BY code'),
        departments: all('SELECT id, code, name, parent_id FROM departments ORDER BY sort, code'),
        accounts: all('SELECT id, code, name, category, direction, is_leaf FROM accounts ORDER BY code'),
      },
      settings: {
        company_name: settings.company_name,
        company_tel: settings.company_tel,
        company_address: settings.company_address,
        fiscal_year_start: settings.fiscal_year_start || '01',
        allow_negative_stock: settings.allow_negative_stock,
        system_date: new Date().toISOString().slice(0, 10),
      },
    };
  }, { perm: 'dashboard.view' });

  // 通用下拉选项
  router.get('/api/meta/options', async (ctx) => {
    const type = ctx.query.type;
    const keyword = ctx.query.keyword || '';
    const limit = Math.min(200, Number(ctx.query.limit) || 30);
    const kw = `%${keyword}%`;
    if (!type) return [];
    switch (type) {
      case 'customer':
        return all('SELECT id AS value, name AS label, code, phone, credit_limit FROM customers WHERE status = \'正常\' AND (name LIKE ? OR code LIKE ? OR short_name LIKE ?) ORDER BY code LIMIT ?', kw, kw, kw, limit);
      case 'supplier':
        return all('SELECT id AS value, name AS label, code, phone FROM suppliers WHERE status = \'正常\' AND (name LIKE ? OR code LIKE ?) ORDER BY code LIMIT ?', kw, kw, limit);
      case 'item':
        return all(`SELECT i.id AS value, i.name AS label, i.code, i.spec, i.uom, i.price_purchase, i.price_sale, i.tax_rate,
                    COALESCE(SUM(sb.qty),0) AS stock_qty
                    FROM items i LEFT JOIN stock_balances sb ON sb.item_id = i.id
                    WHERE i.status = '启用' AND (i.name LIKE ? OR i.code LIKE ? OR i.spec LIKE ? OR i.barcode LIKE ?)
                    GROUP BY i.id ORDER BY i.code LIMIT ?`, kw, kw, kw, kw, limit);
      case 'employee':
        return all('SELECT id AS value, name AS label, code, position FROM employees WHERE status = \'在职\' AND (name LIKE ? OR code LIKE ?) ORDER BY code LIMIT ?', kw, kw, limit);
      case 'user':
        return all('SELECT id AS value, name AS label, username FROM users WHERE status = \'ENABLED\' AND (name LIKE ? OR username LIKE ?) ORDER BY id LIMIT ?', kw, kw, limit);
      case 'warehouse':
        return all('SELECT id AS value, name AS label, code, type FROM warehouses WHERE status = \'ENABLED\' AND (name LIKE ? OR code LIKE ?) ORDER BY code LIMIT ?', kw, kw, limit);
      case 'department':
        return all('SELECT id AS value, name AS label, code FROM departments WHERE status = \'ENABLED\' AND (name LIKE ? OR code LIKE ?) ORDER BY sort LIMIT ?', kw, kw, limit);
      case 'account':
        return all('SELECT code AS value, name AS label, code AS sub, category FROM accounts WHERE status = \'启用\' AND is_leaf = 1 AND (name LIKE ? OR code LIKE ?) ORDER BY code LIMIT ?', kw, kw, limit);
      case 'invoice': {
        const invoiceType = ctx.query.invoiceType === 'AP' ? 'AP' : 'AR';
        const partnerId = Number(ctx.query.partnerId || 0);
        const params = [invoiceType];
        let extra = '';
        if (partnerId) { extra = ' AND partner_id = ?'; params.push(partnerId); }
        params.push(kw, kw, limit);
        return all(`SELECT id AS value, invoice_no AS label, invoice_no, total_amount, paid_amount,
                    ROUND(total_amount - paid_amount, 2) AS remain_amount, invoice_date, due_date, doc_no
                    FROM invoices WHERE invoice_type = ? AND status NOT IN ('已收','已付','已核销','已作废') ${extra}
                    AND (invoice_no LIKE ? OR doc_no LIKE ?) ORDER BY due_date LIMIT ?`, ...params);
      }
      case 'customer-invoice': {
        const pid = Number(ctx.query.partnerId || 0);
        return all(`SELECT id AS value, invoice_no AS label, invoice_no, total_amount, paid_amount,
                    ROUND(total_amount - paid_amount, 2) AS remain_amount, due_date FROM invoices
                    WHERE invoice_type = 'AR' AND partner_id = ? AND status NOT IN ('已收','已核销','已作废')
                    ORDER BY due_date`, pid);
      }
      default:
        return [];
    }
  });

  // 单据可执行动作
  router.get('/api/meta/doc-actions', async (ctx) => {
    const { docType, status } = ctx.query;
    if (!docType) return [];
    return availableActions(docType, status, ctx.user.permissions || [], (ctx.user.permissions || []).includes('*'));
  });
}
