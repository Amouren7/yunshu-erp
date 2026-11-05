import { useMemo } from 'react';
import { Button, Col, Row, Table } from 'antd';
import {
  BankOutlined, DownloadOutlined, InboxOutlined, RiseOutlined, ShoppingCartOutlined,
  ShoppingOutlined, TeamOutlined, ThunderboltOutlined, TransactionOutlined, WalletOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { CHART_COLORS, axisStyle } from '../../components/ChartCard';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { exportCsv, fmtMoney, fmtNumber } from '../../utils/format';
import { ChartOrEmpty, moneyCell, Pct, qtyCell, RangeBar, useReportRange } from './shared';

export default function KpiReportPage() {
  const { range, setRange, params } = useReportRange('month');
  const kpi = useRequest(() => api.get('/api/reports/kpi-dashboard', params), [params.startDate, params.endDate]);
  const trend = useRequest(() => api.get<any[]>('/api/dashboard/trend', { months: 12 }), []);
  const share = useRequest(() => api.get<any[]>('/api/dashboard/category-share'), []);
  const topCustomers = useRequest(() => api.get<any[]>('/api/dashboard/top-customers', { limit: 8 }), []);
  const topItems = useRequest(() => api.get<any[]>('/api/dashboard/top-items', { limit: 8 }), []);

  const k = kpi.data || {};
  const sales = k.sales || {};
  const purchase = k.purchase || {};
  const gross = k.grossProfit || {};
  const inventory = k.inventory || {};
  const receivable = k.receivable || {};
  const payable = k.payable || {};
  const cash = k.cash || {};
  const customers = k.customers || {};

  const trendData = trend.data || [];
  const shareData = share.data || [];
  const topCustomerRows = topCustomers.data || [];
  const topItemRows = topItems.data || [];

  const refreshAll = () => {
    kpi.refresh();
    trend.refresh();
    share.refresh();
    topCustomers.refresh();
    topItems.refresh();
  };

  const trendOption = useMemo(() => ({
    color: CHART_COLORS,
    tooltip: { trigger: 'axis', valueFormatter: (v: any) => `￥${fmtMoney(v)}` },
    legend: { data: ['销售额', '采购额', '毛利'], right: 0, top: 0, itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
    grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: trendData.map((t: any) => String(t.period).slice(2)), ...axisStyle() },
    yAxis: {
      type: 'value', ...axisStyle(),
      axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 10000)}万` : v) },
    },
    series: [
      { name: '销售额', type: 'bar', barWidth: 10, itemStyle: { borderRadius: [3, 3, 0, 0] }, data: trendData.map((t: any) => t.sales) },
      { name: '采购额', type: 'bar', barWidth: 10, itemStyle: { borderRadius: [3, 3, 0, 0] }, data: trendData.map((t: any) => t.purchase) },
      { name: '毛利', type: 'line', smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2 }, data: trendData.map((t: any) => t.profit) },
    ],
  }), [trendData]);

  const shareOption = useMemo(() => ({
    color: CHART_COLORS,
    tooltip: { trigger: 'item', valueFormatter: (v: any) => `￥${fmtMoney(v)}` },
    legend: { orient: 'vertical', right: 0, top: 'center', itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
    series: [{
      type: 'pie', radius: ['52%', '74%'], center: ['34%', '50%'], avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
      label: { show: false },
      data: shareData.map((x: any) => ({ name: x.name, value: x.amount })),
    }],
  }), [shareData]);

  const topCustomerOption = useMemo(() => {
    const rows = [...topCustomerRows].reverse();
    return {
      color: CHART_COLORS,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: any) => `￥${fmtMoney(v)}` },
      grid: { left: 8, right: 24, top: 8, bottom: 4, containLabel: true },
      xAxis: {
        type: 'value', ...axisStyle(),
        axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 10000)}万` : v) },
      },
      yAxis: { type: 'category', data: rows.map((x: any) => String(x.name || '').slice(0, 9)), ...axisStyle() },
      series: [{ type: 'bar', barWidth: 12, itemStyle: { borderRadius: [0, 4, 4, 0], color: '#2f6bff' }, data: rows.map((x: any) => x.amount) }],
    };
  }, [topCustomerRows]);

  const exportTrend = () => {
    if (!trendData.length) return;
    exportCsv('经营驾驶舱_月度趋势', [
      { title: '月份', dataIndex: 'period' },
      { title: '销售额', dataIndex: 'sales' },
      { title: '采购额', dataIndex: 'purchase' },
      { title: '销售成本', dataIndex: 'cogs' },
      { title: '毛利', dataIndex: 'profit' },
      { title: '销售单数', dataIndex: 'orders' },
    ], trendData);
  };

  return (
    <div>
      <PageHeader
        title="经营驾驶舱"
        subtitle={`统计区间 ${params.startDate} ~ ${params.endDate} · 数据来源：销售发货 / 采购入库 / 库存 / 应收应付`}
        extra={
          <RangeBar
            value={range}
            onChange={setRange}
            onRefresh={refreshAll}
            loading={kpi.loading}
            extra={<Button icon={<DownloadOutlined />} onClick={exportTrend}>导出趋势</Button>}
          />
        }
      />

      <div className="kpi-grid">
        <StatCard
          title="销售额（未税）" value={sales.value || 0} prefix="¥" growth={sales.mom}
          icon={<ShoppingCartOutlined />}
          foot={`同比 ${sales.yoy === null || sales.yoy === undefined ? '-' : `${Number(sales.yoy).toFixed(1)}%`} · ${fmtNumber(sales.orders, 0)} 张发货单`}
        />
        <StatCard
          title="采购额（未税）" value={purchase.value || 0} prefix="¥" growth={purchase.mom}
          icon={<ShoppingOutlined />}
          foot={`同比 ${purchase.yoy === null || purchase.yoy === undefined ? '-' : `${Number(purchase.yoy).toFixed(1)}%`} · ${fmtNumber(purchase.orders, 0)} 张入库单`}
        />
        <StatCard
          title="毛利额" value={gross.value || 0} prefix="¥" growth={gross.mom}
          icon={<RiseOutlined />}
          foot={`毛利率 ${gross.rate === undefined ? '-' : `${Number(gross.rate).toFixed(2)}%`} · 同比 ${gross.yoy === null || gross.yoy === undefined ? '-' : `${Number(gross.yoy).toFixed(1)}%`}`}
        />
        <StatCard
          title="库存金额" value={inventory.value || 0} prefix="¥"
          icon={<InboxOutlined />} foot={`${fmtNumber(inventory.skuCount, 0)} 个库存明细`}
        />
        <StatCard
          title="应收余额" value={receivable.value || 0} prefix="¥"
          icon={<WalletOutlined />} foot={`${fmtNumber(receivable.count, 0)} 张未结应收发票`}
        />
        <StatCard
          title="应付余额" value={payable.value || 0} prefix="¥"
          icon={<BankOutlined />} foot={`${fmtNumber(payable.count, 0)} 张未结应付发票`}
        />
        <StatCard
          title="现金净流量" value={cash.net || 0} prefix="¥"
          icon={<TransactionOutlined />}
          foot={`收款 ￥${fmtMoney(cash.inflow || 0)} · 付款 ￥${fmtMoney(cash.outflow || 0)}`}
        />
        <StatCard
          title="新增客户" value={customers.newInRange || 0} money={false} digits={0} growth={customers.mom}
          icon={<TeamOutlined />} foot={`客户总数 ${fmtNumber(customers.total, 0)} 家`}
        />
      </div>

      <Row gutter={14} className="mt-14">
        <Col xs={24} xl={16}>
          <ChartOrEmpty title="销售 / 采购 / 毛利 趋势（近 12 个月）" option={trendOption} hasData={trendData.length > 0} height={320} />
        </Col>
        <Col xs={24} xl={8}>
          <ChartOrEmpty title="销售品类占比（近 6 个月）" option={shareOption} hasData={shareData.length > 0} height={320} />
        </Col>
      </Row>

      <Row gutter={14} className="mt-14">
        <Col xs={24} xl={12}>
          <ChartOrEmpty title="客户销售排行 TOP 8（近 6 个月）" option={topCustomerOption} hasData={topCustomerRows.length > 0} height={300} />
        </Col>
        <Col xs={24} xl={12}>
          <div className="card">
            <div className="card-head">
              <div className="card-title"><span className="dot" />产品畅销排行 TOP 8（近 6 个月）</div>
              <Button size="small" type="link" icon={<ThunderboltOutlined />} onClick={topItems.refresh}>刷新</Button>
            </div>
            <div className="card-pad" style={{ paddingTop: 4 }}>
              {topItemRows.length === 0 ? (
                <div className="empty-hint">当前区间暂无数据</div>
              ) : (
                <Table
                  size="small"
                  rowKey="item_id"
                  pagination={false}
                  dataSource={topItemRows}
                  columns={[
                    { title: '排名', width: 56, align: 'center', render: (_: any, __: any, i: number) => <b className="num" style={{ color: i < 3 ? 'var(--primary)' : undefined }}>{i + 1}</b> },
                    { title: '产品', dataIndex: 'name', ellipsis: true, render: (v: string, r: any) => (<div><div>{v}</div><div className="text-muted" style={{ fontSize: 11 }}>{r.code} {r.spec}</div></div>) },
                    { title: '数量', dataIndex: 'qty', width: 90, align: 'right', render: qtyCell },
                    { title: '销售额', dataIndex: 'amount', width: 120, align: 'right', render: moneyCell },
                  ]}
                />
              )}
            </div>
          </div>
        </Col>
      </Row>

      <Row gutter={14} className="mt-14">
        <Col xs={24}>
          <div className="card">
            <div className="card-head">
              <div className="card-title"><span className="dot" />经营指标概览</div>
              <span className="text-muted" style={{ fontSize: 12 }}>
                环比对比区间 {k.prevRange?.startDate || '-'} ~ {k.prevRange?.endDate || '-'} · 同比对比区间 {k.lastYearRange?.startDate || '-'} ~ {k.lastYearRange?.endDate || '-'}
              </span>
            </div>
            <div className="card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
              <Metric label="销售单数" value={fmtNumber(sales.orders, 0)} suffix="张" />
              <Metric label="采购单数" value={fmtNumber(purchase.orders, 0)} suffix="张" />
              <Metric label="毛利率" value={<Pct value={gross.rate} />} />
              <Metric label="在产工单" value={fmtNumber(k.production?.wip, 0)} suffix="张" />
              <Metric label="本月完工数量" value={fmtNumber(k.production?.completedQtyThisMonth, 2)} />
              <Metric label="在职人数" value={fmtNumber(k.hr?.headcount, 0)} suffix="人" />
              <Metric label="最新薪资期间" value={k.hr?.payrollPeriod || '-'} />
              <Metric label="实发工资合计" value={`￥${fmtMoney(k.hr?.payrollNet || 0)}`} />
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}

function Metric({ label, value, suffix }: { label: string; value: any; suffix?: string }) {
  return (
    <div style={{ padding: '10px 12px', background: '#f8fafd', borderRadius: 8 }}>
      <div className="text-muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 650, marginTop: 4 }} className="num">
        {value}{suffix && <span className="text-muted" style={{ fontSize: 12, fontWeight: 400, marginLeft: 3 }}>{suffix}</span>}
      </div>
    </div>
  );
}
