import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Empty, Progress, Space, Spin, Table } from 'antd';
import {
  AlertOutlined, ApartmentOutlined, BarChartOutlined, BuildOutlined, CheckCircleOutlined,
  PlusOutlined, ReloadOutlined, ShoppingOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ChartCard, { CHART_COLORS, axisStyle } from '../../components/ChartCard';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { fmtMoney, fmtNumber } from '../../utils/format';
import { PriorityTag, WoStatusTag, woProgress } from './shared';

/** 生产总览 */
export default function ProductionOverviewPage() {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  const overview = useRequest(() => api.get<any>('/api/production/overview'), []);
  const workOrders = useRequest(() => api.get<any>('/api/production/work-orders', { pageSize: 500 }), []);

  const d = overview.data || {};
  const month = d.month || {};
  const capacity = d.capacity || {};
  const statusCounts: any[] = d.statusCounts || [];
  const statusMap = d.statusMap || {};
  const totalCount = Number(d.total) || 0;

  const refreshAll = () => {
    overview.refresh();
    workOrders.refresh();
  };

  // 近 6 月完工趋势：用已完工/已关闭工单的完工日期聚合
  const trendData = useMemo(() => {
    const periods: string[] = [];
    for (let i = 5; i >= 0; i--) periods.push(dayjs().subtract(i, 'month').format('YYYY-MM'));
    const map = new Map(periods.map((p) => [p, { period: p, qty: 0, orders: 0 }]));
    for (const w of workOrders.data?.rows || []) {
      if (!['COMPLETED', 'CLOSED'].includes(w.status)) continue;
      const period = String(w.actual_end || w.planned_end || '').slice(0, 7);
      const bucket = map.get(period);
      if (!bucket) continue;
      bucket.qty += Number(w.completed_qty) || 0;
      bucket.orders += 1;
    }
    return periods.map((p) => {
      const b = map.get(p)!;
      return { ...b, qty: Math.round(b.qty * 100) / 100 };
    });
  }, [workOrders.data]);

  const trendOption = useMemo(
    () => ({
      color: [CHART_COLORS[0], CHART_COLORS[2], CHART_COLORS[1]],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        data: ['完工数量', '完工工单数'],
        right: 0,
        top: 0,
        itemHeight: 8,
        textStyle: { fontSize: 11, color: '#5b6b82' },
      },
      grid: { left: 8, right: 8, top: 34, bottom: 4, containLabel: true },
      xAxis: { type: 'category', data: trendData.map((t) => t.period.slice(2)), ...axisStyle() },
      yAxis: [
        { type: 'value', name: '数量', nameTextStyle: { color: '#8b98ab', fontSize: 11 }, ...axisStyle() },
        {
          type: 'value',
          name: '工单数',
          nameTextStyle: { color: '#8b98ab', fontSize: 11 },
          ...axisStyle(),
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '完工数量',
          type: 'bar',
          barWidth: 16,
          itemStyle: { borderRadius: [3, 3, 0, 0] },
          data: trendData.map((t) => t.qty),
        },
        {
          name: '完工工单数',
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          yAxisIndex: 1,
          lineStyle: { width: 2 },
          data: trendData.map((t) => t.orders),
        },
      ],
    }),
    [trendData]
  );

  const statusOption = useMemo(() => {
    const rows = statusCounts.filter((s) => Number(s.count) > 0);
    const STATUS_CHART_COLORS: Record<string, string> = {
      DRAFT: '#94a3b8',
      RELEASED: '#2f6bff',
      IN_PROGRESS: '#f59e0b',
      COMPLETED: '#16a34a',
      CLOSED: '#64748b',
      VOID: '#ef4444',
    };
    return {
      tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}：${fmtNumber(p.value, 0)} 张（${p.percent}%）` },
      legend: {
        orient: 'vertical',
        right: 8,
        top: 'center',
        itemHeight: 8,
        textStyle: { fontSize: 11, color: '#5b6b82' },
      },
      graphic: rows.length
        ? {
            type: 'text',
            left: '31%',
            top: '46%',
            style: { text: `工单总数\n${fmtNumber(totalCount, 0)}`, fill: '#1f2b3d', fontSize: 13, fontWeight: 600, textAlign: 'center' },
          }
        : { type: 'text', left: 'center', top: 'middle', style: { text: '暂无工单数据', fill: '#8b98ab', fontSize: 12 } },
      series: [
        {
          type: 'pie',
          radius: ['52%', '74%'],
          center: ['34%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
          label: { show: false },
          data: rows.map((s) => ({
            name: s.label,
            value: Number(s.count),
            itemStyle: { color: STATUS_CHART_COLORS[s.status] || CHART_COLORS[0] },
          })),
        },
      ],
    };
  }, [statusCounts, totalCount]);

  const recentRows = (workOrders.data?.rows || []).slice(0, 10);

  const header = (
    <PageHeader
      title="生产总览"
      subtitle={`${d.period || dayjs().format('YYYY-MM')} 生产执行看板 · 在产工单、完工进度、领料与产能负荷实时汇总`}
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refreshAll}>刷新</Button>
          <Button icon={<BarChartOutlined />} onClick={() => navigate('/production/work-centers')}>产能负荷</Button>
          {hasPerm('production.create') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/production/work-orders/new')}>
              新建工单
            </Button>
          )}
        </Space>
      }
    />
  );

  if (overview.loading && !overview.data) {
    return (
      <div>
        {header}
        <div className="card">
          <div className="empty-hint">
            <Spin /> <span style={{ marginLeft: 8 }}>正在加载生产数据…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      {overview.error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 14 }}
          message="生产数据加载失败"
          description={overview.error}
          action={<Button size="small" onClick={refreshAll}>重试</Button>}
        />
      )}

      <div className="kpi-grid kpi-3">
        <StatCard
          title="在产工单"
          value={d.producing || 0}
          money={false}
          digits={0}
          suffix="张"
          icon={<BuildOutlined />}
          foot={`共 ${fmtNumber(totalCount, 0)} 张工单 · 草稿 ${fmtNumber(statusMap.DRAFT || 0, 0)} 张`}
          onClick={() => navigate('/production/work-orders')}
        />
        <StatCard
          title="本月完工数量"
          value={month.completedQty || 0}
          money={false}
          digits={2}
          icon={<CheckCircleOutlined />}
          foot={`${fmtNumber(month.completedOrders || 0, 0)} 张工单完工 · ${month.period || ''}`}
          onClick={() => navigate('/production/work-orders')}
        />
        <StatCard
          title="本月领料金额"
          value={month.materialAmount || 0}
          prefix="¥"
          icon={<ShoppingOutlined />}
          foot={`本月完工入库 ¥${fmtMoney(month.completionAmount || 0)}`}
          onClick={() => navigate('/inventory/ledger')}
        />
        <StatCard
          title="产能利用率"
          value={capacity.rate || 0}
          money={false}
          digits={1}
          suffix="%"
          icon={<ThunderboltOutlined />}
          foot={`计划 ${fmtNumber(capacity.plannedHours || 0, 1)}h / 实际 ${fmtNumber(capacity.actualHours || 0, 1)}h · ${capacity.operationCount || 0} 道工序`}
          onClick={() => navigate('/production/work-centers')}
        />
        <StatCard
          title="BOM 数"
          value={d.bomCount || 0}
          money={false}
          digits={0}
          suffix="个"
          icon={<ApartmentOutlined />}
          foot="启用中的物料清单"
          onClick={() => navigate('/production/boms')}
        />
        <StatCard
          title="缺料物料"
          value={d.materialShortage || 0}
          money={false}
          digits={0}
          suffix="种"
          color={Number(d.materialShortage) > 0 ? 'var(--danger)' : undefined}
          icon={<AlertOutlined />}
          foot="按未完工工单未领料需求测算"
          onClick={() => navigate('/production/mrp')}
        />
      </div>

      <div className="grid-2 mt-14">
        <ChartCard
          title="近 6 个月完工趋势"
          option={trendOption}
          height={300}
          extra={
            <span className="text-muted" style={{ fontSize: 11 }}>
              {workOrders.loading
                ? '统计中…'
                : `近 6 月完工 ${fmtNumber(trendData.reduce((s, t) => s + t.qty, 0), 0)} 件 / ${fmtNumber(trendData.reduce((s, t) => s + t.orders, 0), 0)} 张工单`}
            </span>
          }
        />
        <ChartCard title="工单状态分布" option={statusOption} height={300} />
      </div>

      <div className="card mt-14">
        <div className="card-head">
          <div className="card-title">
            <span className="dot" />
            最近生产工单
          </div>
          <Button size="small" type="link" onClick={() => navigate('/production/work-orders')}>
            查看全部
          </Button>
        </div>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          loading={workOrders.loading}
          dataSource={recentRows}
          scroll={{ x: 1000 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无生产工单" /> }}
          onRow={(record: any) => ({
            style: { cursor: 'pointer' },
            onClick: () => navigate(`/production/work-orders/${record.id}`),
          })}
          columns={[
            {
              title: '工单号',
              dataIndex: 'order_no',
              width: 170,
              render: (v: string, r: any) => (
                <a
                  style={{ fontWeight: 500 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/production/work-orders/${r.id}`);
                  }}
                >
                  {v}
                </a>
              ),
            },
            {
              title: '成品',
              dataIndex: 'item_name',
              width: 220,
              ellipsis: true,
              render: (v: string, r: any) => (
                <div>
                  <div>{v}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>
                    {r.item_code} · {r.spec}
                  </div>
                </div>
              ),
            },
            {
              title: '数量 / 已完工',
              key: 'qty',
              width: 140,
              align: 'right',
              render: (_: any, r: any) => (
                <span className="num">
                  {fmtNumber(r.qty, 2)} / <span className="text-muted">{fmtNumber(r.completed_qty, 2)}</span>
                </span>
              ),
            },
            {
              title: '进度',
              key: 'progress',
              width: 140,
              render: (_: any, r: any) => (
                <Progress
                  percent={woProgress(r.qty, r.completed_qty)}
                  size="small"
                  strokeColor={Number(r.qty) > 0 && Number(r.completed_qty) >= Number(r.qty) ? 'var(--success)' : 'var(--primary)'}
                />
              ),
            },
            {
              title: '计划结束',
              dataIndex: 'planned_end',
              width: 110,
              render: (v: string, r: any) => {
                const overdue = r.status !== 'COMPLETED' && r.status !== 'CLOSED' && v && dayjs(v).isBefore(dayjs().format('YYYY-MM-DD'));
                return <span className={overdue ? 'text-danger' : undefined}>{v || '-'}</span>;
              },
            },
            { title: '状态', dataIndex: 'status', width: 100, align: 'center', render: (v: string) => <WoStatusTag status={v} /> },
            { title: '优先级', dataIndex: 'priority', width: 80, align: 'center', render: (v: string) => <PriorityTag value={v} /> },
          ]}
        />
      </div>

      <div className="text-muted" style={{ textAlign: 'center', fontSize: 11, marginTop: 18 }}>
        <BuildOutlined /> 云枢ERP · 生产管理模块 · 数据实时同步自工单执行
      </div>
    </div>
  );
}
