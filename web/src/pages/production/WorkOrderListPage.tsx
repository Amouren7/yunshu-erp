import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Dropdown, Progress, Space, Tag, type MenuProps } from 'antd';
import { EyeOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import { api } from '../../api/client';
import { useAuth } from '../../store/auth';
import { fmtNumber } from '../../utils/format';
import WorkOrderActionDialog, { type WoInputMode } from './WorkOrderActionDialog';
import {
  WO_PRIORITIES, WO_STATUS_OPTIONS, actionSuccessText, PriorityTag, WoStatusTag, woActionsOf, woProgress,
} from './shared';

const CONFIRM_TEXT: Record<string, string> = {
  release: '下达后工单进入执行阶段，可进行开工、领料操作。',
  start: '开工后记录实际开工日期，工单状态变为「生产中」。',
  close: '关闭后工单归档，不再参与生产统计与排产。',
  void: '作废后工单不可恢复，且不再参与 MRP 测算与排产。',
};

const CONFIRM_LABEL: Record<string, string> = {
  release: '下达', start: '开工', close: '关闭', void: '作废',
};

/** 生产工单列表 */
export default function WorkOrderListPage() {
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { hasPerm } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialog, setDialog] = useState<{ open: boolean; mode: WoInputMode; woId?: number }>({
    open: false,
    mode: 'issue',
  });

  const refresh = () => setRefreshKey((k) => k + 1);

  const runSimpleAction = async (record: any, action: string) => {
    try {
      await api.post(`/api/production/work-orders/${record.id}/action`, { action });
      message.success(actionSuccessText(action));
      refresh();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  };

  const confirmSimple = (record: any, action: string) => {
    const label = CONFIRM_LABEL[action] || '执行';
    modal.confirm({
      title: `确认${label}工单 ${record.order_no}？`,
      content: CONFIRM_TEXT[action],
      okText: `确认${label}`,
      okButtonProps: action === 'void' ? { danger: true } : undefined,
      cancelText: '取消',
      onOk: () => runSimpleAction(record, action),
    });
  };

  const confirmDelete = (record: any) => {
    modal.confirm({
      title: `确认删除工单 ${record.order_no}？`,
      content: '只有草稿状态的工单可以删除，删除后不可恢复。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.del(`/api/production/work-orders/${record.id}`);
          message.success('工单已删除');
          refresh();
        } catch (e: any) {
          message.error(e?.message || '删除失败');
        }
      },
    });
  };

  const moreItems = (record: any): MenuProps['items'] => {
    const items: MenuProps['items'] = [];
    if (hasPerm('production.approve')) {
      for (const a of woActionsOf(record.status)) {
        items.push({ key: `action:${a.action}`, label: a.label, danger: a.danger });
      }
    }
    if (record.status === 'DRAFT' && hasPerm('production.delete')) {
      if (items.length) items.push({ type: 'divider' });
      items.push({ key: 'delete', label: '删除工单', danger: true });
    }
    return items;
  };

  const onMoreClick = (record: any): MenuProps['onClick'] => ({ key }) => {
    if (key === 'delete') return confirmDelete(record);
    if (key.startsWith('action:')) {
      const action = key.slice('action:'.length);
      const def = woActionsOf(record.status).find((a) => a.action === action);
      if (!def) return;
      if (def.input) {
        setDialog({ open: true, mode: def.input, woId: record.id });
      } else {
        confirmSimple(record, action);
      }
    }
  };

  const rowActions = (record: any) => {
    const items = moreItems(record);
    return (
      <>
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/production/work-orders/${record.id}`)}>
          详情
        </Button>
        {items && items.length > 0 && (
          <Dropdown menu={{ items, onClick: onMoreClick(record) }} trigger={['click']}>
            <Button type="link" size="small">
              操作 <MoreOutlined />
            </Button>
          </Dropdown>
        )}
      </>
    );
  };

  return (
    <div>
      <PageHeader
        title="生产工单"
        subtitle="工单下达、领料、完工、关闭全流程；领料与完工自动生成库存流水与会计凭证"
        extra={
          <Space>
            {hasPerm('production.create') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/production/work-orders/new')}>
                新建工单
              </Button>
            )}
          </Space>
        }
      />

      <DataTable
        columns={[
          {
            title: '工单号',
            dataIndex: 'order_no',
            width: 170,
            fixed: 'left',
            render: (v: string, r: any) => (
              <a style={{ fontWeight: 500 }} onClick={() => navigate(`/production/work-orders/${r.id}`)}>
                {v}
              </a>
            ),
          },
          {
            title: '成品',
            dataIndex: 'item_name',
            width: 230,
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
            title: '数量',
            dataIndex: 'qty',
            width: 90,
            align: 'right',
            render: (v: any) => <span className="num">{fmtNumber(v, 2)}</span>,
          },
          {
            title: '已完工',
            dataIndex: 'completed_qty',
            width: 90,
            align: 'right',
            render: (v: any) => <span className="num text-muted">{fmtNumber(v, 2)}</span>,
          },
          {
            title: '进度',
            key: 'progress',
            width: 150,
            render: (_: any, r: any) => (
              <Progress
                percent={woProgress(r.qty, r.completed_qty)}
                size="small"
                strokeColor={Number(r.qty) > 0 && Number(r.completed_qty) >= Number(r.qty) ? 'var(--success)' : 'var(--primary)'}
              />
            ),
          },
          { title: '计划开始', dataIndex: 'planned_start', width: 108 },
          { title: '计划结束', dataIndex: 'planned_end', width: 108 },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            align: 'center',
            render: (v: string) => <WoStatusTag status={v} />,
          },
          {
            title: '优先级',
            dataIndex: 'priority',
            width: 80,
            align: 'center',
            render: (v: string) => <PriorityTag value={v} />,
          },
          {
            title: '创建人',
            dataIndex: 'created_by_name',
            width: 90,
            render: (v: string) => v || '-',
          },
          {
            title: '物料行',
            dataIndex: 'material_count',
            width: 80,
            align: 'center',
            render: (v: any) => <Tag style={{ marginInlineEnd: 0 }}>{fmtNumber(v || 0, 0)}</Tag>,
          },
        ]}
        load={(params) => api.get('/api/production/work-orders', params)}
        reloadKey={refreshKey}
        rowActions={rowActions}
        filters={[
          { key: 'status', label: '工单状态', type: 'select', width: 140, options: WO_STATUS_OPTIONS },
          {
            key: 'priority',
            label: '优先级',
            type: 'select',
            width: 110,
            options: WO_PRIORITIES.map((p) => ({ label: p, value: p })),
          },
          { key: 'dateRange', label: '计划日期', type: 'dateRange' },
        ]}
        search={{ placeholder: '搜索工单号 / 成品编码 / 成品名称' }}
        exportFilename="生产工单"
        scrollX={1500}
      />

      <WorkOrderActionDialog
        open={dialog.open}
        mode={dialog.mode}
        woId={dialog.woId}
        onClose={() => setDialog((s) => ({ ...s, open: false }))}
        onDone={refresh}
      />
    </div>
  );
}
