import { useMemo, useState } from 'react';
import { Col, Row, Table, Tabs } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PercentageOutlined, RiseOutlined, ShoppingCartOutlined, WalletOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import DataTable from '../../components/DataTable';
import { CHART_COLORS, axisStyle } from '../../components/ChartCard';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { fmtMoney, fmtNumber } from '../../utils/format';
import {
  ChartOrEmpty, Pct, RangeBar, customerSummaryColumns, itemSummaryColumns, useReportRange,
} from './shared';

type TabKey = 'product' | 'customer' | 'document';

export default function GrossProfitPage() {
  const { range, setRange, params } = useReportRange('month');
  const [tab, setTab] = useState<TabKey>('product');
  const [summary, setSummary] = useState<any>({});

  const gross = useRequest(() => api.get('/api/reports/gross-profit', params), [params.startDate, params.endDate]);

  // 排行图数据：按产品取毛利明细聚合，按客户取销售汇总
  const ranking = useRequest(
    () => {
      if (tab === 'customer') {
        return api.get('/api/reports/sales-summary', { ...params, page: 1, pageSize: 100 });
      }
      if (tab === 'document') {
        return api.get('/api/reports/gross-profit', { ...params, page: 1, pageSize: 100 });
      }
      return api.get('/api/reports/sales-by-item', { ...params, page: 1, pageSize: 100 });
    },
    [tab, params.startDate, params.endDate],
  );

  const rankingRows: any[] = useMemo(() => {
    const rows: any[] = ranking.data?.rows || [];
    return rows
      .filter((r) => Number(r.amount) > 0)
      .sort((a, b) => Number(b.profit_rate || 0) - Number(a.profit_rate || 0))
      .slice(0, 12);
  }, [ranking.data]);

  const chartRows = useMemo(() => [...rankingRows].reverse(), [rankingRows]);

  const rateOption = useMemo(() => ({
    color: CHART_COLORS,
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      valueFormatter: (v: any) => `${fmtNumber(v, 2)}%`,
    },
    grid: { left: 8, right: 40, top: 10, bottom: 4, containLabel: true },
    xAxis: {
      type: 'value', ...axisStyle(),
      axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => `${v}%` },
    },
    yAxis: {
      type: 'category',
      data: chartRows.map((r: any) => String(r.item_name || r.customer_name || r.doc_no || '').slice(0, 10)),
      ...axisStyle(),
    },
    series: [{
      type: 'bar', barWidth: 14,
      itemStyle: {
        borderRadius: [0, 4, 4, 0],
        color: (p: any) => (Number(p.value) >= 50 ? '#16a34a' : Number(p.value) >= 30 ? '#f59e0b' : '#ef4444'),
      },
      data: chartRows.map((r: any) => r.profit_rate),
      label: { show: true, position: 'right', fontSize: 10, color: '#8b98ab', formatter: (p: any) => `${p.value}%` },
    }],
  }), [chartRows]);

  const docColumns = useMemo<ColumnsType<any>>(() => [
    { title: '单据编号', dataIndex: 'doc_no', width: 170 },
    { title: '单据日期', dataIndex: 'doc_date', width: 115 },
    { title: '客户编码', dataIndex: 'customer_code', width: 110, render: (v) => v || '-' },
    { title: '客户名称', dataIndex: 'customer_name', width: 220, ellipsis: true, render: (v) => v || '-' },
    { title: '业务员', dataIndex: 'salesperson_name', width: 110, render: (v) => v || '-' },
    { title: '销售额(未税)', dataIndex: 'amount', width: 140, align: 'right', render: (v) => <span className="num money">{fmtMoney(v)}</span> },
    { title: '税额', dataIndex: 'tax_amount', width: 120, align: 'right', render: (v) => fmtMoney(v) },
    { title: '价税合计', dataIndex: 'total_amount', width: 140, align: 'right', render: (v) => fmtMoney(v) },
    { title: '销售成本', dataIndex: 'cost_amount', width: 130, align: 'right', render: (v) => fmtMoney(v) },
    { title: '毛利', dataIndex: 'profit', width: 130, align: 'right', render: (v) => <span className="num text-success">{fmtMoney(v)}</span> },
    { title: '毛利率', dataIndex: 'profit_rate', width: 100, align: 'right', render: (v) => <Pct value={v} /> },
  ], []);

  const tabs = [
    {
      key: 'product', label: '按产品毛利',
      columns: itemSummaryColumns(),
      url: '/api/reports/sales-by-item',
      rowKey: 'item_id',
      exportName: '毛利分析_按产品',
      search: { placeholder: '搜索产品编码 / 名称 / 规格' },
    },
    {
      key: 'customer', label: '按客户毛利',
      columns: customerSummaryColumns(),
      url: '/api/reports/sales-summary',
      rowKey: 'customer_id',
      exportName: '毛利分析_按客户',
      search: { placeholder: '搜索客户编码 / 名称' },
    },
    {
      key: 'document', label: '单据毛利明细',
      columns: docColumns,
      url: '/api/reports/gross-profit',
      rowKey: 'id',
      exportName: '毛利分析_单据明细',
      search: { placeholder: '搜索单据号 / 客户名称' },
    },
  ] as const;
  const active = tabs.find((x) => x.key === tab)!;

  const load = (p: Record<string, any>) =>
    api.get(active.url, p).then((res: any) => {
      if (tab === 'document') setSummary(res?.summary || {});
      return res;
    });

  const s = { ...(gross.data?.summary || {}), ...summary };

  return (
    <div>
      <PageHeader
        title="毛利分析"
        subtitle={`统计区间 ${params.startDate} ~ ${params.endDate} · 毛利 = 未税销售额 - 销售成本，毛利率 = 毛利 / 未税销售额`}
        extra={<RangeBar value={range} onChange={setRange} onRefresh={() => { gross.refresh(); ranking.refresh(); }} loading={gross.loading || ranking.loading} />}
      />

      <div className="kpi-grid">
        <StatCard title="销售额（未税）" value={s.amount || 0} prefix="¥" icon={<ShoppingCartOutlined />}
          foot={`${fmtNumber(s.orders || 0, 0)} 张发货单`} />
        <StatCard title="销售成本" value={s.cost_amount || 0} prefix="¥" icon={<WalletOutlined />}
          foot={`价税合计 ￥${fmtMoney(s.total_amount || 0)}`} />
        <StatCard title="毛利额" value={s.profit || 0} prefix="¥" icon={<RiseOutlined />}
          foot={`税额 ￥${fmtMoney(s.tax_amount || 0)}`} />
        <StatCard title="综合毛利率" value={s.profit_rate || 0} money={false} digits={2} suffix="%" icon={<PercentageOutlined />}
          foot="按未税销售额加权" />
      </div>

      <Row gutter={14} className="mt-14">
        <Col xs={24} xl={14}>
          <ChartOrEmpty
            title={`${active.label} —— 毛利率排行 TOP 12`}
            option={rateOption}
            hasData={chartRows.length > 0}
            height={300}
          />
        </Col>
        <Col xs={24} xl={10}>
          <div className="card" style={{ height: 300 }}>
            <div className="card-head"><div className="card-title"><span className="dot" />毛利结构解读</div></div>
            <div className="card-pad" style={{ fontSize: 12.5, lineHeight: 2, color: 'var(--text-2)' }}>
              <div>· 综合毛利率：<b><Pct value={s.profit_rate} /></b>（毛利 ￥{fmtMoney(s.profit || 0)} / 未税销售额 ￥{fmtMoney(s.amount || 0)}）</div>
              <div>· 销售额与销售成本口径为已审核发货单，成本取移动加权平均成本。</div>
              <div>· 排行榜仅统计销售额大于 0 的项目，按毛利率从高到低取前 12 名。</div>
              <div>· 毛利率 ≥ 50% 标记绿色、30%~50% 标记橙色、低于 30% 标记红色。</div>
              <div>· 切换上方 Tabs 可查看按产品、按客户或单据级毛利明细。</div>
            </div>
          </div>
        </Col>
      </Row>

      <div className="mt-14">
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as TabKey)}
          items={tabs.map((x) => ({
            key: x.key,
            label: x.label,
            children: (
              <DataTable
                key={`${x.key}-${params.startDate}-${params.endDate}`}
                rowKey={x.rowKey}
                columns={x.columns as any}
                load={load}
                extraParams={params}
                exportFilename={x.exportName}
                search={x.search}
                scrollX={1500}
                summary={(rows) => {
                  if (!rows.length) return null;
                  return (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0}><b>合计</b></Table.Summary.Cell>
                      {(x.columns as any[]).map((c, i) => {
                        if (i === 0) return <Table.Summary.Cell key={i} index={i + 1} />;
                        if (i === 1) return <Table.Summary.Cell key={i} index={i + 1}><b>当前区间合计</b></Table.Summary.Cell>;
                        const val = (() => {
                          switch (c.dataIndex) {
                            case 'amount': return <b className="num money">{`￥${fmtMoney(s.amount || 0)}`}</b>;
                            case 'tax_amount': return <b>{`￥${fmtMoney(s.tax_amount || 0)}`}</b>;
                            case 'total_amount': return <b>{`￥${fmtMoney(s.total_amount || 0)}`}</b>;
                            case 'cost_amount': return <b>{`￥${fmtMoney(s.cost_amount || 0)}`}</b>;
                            case 'profit': return <b className="num text-success">{`￥${fmtMoney(s.profit || 0)}`}</b>;
                            case 'profit_rate': return <b><Pct value={s.profit_rate} /></b>;
                            default: return null;
                          }
                        })();
                        return <Table.Summary.Cell key={i} index={i + 1} align={c.align || 'left'}>{val}</Table.Summary.Cell>;
                      })}
                    </Table.Summary.Row>
                  );
                }}
              />
            ),
          }))}
        />
      </div>

      <div className="text-muted" style={{ fontSize: 11, marginTop: 10 }}>
        注：按产品 / 按客户表金额为未税金额；单据明细为发货单级毛利。数据均来自 /api/reports/gross-profit 及销售汇总接口。
      </div>
    </div>
  );
}
