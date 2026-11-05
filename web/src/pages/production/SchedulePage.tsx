import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Col, Empty, Progress, Row, Segmented, Select, Space, Spin, Table, Tag } from 'antd';
import { CalendarOutlined, ReloadOutlined, UnorderedListOutlined, AppstoreOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { fmtDate, fmtNumber } from '../../utils/format';
import { PriorityTag, WoStatusTag, woProgress } from './shared';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 排产看板 */
export default function SchedulePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('ALL');
  const [view, setView] = useState<'card' | 'table'>('card');
  const schedule = useRequest<any>(
    () => api.get('/api/production/schedule', { status: status === 'ALL' ? undefined : status }),
    [status]
  );

  const data = schedule.data || {};
  const rows: any[] = data.rows || [];
  const groups: any[] = data.groups || [];
  const summary = data.summary || {};

  const groupTitle = (date: string) => {
    if (!date || date === '未排期') return '未排期';
    const d = dayjs(date);
    const today = dayjs().format('YYYY-MM-DD');
    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
    const tag = date === today ? '今天' : date === tomorrow ? '明天' : WEEKDAYS[d.day()];
    return `${d.format('MM 月 DD 日')} · ${tag}`;
  };

  const columns = useMemo(
    () => [
      {
        title: '计划开始',
        dataIndex: 'planned_start',
        width: 110,
        fixed: 'left' as const,
        render: (v: string) => v || '未排期',
      },
      {
        title: '工单号',
        dataIndex: 'order_no',
        width: 170,
        render: (v: string, r: any) => (
          <a style={{ fontWeight: 500 }} onClick={() => navigate(`/production/work-orders/${r.id}`)}>
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
            <div className="text-muted" style={{ fontSize: 11 }}>{r.item_code} · {r.spec}</div>
          </div>
        ),
      },
      {
        title: '数量 / 已完工',
        key: 'qty',
        width: 130,
        align: 'right' as const,
        render: (_: any, r: any) => (
          <span className="num">
            {fmtNumber(r.qty, 2)} / <span className="text-muted">{fmtNumber(r.completed_qty, 2)}</span>
          </span>
        ),
      },
      {
        title: '进度',
        key: 'progress',
        width: 150,
        render: (_: any, r: any) => (
          <Progress
            percent={woProgress(r.qty, r.completed_qty)}
            size="small"
            strokeColor={Number(r.completed_qty) >= Number(r.qty) && Number(r.qty) > 0 ? 'var(--success)' : 'var(--primary)'}
          />
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 100,
        align: 'center' as const,
        render: (v: string) => <WoStatusTag status={v} />,
      },
      {
        title: '优先级',
        dataIndex: 'priority',
        width: 80,
        align: 'center' as const,
        render: (v: string) => <PriorityTag value={v} />,
      },
      {
        title: '物料齐套率',
        dataIndex: 'material_issued_rate',
        width: 120,
        align: 'right' as const,
        render: (v: any) => (
          <span className="num" style={{ color: Number(v) >= 100 ? 'var(--success)' : 'var(--warning)' }}>
            {fmtNumber(v, 1)}%
          </span>
        ),
      },
      { title: '计划完成', dataIndex: 'planned_end', width: 110, render: (v: string) => v || '-' },
      {
        title: '剩余天数',
        dataIndex: 'days_left',
        width: 100,
        align: 'center' as const,
        render: (v: any) =>
          Number(v) < 0 ? (
            <Tag color="red">逾期 {Math.abs(Number(v))} 天</Tag>
          ) : Number(v) === 0 ? (
            <Tag color="orange">今天到期</Tag>
          ) : (
            <span className="num">{fmtNumber(v, 0)} 天</span>
          ),
      },
    ],
    [navigate]
  );

  const renderCard = (w: any) => (
    <Col xs={24} sm={12} md={8} xl={6} key={w.id}>
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '10px 12px',
          background: w.overdue ? '#fff8f8' : '#fff',
          height: '100%',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-sm)',
        }}
        onClick={() => navigate(`/production/work-orders/${w.id}`)}
      >
        <div className="flex-between">
          <a style={{ fontWeight: 600, fontSize: 12.5 }} onClick={(e) => { e.stopPropagation(); navigate(`/production/work-orders/${w.id}`); }}>
            {w.order_no}
          </a>
          <WoStatusTag status={w.status} />
        </div>
        <div style={{ marginTop: 6, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {w.item_name}
        </div>
        <div className="text-muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {w.item_code} · {w.spec}
        </div>
        <Progress
          percent={woProgress(w.qty, w.completed_qty)}
          size="small"
          strokeColor={Number(w.completed_qty) >= Number(w.qty) && Number(w.qty) > 0 ? 'var(--success)' : 'var(--primary)'}
          style={{ margin: '6px 0 2px' }}
        />
        <div className="flex-between" style={{ fontSize: 11 }}>
          <span className="text-muted">
            完工 {fmtNumber(w.completed_qty, 0)} / {fmtNumber(w.qty, 0)} {w.uom || ''}
          </span>
          <PriorityTag value={w.priority} />
        </div>
        <div className="flex-between" style={{ fontSize: 11, marginTop: 6 }}>
          <span className="text-muted">
            计划 {fmtDate(w.planned_start)} ~ {fmtDate(w.planned_end)}
          </span>
          {w.overdue ? <Tag color="red" style={{ marginInlineEnd: 0 }}>逾期 {Math.abs(Number(w.days_left))} 天</Tag> : null}
        </div>
        <div style={{ fontSize: 11, marginTop: 4 }} className="text-muted">
          物料齐套 {fmtNumber(w.material_issued_rate, 0)}% · 工序 {w.operation_done || 0}/{w.operation_count || 0}
        </div>
      </div>
    </Col>
  );

  return (
    <div>
      <PageHeader
        title="排产看板"
        subtitle="已下达与生产中的工单按计划开始日期分组建模，快速识别交期风险与物料齐套情况"
        extra={
          <Space>
            <Select
              style={{ width: 140 }}
              value={status}
              onChange={setStatus}
              options={[
                { label: '全部状态', value: 'ALL' },
                { label: '已下达', value: 'RELEASED' },
                { label: '生产中', value: 'IN_PROGRESS' },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={schedule.refresh}>刷新</Button>
            <Button type="primary" icon={<CalendarOutlined />} onClick={() => navigate('/production/work-orders')}>
              工单列表
            </Button>
          </Space>
        }
      />

      {schedule.error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 14 }}
          message="排产数据加载失败"
          description={schedule.error}
          action={<Button size="small" onClick={schedule.refresh}>重试</Button>}
        />
      )}

      <div className="kpi-grid">
        <StatCard title="排产工单" value={summary.total || 0} money={false} digits={0} suffix="张" icon={<CalendarOutlined />} foot="已下达 + 生产中" />
        <StatCard title="已下达" value={summary.released || 0} money={false} digits={0} suffix="张" foot="待开工" />
        <StatCard title="生产中" value={summary.inProgress || 0} money={false} digits={0} suffix="张" foot="正在执行" />
        <StatCard
          title="逾期工单"
          value={summary.overdue || 0}
          money={false}
          digits={0}
          suffix="张"
          color={Number(summary.overdue) > 0 ? 'var(--danger)' : undefined}
          foot={`紧急 / 高优先级 ${fmtNumber(summary.urgent || 0, 0)} 张`}
        />
      </div>

      <div className="mt-14 flex-between">
        <Segmented
          value={view}
          onChange={(v) => setView(v as 'card' | 'table')}
          options={[
            { label: <span><AppstoreOutlined /> 卡片视图</span>, value: 'card' },
            { label: <span><UnorderedListOutlined /> 表格视图</span>, value: 'table' },
          ]}
        />
        <span className="text-muted" style={{ fontSize: 12 }}>
          {schedule.loading ? '加载中…' : `共 ${rows.length} 张工单 · ${groups.length} 个计划日期`}
        </span>
      </div>

      {schedule.loading && !rows.length ? (
        <div className="card mt-14">
          <div className="empty-hint">
            <Spin /> <span style={{ marginLeft: 8 }}>正在加载排产看板…</span>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="card mt-14">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无排产工单：请先在工单列表中将草稿工单「下达」，已下达与生产中的工单会出现在排产看板"
            style={{ padding: '40px 0' }}
          >
            <Button type="primary" onClick={() => navigate('/production/work-orders')}>去工单列表</Button>
          </Empty>
        </div>
      ) : view === 'card' ? (
        <div className="mt-14">
          {groups.map((g: any) => (
            <div className="card" key={g.date} style={{ marginBottom: 14 }}>
              <div className="card-head">
                <div className="card-title">
                  <span className="dot" />
                  {groupTitle(g.date)}
                  <Tag color="blue" style={{ marginLeft: 4 }}>{g.count} 张</Tag>
                </div>
                <span className="text-muted" style={{ fontSize: 11 }}>按计划开始日期分组</span>
              </div>
              <div className="card-pad">
                <Row gutter={[12, 12]}>{g.rows.map((w: any) => renderCard(w))}</Row>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card mt-14">
          <Table
            size="small"
            rowKey="id"
            loading={schedule.loading}
            dataSource={rows}
            columns={columns}
            scroll={{ x: 1400 }}
            pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
            rowClassName={(r: any) => (r.overdue ? 'text-danger' : '')}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无排产工单" /> }}
          />
        </div>
      )}
    </div>
  );
}
