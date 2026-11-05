import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App, Button, Col, Empty, Popconfirm, Row, Space, Table, Tag } from 'antd';
import {
  ArrowRightOutlined, CalendarOutlined, CheckOutlined, ClockCircleOutlined, CloseOutlined,
  LogoutOutlined, MoneyCollectOutlined, ReloadOutlined, ScheduleOutlined, TeamOutlined,
  ThunderboltOutlined, UsergroupAddOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ChartCard, { CHART_COLORS, axisStyle } from '../../components/ChartCard';
import { SimpleStatus } from '../../components/StatusTag';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { useMeta } from '../../store/meta';
import { fmtDate, fmtMoney, fmtNumber } from '../../utils/format';
import dayjs from 'dayjs';

const ATT_COLORS: Record<string, string> = {
  正常: '#16a34a', 迟到: '#f59e0b', 早退: '#f97316', 缺勤: '#e5484d',
  请假: '#2f6bff', 出差: '#06b6d4', 加班: '#8b5cf6',
};

export default function HrOverviewPage() {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  const { enumOf } = useMeta();
  const { message } = App.useApp();
  const month = dayjs().format('YYYY-MM');
  const overview = useRequest(() => api.get('/api/hr/overview'), []);
  const deptStats = useRequest(() => api.get('/api/hr/departments/stats'), []);
  const pending = useRequest(() => api.get('/api/hr/leaves', { status: '待审批', pageSize: 6 }), []);
  const monthStart = `${month}-01`;
  const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD');
  const attSummary = useRequest(
    () => api.get('/api/hr/attendances', { startDate: monthStart, endDate: monthEnd, pageSize: 1 }),
    [monthStart, monthEnd],
  );

  const o = overview.data || ({} as any);
  const deptRows: any[] = o.departments || [];
  const statRows: any[] = deptStats.data?.rows || [];
  const statTotals = deptStats.data?.totals || {};
  const att = o.attendance || {};
  const payroll = o.payroll || {};
  const leaveStats = o.leaveStats || {};

  const deptPieOption = useMemo(() => ({
    color: CHART_COLORS,
    tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 人（{d}%）' },
    legend: { type: 'scroll', orient: 'vertical', right: 0, top: 'center', itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
    series: [{
      type: 'pie', radius: ['48%', '72%'], center: ['36%', '50%'],
      itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
      label: { show: false },
      data: deptRows.filter((d) => Number(d.employee_count) > 0).map((d) => ({ name: d.name, value: Number(d.employee_count) })),
    }],
  }), [deptRows]);

  const deptSalaryOption = useMemo(() => ({
    color: ['#2f6bff', '#f59e0b'],
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['在职人数', '本期薪资支出'], right: 0, top: 0, itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
    grid: { left: 8, right: 12, top: 36, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: statRows.map((d) => d.name), ...axisStyle(), axisLabel: { ...axisStyle().axisLabel, interval: 0, rotate: 26 } },
    yAxis: [
      { type: 'value', name: '人数', ...axisStyle() },
      { type: 'value', name: '薪资', ...axisStyle(), axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => (v >= 10000 ? `${v / 10000}万` : v) } },
    ],
    series: [
      { name: '在职人数', type: 'bar', barWidth: 14, itemStyle: { borderRadius: [3, 3, 0, 0] }, data: statRows.map((d) => Number(d.employee_count || 0)) },
      { name: '本期薪资支出', type: 'line', yAxisIndex: 1, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2 }, data: statRows.map((d) => Number(d.payroll_net || 0)) },
    ],
  }), [statRows]);

  const attPieOption = useMemo(() => {
    const summary = attSummary.data?.summary || {};
    const statuses = enumOf('attendanceStatus') as string[];
    const data = statuses
      .map((s) => ({ name: s, value: Number(summary[s] || 0), itemStyle: { color: ATT_COLORS[s] } }))
      .filter((x) => x.value > 0);
    return {
      color: CHART_COLORS,
      tooltip: { trigger: 'item', formatter: '{b}<br/>{c} 人次（{d}%）' },
      legend: { type: 'scroll', orient: 'vertical', right: 0, top: 'center', itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
      series: [{
        type: 'pie', radius: ['48%', '72%'], center: ['36%', '50%'],
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        label: { show: false }, data,
      }],
    };
  }, [attSummary.data, enumOf]);

  const approve = async (row: any, approved: boolean) => {
    try {
      await api.post(`/api/hr/leaves/${row.id}/approve`, { approved });
      message.success(approved ? '已批准该请假申请' : '已驳回该请假申请');
      overview.refresh();
      pending.refresh();
    } catch (e: any) {
      message.error(e?.message || '审批失败');
    }
  };

  const refreshAll = () => {
    overview.refresh();
    deptStats.refresh();
    pending.refresh();
    attSummary.refresh();
  };

  const pendingRows: any[] = pending.data?.rows || [];

  return (
    <div>
      <PageHeader
        title="人事总览"
        subtitle={`${month} 人力资源关键指标 · 在职 ${o.headcount || 0} 人 · 数据来自员工档案、考勤与薪资`}
        extra={
          <Space>
            <Button icon={<ScheduleOutlined />} onClick={() => navigate('/hr/leaves')}>请假审批</Button>
            <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={overview.loading}>刷新</Button>
          </Space>
        }
      />
      {overview.error && (
        <Alert type="error" showIcon message="人事总览数据加载失败" description={overview.error} style={{ marginBottom: 14 }} />
      )}

      <div className="kpi-grid">
        <StatCard
          title="在职人数" value={o.headcount || 0} money={false} digits={0} suffix="人"
          icon={<TeamOutlined />} foot={`员工档案 ${o.totalEmployees || 0} 人 · ${o.departmentCount || 0} 个部门`}
          onClick={() => navigate('/hr/departments')}
        />
        <StatCard
          title="本月出勤率" value={att.rate || 0} money={false} suffix="%"
          icon={<CalendarOutlined />} foot={`应出勤 ${fmtNumber(att.total, 0)} 人次 · 加班 ${fmtNumber(att.overtimeHours, 1)} 小时`}
          onClick={() => navigate('/hr/attendances')}
        />
        <StatCard
          title="本月薪资总额" value={payroll.count ? payroll.totalNet : payroll.latestTotalNet || 0} prefix="¥"
          icon={<MoneyCollectOutlined />}
          foot={payroll.count
            ? `已生成 ${payroll.count} 条 · 个税 ¥${fmtMoney(payroll.totalTax, 0)}`
            : `本月未生成，展示 ${payroll.latestPeriod || '-'} 实发合计`}
          onClick={() => navigate('/hr/payrolls')}
        />
        <StatCard
          title="待审批请假" value={o.pendingLeaves || 0} money={false} digits={0} suffix="条"
          icon={<ScheduleOutlined />}
          foot={`已批准 ${leaveStats['已批准'] || 0} · 已驳回 ${leaveStats['已驳回'] || 0}`}
          onClick={() => navigate('/hr/leaves')}
        />
        <StatCard
          title="本月入职" value={o.hires || 0} money={false} digits={0} suffix="人"
          icon={<UsergroupAddOutlined />}
          foot={`人事净增 ${Number(o.hireNet) >= 0 ? '+' : ''}${o.hireNet || 0} 人 · 本月新增员工`}
        />
        <StatCard
          title="本月离职" value={o.departures || 0} money={false} digits={0} suffix="人"
          icon={<LogoutOutlined />}
          foot="离职员工不计入在职人数与薪资核算"
        />
        <StatCard
          title="本月加班" value={att.overtimeHours || 0} money={false} digits={1} suffix="小时"
          icon={<ThunderboltOutlined />}
          foot={`出差 ${attSummary.data?.summary?.['出差'] || 0} 人次 · 请假 ${attSummary.data?.summary?.['请假'] || 0} 人次`}
        />
        <StatCard
          title="今日出勤" value={att.today?.present || 0} money={false} digits={0} suffix="人"
          icon={<ClockCircleOutlined />}
          foot={`今日排班 ${att.today?.total || 0} 人 · 出勤率 ${att.today?.total ? ((Number(att.today.present) / Number(att.today.total)) * 100).toFixed(1) : '0.0'}%`}
          onClick={() => navigate('/hr/attendances')}
        />
      </div>

      <Row gutter={14} className="mt-14">
        <Col xs={24} xl={9}>
          <ChartCard title="部门人数分布" option={deptPieOption} height={300} />
        </Col>
        <Col xs={24} xl={15}>
          <ChartCard
            title="部门人数与本期薪资支出"
            extra={<Button size="small" type="link" onClick={() => navigate('/hr/departments')}>部门与编制 <ArrowRightOutlined /></Button>}
            option={deptSalaryOption}
            height={300}
          />
        </Col>
      </Row>

      <Row gutter={14} className="mt-14">
        <Col xs={24} xl={9}>
          <ChartCard title={`本月出勤构成（${month}）`} option={attPieOption} height={286} />
        </Col>
        <Col xs={24} xl={15}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <span className="dot" />待审批请假
                <Tag color="orange" style={{ marginInlineStart: 4 }}>{o.pendingLeaves || 0}</Tag>
              </div>
              <Button size="small" type="link" onClick={() => navigate('/hr/leaves')}>全部请假 <ArrowRightOutlined /></Button>
            </div>
            <div style={{ padding: '4px 18px 12px' }}>
              {pendingRows.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待审批的请假申请" style={{ padding: '24px 0' }} />
              ) : (
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={pendingRows}
                  columns={[
                    {
                      title: '员工', dataIndex: 'employee_name', width: 150,
                      render: (v: string, r: any) => (
                        <div>
                          <b>{v}</b>
                          <div className="text-muted" style={{ fontSize: 11 }}>{r.employee_code} · {r.department_name || '-'}</div>
                        </div>
                      ),
                    },
                    { title: '类型', dataIndex: 'leave_type', width: 80, render: (v: string) => <Tag>{v}</Tag> },
                    { title: '开始日期', dataIndex: 'start_date', width: 108, render: (v: string) => fmtDate(v) },
                    { title: '结束日期', dataIndex: 'end_date', width: 108, render: (v: string) => fmtDate(v) },
                    { title: '天数', dataIndex: 'days', width: 70, align: 'right', render: (v: any) => `${fmtNumber(v, 1)} 天` },
                    { title: '原因', dataIndex: 'reason', ellipsis: true, render: (v: string) => v || '-' },
                    { title: '状态', dataIndex: 'status', width: 96, render: (v: string) => <SimpleStatus value={v} /> },
                    hasPerm('hr.approve') ? {
                      title: '操作', key: 'op', width: 132, align: 'center',
                      render: (_: any, r: any) => (
                        <Space size={0}>
                          <Popconfirm title="确认批准该请假申请？" onConfirm={() => approve(r, true)}>
                            <Button type="link" size="small" icon={<CheckOutlined />}>批准</Button>
                          </Popconfirm>
                          <Popconfirm title="确认驳回该请假申请？" onConfirm={() => approve(r, false)}>
                            <Button type="link" size="small" danger icon={<CloseOutlined />}>驳回</Button>
                          </Popconfirm>
                        </Space>
                      ),
                    } : null,
                  ].filter(Boolean) as any}
                />
              )}
            </div>
          </div>
        </Col>
      </Row>

      <div className="card mt-14">
        <div className="card-head">
          <div className="card-title"><span className="dot" />部门人事成本（{deptStats.data?.period || month}）</div>
          <Space size={14} className="text-muted" style={{ fontSize: 12 }}>
            <span>部门 <b style={{ color: '#1f2b3d' }}>{statTotals.departmentCount || 0}</b> 个</span>
            <span>在职 <b style={{ color: '#1f2b3d' }}>{statTotals.employeeCount || 0}</b> 人</span>
            <span>基本工资合计 <b style={{ color: '#1f2b3d' }}>¥{fmtMoney(statTotals.totalBaseSalary, 0)}</b></span>
            <span>本期薪资支出 <b style={{ color: '#2f6bff' }}>¥{fmtMoney(statTotals.payrollNet, 0)}</b></span>
          </Space>
        </div>
        <Table
          size="small"
          rowKey="department_id"
          loading={deptStats.loading}
          dataSource={statRows}
          pagination={false}
          scroll={{ x: 980 }}
          columns={[
            {
              title: '部门', dataIndex: 'name', width: 180, fixed: 'left' as const,
              render: (v: string, r: any) => (
                <div>
                  <b>{v}</b>
                  <div className="text-muted" style={{ fontSize: 11 }}>{r.code} · {r.cost_center || '未设成本中心'}</div>
                </div>
              ),
            },
            { title: '在职人数', dataIndex: 'employee_count', width: 90, align: 'right', render: (v: any) => <b className="num">{fmtNumber(v, 0)}</b> },
            { title: '正式员工', dataIndex: 'formal_count', width: 90, align: 'right', render: (v: any) => fmtNumber(v, 0) },
            { title: '男 / 女', key: 'gender', width: 90, align: 'center', render: (_: any, r: any) => `${fmtNumber(r.male_count, 0)} / ${fmtNumber(r.female_count, 0)}` },
            { title: '基本工资合计', dataIndex: 'total_base_salary', width: 130, align: 'right', render: (v: any) => <span className="num">¥{fmtMoney(v, 0)}</span> },
            { title: '平均基本工资', dataIndex: 'avg_salary', width: 130, align: 'right', render: (v: any) => <span className="num">¥{fmtMoney(v, 0)}</span> },
            { title: '最高基本工资', dataIndex: 'max_salary', width: 130, align: 'right', render: (v: any) => <span className="num">¥{fmtMoney(v, 0)}</span> },
            { title: '本期薪资支出', dataIndex: 'payroll_net', width: 130, align: 'right', render: (v: any) => <span className="num">¥{fmtMoney(v, 0)}</span> },
            { title: '薪资人数', dataIndex: 'payroll_count', width: 90, align: 'right', render: (v: any) => fmtNumber(v, 0) },
          ]}
          summary={() => (
            <Table.Summary fixed>
              <Table.Summary.Row style={{ background: '#fafbfe', fontWeight: 600 }}>
                <Table.Summary.Cell index={0}>合计</Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">{fmtNumber(statTotals.employeeCount, 0)}</Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">{fmtNumber(statRows.reduce((s, r) => s + Number(r.formal_count || 0), 0), 0)}</Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="center">-</Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">¥{fmtMoney(statTotals.totalBaseSalary, 0)}</Table.Summary.Cell>
                <Table.Summary.Cell index={5} align="right">¥{fmtMoney(statRows.length ? Number(statTotals.totalBaseSalary) / Math.max(1, Number(statTotals.employeeCount)) : 0, 0)}</Table.Summary.Cell>
                <Table.Summary.Cell index={6} align="right">-</Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right" style={{ color: 'var(--primary)' }}>¥{fmtMoney(statTotals.payrollNet, 0)}</Table.Summary.Cell>
                <Table.Summary.Cell index={8} align="right">{fmtNumber(statRows.reduce((s, r) => s + Number(r.payroll_count || 0), 0), 0)}</Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </div>
    </div>
  );
}
