import { useEffect, useMemo, useState } from 'react';
import { Col, Row, Table, Tabs } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { InboxOutlined, ShoppingOutlined, TeamOutlined, WalletOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import DataTable from '../../components/DataTable';
import { CHART_COLORS, axisStyle } from '../../components/ChartCard';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { fmtMoney, fmtNumber } from '../../utils/format';
import {
  ChartOrEmpty, Pct, RangeBar, growth, monthSpan, purchaseItemColumns, supplierSummaryColumns, useReportRange,
} from './shared';

type TabKey = 'supplier' | 'item' | 'monthly';

const TAB_META: Record<'supplier' | 'item', {
  label: string; url: string; rowKey: string; exportName: string;
  columns: () => ColumnsType<any>; countLabel: string; countValue: (s: any) => number; unit: string;
}> = {
  supplier: {
    label: '按供应商', url: '/api/reports/purchase-summary', rowKey: 'supplier_id',
    exportName: '采购汇总_按供应商', columns: supplierSummaryColumns,
    countLabel: '供应商数', countValue: (s) => s.supplierCount || 0, unit: '家供应商',
  },
  item: {
    label: '按产品', url: '/api/reports/purchase-by-item', rowKey: 'item_id',
    exportName: '采购汇总_按产品', columns: purchaseItemColumns,
    countLabel: '产品数', countValue: (s) => s.itemCount || 0, unit: '个产品',
  },
};

export default function PurchaseSummaryPage() {
  const { range, setRange, params } = useReportRange('last12');
  const [tab, setTab] = useState<TabKey>('supplier');
  const [summary, setSummary] = useState<any>({});
  const span = monthSpan(range);

  const monthly = useRequest(
    () => api.get('/api/reports/purchase-monthly', { endDate: params.endDate, months: span }),
    [params.endDate, span],
  );

  useEffect(() => {
    if (tab === 'monthly' && monthly.data?.summary) setSummary(monthly.data.summary);
  }, [tab, monthly.data]);

  const monthlyRows: any[] = useMemo(() => {
    const rows: any[] = monthly.data?.rows || [];
    return rows.map((r, i) => ({ ...r, mom: i > 0 ? growth(r.amount, rows[i - 1].amount) : null }));
  }, [monthly.data]);

  const option = useMemo(() => ({
    color: CHART_COLORS,
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      valueFormatter: (v: any) => (typeof v === 'number' ? fmtMoney(v) : v),
    },
    legend: { data: ['采购金额', '订单数'], right: 0, top: 0, itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
    grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: monthlyRows.map((r) => String(r.period).slice(2)), ...axisStyle() },
    yAxis: [
      {
        type: 'value', ...axisStyle(),
        axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 10000)}万` : v) },
      },
      { type: 'value', ...axisStyle(), name: '单数', nameTextStyle: { color: '#8b98ab', fontSize: 11 }, splitLine: { show: false } },
    ],
    series: [
      { name: '采购金额', type: 'bar', barWidth: 14, itemStyle: { borderRadius: [3, 3, 0, 0] }, data: monthlyRows.map((r) => r.amount) },
      { name: '订单数', type: 'line', yAxisIndex: 1, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2 }, data: monthlyRows.map((r) => r.orders) },
    ],
  }), [monthlyRows]);

  const monthlyColumns = useMemo(() => [
    { title: '月份', dataIndex: 'period', width: 110 },
    { title: '订单数', dataIndex: 'orders', width: 90, align: 'right' as const, render: (v: any) => fmtNumber(v, 0) },
    { title: '采购数量', dataIndex: 'qty', width: 110, align: 'right' as const, render: (v: any) => fmtNumber(v, 2) },
    { title: '采购金额（未税）', dataIndex: 'amount', width: 150, align: 'right' as const, render: (v: any) => <span className="num money">{fmtMoney(v)}</span> },
    { title: '税额', dataIndex: 'tax_amount', width: 130, align: 'right' as const, render: (v: any) => fmtMoney(v) },
    { title: '价税合计', dataIndex: 'total_amount', width: 150, align: 'right' as const, render: (v: any) => fmtMoney(v) },
    {
      title: '环比', dataIndex: 'mom', width: 110, align: 'right' as const,
      render: (v: any) => (v === null || v === undefined ? <span className="text-muted">-</span>
        : <span className={v >= 0 ? 'text-success' : 'text-danger'}>{v >= 0 ? '+' : ''}{Number(v).toFixed(2)}%</span>),
    },
  ], []);

  const summaryCountLabel = tab === 'monthly' ? '统计月份' : TAB_META[tab].countLabel;
  const summaryCount = tab === 'monthly' ? monthlyRows.length : TAB_META[tab].countValue(summary);

  return (
    <div>
      <PageHeader
        title="采购汇总表"
        subtitle={`统计区间 ${params.startDate} ~ ${params.endDate} · 口径：已审核采购入库单，金额为未税金额`}
        extra={<RangeBar value={range} onChange={setRange} onRefresh={() => { if (tab === 'monthly') monthly.refresh(); }} loading={monthly.loading} />}
      />

      <div className="kpi-grid">
        <StatCard title="采购金额（未税）" value={summary.amount || 0} prefix="¥" icon={<ShoppingOutlined />}
          foot={`价税合计 ￥${fmtMoney(summary.total_amount || 0)}`} />
        <StatCard title="进项税额" value={summary.tax_amount || 0} prefix="¥" icon={<WalletOutlined />}
          foot={`${fmtNumber(summary.orders || 0, 0)} 张入库单`} />
        <StatCard title="价税合计" value={summary.total_amount || 0} prefix="¥" icon={<InboxOutlined />}
          foot="含进项税额" />
        <StatCard title={summaryCountLabel} value={summaryCount} money={false} digits={0} icon={<TeamOutlined />}
          foot={tab === 'monthly' ? `统计 ${span} 个月` : `${fmtNumber(summaryCount, 0)} ${TAB_META[tab].unit}`} />
      </div>

      <Tabs
        className="mt-14"
        activeKey={tab}
        onChange={(k) => setTab(k as TabKey)}
        items={[
          {
            key: 'supplier', label: '按供应商',
            children: (
              <DataTable
                key={`supplier-${params.startDate}-${params.endDate}`}
                rowKey="supplier_id"
                columns={TAB_META.supplier.columns() as any}
                load={(p) => loadSummary(TAB_META.supplier.url, p, setSummary)}
                extraParams={params}
                exportFilename={TAB_META.supplier.exportName}
                search={{ placeholder: '搜索供应商编码 / 名称' }}
                scrollX={1400}
                showIndex
                summary={(rows) => (rows.length
                  ? <PurchaseSummaryRow data={rows} summary={summary} tab="supplier" countLabel={`${fmtNumber(summaryCount, 0)} 家供应商`} columns={TAB_META.supplier.columns()} />
                  : null)}
              />
            ),
          },
          {
            key: 'item', label: '按产品',
            children: (
              <DataTable
                key={`item-${params.startDate}-${params.endDate}`}
                rowKey="item_id"
                columns={TAB_META.item.columns() as any}
                load={(p) => loadSummary(TAB_META.item.url, p, setSummary)}
                extraParams={params}
                exportFilename={TAB_META.item.exportName}
                search={{ placeholder: '搜索产品编码 / 名称' }}
                scrollX={1400}
                showIndex
                summary={(rows) => (rows.length
                  ? <PurchaseSummaryRow data={rows} summary={summary} tab="item" countLabel={`${fmtNumber(summaryCount, 0)} 个产品`} columns={TAB_META.item.columns()} />
                  : null)}
              />
            ),
          },
          {
            key: 'monthly', label: '按月趋势',
            children: (
              <div>
                <ChartOrEmpty title="采购金额 / 订单数 月度趋势" option={option} hasData={monthlyRows.length > 0} height={300} />
                <div className="mt-14">
                  <DataTable
                    rowKey="period"
                    columns={monthlyColumns as any}
                    load={() => Promise.resolve({ rows: monthlyRows, total: monthlyRows.length })}
                    reloadKey={`${params.endDate}-${monthlyRows.length}`}
                    search={false}
                    exportFilename="采购汇总_按月"
                    scrollX={1000}
                    defaultPageSize={24}
                    summary={(rows) => (rows.length ? (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}><b>合计</b></Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right"><b>{fmtNumber(summary.orders || monthlyRows.reduce((s, r) => s + Number(r.orders || 0), 0), 0)}</b></Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right"><b>{fmtNumber(monthlyRows.reduce((s, r) => s + Number(r.qty || 0), 0), 2)}</b></Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right"><b className="num money">{`￥${fmtMoney(monthlyRows.reduce((s, r) => s + Number(r.amount || 0), 0))}`}</b></Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="right"><b>{fmtMoney(monthlyRows.reduce((s, r) => s + Number(r.tax_amount || 0), 0))}</b></Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="right"><b>{fmtMoney(monthlyRows.reduce((s, r) => s + Number(r.total_amount || 0), 0))}</b></Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="right">-</Table.Summary.Cell>
                        <Table.Summary.Cell index={7} align="right">-</Table.Summary.Cell>
                      </Table.Summary.Row>
                    ) : null)}
                  />
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

function loadSummary(url: string, p: Record<string, any>, setSummary: (v: any) => void) {
  return api.get(url, p).then((res: any) => {
    setSummary(res?.summary || {});
    return res;
  });
}

function PurchaseSummaryRow({
  summary, tab, countLabel, columns,
}: {
  data: any[];
  summary: any;
  tab: 'supplier' | 'item';
  countLabel: string;
  columns: ColumnsType<any>;
}) {
  const firstKey = tab === 'supplier' ? 'supplier_code' : 'item_code';
  const secondKey = tab === 'supplier' ? 'supplier_name' : 'item_name';
  const valueOf = (dataIndex: any): any => {
    const key = String(dataIndex);
    if (key === firstKey) return '';
    if (key === secondKey) return `合计（${countLabel}）`;
    if (key === 'order_count') return <b>{fmtNumber(summary.orders, 0)}</b>;
    if (key === 'qty') {
      return summary.qty === undefined || summary.qty === null
        ? '-'
        : <b>{fmtNumber(summary.qty, 2)}</b>;
    }
    if (['amount', 'tax_amount', 'total_amount', 'avg_price'].includes(key)) {
      return <b className="num">{`￥${fmtMoney(summary[key] || 0)}`}</b>;
    }
    return '';
  };
  return (
    <Table.Summary.Row>
      <Table.Summary.Cell index={0}><b>合计</b></Table.Summary.Cell>
      {columns.map((c: any, i) => (
        <Table.Summary.Cell key={i} index={i + 1} align={c.align || 'left'}>{valueOf(c.dataIndex)}</Table.Summary.Cell>
      ))}
    </Table.Summary.Row>
  );
}
