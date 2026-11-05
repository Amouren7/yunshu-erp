/** 单据类型注册表：驱动前端通用单据页 + 后端校验/过账 */

const S = (value, label, color) => ({ value, label, color });

const BASE_STATUS = {
  DRAFT: S('DRAFT', '草稿', 'default'),
  SUBMITTED: S('SUBMITTED', '待审批', 'processing'),
  APPROVED: S('APPROVED', '已审核', 'success'),
  VOID: S('VOID', '已作废', 'error'),
  CLOSED: S('CLOSED', '已关闭', 'default'),
};

const baseTransitions = [
  { action: 'submit', label: '提交', from: ['DRAFT'], to: 'SUBMITTED', perm: 'submit', primary: true },
  { action: 'approve', label: '审核', from: ['SUBMITTED'], to: 'APPROVED', perm: 'approve', danger: false, confirm: true },
  { action: 'void', label: '作废', from: ['DRAFT', 'SUBMITTED'], to: 'VOID', perm: 'edit', confirm: true },
];

const warehouseField = { key: 'warehouse_id', label: '仓库', type: 'warehouse', required: true, span: 8 };

const commonHeader = [
  { key: 'doc_date', label: '单据日期', type: 'date', required: true, span: 8, default: 'today' },
];

const lineDefault = {
  mode: 'items',
  itemRequired: true,
  fields: ['item_id', 'qty', 'price', 'discount_rate', 'tax_rate', 'amount', 'tax_amount', 'warehouse_id', 'batch_no', 'remark'],
};

/** @type {Record<string, any>} */
export const DOC_TYPES = {
  SO: {
    code: 'SO',
    name: '销售订单',
    module: 'sales',
    docNoLabel: '订单编号',
    prefix: 'XSDD',
    partnerType: 'customer',
    effect: null,
    fields: [
      ...commonHeader,
      { key: 'partner_id', label: '客户', type: 'customer', required: true, span: 8 },
      { key: 'contact', label: '联系人', type: 'text', span: 8 },
      { key: 'phone', label: '联系电话', type: 'text', span: 8 },
      { key: 'salesperson_id', label: '业务员', type: 'employee', span: 8 },
      { key: 'department_id', label: '销售部门', type: 'department', span: 8 },
      { key: 'warehouse_id', label: '发货仓库', type: 'warehouse', required: true, span: 8 },
      { key: 'payment_terms', label: '付款条件', type: 'select', options: ['现款现货', '货到付款', '月结30天', '月结60天', '月结90天', '预付30%', '预付50%'], span: 8 },
      { key: 'due_date', label: '约定交期', type: 'date', span: 8 },
      { key: 'currency', label: '币种', type: 'currency', span: 8 },
      { key: 'project', label: '项目/合同', type: 'text', span: 8 },
      { key: 'x_sale_type', label: '销售类型', type: 'select', options: ['标准销售', '样品销售', '试用借用', '换货销售', '补货'], span: 8, extra: true },
      { key: 'x_order_source', label: '订单来源', type: 'select', options: ['业务员', '官网', '电话', '展会', '老客户转介绍', '电商平台'], span: 8, extra: true },
      { key: 'address', label: '收货地址', type: 'text', span: 16 },
      { key: 'remark', label: '备注', type: 'textarea', span: 24 },
    ],
    lines: { ...lineDefault, warehouse: false, price: true, fields: ['item_id', 'qty', 'price', 'discount_rate', 'tax_rate', 'amount', 'tax_amount', 'remark'] },
    statuses: [
      BASE_STATUS.DRAFT, BASE_STATUS.SUBMITTED, BASE_STATUS.APPROVED,
      S('PARTIAL_SHIPPED', '部分发货', 'warning'),
      S('FULL_SHIPPED', '已发货', 'cyan'),
      S('COMPLETED', '已完成', 'success'),
      BASE_STATUS.CLOSED, BASE_STATUS.VOID,
    ],
    transitions: [
      ...baseTransitions,
      { action: 'close', label: '关闭', from: ['APPROVED', 'PARTIAL_SHIPPED', 'FULL_SHIPPED'], to: 'CLOSED', perm: 'approve', confirm: true },
    ],
    sources: ['SO'],
  },

  DN: {
    code: 'DN',
    name: '销售发货单',
    module: 'sales',
    docNoLabel: '发货单号',
    prefix: 'XSFH',
    partnerType: 'customer',
    effect: 'SALES_DELIVERY',
    fields: [
      ...commonHeader,
      { key: 'partner_id', label: '客户', type: 'customer', required: true, span: 8 },
      { key: 'contact', label: '联系人', type: 'text', span: 8 },
      { key: 'phone', label: '联系电话', type: 'text', span: 8 },
      warehouseField,
      { key: 'salesperson_id', label: '业务员', type: 'employee', span: 8 },
      { key: 'department_id', label: '销售部门', type: 'department', span: 8 },
      { key: 'payment_terms', label: '付款条件', type: 'select', options: ['现款现货', '货到付款', '月结30天', '月结60天', '月结90天', '预付30%', '预付50%'], span: 8 },
      { key: 'due_date', label: '到期日', type: 'date', span: 8 },
      { key: 'address', label: '收货地址', type: 'text', span: 16 },
      { key: 'x_logistics', label: '物流公司', type: 'text', span: 8, extra: true },
      { key: 'x_tracking_no', label: '物流单号', type: 'text', span: 8, extra: true },
      { key: 'remark', label: '备注', type: 'textarea', span: 24 },
    ],
    lines: { ...lineDefault, warehouse: false, price: true },
    statuses: [BASE_STATUS.DRAFT, BASE_STATUS.SUBMITTED, BASE_STATUS.APPROVED, BASE_STATUS.VOID],
    transitions: [...baseTransitions],
    sources: ['SO'],
  },

  SR: {
    code: 'SR',
    name: '销售退货单',
    module: 'sales',
    docNoLabel: '退货单号',
    prefix: 'XSTH',
    partnerType: 'customer',
    effect: 'SALES_RETURN',
    fields: [
      ...commonHeader,
      { key: 'partner_id', label: '客户', type: 'customer', required: true, span: 8 },
      { key: 'contact', label: '联系人', type: 'text', span: 8 },
      { key: 'phone', label: '联系电话', type: 'text', span: 8 },
      warehouseField,
      { key: 'salesperson_id', label: '业务员', type: 'employee', span: 8 },
      { key: 'x_return_reason', label: '退货原因', type: 'select', options: ['质量问题', '型号错误', '客户取消', '发货错误', '其他'], span: 8, extra: true },
      { key: 'remark', label: '备注', type: 'textarea', span: 24 },
    ],
    lines: { ...lineDefault, warehouse: false, price: true },
    statuses: [BASE_STATUS.DRAFT, BASE_STATUS.SUBMITTED, BASE_STATUS.APPROVED, BASE_STATUS.VOID],
    transitions: [...baseTransitions],
    sources: ['DN'],
  },

  PO: {
    code: 'PO',
    name: '采购订单',
    module: 'purchase',
    docNoLabel: '订单编号',
    prefix: 'CGDD',
    partnerType: 'supplier',
    effect: null,
    fields: [
      ...commonHeader,
      { key: 'partner_id', label: '供应商', type: 'supplier', required: true, span: 8 },
      { key: 'contact', label: '联系人', type: 'text', span: 8 },
      { key: 'phone', label: '联系电话', type: 'text', span: 8 },
      { key: 'warehouse_id', label: '收货仓库', type: 'warehouse', required: true, span: 8 },
      { key: 'department_id', label: '采购部门', type: 'department', span: 8 },
      { key: 'payment_terms', label: '付款条件', type: 'select', options: ['现款现货', '货到付款', '月结30天', '月结60天', '月结90天', '预付30%', '预付50%'], span: 8 },
      { key: 'due_date', label: '约定到货日', type: 'date', span: 8 },
      { key: 'currency', label: '币种', type: 'currency', span: 8 },
      { key: 'x_purchase_type', label: '采购类型', type: 'select', options: ['原材料采购', '包装物采购', '外协加工', '设备采购', '办公用品', '备品备件'], span: 8, extra: true },
      { key: 'remark', label: '备注', type: 'textarea', span: 24 },
    ],
    lines: { ...lineDefault, warehouse: false, price: true, fields: ['item_id', 'qty', 'price', 'tax_rate', 'amount', 'tax_amount', 'remark'] },
    statuses: [
      BASE_STATUS.DRAFT, BASE_STATUS.SUBMITTED, BASE_STATUS.APPROVED,
      S('PARTIAL_RECEIVED', '部分入库', 'warning'),
      S('FULL_RECEIVED', '已入库', 'cyan'),
      S('COMPLETED', '已完成', 'success'),
      BASE_STATUS.CLOSED, BASE_STATUS.VOID,
    ],
    transitions: [
      ...baseTransitions,
      { action: 'close', label: '关闭', from: ['APPROVED', 'PARTIAL_RECEIVED', 'FULL_RECEIVED'], to: 'CLOSED', perm: 'approve', confirm: true },
    ],
  },

  GRN: {
    code: 'GRN',
    name: '采购入库单',
    module: 'purchase',
    docNoLabel: '入库单号',
    prefix: 'CGRK',
    partnerType: 'supplier',
    effect: 'PURCHASE_RECEIPT',
    fields: [
      ...commonHeader,
      { key: 'partner_id', label: '供应商', type: 'supplier', required: true, span: 8 },
      { key: 'contact', label: '联系人', type: 'text', span: 8 },
      { key: 'phone', label: '联系电话', type: 'text', span: 8 },
      warehouseField,
      { key: 'department_id', label: '采购部门', type: 'department', span: 8 },
      { key: 'x_invoice_no', label: '供应商发票号', type: 'text', span: 8, extra: true },
      { key: 'remark', label: '备注', type: 'textarea', span: 24 },
    ],
    lines: { ...lineDefault, warehouse: true, price: true },
    statuses: [BASE_STATUS.DRAFT, BASE_STATUS.SUBMITTED, BASE_STATUS.APPROVED, BASE_STATUS.VOID],
    transitions: [...baseTransitions],
    sources: ['PO'],
  },

  PR: {
    code: 'PR',
    name: '采购退货单',
    module: 'purchase',
    docNoLabel: '退货单号',
    prefix: 'CGTH',
    partnerType: 'supplier',
    effect: 'PURCHASE_RETURN',
    fields: [
      ...commonHeader,
      { key: 'partner_id', label: '供应商', type: 'supplier', required: true, span: 8 },
      warehouseField,
      { key: 'contact', label: '联系人', type: 'text', span: 8 },
      { key: 'x_return_reason', label: '退货原因', type: 'select', options: ['质量问题', '规格不符', '数量差异', '交期延误', '其他'], span: 8, extra: true },
      { key: 'remark', label: '备注', type: 'textarea', span: 24 },
    ],
    lines: { ...lineDefault, warehouse: true, price: true },
    statuses: [BASE_STATUS.DRAFT, BASE_STATUS.SUBMITTED, BASE_STATUS.APPROVED, BASE_STATUS.VOID],
    transitions: [...baseTransitions],
    sources: ['GRN'],
  },

  TR: {
    code: 'TR',
    name: '库存调拨单',
    module: 'inventory',
    docNoLabel: '调拨单号',
    prefix: 'KCDB',
    partnerType: null,
    effect: 'TRANSFER',
    fields: [
      ...commonHeader,
      { key: 'warehouse_id', label: '调出仓库', type: 'warehouse', required: true, span: 8 },
      { key: 'to_warehouse_id', label: '调入仓库', type: 'warehouse', required: true, span: 8 },
      { key: 'x_handler', label: '经手人', type: 'text', span: 8, extra: true },
      { key: 'remark', label: '备注', type: 'textarea', span: 24 },
    ],
    lines: { ...lineDefault, price: false, fields: ['item_id', 'qty', 'batch_no', 'remark'] },
    statuses: [BASE_STATUS.DRAFT, BASE_STATUS.SUBMITTED, BASE_STATUS.APPROVED, BASE_STATUS.VOID],
    transitions: [...baseTransitions],
  },

  ADJ: {
    code: 'ADJ',
    name: '库存盘点单',
    module: 'inventory',
    docNoLabel: '盘点单号',
    prefix: 'KCYK',
    partnerType: null,
    effect: 'ADJUSTMENT',
    fields: [
      ...commonHeader,
      warehouseField,
      { key: 'x_stocktake_type', label: '盘点类型', type: 'select', options: ['全盘', '抽盘', '循环盘点'], span: 8, extra: true },
      { key: 'x_handler', label: '盘点人', type: 'text', span: 8, extra: true },
      { key: 'remark', label: '备注', type: 'textarea', span: 24 },
    ],
    lines: { ...lineDefault, price: false, batch: true, fields: ['item_id', 'qty', 'batch_no', 'remark'] },
    statuses: [BASE_STATUS.DRAFT, BASE_STATUS.SUBMITTED, BASE_STATUS.APPROVED, BASE_STATUS.VOID],
    transitions: [...baseTransitions],
  },

  OI: {
    code: 'OI',
    name: '其他入库单',
    module: 'inventory',
    docNoLabel: '入库单号',
    prefix: 'QTRK',
    partnerType: null,
    effect: 'OTHER_IN',
    fields: [
      ...commonHeader,
      warehouseField,
      { key: 'x_in_type', label: '入库类型', type: 'select', options: ['盘盈入库', '借入入库', '样品入库', '赠品入库', '其他'], span: 8, extra: true },
      { key: 'remark', label: '备注', type: 'textarea', span: 24 },
    ],
    lines: { ...lineDefault, price: true, fields: ['item_id', 'qty', 'price', 'batch_no', 'remark'] },
    statuses: [BASE_STATUS.DRAFT, BASE_STATUS.SUBMITTED, BASE_STATUS.APPROVED, BASE_STATUS.VOID],
    transitions: [...baseTransitions],
  },

  OO: {
    code: 'OO',
    name: '其他出库单',
    module: 'inventory',
    docNoLabel: '出库单号',
    prefix: 'QTCK',
    partnerType: null,
    effect: 'OTHER_OUT',
    fields: [
      ...commonHeader,
      warehouseField,
      { key: 'x_out_type', label: '出库类型', type: 'select', options: ['盘亏出库', '借出出库', '样品出库', '赠送出库', '研发领用', '其他'], span: 8, extra: true },
      { key: 'remark', label: '备注', type: 'textarea', span: 24 },
    ],
    lines: { ...lineDefault, price: false, fields: ['item_id', 'qty', 'batch_no', 'remark'] },
    statuses: [BASE_STATUS.DRAFT, BASE_STATUS.SUBMITTED, BASE_STATUS.APPROVED, BASE_STATUS.VOID],
    transitions: [...baseTransitions],
  },

  RC: {
    code: 'RC',
    name: '收款单',
    module: 'finance',
    docNoLabel: '收款单号',
    prefix: 'SKD',
    partnerType: 'customer',
    effect: 'RECEIPT',
    fields: [
      ...commonHeader,
      { key: 'partner_id', label: '客户', type: 'customer', required: true, span: 8 },
      { key: 'x_settle_method', label: '结算方式', type: 'select', options: ['银行转账', '现金', '承兑汇票', '微信', '支付宝', '支票'], span: 8, extra: true },
      { key: 'x_bank_account', label: '收款账户', type: 'text', span: 8, extra: true },
      { key: 'x_received_from', label: '付款方', type: 'text', span: 8, extra: true },
      { key: 'remark', label: '备注', type: 'textarea', span: 24 },
    ],
    lines: {
      mode: 'invoices',
      invoiceType: 'AR',
      itemRequired: false,
      fields: ['invoice_id', 'amount', 'remark'],
    },
    statuses: [BASE_STATUS.DRAFT, BASE_STATUS.SUBMITTED, BASE_STATUS.APPROVED, BASE_STATUS.VOID],
    transitions: [...baseTransitions],
  },

  PY: {
    code: 'PY',
    name: '付款单',
    module: 'finance',
    docNoLabel: '付款单号',
    prefix: 'FKD',
    partnerType: 'supplier',
    effect: 'PAYMENT',
    fields: [
      ...commonHeader,
      { key: 'partner_id', label: '供应商', type: 'supplier', required: true, span: 8 },
      { key: 'x_settle_method', label: '结算方式', type: 'select', options: ['银行转账', '现金', '承兑汇票', '微信', '支付宝', '支票'], span: 8, extra: true },
      { key: 'x_bank_account', label: '付款账户', type: 'text', span: 8, extra: true },
      { key: 'remark', label: '备注', type: 'textarea', span: 24 },
    ],
    lines: {
      mode: 'invoices',
      invoiceType: 'AP',
      itemRequired: false,
      fields: ['invoice_id', 'amount', 'remark'],
    },
    statuses: [BASE_STATUS.DRAFT, BASE_STATUS.SUBMITTED, BASE_STATUS.APPROVED, BASE_STATUS.VOID],
    transitions: [...baseTransitions],
  },
};

// 需要生成财务凭证的单据
export const GL_DOC_TYPES = ['DN', 'SR', 'GRN', 'PR', 'ADJ', 'OI', 'OO', 'RC', 'PY'];

export function getDocType(code) {
  const t = DOC_TYPES[code];
  if (!t) throw new Error(`未知单据类型: ${code}`);
  return t;
}

/** 展示用状态标签 */
export function statusMeta(docType, status) {
  const t = DOC_TYPES[docType];
  const s = t?.statuses?.find((x) => x.value === status);
  return s || { value: status, label: status, color: 'default' };
}

/** 状态机：当前状态下可执行的动作 */
export function availableActions(docType, status, permissions = [], isAdmin = false) {
  const t = DOC_TYPES[docType];
  if (!t) return [];
  return t.transitions
    .filter((tr) => tr.from.includes(status))
    .filter((tr) => {
      if (isAdmin) return true;
      const perm = `${t.module}.${tr.perm}`;
      return permissions.includes('*') || permissions.includes(perm) || permissions.includes(`${t.module}.*`);
    })
    .map((tr) => ({ action: tr.action, label: tr.label, to: tr.to, confirm: !!tr.confirm, primary: !!tr.primary }));
}
