/**
 * 财务模块页面公用常量与小组件
 * ------------------------------------------------------------
 * 仅服务于 /finance/* 页面，统一发票状态、单据跳转路径、科目类别、
 * 凭证类型等业务术语，避免各页面重复定义。
 */
import { Tag } from 'antd';
import { SimpleStatus } from '../../components/StatusTag';
import { fmtMoney } from '../../utils/format';

export type InvoiceType = 'AR' | 'AP';

/* ---------------- 发票 ---------------- */
export const INVOICE_STATUS: Record<InvoiceType, string[]> = {
  AR: ['未收', '部分收款', '已收', '已核销', '已作废'],
  AP: ['未付', '部分付款', '已付', '已核销', '已作废'],
};

/** 已结清/无效状态（不再计算逾期） */
export const CLOSED_INVOICE_STATUS = ['已收', '已付', '已核销', '已作废'];

export function invoiceStatusOptions(type: InvoiceType): { label: string; value: string }[] {
  return INVOICE_STATUS[type].map((s) => ({ label: s, value: s }));
}

export function invoiceTypeLabel(type?: string) {
  return type === 'AP' ? '应付' : '应收';
}

/** 往来单位称谓 */
export function partnerLabel(type?: string) {
  return type === 'AP' ? '供应商' : '客户';
}

/* ---------------- 单据跳转 ---------------- */
export const DOC_PATHS: Record<string, string> = {
  SO: '/sales/orders',
  DN: '/sales/deliveries',
  SR: '/sales/returns',
  PO: '/purchase/orders',
  GRN: '/purchase/receipts',
  PR: '/purchase/returns',
  TR: '/inventory/transfers',
  ADJ: '/inventory/stocktake',
  OI: '/inventory/other-in',
  OO: '/inventory/other-out',
  RC: '/finance/receipts',
  PY: '/finance/payments',
};

export const DOC_TYPE_LABEL: Record<string, string> = {
  SO: '销售订单',
  DN: '销售发货单',
  SR: '销售退货单',
  PO: '采购订单',
  GRN: '采购入库单',
  PR: '采购退货单',
  TR: '库存调拨单',
  ADJ: '库存盘点单',
  OI: '其他入库单',
  OO: '其他出库单',
  RC: '收款单',
  PY: '付款单',
};

export function docPathOf(docType?: string, id?: any): string | null {
  if (!docType || !id) return null;
  const base = DOC_PATHS[docType];
  return base ? `${base}/${id}` : null;
}

/* ---------------- 凭证 ---------------- */
export const VOUCHER_TYPE_LABEL: Record<string, string> = {
  AUTO: '系统生成',
  MANUAL: '手工凭证',
};

export const VOUCHER_STATUS_LABEL: Record<string, string> = {
  POSTED: '已过账',
  DRAFT: '草稿',
};

/** 自动凭证来源类型（source_type） */
export const VOUCHER_SOURCE_LABEL: Record<string, string> = {
  DN: '销售发货',
  SR: '销售退货',
  GRN: '采购入库',
  PR: '采购退货',
  ADJ: '库存盘点',
  OI: '其他入库',
  OO: '其他出库',
  RC: '收款单',
  PY: '付款单',
  FEE: '费用计提',
  PAYROLL: '工资',
  DEPR: '折旧',
  PROD: '生产',
};

/* ---------------- 会计科目 ---------------- */
export const ACCOUNT_CATEGORY_LABEL: Record<string, string> = {
  ASSET: '资产',
  LIABILITY: '负债',
  EQUITY: '所有者权益',
  INCOME: '收入',
  COST: '成本',
  EXPENSE: '费用',
};

export const DIRECTION_LABEL: Record<string, string> = {
  DEBIT: '借',
  CREDIT: '贷',
};

/** 科目映射业务说明（gl_mappings.key → 说明） */
export const GL_KEY_DESC: Record<string, string> = {
  AR: '销售发货 / 销售退货生成的应收凭证',
  AP: '采购入库 / 采购退货生成的应付凭证',
  REVENUE: '销售收入确认（发货审核）',
  COGS: '销售成本结转（发货审核）',
  INVENTORY: '库存商品（产成品完工 / 盘盈盘亏）',
  RAW_MATERIAL: '原材料（采购入库 / 生产领料）',
  TAX_OUTPUT: '销项税额（销售发票）',
  TAX_INPUT: '进项税额（采购发票）',
  CASH: '库存现金（现金收付款）',
  BANK: '银行存款（银行收付款）',
  WIP: '生产成本（生产领料 / 完工入库）',
  OVERHEAD: '制造费用（生产费用归集）',
  ASSET_PENDING: '待处理财产损溢（盘盈盘亏）',
  SALARY: '应付职工薪酬（工资计提 / 发放）',
  FIN_EXPENSE: '财务费用（手续费等）',
  OTHER_INCOME: '营业外收入',
  OTHER_EXPENSE: '营业外支出',
};

/* ---------------- 账龄 ---------------- */
export const AGING_BUCKETS = ['0-30', '31-60', '61-90', '90+'] as const;

/* ---------------- 小组件 ---------------- */
/** 逾期天数单元格 */
export function OverdueTag({ days, status }: { days: any; status?: string }) {
  if (status && CLOSED_INVOICE_STATUS.includes(status)) return <span className="text-muted">-</span>;
  const d = Number(days) || 0;
  if (d > 0) return <span className="text-danger" style={{ fontWeight: 600 }}>逾期 {d} 天</span>;
  if (d === 0) return <span style={{ color: 'var(--warning)' }}>今日到期</span>;
  return <span className="text-muted">未到期</span>;
}

/** 发票状态标签（中文业务状态） */
export function InvoiceStatusTag({ status }: { status?: string }) {
  return <SimpleStatus value={status || '-'} />;
}

/** 借贷方向标签 */
export function DirectionTag({ direction }: { direction?: string }) {
  if (!direction) return <span className="text-muted">-</span>;
  return direction === 'DEBIT' ? <Tag color="blue">借</Tag> : <Tag color="orange">贷</Tag>;
}

/** 凭证类型标签 */
export function VoucherTypeTag({ type }: { type?: string }) {
  if (!type) return <span className="text-muted">-</span>;
  return type === 'MANUAL' ? <Tag color="purple">手工</Tag> : <Tag color="blue">系统</Tag>;
}

/** 凭证状态标签 */
export function VoucherStatusTag({ status }: { status?: string }) {
  if (status === 'POSTED') return <Tag color="green">已过账</Tag>;
  if (status === 'DRAFT') return <Tag>草稿</Tag>;
  return <Tag>{status || '-'}</Tag>;
}

/** 金额（右对齐等宽数字，负数红色） */
export function Amount({ value, strong }: { value: any; strong?: boolean }) {
  const n = Number(value) || 0;
  const cls = `num${n < 0 ? ' text-danger' : ''}`;
  return <span className={cls} style={strong ? { fontWeight: 600 } : undefined}>{fmtMoney(n)}</span>;
}

/** 左对齐缩进的项目名称（报表用） */
export function indentStyle(level: number) {
  return { paddingLeft: 8 + (level || 0) * 18 };
}
