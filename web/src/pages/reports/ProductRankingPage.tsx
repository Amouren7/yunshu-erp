import { useMemo, useState } from 'react';
import { Col, Row, Segmented, Select } from 'antd';
import { BarChartOutlined, FundOutlined, ShoppingCartOutlined, TrophyOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import DataTable from '../../components/DataTable';
import { CHART_COLORS, axisStyle } from '../../components/ChartCard';
import { api } from '../../api/client';
import { fmtMoney, fmtNumber } from '../../utils/format';
import { ChartOrEmpty, Pct, RangeBar, useReportRange } from './shared';

type SortKey = 'amount' | 'qty';

export default function ProductRankingPage() {
  const { range, setRange, params } = useReportRange('month');
  const [sort, setSort] = useState<SortKey>('amount');
  const [limit, setLimit] = useState(20);
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});

  const chartRows = useMemo(() => {
    const list = [...rows].slice(0, 10);
    return list.reverse();
  }, [rows]);

  const chartOption = useMemo(() => ({
    color: CHART_COLORS,
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      valueFormatter: (v: any) => (sort === 'amount' ? `￥${fmtMoney(v)}` : `${fmtNumber(v, 2)}`),
    },
    grid: { left: 8, right: 46, top: 10, bottom: 4, containLabel: true },
    xAxis: {
      type: 'value', ...axisStyle(),
      axisLabel: {
        ...axisStyle().axisLabel,
        formatter: (v: number) => (sort === 'amount' && Math.abs(v) >= 10000 ? `${Math.round(v / 10000)}万` : v),
      },
    },
    yAxis: { type: 'category', data: chartRows.map((r) => String(r.item_name || '').slice(0, 11)), ...axisStyle() },
    series: [{
      type: 'bar', barWidth: 14,
      itemStyle: { borderRadius: [0, 4, 4, 0], color: '#2f6bff' },
      data: chartRows.map((r) => (sort === 'amount' ? r.amount : r.qty)),
      label: {
        show: true, position: 'right', fontSize: 10, color: '#8b98ab',
        formatter: (p: any) => (sort === 'amount' ? `￥${fmtMoney(p.value, 0)}` : fmtNumber(p.value, 0)),
      },
    }],
  }), [chartRows, sort]);

  const load = (p: Record<string, any>) =>
    api.get('/api/reports/product-ranking', { ...p, sort, limit }).then((res: any) => {
      setRows(res?.rows || []);
      setSummary(res?.summary || {});
      return res;
    });

  const columns = useMemo(() => [
    {
      title: '排名', dataIndex: 'rank', width: 66, align: 'center' as const,
      render: (v: any) => (
        <b className="num" style={{ color: Number(v) <= 3 ? 'var(--primary)' : undefined }}>{v}</b>
      ),
    },
    { title: '产品编码', dataIndex: 'item_code', width: 130 },
    { title: '产品名称', dataIndex: 'item_name', width: 190, ellipsis: true },
    { title: '规格型号', dataIndex: 'spec', width: 190, ellipsis: true, render: (v: any) => v || '-' },
    { title: '分类', dataIndex: 'category_name', width: 110, render: (v: any) => v || '未分类' },
    { title: '单位', dataIndex: 'uom', width: 70, align: 'center' as const, render: (v: any) => v || '-' },
    { title: '销售单数', dataIndex: 'order_count', width: 90, align: 'right' as const, render: (v: any) => fmtNumber(v, 0) },
    { title: '销售数量', dataIndex: 'qty', width: 120, align: 'right' as const, render: (v: any) => <b className="num">{fmtNumber(v, 2)}</b> },
    { title: '数量占比', dataIndex: 'qty_share', width: 100, align: 'right' as const, render: (v: any) => <Pct value={v} /> },
    { title: '销售额(未税)', dataIndex: 'amount', width: 145, align: 'right' as const, render: (v: any) => <span className="num money">{fmtMoney(v)}</span> },
    { title: '金额占比', dataIndex: 'amount_share', width: 100, align: 'right' as const, render: (v: any) => <Pct value={v} /> },
    { title: '销售成本', dataIndex: 'cost_amount', width: 130, align: 'right' as const, render: (v: any) => fmtMoney(v) },
    { title: '毛利', dataIndex: 'profit', width: 130, align: 'right' as const, render: (v: any) => <span className="num text-success">{fmtMoney(v)}</span> },
    { title: '毛利率', dataIndex: 'profit_rate', width: 95, align: 'right' as const, render: (v: any) => <Pct value={v} /> },
  ], []);

  return (
    <div>
      <PageHeader
        title="产品畅销榜"
        subtitle={`统计区间 ${params.startDate} ~ ${params.endDate} · 按已审核发货单明细汇总，可切换按金额 / 按数量排行`}
        extra={<RangeBar value={range} onChange={setRange} loading={false} />}
      />

      <div className="kpi-grid">
        <StatCard title="上榜产品数" value={summary.itemCount || 0} money={false} digits={0} icon={<FundOutlined />}
          foot={`取前 ${limit} 名`} />
        <StatCard title="销售额合计" value={summary.amount || 0} prefix="¥" icon={<ShoppingCartOutlined />}
          foot="上榜产品未税销售额" />
        <StatCard title="销售数量合计" value={summary.qty || 0} money={false} digits={2} icon={<BarChartOutlined />}
          foot="上榜产品数量合计" />
        <StatCard title="榜首产品" value={rows[0]?.item_name || '-'} money={false} icon={<TrophyOutlined />}
          foot={rows[0] ? `销售额 ￥${fmtMoney(rows[0].amount)} · 数量 ${fmtNumber(rows[0].qty, 2)}` : '暂无数据'} />
      </div>

      <Row gutter={14} className="mt-14">
        <Col span={24}>
          <ChartOrEmpty
            title={`畅销产品 TOP 10（按${sort === 'amount' ? '销售额' : '销售数量'}）`}
            option={chartOption}
            hasData={chartRows.length > 0}
            height={320}
          />
        </Col>
      </Row>

      <div className="mt-14">
        <DataTable
          key={`${sort}-${limit}-${params.startDate}-${params.endDate}`}
          rowKey="item_id"
          columns={columns as any}
          load={load}
          extraParams={params}
          search={false}
          exportFilename="产品畅销榜"
          scrollX={1600}
          defaultPageSize={20}
          toolbar={
            <>
              <Segmented
                size="middle"
                value={sort}
                options={[{ label: '按金额排行', value: 'amount' }, { label: '按数量排行', value: 'qty' }]}
                onChange={(v) => setSort(v as SortKey)}
              />
              <Select
                size="middle"
                value={limit}
                style={{ width: 120 }}
                onChange={setLimit}
                options={[
                  { label: 'TOP 10', value: 10 },
                  { label: 'TOP 20', value: 20 },
                  { label: 'TOP 50', value: 50 },
                  { label: 'TOP 100', value: 100 },
                ]}
              />
            </>
          }
        />
      </div>
    </div>
  );
}
