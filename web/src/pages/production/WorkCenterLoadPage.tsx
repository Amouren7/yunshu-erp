import { useMemo } from 'react';
import { Alert, Button, Progress, Space, Table, Tag } from 'antd';
import { BarChartOutlined, ClockCircleOutlined, ReloadOutlined, TeamOutlined, ThunderboltOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ChartCard, { CHART_COLORS, axisStyle } from '../../components/ChartCard';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { fmtMoney, fmtNumber } from '../../utils/format';
import { loadColor } from './shared';

/** 工作中心负荷 */
export default function WorkCenterLoadPage() {
  const wcl = useRequest<any>(() => api.get('/api/production/work-center-load'), []);
  const data = wcl.data || {};
  const rows: any[] = data.rows || [];
  const summary = data.summary || {};

  const chartOption = useMemo(
    () => ({
      color: [CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[6], CHART_COLORS[2]],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        data: ['计划工时', '实际工时', '月度产能', '负荷率'],
        right: 0,
        top: 0,
        itemHeight: 8,
        textStyle: { fontSize: 11, color: '#5b6b82' },
      },
      grid: { left: 8, right: 8, top: 36, bottom: 4, containLabel: true },
      ...(rows.length
        ? {}
        : { graphic: { type: 'text', left: 'center', top: 'middle', style: { text: '暂无工作中心负荷数据', fill: '#8b98ab', fontSize: 12 } } }),
      xAxis: { type: 'category', data: rows.map((r) => r.name), ...axisStyle() },
      yAxis: [
        { type: 'value', ...axisStyle() },
        {
          type: 'value',
          ...axisStyle(),
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '计划工时',
          type: 'bar',
          barWidth: 12,
          itemStyle: { borderRadius: [3, 3, 0, 0] },
          data: rows.map((r) => r.planned_hours),
        },
        {
          name: '实际工时',
          type: 'bar',
          barWidth: 12,
          itemStyle: { borderRadius: [3, 3, 0, 0] },
          data: rows.map((r) => r.actual_hours),
        },
        {
          name: '月度产能',
          type: 'bar',
          barWidth: 12,
          itemStyle: { borderRadius: [3, 3, 0, 0], color: '#c7d3e8' },
          data: rows.map((r) => r.capacity_hours),
        },
        {
          name: '负荷率',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { width: 2, type: 'dashed' },
          data: rows.map((r) => r.load_rate),
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#e5484d', type: 'dashed', width: 1 },
            label: { formatter: '100%', fontSize: 10, color: '#e5484d' },
            data: [{ yAxis: 100 }],
          },
        },
      ],
    }),
    [rows]
  );

  return (
    <div>
      <PageHeader
        title="工作中心负荷"
        subtitle={`${data.period || ''} 工作中心产能与工时负荷分析 · 计划工时 vs 实际工时 vs 月度产能（工作日 ${data.workdays || 0} 天）`}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={wcl.refresh}>刷新</Button>
          </Space>
        }
      />

      {wcl.error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 14 }}
          message="工作中心负荷加载失败"
          description={wcl.error}
          action={<Button size="small" onClick={wcl.refresh}>重试</Button>}
        />
      )}

      <div className="kpi-grid">
        <StatCard
          title="计划工时"
          value={summary.plannedHours || 0}
          money={false}
          digits={2}
          suffix="h"
          icon={<ClockCircleOutlined />}
          foot={`本月 ${data.workdays || 0} 个工作日`}
        />
        <StatCard
          title="实际工时"
          value={summary.actualHours || 0}
          money={false}
          digits={2}
          suffix="h"
          icon={<BarChartOutlined />}
          foot={`工时利用率 ${fmtNumber(summary.utilization || 0, 1)}%`}
        />
        <StatCard
          title="综合负荷率"
          value={summary.loadRate || 0}
          money={false}
          digits={1}
          suffix="%"
          color={Number(summary.loadRate) > 100 ? 'var(--danger)' : undefined}
          icon={<ThunderboltOutlined />}
          foot={`产能工时 ${fmtNumber(summary.capacityHours || 0, 2)}h`}
        />
        <StatCard
          title="预计人工成本"
          value={summary.costAmount || 0}
          prefix="¥"
          icon={<TeamOutlined />}
          foot="按实际工时 × 小时费率"
        />
      </div>

      <div className="mt-14">
        <ChartCard
          title="工作中心工时负荷"
          option={chartOption}
          height={320}
          extra={<span className="text-muted" style={{ fontSize: 11 }}>虚线为负荷率（右轴），超过 100% 表示产能超负荷</span>}
        />
      </div>

      <div className="card mt-14">
        <div className="card-head">
          <div className="card-title">
            <span className="dot" />
            工作中心负荷明细
          </div>
          <span className="text-muted" style={{ fontSize: 11 }}>
            {wcl.loading ? '加载中…' : `共 ${rows.length} 个工作中心`}
          </span>
        </div>
        <Table
          size="small"
          rowKey="work_center_id"
          loading={wcl.loading}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 1300 }}
          locale={{ emptyText: <div className="empty-hint">暂无工作中心数据，请先在「工序与工作中心」中维护</div> }}
          columns={[
            { title: '编码', dataIndex: 'code', width: 90 },
            { title: '工作中心', dataIndex: 'name', width: 150 },
            { title: '类型', dataIndex: 'type', width: 100, render: (v: string) => <Tag style={{ marginInlineEnd: 0 }}>{v || '-'}</Tag> },
            {
              title: '日产能(工时)',
              dataIndex: 'capacity',
              width: 110,
              align: 'right',
              render: (v: any) => <span className="num">{fmtNumber(v, 2)}</span>,
            },
            {
              title: '月度产能(工时)',
              dataIndex: 'capacity_hours',
              width: 130,
              align: 'right',
              render: (v: any) => <span className="num">{fmtNumber(v, 2)}</span>,
            },
            {
              title: '计划工时',
              dataIndex: 'planned_hours',
              width: 100,
              align: 'right',
              render: (v: any) => <b className="num">{fmtNumber(v, 2)}</b>,
            },
            {
              title: '实际工时',
              dataIndex: 'actual_hours',
              width: 100,
              align: 'right',
              render: (v: any) => <span className="num">{fmtNumber(v, 2)}</span>,
            },
            {
              title: '负荷率',
              dataIndex: 'load_rate',
              width: 180,
              render: (v: any) => {
                const rate = Number(v) || 0;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Progress
                      percent={Math.min(100, rate)}
                      size="small"
                      showInfo={false}
                      strokeColor={loadColor(rate)}
                      style={{ flex: 1, marginBottom: 0 }}
                    />
                    <span className="num" style={{ color: loadColor(rate), width: 48, textAlign: 'right' }}>
                      {fmtNumber(rate, 1)}%
                    </span>
                  </div>
                );
              },
            },
            {
              title: '利用率',
              dataIndex: 'utilization',
              width: 90,
              align: 'right',
              render: (v: any) => <span className="num">{fmtNumber(v, 1)}%</span>,
            },
            { title: '工单数', dataIndex: 'order_count', width: 80, align: 'center' },
            { title: '工序数', dataIndex: 'operation_count', width: 80, align: 'center' },
            {
              title: '小时费率',
              dataIndex: 'cost_rate',
              width: 100,
              align: 'right',
              render: (v: any) => `¥${fmtMoney(v)}`,
            },
            {
              title: '预计人工成本',
              dataIndex: 'cost_amount',
              width: 130,
              align: 'right',
              render: (v: any) => <b className="num">¥{fmtMoney(v)}</b>,
            },
          ]}
        />
      </div>
    </div>
  );
}
