import { useMemo, useState, type ReactNode } from 'react';
import { Button, DatePicker, Segmented, Space, Tooltip } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import ChartCard from '../../components/ChartCard';
import { fmtMoney, fmtNumber } from '../../utils/format';

export type ReportRange = [Dayjs, Dayjs];

export type RangeKey = 'month' | 'quarter' | 'last12' | 'year';

/** 各页面默认统计区间：本月 / 近 3 月 / 近 12 月 / 今年 */
export function presetRange(key: RangeKey = 'month'): ReportRange {
  const today = dayjs();
  switch (key) {
    case 'quarter':
      return [today.startOf('month').subtract(2, 'month'), today];
    case 'last12':
      return [today.startOf('month').subtract(11, 'month'), today];
    case 'year':
      return [today.startOf('year'), today];
    default:
      return [today.startOf('month'), today];
  }
}

const RANGE_PRESETS: { key: RangeKey; label: string; make: () => ReportRange }[] = [
  { key: 'month', label: '本月', make: () => presetRange('month') },
  { key: 'quarter', label: '近3月', make: () => presetRange('quarter') },
  { key: 'last12', label: '近12月', make: () => presetRange('last12') },
  { key: 'year', label: '今年', make: () => presetRange('year') },
];

const sameRange = (a: ReportRange | null | undefined, b: ReportRange) => {
  if (!a || !a[0] || !a[1]) return false;
  return a[0].format('YYYY-MM-DD') === b[0].format('YYYY-MM-DD')
    && a[1].format('YYYY-MM-DD') === b[1].format('YYYY-MM-DD');
};

/** 区间 -> 接口参数 { startDate, endDate } */
export function rangeParams(range: ReportRange | null | undefined): { startDate: string; endDate: string } {
  if (!range || !range[0] || !range[1]) {
    const r = presetRange('month');
    return { startDate: r[0].format('YYYY-MM-DD'), endDate: r[1].format('YYYY-MM-DD') };
  }
  return { startDate: range[0].format('YYYY-MM-DD'), endDate: range[1].format('YYYY-MM-DD') };
}

/** 区间跨月数（含首尾月），用于月度趋势接口的 months 参数 */
export function monthSpan(range: ReportRange): number {
  if (!range || !range[0] || !range[1]) return 12;
  return Math.min(24, Math.max(1, range[1].diff(range[0], 'month') + 1));
}

export function useReportRange(initial: RangeKey = 'month') {
  const [range, setRange] = useState<ReportRange>(() => presetRange(initial));
  const params = useMemo(() => rangeParams(range), [range]);
  return { range, setRange, params };
}

/** 报表页统一工具条：预设区间 + 自定义区间 + 刷新 */
export function RangeBar({
  value,
  onChange,
  onRefresh,
  loading,
  extra,
}: {
  value: ReportRange;
  onChange: (v: ReportRange) => void;
  onRefresh?: () => void;
  loading?: boolean;
  extra?: ReactNode;
}) {
  const matched = RANGE_PRESETS.find((p) => sameRange(value, p.make()))?.key;
  return (
    <Space size={8} wrap>
      <Segmented
        size="small"
        value={matched}
        options={RANGE_PRESETS.map((p) => ({ label: p.label, value: p.key }))}
        onChange={(k) => onChange(RANGE_PRESETS.find((p) => p.key === k)!.make())}
      />
      <DatePicker.RangePicker
        size="middle"
        style={{ width: 250 }}
        allowClear={false}
        value={value as any}
        onChange={(v) => { if (v && v[0] && v[1]) onChange([v[0], v[1]]); }}
      />
      {onRefresh && (
        <Tooltip title="刷新数据">
          <Button icon={<ReloadOutlined />} loading={loading} onClick={onRefresh} />
        </Tooltip>
      )}
      {extra}
    </Space>
  );
}

/** 图表卡片：无数据时展示空状态，避免 echarts 空白 */
export function ChartOrEmpty({
  title,
  option,
  hasData,
  height = 300,
  extra,
}: {
  title: ReactNode;
  option: any;
  hasData: boolean;
  height?: number;
  extra?: ReactNode;
}) {
  if (!hasData) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-title"><span className="dot" />{title}</div>
          {extra}
        </div>
        <div className="empty-hint" style={{ height: height - 46, display: 'grid', placeItems: 'center' }}>
          当前区间暂无数据
        </div>
      </div>
    );
  }
  return <ChartCard title={title} option={option} height={height} extra={extra} />;
}

/** 百分比展示：接口返回值已是百分数（如 57.57 表示 57.57%） */
export function Pct({ value, digits = 2 }: { value: any; digits?: number }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return <span className="text-muted">-</span>;
  return (
    <span className={n >= 0 ? 'num' : 'num text-danger'}>
      {n.toFixed(digits)}%
    </span>
  );
}

/** 环比 / 同比（返回百分数，保留 2 位；基期为 0 时返回 null） */
export function growth(cur: any, prev: any): number | null {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  if (!p) return null;
  return Math.round(((c - p) / Math.abs(p)) * 10000) / 100;
}

export function GrowthText({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return <span className="text-muted">-</span>;
  }
  const n = Number(value);
  return (
    <span className={n >= 0 ? 'text-success' : 'text-danger'}>
      {n >= 0 ? '+' : ''}{n.toFixed(2)}%
    </span>
  );
}

export const moneyCell = (v: any) => <span className="num">{fmtMoney(v)}</span>;
export const strongMoneyCell = (v: any) => <span className="num money">{fmtMoney(v)}</span>;
export const qtyCell = (v: any) => <span className="num">{fmtNumber(v, 2)}</span>;
export const intCell = (v: any) => <span className="num">{fmtNumber(v, 0)}</span>;

// ============================================================
// 通用报表列（销售 / 采购汇总，供汇总页与毛利分析页复用）
// ============================================================

/** 销售汇总 —— 按客户 */
export function customerSummaryColumns(): ColumnsType<any> {
  return [
    { title: '客户编码', dataIndex: 'customer_code', width: 110 },
    { title: '客户名称', dataIndex: 'customer_name', width: 220, ellipsis: true },
    { title: '等级', dataIndex: 'level', width: 70, align: 'center', render: (v) => (v ? <span className="num">{v}</span> : '-') },
    { title: '地区', dataIndex: 'region', width: 80, render: (v) => v || '-' },
    { title: '单数', dataIndex: 'order_count', width: 80, align: 'right', render: intCell },
    { title: '数量', dataIndex: 'qty', width: 100, align: 'right', render: qtyCell },
    { title: '金额(未税)', dataIndex: 'amount', width: 130, align: 'right', render: moneyCell },
    { title: '税额', dataIndex: 'tax_amount', width: 115, align: 'right', render: moneyCell },
    { title: '价税合计', dataIndex: 'total_amount', width: 130, align: 'right', render: strongMoneyCell },
    { title: '销售成本', dataIndex: 'cost_amount', width: 130, align: 'right', render: moneyCell },
    { title: '毛利', dataIndex: 'profit', width: 125, align: 'right', render: (v) => <span className="num text-success">{fmtMoney(v)}</span> },
    { title: '毛利率', dataIndex: 'profit_rate', width: 95, align: 'right', render: (v) => <Pct value={v} /> },
  ];
}

/** 销售汇总 —— 按产品 */
export function itemSummaryColumns(): ColumnsType<any> {
  return [
    { title: '产品编码', dataIndex: 'item_code', width: 130 },
    { title: '产品名称', dataIndex: 'item_name', width: 180, ellipsis: true },
    { title: '规格型号', dataIndex: 'spec', width: 190, ellipsis: true, render: (v) => v || '-' },
    { title: '分类', dataIndex: 'category_name', width: 110, render: (v) => v || '未分类' },
    { title: '单位', dataIndex: 'uom', width: 70, align: 'center', render: (v) => v || '-' },
    { title: '单数', dataIndex: 'order_count', width: 80, align: 'right', render: intCell },
    { title: '数量', dataIndex: 'qty', width: 100, align: 'right', render: qtyCell },
    { title: '金额(未税)', dataIndex: 'amount', width: 130, align: 'right', render: moneyCell },
    { title: '税额', dataIndex: 'tax_amount', width: 115, align: 'right', render: moneyCell },
    { title: '价税合计', dataIndex: 'total_amount', width: 130, align: 'right', render: strongMoneyCell },
    { title: '销售成本', dataIndex: 'cost_amount', width: 125, align: 'right', render: moneyCell },
    { title: '毛利', dataIndex: 'profit', width: 125, align: 'right', render: (v) => <span className="num text-success">{fmtMoney(v)}</span> },
    { title: '毛利率', dataIndex: 'profit_rate', width: 95, align: 'right', render: (v) => <Pct value={v} /> },
  ];
}

/** 销售汇总 —— 按业务员 */
export function salespersonSummaryColumns(): ColumnsType<any> {
  return [
    { title: '工号', dataIndex: 'employee_code', width: 100, render: (v) => v || '-' },
    { title: '业务员', dataIndex: 'salesperson_name', width: 140 },
    { title: '部门', dataIndex: 'department_name', width: 150, render: (v) => v || '-' },
    { title: '单数', dataIndex: 'order_count', width: 80, align: 'right', render: intCell },
    { title: '数量', dataIndex: 'qty', width: 100, align: 'right', render: qtyCell },
    { title: '金额(未税)', dataIndex: 'amount', width: 130, align: 'right', render: moneyCell },
    { title: '税额', dataIndex: 'tax_amount', width: 115, align: 'right', render: moneyCell },
    { title: '价税合计', dataIndex: 'total_amount', width: 130, align: 'right', render: strongMoneyCell },
    { title: '销售成本', dataIndex: 'cost_amount', width: 125, align: 'right', render: moneyCell },
    { title: '毛利', dataIndex: 'profit', width: 125, align: 'right', render: (v) => <span className="num text-success">{fmtMoney(v)}</span> },
    { title: '毛利率', dataIndex: 'profit_rate', width: 95, align: 'right', render: (v) => <Pct value={v} /> },
  ];
}

/** 采购汇总 —— 按供应商 */
export function supplierSummaryColumns(): ColumnsType<any> {
  return [
    { title: '供应商编码', dataIndex: 'supplier_code', width: 120 },
    { title: '供应商名称', dataIndex: 'supplier_name', width: 240, ellipsis: true },
    { title: '分类', dataIndex: 'category', width: 130, render: (v) => v || '-' },
    { title: '等级', dataIndex: 'rating', width: 70, align: 'center', render: (v) => (v ? <span className="num">{v}</span> : '-') },
    { title: '地区', dataIndex: 'region', width: 80, render: (v) => v || '-' },
    { title: '单数', dataIndex: 'order_count', width: 80, align: 'right', render: intCell },
    { title: '数量', dataIndex: 'qty', width: 100, align: 'right', render: qtyCell },
    { title: '金额(未税)', dataIndex: 'amount', width: 130, align: 'right', render: moneyCell },
    { title: '税额', dataIndex: 'tax_amount', width: 115, align: 'right', render: moneyCell },
    { title: '价税合计', dataIndex: 'total_amount', width: 135, align: 'right', render: strongMoneyCell },
  ];
}

/** 采购汇总 —— 按产品 */
export function purchaseItemColumns(): ColumnsType<any> {
  return [
    { title: '产品编码', dataIndex: 'item_code', width: 130 },
    { title: '产品名称', dataIndex: 'item_name', width: 180, ellipsis: true },
    { title: '规格型号', dataIndex: 'spec', width: 190, ellipsis: true, render: (v) => v || '-' },
    { title: '分类', dataIndex: 'category_name', width: 110, render: (v) => v || '未分类' },
    { title: '单位', dataIndex: 'uom', width: 70, align: 'center', render: (v) => v || '-' },
    { title: '单数', dataIndex: 'order_count', width: 80, align: 'right', render: intCell },
    { title: '数量', dataIndex: 'qty', width: 100, align: 'right', render: qtyCell },
    { title: '金额(未税)', dataIndex: 'amount', width: 130, align: 'right', render: moneyCell },
    { title: '均价', dataIndex: 'avg_price', width: 110, align: 'right', render: (v) => fmtMoney(v) },
    { title: '税额', dataIndex: 'tax_amount', width: 115, align: 'right', render: moneyCell },
    { title: '价税合计', dataIndex: 'total_amount', width: 135, align: 'right', render: strongMoneyCell },
  ];
}
