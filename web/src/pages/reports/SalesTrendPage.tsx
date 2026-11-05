import { useMemo } from 'react';
import { Col, Row } from 'antd';
import { LineChartOutlined, RiseOutlined, ShoppingCartOutlined, WalletOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import DataTable from '../../components/DataTable';
import { CHART_COLORS, axisStyle } from '../../components/ChartCard';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { fmtMoney, fmtNumber } from '../../utils/format';
import { ChartOrEmpty, GrowthText, growth, Pct, RangeBar, monthSpan, useReportRange } from './shared';

export default function SalesTrendPage() {
  const { range, setRange, params } = useReportRange('last12');
  const span = monthSpan(range);
  // 多取前 12 个月用于计算同比（接口 months 上限 24）
  const fetchMonths = Math.min(24, span + 12);

  const monthly = useRequest(
    () => api.get('/api/reports/sales-monthly', { endDate: params.endDate, months: fetchMonths }),
    [params.endDate, fetchMonths],
  );

  const allRows: any[] = monthly.data?.rows || [];

  const rows = useMemo(() => {
    if (!allRows.length) return [];
    const display = allRows.slice(Math.max(0, allRows.length - span));
    const offset = allRows.length - display.length;
    return display.map((r, i) => {
      const idx = offset + i;
      const prev = idx - 1 >= 0 ? allRows[idx - 1] : null;
      const prevYear = idx - 12 >= 0 ? allRows[idx - 12] : null;
      return {
        ...r,
        mom: prev ? growth(r.amount, prev.amount) : null,
        yoy: prevYear ? growth(r.amount, prevYear.amount) : null,
      };
    });
  }, [allRows, span]);

  const totals = useMemo(() => {
    const amount = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const cost = rows.reduce((s, r) => s + Number(r.cost_amount || 0), 0);
    const profit = rows.reduce((s, r) => s + Number(r.profit || 0), 0);
    const orders = rows.reduce((s, r) => s + Number(r.orders || 0), 0);
    const qty = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
    return {
      amount, cost, profit, orders, qty,
      profit_rate: amount ? Math.round((profit / amount) * 10000) / 100 : 0,
    };
  }, [rows]);

  const chartData = rows.filter((r) => Number(r.amount) > 0 || Number(r.orders) > 0);

  const option = useMemo(() => ({
    color: ['#2f6bff', '#93b4ff', '#16a34a'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: any) => (typeof v === 'number' ? fmtMoney(v) : v),
    },
    legend: { data: ['销售额', '销售成本', '毛利率'], right: 0, top: 0, itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
    grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: chartData.map((r) => String(r.period).slice(2)), ...axisStyle() },
    yAxis: [
      {
        type: 'value', ...axisStyle(),
        axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 10000)}万` : v) },
      },
      {
        type: 'value', ...axisStyle(),
        axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => `${v}%` },
        splitLine: { show: false },
      },
    ],
    series: [
      { name: '销售额', type: 'bar', barWidth: 12, itemStyle: { borderRadius: [3, 3, 0, 0] }, data: chartData.map((r) => r.amount) },
      { name: '销售成本', type: 'bar', barWidth: 12, itemStyle: { borderRadius: [3, 3, 0, 0] }, data: chartData.map((r) => r.cost_amount) },
      { name: '毛利率', type: 'line', yAxisIndex: 1, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2 }, data: chartData.map((r) => r.profit_rate) },
    ],
  }), [chartData]);

  const columns = useMemo(() => [
    { title: '月份', dataIndex: 'period', width: 110, fixed: 'left' as const },
    { title: '订单数', dataIndex: 'orders', width: 90, align: 'right' as const, render: (v: any) => fmtNumber(v, 0) },
    { title: '销售数量', dataIndex: 'qty', width: 110, align: 'right' as const, render: (v: any) => fmtNumber(v, 2) },
    { title: '销售额（未税）', dataIndex: 'amount', width: 140, align: 'right' as const, render: (v: any) => <span className="num money">{fmtMoney(v)}</span> },
    { title: '税额', dataIndex: 'tax_amount', width: 120, align: 'right' as const, render: (v: any) => fmtMoney(v) },
    { title: '价税合计', dataIndex: 'total_amount', width: 140, align: 'right' as const, render: (v: any) => <span className="num">{fmtMoney(v)}</span> },
    { title: '销售成本', dataIndex: 'cost_amount', width: 130, align: 'right' as const, render: (v: any) => fmtMoney(v) },
    { title: '毛利', dataIndex: 'profit', width: 130, align: 'right' as const, render: (v: any) => <span className="num text-success">{fmtMoney(v)}</span> },
    { title: '毛利率', dataIndex: 'profit_rate', width: 100, align: 'right' as const, render: (v: any) => <Pct value={v} /> },
    { title: '环比', dataIndex: 'mom', width: 100, align: 'right' as const, render: (v: any) => <GrowthText value={v} /> },
    { title: '同比', dataIndex: 'yoy', width: 100, align: 'right' as const, render: (v: any) => <GrowthText value={v} /> },
  ], []);

  return (
    <div>
      <PageHeader
        title="销售趋势分析"
        subtitle={`统计区间 ${params.startDate} ~ ${params.endDate} · 按月统计已审核发货单，环比/同比按销售额计算；同比需近 24 个月数据`}
        extra={<RangeBar value={range} onChange={setRange} onRefresh={monthly.refresh} loading={monthly.loading} />}
      />

      <div className="kpi-grid">
        <StatCard title="销售额（未税）" value={totals.amount} prefix="¥" icon={<ShoppingCartOutlined />}
          foot={`${fmtNumber(totals.orders, 0)} 张发货单`} />
        <StatCard title="销售成本" value={totals.cost} prefix="¥" icon={<WalletOutlined />}
          foot={`销售数量 ${fmtNumber(totals.qty, 2)}`} />
        <StatCard title="毛利额" value={totals.profit} prefix="¥" icon={<RiseOutlined />}
          foot={<span>毛利率 <Pct value={totals.profit_rate} /></span>} />
        <StatCard title="月均销售额" value={rows.length ? totals.amount / rows.length : 0} prefix="¥" icon={<LineChartOutlined />}
          foot={`统计 ${rows.length} 个月`} />
      </div>

      <Row gutter={14} className="mt-14">
        <Col span={24}>
          <ChartOrEmpty
            title="销售额 / 销售成本 / 毛利率 月度趋势"
            option={option}
            hasData={chartData.length > 0}
            height={320}
          />
        </Col>
      </Row>

      <div className="mt-14">
        <DataTable
          rowKey="period"
          columns={columns as any}
          load={() => Promise.resolve({ rows, total: rows.length })}
          reloadKey={`${params.startDate}-${params.endDate}-${rows.length}-${rows[0]?.amount ?? ''}`}
          search={false}
          exportFilename="销售趋势分析_月度"
          scrollX={1400}
          defaultPageSize={24}
        />
      </div>

      <div className="text-muted" style={{ fontSize: 11, marginTop: 10 }}>
        注：环比 =（本期销售额 - 上期销售额）/ 上期销售额；同比 =（本期销售额 - 去年同期销售额）/ 去年同期销售额；基期为 0 时显示「-」。
      </div>
    </div>
  );
}
