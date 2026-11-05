import { useMemo } from 'react';
import { Tag } from 'antd';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useMeta } from '../../store/meta';

const ACTION_COLORS: Record<string, string> = {
  登录: 'blue',
  新建: 'green',
  新建通知: 'green',
  新建跟进: 'green',
  修改: 'orange',
  修改参数: 'orange',
  修改单号规则: 'orange',
  修改总账映射: 'orange',
  修改考勤: 'orange',
  修改请假: 'orange',
  修改跟进: 'orange',
  重置密码: 'volcano',
  删除: 'red',
  删除通知: 'red',
  删除跟进: 'red',
  审核: 'cyan',
  批准请假: 'cyan',
  过账: 'cyan',
  确认薪资: 'cyan',
  批量确认薪资: 'cyan',
  完工: 'cyan',
  关闭: 'default',
  下达: 'processing',
  领料: 'processing',
  生成考勤: 'purple',
  生成薪资: 'purple',
  商机推进: 'purple',
  线索转客户: 'purple',
  请假申请: 'gold',
};

export default function AuditLogsPage() {
  const { meta } = useMeta();

  // 单独取一次用于筛选项（模块 / 动作），不影响列表分页
  const filterMeta = useRequest(() => api.get('/api/system/audit-logs', { page: 1, pageSize: 1 }), []);
  const moduleOptions = useMemo(
    () => (filterMeta.data?.filters?.modules || []).map((m: string) => ({
      label: meta?.modules?.find((x: any) => x.key === m)?.name || m,
      value: m,
    })),
    [filterMeta.data, meta],
  );
  const actionOptions = useMemo(
    () => (filterMeta.data?.filters?.actions || []).map((a: string) => ({ label: a, value: a })),
    [filterMeta.data],
  );

  const columns = useMemo(() => [
    { title: '时间', dataIndex: 'created_at', width: 160, fixed: 'left' as const },
    {
      title: '操作人', dataIndex: 'user_name', width: 140,
      render: (v: string, r: any) => (
        <div>
          <div>{v || '-'}</div>
          <div className="text-muted" style={{ fontSize: 11 }}>{r.username || `用户 #${r.user_id ?? '-'}`}</div>
        </div>
      ),
    },
    {
      title: '动作', dataIndex: 'action', width: 110, align: 'center' as const,
      render: (v: string) => <Tag color={ACTION_COLORS[v] || 'default'}>{v || '-'}</Tag>,
    },
    {
      title: '模块', dataIndex: 'module', width: 120,
      render: (v: string) => {
        if (!v) return '-';
        const name = meta?.modules?.find((x: any) => x.key === v)?.name;
        return name ? <span>{name}<span className="text-muted" style={{ fontSize: 11, marginLeft: 4 }}>{v}</span></span> : v;
      },
    },
    {
      title: '对象', dataIndex: 'entity', width: 150,
      render: (v: string, r: any) => (
        <span>
          {v || '-'}
          {r.entity_id ? <span className="text-muted"> #{r.entity_id}</span> : null}
        </span>
      ),
    },
    { title: '详情', dataIndex: 'detail', width: 280, ellipsis: true, render: (v: string) => v || '-' },
    { title: 'IP 地址', dataIndex: 'ip', width: 130, render: (v: string) => (v ? <code style={{ fontSize: 12 }}>{v}</code> : '-') },
  ], [meta]);

  return (
    <div>
      <PageHeader
        title="操作日志"
        subtitle="系统关键操作审计记录（登录、增删改、审核、过账等），用于追溯与合规检查"
      />
      <DataTable
        rowKey="id"
        columns={columns as any}
        load={(params) => api.get('/api/system/audit-logs', params)}
        search={{ placeholder: '搜索操作人 / 详情 / 对象ID' }}
        filters={[
          { key: 'module', label: '模块', type: 'select', options: moduleOptions, width: 130 },
          { key: 'action', label: '动作', type: 'select', options: actionOptions, width: 140 },
          { key: 'dateRange', label: '日期', type: 'dateRange' },
        ]}
        exportFilename="操作日志"
        scrollX={1500}
      />
    </div>
  );
}
