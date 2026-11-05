import { useState } from 'react';
import { App, Button, Dropdown, Progress, Space, Tag } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import CrudPage from '../../components/CrudPage';
import { api } from '../../api/client';
import { useAuth } from '../../store/auth';
import { useMeta } from '../../store/meta';
import { useRequest } from '../../api/hooks';
import { fmtDate, fmtMoney } from '../../utils/format';

const STAGE_COLORS: Record<string, string> = {
  初步接洽: 'default', 需求确认: 'blue', 方案报价: 'cyan', 商务谈判: 'orange', 赢单: 'green', 输单: 'red',
};
const STATUS_COLORS: Record<string, string> = { 进行中: 'blue', 已赢单: 'green', 已输单: 'red' };

export default function OpportunitiesPage() {
  const { hasPerm } = useAuth();
  const { enumOf } = useMeta();
  const { message, modal } = App.useApp();
  const [reloadKey, setReloadKey] = useState(0);
  const employeeOptions = useRequest(
    () => api.get('/api/meta/options', { type: 'employee', limit: 500 }).then((rows: any[]) => (rows || []).map((r) => ({ label: `${r.label}（${r.code}）`, value: r.value }))),
    [],
  );

  const stages = enumOf('opportunityStages') as string[];
  const stageOptions = stages.map((v) => ({ label: v, value: v }));

  const applyStage = async (row: any, stage: string) => {
    try {
      await api.post(`/api/crm/opportunities/${row.id}/stage`, { stage });
      message.success(`「${row.name}」阶段已推进至「${stage}」`);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      message.error(e?.message || '阶段推进失败');
    }
  };

  const advance = (row: any, stage: string) => {
    if (stage === row.stage) return;
    if (stage === '赢单' || stage === '输单') {
      modal.confirm({
        title: `确认将商机标记为「${stage}」？`,
        content: `商机「${row.name}」金额 ¥${fmtMoney(row.amount, 0)}，标记后商机状态将同步为${stage === '赢单' ? '已赢单' : '已输单'}，赢率自动调整。`,
        okText: '确认',
        cancelText: '取消',
        onOk: () => applyStage(row, stage),
      });
      return;
    }
    applyStage(row, stage);
  };

  return (
    <CrudPage
      key={reloadKey}
      title="商机管理"
      subtitle="从接洽到赢单的商机全生命周期跟踪；推进阶段时系统按阶段自动更新赢率与状态"
      entity="商机"
      base="/api/crm/opportunities"
      permModule="crm"
      drawerWidth={820}
      scrollX={1300}
      exportFilename="商机列表"
      columns={[
        {
          title: '商机名称', dataIndex: 'name', width: 220, fixed: 'left', ellipsis: true,
          render: (v: string) => <b>{v}</b>,
        },
        {
          title: '客户', dataIndex: 'customer_name', width: 190, ellipsis: true,
          render: (v: string, r: any) => (
            <div>
              <div>{v || <span className="text-muted">未关联客户</span>}</div>
              {r.customer_code && <div className="text-muted" style={{ fontSize: 11 }}>{r.customer_code}{r.customer_level ? ` · ${r.customer_level} 级` : ''}</div>}
            </div>
          ),
        },
        {
          title: '商机金额', dataIndex: 'amount', width: 130, align: 'right',
          render: (v: any) => <b className="num">¥{fmtMoney(v, 0)}</b>,
        },
        {
          title: '阶段', dataIndex: 'stage', width: 106, align: 'center',
          render: (v: string) => <Tag color={STAGE_COLORS[v] || 'default'}>{v}</Tag>,
        },
        {
          title: '赢率', dataIndex: 'probability', width: 130,
          render: (v: any) => (
            <Space size={6}>
              <Progress
                percent={Number(v) || 0}
                size="small"
                showInfo={false}
                style={{ width: 64 }}
                strokeColor={Number(v) >= 80 ? '#16a34a' : Number(v) >= 40 ? '#2f6bff' : '#f59e0b'}
              />
              <span className="num" style={{ fontSize: 12 }}>{Number(v) || 0}%</span>
            </Space>
          ),
        },
        { title: '预计成交', dataIndex: 'expected_close_date', width: 110, render: (v: string) => (v ? fmtDate(v) : '-') },
        { title: '负责人', dataIndex: 'owner_name', width: 90, render: (v: string) => v || '-' },
        {
          title: '状态', dataIndex: 'status', width: 96, align: 'center',
          render: (v: string) => <Tag color={STATUS_COLORS[v] || 'default'}>{v}</Tag>,
        },
      ]}
      filters={[
        { key: 'stage', label: '商机阶段', type: 'select', options: stageOptions, width: 120 },
        { key: 'status', label: '商机状态', type: 'select', options: ['进行中', '已赢单', '已输单'].map((v) => ({ label: v, value: v })), width: 120 },
        { key: 'ownerId', label: '负责人', type: 'select', options: employeeOptions.data || [], width: 160 },
      ]}
      fields={[
        { key: 'name', label: '商机名称', required: true, span: 12 },
        { key: 'customer_id', label: '关联客户', type: 'customer', required: true, span: 12 },
        { key: 'amount', label: '商机金额', type: 'money', span: 8 },
        { key: 'stage', label: '商机阶段', type: 'select', enumKey: 'opportunityStages', span: 8 },
        { key: 'probability', label: '赢率（%）', type: 'number', min: 0, max: 100, precision: 0, span: 8 },
        { key: 'expected_close_date', label: '预计成交日期', type: 'date', span: 8 },
        { key: 'owner_id', label: '负责人', type: 'employee', span: 8 },
        { key: 'status', label: '商机状态', type: 'select', options: ['进行中', '已赢单', '已输单'].map((v) => ({ label: v, value: v })), span: 8 },
        { key: 'remark', label: '备注', type: 'textarea', rows: 3, span: 24 },
      ]}
      toFormValues={(record: any) => ({
        ...record,
        expected_close_date: record.expected_close_date ? dayjs(record.expected_close_date) : undefined,
      })}
      rowActionsExtra={(record: any) => (
        hasPerm('crm.edit') ? (
          <Dropdown
            trigger={['click']}
            menu={{
              items: stages.map((s) => ({
                key: s,
                label: s === record.stage ? `${s}（当前）` : `推进至 ${s}`,
                disabled: s === record.stage,
              })),
              onClick: ({ key }) => advance(record, key),
            }}
          >
            <Button type="text" size="small" icon={<SwapOutlined />} title="推进阶段" />
          </Dropdown>
        ) : null
      )}
      headerExtra={(
        <Tag color="blue">阶段赢率：初步接洽 20% · 需求确认 40% · 方案报价 60% · 商务谈判 80%</Tag>
      )}
    />
  );
}
