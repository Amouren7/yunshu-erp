import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Col, Empty, Row, Space, Table, Tag } from 'antd';
import {
  ArrowRightOutlined, BarChartOutlined, ContactsOutlined, FileDoneOutlined,
  ReloadOutlined, RiseOutlined, SolutionOutlined, TeamOutlined, ThunderboltOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ChartCard, { CHART_COLORS, axisStyle } from '../../components/ChartCard';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useMeta } from '../../store/meta';
import { fmtDate, fmtMoney, fmtNumber } from '../../utils/format';
import dayjs from 'dayjs';

const LEAD_STATUS_COLORS: Record<string, string> = {
  待跟进: '#f59e0b', 已联系: '#2f6bff', 已确认商机: '#8b5cf6', 已转客户: '#16a34a', 已流失: '#94a3b8',
};
const LEAD_STATUS_TAGS: Record<string, string> = {
  待跟进: 'orange', 已联系: 'blue', 已确认商机: 'purple', 已转客户: 'green', 已流失: 'default',
};

export default function CrmOverviewPage() {
  const navigate = useNavigate();
  const { enumOf } = useMeta();
  const overview = useRequest(() => api.get('/api/crm/overview'), []);
  const pendingLeads = useRequest(() => api.get('/api/crm/leads', { status: '待跟进', pageSize: 6 }), []);

  const o = overview.data || ({} as any);
  const leads = o.leads || {};
  const opps = o.opportunities || {};
  const contracts = o.contracts || {};
  const followUp = o.followUp || {};
  const funnel: any[] = opps.funnel || [];
  const weightedTotal = funnel.reduce((s, r) => s + Number(r.weighted_amount || 0), 0);

  const funnelOption = useMemo(() => {
    const rows = funnel
      .filter((r) => r.stage !== '输单' && Number(r.amount) > 0)
      .sort((a, b) => Number(b.amount) - Number(a.amount));
    return {
      color: CHART_COLORS,
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => `${p.name}<br/>商机金额：¥${fmtMoney(p.value, 0)}<br/>商机数量：${p.data.count} 个<br/>加权金额：¥${fmtMoney(p.data.weighted, 0)}`,
      },
      series: [{
        type: 'funnel', left: '6%', right: '6%', top: 8, bottom: 8, sort: 'descending', gap: 2,
        minSize: '28%', maxSize: '100%',
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        label: {
          show: true, position: 'inside', color: '#fff', fontSize: 12, fontWeight: 600,
          formatter: (p: any) => `${p.name}  ${fmtMoney(Number(p.value) / 10000, 1)} 万 · ${p.data.count} 个`,
        },
        data: rows.map((r) => ({ name: r.stage, value: Number(r.amount), count: r.count, weighted: r.weighted_amount })),
      }],
    };
  }, [funnel]);

  const stageOption = useMemo(() => ({
    color: ['#2f6bff', '#93b4ff', '#f59e0b'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: any) => `¥${fmtMoney(v, 0)}` },
    legend: { data: ['商机金额', '加权金额'], right: 0, top: 0, itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
    grid: { left: 8, right: 12, top: 36, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: funnel.map((r) => r.stage), ...axisStyle(), axisLabel: { ...axisStyle().axisLabel, interval: 0 } },
    yAxis: { type: 'value', ...axisStyle(), axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => (v >= 10000 ? `${v / 10000}万` : v) } },
    series: [
      { name: '商机金额', type: 'bar', barWidth: 16, itemStyle: { borderRadius: [3, 3, 0, 0] }, data: funnel.map((r) => Number(r.amount || 0)) },
      { name: '加权金额', type: 'bar', barWidth: 16, itemStyle: { borderRadius: [3, 3, 0, 0] }, data: funnel.map((r) => Number(r.weighted_amount || 0)) },
    ],
  }), [funnel]);

  const leadPieOption = useMemo(() => {
    const byStatus = leads.byStatus || {};
    const statuses = enumOf('leadStatus') as string[];
    const data = statuses
      .map((s) => ({
        name: s,
        value: Number(byStatus[s]?.count || 0),
        itemStyle: { color: LEAD_STATUS_COLORS[s] || '#94a3b8' },
      }))
      .filter((x) => x.value > 0);
    return {
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const amount = Number(byStatus[p.name]?.amount || 0);
          return `${p.name}<br/>线索数量：${p.value} 条（${p.percent}%）<br/>预计金额：¥${fmtMoney(amount, 0)}`;
        },
      },
      legend: { type: 'scroll', orient: 'vertical', right: 0, top: 'center', itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
      series: [{
        type: 'pie', radius: ['48%', '72%'], center: ['34%', '50%'],
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        label: { show: false }, data,
      }],
    };
  }, [leads, enumOf]);

  const pendingRows: any[] = pendingLeads.data?.rows || [];

  const refreshAll = () => {
    overview.refresh();
    pendingLeads.refresh();
  };

  return (
    <div>
      <PageHeader
        title="销售漏斗总览"
        subtitle={`${o.period || dayjs().format('YYYY-MM')} 线索 → 商机 → 合同转化全景 · 本月跟进 ${o.activities?.thisMonth || 0} 次`}
        extra={(
          <Space>
            <Button icon={<SolutionOutlined />} onClick={() => navigate('/crm/leads')}>线索管理</Button>
            <Button icon={<RiseOutlined />} onClick={() => navigate('/crm/opportunities')}>商机管理</Button>
            <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={overview.loading}>刷新</Button>
          </Space>
        )}
      />
      {overview.error && (
        <Alert type="error" showIcon message="CRM 总览数据加载失败" description={overview.error} style={{ marginBottom: 14 }} />
      )}

      <div className="kpi-grid">
        <StatCard
          title="线索总数" value={leads.total || 0} money={false} digits={0} suffix="条"
          icon={<SolutionOutlined />}
          foot={`已转化 ${leads.converted || 0} 条 · 转化率 ${leads.conversionRate || 0}%`}
          onClick={() => navigate('/crm/leads')}
        />
        <StatCard
          title="商机总额" value={opps.amount || 0} prefix="¥" icon={<RiseOutlined />}
          foot={`${opps.total || 0} 个商机 · 赢单率 ${opps.winRate || 0}%`}
          onClick={() => navigate('/crm/opportunities')}
        />
        <StatCard
          title="加权商机金额" value={weightedTotal} prefix="¥" icon={<BarChartOutlined />}
          foot={`按阶段赢率折算 · 共 ${opps.total || 0} 个商机`}
        />
        <StatCard
          title="赢单金额" value={opps.wonAmount || 0} prefix="¥" icon={<RiseOutlined />}
          foot={`赢单 ${opps.wonCount || 0} 个 · 赢单率 ${opps.winRate || 0}%`}
        />
        <StatCard
          title="合同总额" value={contracts.amount || 0} prefix="¥" icon={<FileDoneOutlined />}
          foot={`共 ${contracts.count || 0} 份 · 执行中 ${contracts.executingCount || 0} 份 ¥${fmtMoney(contracts.executingAmount, 0)}`}
          onClick={() => navigate('/crm/contracts')}
        />
        <StatCard
          title="本月新增客户" value={o.newCustomers || 0} money={false} digits={0} suffix="家"
          icon={<UsergroupAddOutlined />}
          foot="由线索转化或手工建档的新客户"
        />
        <StatCard
          title="客户总数" value={o.customers || 0} money={false} digits={0} suffix="家"
          icon={<TeamOutlined />}
          foot="状态正常的客户档案"
          onClick={() => navigate('/crm/customer-rank')}
        />
        <StatCard
          title="待跟进线索" value={followUp.pending || 0} money={false} digits={0} suffix="条"
          icon={<ThunderboltOutlined />}
          foot={`今日到期 ${followUp.due || 0} 条 · 本月跟进 ${o.activities?.thisMonth || 0} 次`}
          onClick={() => navigate('/crm/leads')}
        />
      </div>

      <Row gutter={14} className="mt-14">
        <Col xs={24} xl={10}>
          <ChartCard
            title="销售漏斗（按商机金额）"
            extra={<Button size="small" type="link" onClick={() => navigate('/crm/opportunities')}>商机明细 <ArrowRightOutlined /></Button>}
            option={funnelOption}
            height={300}
          />
        </Col>
        <Col xs={24} xl={14}>
          <ChartCard title="各阶段商机金额与加权金额" option={stageOption} height={300} />
        </Col>
      </Row>

      <Row gutter={14} className="mt-14">
        <Col xs={24} xl={15}>
          <div className="card">
            <div className="card-head">
              <div className="card-title"><span className="dot" />待跟进线索 <Tag color="orange">{followUp.pending || 0}</Tag></div>
              <Button size="small" type="link" onClick={() => navigate('/crm/leads')}>全部线索 <ArrowRightOutlined /></Button>
            </div>
            <div style={{ padding: '4px 18px 12px' }}>
              {pendingRows.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待跟进线索" style={{ padding: '26px 0' }} />
              ) : (
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={pendingRows}
                  columns={[
                    {
                      title: '线索 / 公司', dataIndex: 'name', ellipsis: true,
                      render: (v: string, r: any) => (
                        <div>
                          <b>{v}</b>
                          <div className="text-muted" style={{ fontSize: 11 }}>{r.company || '-'}</div>
                        </div>
                      ),
                    },
                    { title: '联系人', dataIndex: 'contact', width: 90, render: (v: string) => v || '-' },
                    { title: '电话', dataIndex: 'phone', width: 120, render: (v: string) => v || '-' },
                    { title: '来源', dataIndex: 'source', width: 96, render: (v: string) => <Tag>{v}</Tag> },
                    {
                      title: '预计金额', dataIndex: 'expected_amount', width: 110, align: 'right',
                      render: (v: any) => <span className="num">¥{fmtMoney(v, 0)}</span>,
                    },
                    {
                      title: '下次跟进', dataIndex: 'next_follow_at', width: 110,
                      render: (v: string) => {
                        if (!v) return <span className="text-muted">未安排</span>;
                        const overdue = dayjs(v).isBefore(dayjs().startOf('day'));
                        return <span style={overdue ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>{fmtDate(v)}{overdue ? ' · 已逾期' : ''}</span>;
                      },
                    },
                    { title: '负责人', dataIndex: 'owner_name', width: 90, render: (v: string) => v || '-' },
                    {
                      title: '状态', dataIndex: 'status', width: 96, align: 'center',
                      render: (v: string) => <Tag color={LEAD_STATUS_TAGS[v] || 'default'}>{v}</Tag>,
                    },
                  ]}
                />
              )}
            </div>
          </div>
        </Col>
        <Col xs={24} xl={9}>
          <ChartCard title="线索状态分布" option={leadPieOption} height={286} />
        </Col>
      </Row>

      <div className="text-muted" style={{ textAlign: 'center', fontSize: 11, marginTop: 18 }}>
        <ContactsOutlined /> 转化链路：线索 → 商机 → 合同 · 金额口径为不含税商机金额，加权金额 = 商机金额 × 阶段赢率
      </div>
    </div>
  );
}
