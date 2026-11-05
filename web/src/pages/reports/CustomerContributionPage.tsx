import { useMemo, useState } from 'react';
import { Col, Row, Progress, Table } from 'antd';
import { PieChartOutlined, TeamOutlined, TrophyOutlined, WalletOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import DataTable from '../../components/DataTable';
import { CHART_COLORS, axisStyle } from '../../components/ChartCard';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { fmtMoney, fmtNumber } from '../../utils/format';
import { ChartOrEmpty, Pct, RangeBar, useReportRange } from './shared';

const ABC_META: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  A: { label: 'A 类', color: '#e5484d', bg: '#fdeeee', desc: '累计贡献 ≤ 70%，核心客户' },
  B: { label: 'B 类', color: '#d97706', bg: '#fff7e8', desc: '累计贡献 70%~90%，重点维护' },
  C: { label: 'C 类', color: '#5b6b82', bg: '#f2f4f8', desc: '累计贡献 > 90%，长尾客户' },
};

function AbcTag({ value }: { value: string }) {
  const m = ABC_META[value] || ABC_META.C;
  return (
    <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: 12, background: m.bg, color: m.color, fontWeight: 600 }}>
      {m.label}
    </span>
  );
}

export default function CustomerContributionPage() {
  const { range, setRange, params } = useReportRange('last12');
  const [summary, setSummary] = useState<any>({});

  const top = useRequest(
    () => api.get('/api/reports/customer-contribution', { ...params, page: 1, pageSize: 15 }),
    [params.startDate, params.endDate],
  );

  const topRows: any[] = useMemo(() => top.data?.rows || [], [top.data]);

  const barOption = useMemo(() => {
    const rows = [...topRows].reverse();
    return {
      color: CHART_COLORS,
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        valueFormatter: (v: any) => `￥${fmtMoney(v)}`,
      },
      grid: { left: 8, right: 46, top: 10, bottom: 4, containLabel: true },
      xAxis: {
        type: 'value', ...axisStyle(),
        axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 10000)}万` : v) },
      },
      yAxis: {
        type: 'category',
        data: rows.map((r) => String(r.customer_name || '').slice(0, 10)),
        ...axisStyle(),
      },
      series: [{
        type: 'bar', barWidth: 13,
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: (p: any) => {
            const row = rows[p.dataIndex];
            return ABC_META[row?.abc_class]?.color || '#2f6bff';
          },
        },
        data: rows.map((r) => r.total_amount),
        label: {
          show: true, position: 'right', fontSize: 10, color: '#8b98ab',
          formatter: (p: any) => `￥${fmtMoney(p.value, 0)}`,
        },
      }],
    };
  }, [topRows]);

  const abcPieOption = useMemo(() => {
    const items = ['A', 'B', 'C'].map((k) => ({
      name: ABC_META[k].label,
      value: Number(summary[`${k.toLowerCase()}_count`] || 0),
      itemStyle: { color: ABC_META[k].color },
    })).filter((x) => x.value > 0);
    return {
      tooltip: { trigger: 'item', valueFormatter: (v: any) => `${v} 家` },
      legend: { orient: 'vertical', right: 0, top: 'center', itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
      series: [{
        type: 'pie', radius: ['50%', '72%'], center: ['34%', '50%'],
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        label: { show: false },
        data: items,
      }],
    };
  }, [summary]);

  const load = (p: Record<string, any>) =>
    api.get('/api/reports/customer-contribution', p).then((res: any) => {
      setSummary(res?.summary || {});
      return res;
    });

  const columns = useMemo(() => [
    { title: '排名', dataIndex: 'rank', width: 64, align: 'center' as const, render: (v: any) => <b className="num">{v}</b> },
    { title: 'ABC', dataIndex: 'abc_class', width: 80, align: 'center' as const, render: (v: string) => <AbcTag value={v} /> },
    { title: '客户编码', dataIndex: 'customer_code', width: 110 },
    { title: '客户名称', dataIndex: 'customer_name', width: 230, ellipsis: true },
    { title: '等级', dataIndex: 'level', width: 70, align: 'center' as const, render: (v: any) => (v || '-') },
    { title: '地区', dataIndex: 'region', width: 80, render: (v: any) => v || '-' },
    { title: '单数', dataIndex: 'order_count', width: 80, align: 'right' as const, render: (v: any) => fmtNumber(v, 0) },
    { title: '销售额(未税)', dataIndex: 'amount', width: 140, align: 'right' as const, render: (v: any) => <span className="num">{fmtMoney(v)}</span> },
    { title: '价税合计', dataIndex: 'total_amount', width: 145, align: 'right' as const, render: (v: any) => <span className="num money">{fmtMoney(v)}</span> },
    { title: '毛利', dataIndex: 'profit', width: 130, align: 'right' as const, render: (v: any) => <span className="num text-success">{fmtMoney(v)}</span> },
    { title: '毛利率', dataIndex: 'profit_rate', width: 95, align: 'right' as const, render: (v: any) => <Pct value={v} /> },
    { title: '销售占比', dataIndex: 'amount_share', width: 100, align: 'right' as const, render: (v: any) => <Pct value={v} /> },
    {
      title: '累计占比', dataIndex: 'cumulative_rate', width: 170,
      render: (v: any) => (
        <div>
          <Progress percent={Math.min(100, Number(v) || 0)} size="small" showInfo={false} strokeColor="#2f6bff" />
          <span className="text-muted num" style={{ fontSize: 11 }}>{Number(v || 0).toFixed(2)}%</span>
        </div>
      ),
    },
  ], []);

  const totalAmount = summary.total_amount || 0;

  return (
    <div>
      <PageHeader
        title="客户贡献 ABC 分析"
        subtitle={`统计区间 ${params.startDate} ~ ${params.endDate} · 按客户销售额降序累计：A ≤ 70%、B 70%~90%、C > 90%`}
        extra={<RangeBar value={range} onChange={setRange} onRefresh={() => { top.refresh(); }} loading={top.loading} />}
      />

      <div className="kpi-grid">
        <StatCard title="成交客户数" value={summary.customerCount || 0} money={false} digits={0} icon={<TeamOutlined />}
          foot="区间内有发货的客户" />
        <StatCard title="客户销售总额" value={totalAmount} prefix="¥" icon={<WalletOutlined />}
          foot={`笔均 ￥${fmtMoney(summary.customerCount ? totalAmount / summary.customerCount : 0)}`} />
        <StatCard title="A 类核心客户" value={summary.a_count || 0} money={false} digits={0} icon={<TrophyOutlined />}
          foot={ABC_META.A.desc} color="#e5484d" />
        <StatCard title="B / C 类客户" value={`${summary.b_count || 0} / ${summary.c_count || 0}`} money={false} icon={<PieChartOutlined />}
          foot="B 重点维护 · C 长尾客户" />
      </div>

      <Row gutter={14} className="mt-14">
        <Col xs={24} xl={16}>
          <ChartOrEmpty title="客户销售额排行 TOP 15（颜色区分 ABC 分级）" option={barOption} hasData={topRows.length > 0} height={320} />
        </Col>
        <Col xs={24} xl={8}>
          <ChartOrEmpty title="ABC 客户数量分布" option={abcPieOption} hasData={!!(summary.a_count || summary.b_count || summary.c_count)} height={320} />
        </Col>
      </Row>

      <div className="mt-14">
        <DataTable
          key={`${params.startDate}-${params.endDate}`}
          rowKey="customer_id"
          columns={columns as any}
          load={load}
          extraParams={params}
          search={false}
          exportFilename="客户贡献ABC分析"
          scrollX={1600}
          summary={(rows) => (rows.length ? (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}><b>合计</b></Table.Summary.Cell>
              {columns.map((c: any, i: number) => {
                let content: any = '';
                switch (c.dataIndex) {
                  case 'customer_code':
                    content = <b>{fmtNumber(summary.customerCount || 0, 0)} 家客户</b>;
                    break;
                  case 'order_count':
                    content = <b>{fmtNumber(rows.reduce((s2, r) => s2 + Number(r.order_count || 0), 0), 0)}</b>;
                    break;
                  case 'total_amount':
                    content = <b className="num money">{`￥${fmtMoney(totalAmount)}`}</b>;
                    break;
                  case 'profit':
                    content = <b className="num text-success">{`￥${fmtMoney(rows.reduce((s2, r) => s2 + Number(r.profit || 0), 0))}`}</b>;
                    break;
                  case 'amount_share':
                    content = <b>100.00%</b>;
                    break;
                  default:
                    content = '';
                }
                return <Table.Summary.Cell key={i} index={i + 1} align={c.align || 'left'}>{content}</Table.Summary.Cell>;
              })}
            </Table.Summary.Row>
          ) : null)}
        />
      </div>

      <div className="text-muted" style={{ fontSize: 11, marginTop: 10 }}>
        注：ABC 分级依据客户「价税合计销售额」降序累计占比；累计占比 ≤ 70% 为 A 类，70%~90% 为 B 类，其余为 C 类。
      </div>
    </div>
  );
}
