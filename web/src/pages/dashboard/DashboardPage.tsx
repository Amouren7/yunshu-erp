import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Col, Empty, Progress, Row, Space, Table, Tabs, Tag, Tooltip } from 'antd';
import {
  AlertOutlined, ArrowRightOutlined, BankOutlined, BuildOutlined, ClockCircleOutlined, FileTextOutlined,
  InboxOutlined, RiseOutlined, ShoppingCartOutlined, ShoppingOutlined, TeamOutlined, ThunderboltOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ChartCard, { CHART_COLORS, axisStyle } from '../../components/ChartCard';
import StatusTag from '../../components/StatusTag';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { useMeta } from '../../store/meta';
import { fmtMoney, fmtNumber } from '../../utils/format';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { meta } = useMeta();
  const summary = useRequest(() => api.get('/api/dashboard/summary'), []);
  const trend = useRequest(() => api.get('/api/dashboard/trend', { months: 12 }), []);
  const share = useRequest(() => api.get('/api/dashboard/category-share'), []);
  const topCustomers = useRequest(() => api.get('/api/dashboard/top-customers', { limit: 8 }), []);
  const recent = useRequest(() => api.get('/api/dashboard/recent-docs', { limit: 9 }), []);
  const todos = useRequest(() => api.get('/api/dashboard/todos'), []);
  const alerts = useRequest(() => api.get('/api/dashboard/alerts'), []);
  const production = useRequest(() => api.get('/api/dashboard/production'), []);
  const cashflow = useRequest(() => api.get('/api/dashboard/cashflow'), []);

  const s = summary.data || {};
  const trendData = trend.data || [];
  const hour = new Date().getHours();
  const greeting = hour < 6 ? '凌晨好' : hour < 9 ? '早上好' : hour < 12 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const trendOption = useMemo(() => ({
    color: CHART_COLORS,
    tooltip: { trigger: 'axis', valueFormatter: (v: any) => `￥${fmtMoney(v)}` },
    legend: { data: ['销售额', '采购额', '毛利'], right: 0, top: 0, itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
    grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: trendData.map((t: any) => t.period.slice(2)), ...axisStyle() },
    yAxis: { type: 'value', ...axisStyle(), axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => (v >= 10000 ? `${v / 10000}万` : v) } },
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
      data: (share.data || []).map((x: any) => ({ name: x.name, value: x.amount })),
    }],
  }), [share.data]);

  const topCustomerOption = useMemo(() => {
    const rows = [...(topCustomers.data || [])].reverse();
    return {
      color: CHART_COLORS,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: any) => `￥${fmtMoney(v)}` },
      grid: { left: 8, right: 20, top: 8, bottom: 4, containLabel: true },
      xAxis: { type: 'value', ...axisStyle(), axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => (v >= 10000 ? `${v / 10000}万` : v) } },
      yAxis: { type: 'category', data: rows.map((x: any) => x.name?.slice(0, 8)), ...axisStyle() },
      series: [{ type: 'bar', barWidth: 12, itemStyle: { borderRadius: [0, 4, 4, 0], color: '#2f6bff' }, data: rows.map((x: any) => x.amount) }],
    };
  }, [topCustomers.data]);

  const cashOption = useMemo(() => {
    const rows = cashflow.data || [];
    return {
      color: ['#16a34a', '#e5484d', '#2f6bff'],
      tooltip: { trigger: 'axis', valueFormatter: (v: any) => `￥${fmtMoney(v)}` },
      legend: { data: ['收款', '付款', '净流量'], right: 0, top: 0, itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
      grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
      xAxis: { type: 'category', data: rows.map((x: any) => x.period.slice(5)), ...axisStyle() },
      yAxis: { type: 'value', ...axisStyle(), axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => (v >= 10000 ? `${v / 10000}万` : v) } },
      series: [
        { name: '收款', type: 'bar', barWidth: 10, itemStyle: { borderRadius: [3, 3, 0, 0] }, data: rows.map((x: any) => x.inflow) },
        { name: '付款', type: 'bar', barWidth: 10, itemStyle: { borderRadius: [3, 3, 0, 0] }, data: rows.map((x: any) => x.outflow) },
        { name: '净流量', type: 'line', smooth: true, symbolSize: 5, data: rows.map((x: any) => x.net) },
      ],
    };
  }, [cashflow.data]);

  const todoTabs = [
    {
      key: 'approval',
      label: `待审批 ${todos.data?.approvals?.reduce((a: number, b: any) => a + b.count, 0) || 0}`,
      children: (
        <div>
          {(todos.data?.approvals || []).length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待审批单据" />}
          {(todos.data?.approvals || []).map((x: any) => (
            <div key={x.doc_type} className="flex-between" style={{ padding: '10px 4px', borderBottom: '1px solid #f4f6fa' }}>
              <Space>
                <Tag color="blue">{meta?.docTypes?.[x.doc_type]?.name || x.doc_type}</Tag>
                <span className="text-muted" style={{ fontSize: 12 }}>最早 {x.earliest}</span>
              </Space>
              <Space>
                <b>{x.count} 张</b>
                <Button size="small" type="link" onClick={() => navigate(routeOfDocType(x.doc_type))}>去处理 <ArrowRightOutlined /></Button>
              </Space>
            </div>
          ))}
          <div className="flex-between" style={{ padding: '10px 4px' }}>
            <Space><Tag color="orange">请假申请</Tag></Space>
            <Space><b>{todos.data?.leave || 0} 条</b><Button size="small" type="link" onClick={() => navigate('/hr/leaves')}>去处理</Button></Space>
          </div>
        </div>
      ),
    },
    {
      key: 'stock',
      label: `库存预警 ${todos.data?.lowStock || 0}`,
      children: (
        <div>
          {(alerts.data?.lowStock || []).length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="库存充足" />}
          {(alerts.data?.lowStock || []).map((x: any) => (
            <div key={x.code} className="flex-between" style={{ padding: '9px 4px', borderBottom: '1px solid #f4f6fa' }}>
              <div>
                <div style={{ fontSize: 12.5 }}>{x.name}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>{x.code} · 安全库存 {x.safety_stock}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="text-danger" style={{ fontWeight: 600 }}>{fmtNumber(x.qty, 0)}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>当前库存</div>
              </div>
            </div>
          ))}
          <div style={{ textAlign: 'center', paddingTop: 8 }}>
            <Button size="small" type="link" onClick={() => navigate('/inventory/alerts')}>查看全部预警 <ArrowRightOutlined /></Button>
          </div>
        </div>
      ),
    },
    {
      key: 'overdue',
      label: `逾期应收 ${todos.data?.overdueAr?.c || 0}`,
      children: (
        <div>
          {(alerts.data?.overdue || []).length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无逾期应收" />}
          {(alerts.data?.overdue || []).map((x: any) => (
            <div key={x.id} className="flex-between" style={{ padding: '9px 4px', borderBottom: '1px solid #f4f6fa' }}>
              <div>
                <div style={{ fontSize: 12.5 }}>{x.partner_name}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>{x.invoice_no} · 到期 {x.due_date}</div>
              </div>
              <b className="text-danger num">￥{fmtMoney(x.remain)}</b>
            </div>
          ))}
          <div style={{ textAlign: 'center', paddingTop: 8 }}>
            <Button size="small" type="link" onClick={() => navigate('/finance/receivables')}>查看应收台账 <ArrowRightOutlined /></Button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={`${greeting}，${user?.name || ''}`}
        subtitle={`${today} · 当前账期 ${s.period || ''} · 数据实时同步自业务单据`}
        extra={
          <Space>
            <Button icon={<ShoppingCartOutlined />} onClick={() => navigate('/sales/orders/new')}>新建销售订单</Button>
            <Button icon={<ShoppingOutlined />} onClick={() => navigate('/purchase/orders/new')}>新建采购订单</Button>
            <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => navigate('/reports/kpi')}>经营分析</Button>
          </Space>
        }
      />

      <div className="kpi-grid">
        <StatCard title="本月销售额" value={s.sales?.value || 0} prefix="¥" growth={s.sales?.growth}
          icon={<ShoppingCartOutlined />} foot={`${s.sales?.count || 0} 张发货单`} onClick={() => navigate('/sales/deliveries')} />
        <StatCard title="本月采购额" value={s.purchase?.value || 0} prefix="¥" growth={s.purchase?.growth}
          icon={<ShoppingOutlined />} foot={`${s.purchase?.count || 0} 张入库单`} onClick={() => navigate('/purchase/receipts')} />
        <StatCard title="本月毛利" value={s.grossProfit?.value || 0} prefix="¥" growth={s.grossProfit?.growth}
          icon={<RiseOutlined />} foot={`毛利率 ${s.grossProfit?.rate || 0}%`} onClick={() => navigate('/reports/gross-profit')} />
        <StatCard title="库存总额" value={s.inventory?.value || 0} prefix="¥"
          icon={<InboxOutlined />} foot={`${s.inventory?.skuCount || 0} 个库存明细`} onClick={() => navigate('/inventory/balances')} />
        <StatCard title="应收余额" value={s.receivable || 0} prefix="¥" icon={<WalletOutlined />}
          foot={`${todos.data?.overdueAr?.c || 0} 张逾期 · ￥${fmtMoney(todos.data?.overdueAr?.amount || 0)}`} onClick={() => navigate('/finance/receivables')} />
        <StatCard title="应付余额" value={s.payable || 0} prefix="¥" icon={<BankOutlined />}
          foot="待付供应商货款" onClick={() => navigate('/finance/payables')} />
        <StatCard title="待办审批" value={s.todo || 0} money={false} digits={0} icon={<ClockCircleOutlined />}
          foot={`${s.producing || 0} 张在产工单`} onClick={() => navigate('/sales/orders')} />
        <StatCard title="库存预警" value={s.alerts || 0} money={false} digits={0} icon={<AlertOutlined />}
          foot={`${s.customers || 0} 家客户 · ${s.items || 0} 个物料`} onClick={() => navigate('/inventory/alerts')} />
      </div>

      <Row gutter={14} className="mt-14">
        <Col xs={24} xl={16}>
          <ChartCard title="销售 / 采购 / 毛利 趋势（近 12 个月）" option={trendOption} height={320}
            extra={<Button size="small" type="link" onClick={() => navigate('/reports/sales-trend')}>明细分析</Button>} />
        </Col>
        <Col xs={24} xl={8}>
          <ChartCard title="销售品类占比（近 6 个月）" option={shareOption} height={320} />
        </Col>
      </Row>

      <Row gutter={14} className="mt-14">
        <Col xs={24} xl={10}>
          <div className="card">
            <div className="card-head">
              <div className="card-title"><span className="dot" />待办事项与风险提示</div>
              <Button size="small" type="link" onClick={() => todos.refresh()}>刷新</Button>
            </div>
            <div className="card-pad" style={{ paddingTop: 6 }}>
              <Tabs items={todoTabs} />
            </div>
          </div>
        </Col>
        <Col xs={24} xl={14}>
          <div className="card">
            <div className="card-head">
              <div className="card-title"><span className="dot" />最近业务单据</div>
              <Button size="small" type="link" onClick={() => navigate('/reports/sales-summary')}>更多</Button>
            </div>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={recent.data || []}
              columns={[
                { title: '单据编号', dataIndex: 'doc_no', width: 160, render: (v: string, r: any) => <a onClick={() => navigate(`${routeOfDocType(r.doc_type)}/${r.id}`)}>{v}</a> },
                { title: '类型', dataIndex: 'doc_type', width: 110, render: (v: string) => <Tag color="blue">{meta?.docTypes?.[v]?.name || v}</Tag> },
                { title: '往来单位', dataIndex: 'partner_name', ellipsis: true, render: (v: string) => v || '-' },
                { title: '日期', dataIndex: 'doc_date', width: 105 },
                { title: '金额', dataIndex: 'total_amount', width: 110, align: 'right', render: (v: number) => <span className="num">{fmtMoney(v)}</span> },
                { title: '状态', dataIndex: 'status', width: 100, render: (v: string, r: any) => <StatusTag status={v} docType={r.doc_type} /> },
              ]}
            />
          </div>
        </Col>
      </Row>

      <Row gutter={14} className="mt-14">
        <Col xs={24} xl={10}>
          <ChartCard title="客户销售排行（近 6 个月）" option={topCustomerOption} height={280} />
        </Col>
        <Col xs={24} xl={8}>
          <ChartCard title="收付款净流量（近 6 个月）" option={cashOption} height={280} />
        </Col>
        <Col xs={24} xl={6}>
          <div className="card" style={{ height: 280 }}>
            <div className="card-head"><div className="card-title"><span className="dot" />生产执行</div>
              <Button size="small" type="link" onClick={() => navigate('/production/work-orders')}>全部</Button>
            </div>
            <div className="card-pad" style={{ maxHeight: 220, overflow: 'auto' }}>
              {(production.data?.recent || []).slice(0, 6).map((w: any) => (
                <div key={w.id} style={{ padding: '7px 0', borderBottom: '1px solid #f4f6fa' }}>
                  <div className="flex-between">
                    <span style={{ fontSize: 12.5 }}>{w.item_name}</span>
                    <span className="text-muted" style={{ fontSize: 11 }}>{w.status === 'COMPLETED' ? '已完工' : w.status === 'IN_PROGRESS' ? '生产中' : w.status}</span>
                  </div>
                  <Progress percent={w.qty ? Math.min(100, Math.round((w.completed_qty / w.qty) * 100)) : 0} size="small" showInfo={false} style={{ margin: '2px 0' }} />
                  <div className="text-muted" style={{ fontSize: 11 }}>{w.order_no} · {fmtNumber(w.completed_qty, 0)}/{fmtNumber(w.qty, 0)}</div>
                </div>
              ))}
              {(production.data?.recent || []).length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无工单" />}
            </div>
          </div>
        </Col>
      </Row>

      <div className="text-muted" style={{ textAlign: 'center', fontSize: 11, marginTop: 20 }}>
        <BuildOutlined /> 云枢ERP V1.0.0 · 数据每日自动备份 · 技术支持：云枢科技
      </div>
    </div>
  );
}

function routeOfDocType(docType: string): string {
  const map: Record<string, string> = {
    SO: '/sales/orders', DN: '/sales/deliveries', SR: '/sales/returns',
    PO: '/purchase/orders', GRN: '/purchase/receipts', PR: '/purchase/returns',
    TR: '/inventory/transfers', ADJ: '/inventory/stocktake', OI: '/inventory/other-in', OO: '/inventory/other-out',
    RC: '/finance/receipts', PY: '/finance/payments',
  };
  return map[docType] || '/dashboard';
}
