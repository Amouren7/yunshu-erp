import { useState } from 'react';
import { App, Button, Modal, Space, Tag, Tooltip } from 'antd';
import { SwapOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import CrudPage from '../../components/CrudPage';
import { SimpleStatus } from '../../components/StatusTag';
import { api } from '../../api/client';
import { useAuth } from '../../store/auth';
import { useRequest } from '../../api/hooks';
import { fmtDate, fmtMoney } from '../../utils/format';
import { useMeta } from '../../store/meta';

export default function LeadsPage() {
  const { hasPerm } = useAuth();
  const { enumOf } = useMeta();
  const { message } = App.useApp();
  const [modal, contextHolder] = Modal.useModal();
  const [reloadKey, setReloadKey] = useState(0);
  const employeeOptions = useRequest(
    () => api.get('/api/meta/options', { type: 'employee', limit: 500 }).then((rows: any[]) => (rows || []).map((r) => ({ label: `${r.label}（${r.code}）`, value: r.value }))),
    [],
  );

  const statusOptions = (enumOf('leadStatus') as string[]).map((v) => ({ label: v, value: v }));
  const sourceOptions = (enumOf('leadSources') as string[]).map((v) => ({ label: v, value: v }));

  const doConvert = (row: any) => {
    modal.confirm({
      title: '线索转客户',
      width: 460,
      content: (
        <div style={{ lineHeight: 1.9, marginTop: 8 }}>
          <div>将线索 <b>「{row.name}」</b> 转为正式客户，系统将：</div>
          <div className="text-muted" style={{ fontSize: 12 }}>
            · 以公司名称（无则用线索名称）创建客户档案，自动生成客户编码<br />
            · 回填联系人 / 电话 / 邮箱 / 负责人<br />
            · 线索状态自动更新为「已转客户」<br />
            · 关联该线索的商机将自动绑定新客户
          </div>
        </div>
      ),
      okText: '确认转换',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res: any = await api.post(`/api/crm/leads/${row.id}/convert`);
          message.success(`已转为客户「${res.customer?.name || row.company || row.name}」，客户编码 ${res.code}`);
          setReloadKey((k) => k + 1);
        } catch (e: any) {
          message.error(e?.message || '转换失败');
        }
      },
    });
  };

  return (
    <>
      {contextHolder}
      <CrudPage
        key={reloadKey}
        title="线索管理"
        subtitle="潜在客户线索登记与跟进，确认意向可一键转为正式客户（自动生成客户编码禁重复）"
        entity="线索"
        base="/api/crm/leads"
        permModule="crm"
        drawerWidth={780}
        scrollX={1300}
        exportFilename="线索列表"
        columns={[
          {
            title: '线索名称', dataIndex: 'name', width: 200, fixed: 'left',
            render: (v: string) => <b>{v}</b>,
          },
          { title: '公司', dataIndex: 'company', width: 180, ellipsis: true, render: (v: string) => v || '-' },
          { title: '联系人', dataIndex: 'contact', width: 90, render: (v: string) => v || '-' },
          { title: '电话', dataIndex: 'phone', width: 120, render: (v: string) => v || '-' },
          { title: '来源', dataIndex: 'source', width: 100, render: (v: string) => <Tag>{v}</Tag> },
          { title: '状态', dataIndex: 'status', width: 104, align: 'center', render: (v: string) => <SimpleStatus value={v} /> },
          { title: '负责人', dataIndex: 'owner_name', width: 90, render: (v: string) => v || '-' },
          {
            title: '预计金额', dataIndex: 'expected_amount', width: 110, align: 'right',
            render: (v: any) => <span className="num">¥{fmtMoney(v, 0)}</span>,
          },
          {
            title: '下次跟进', dataIndex: 'next_follow_at', width: 110,
            render: (v: string) => {
              if (!v) return <span className="text-muted">未安排</span>;
              const overdue = dayjs(v).isBefore(dayjs().startOf('day'));
              return <span style={overdue ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>{fmtDate(v)}{overdue ? ' · 逾期' : ''}</span>;
            },
          },
        ]}
        filters={[
          { key: 'status', label: '线索状态', type: 'select', options: statusOptions, width: 120 },
          { key: 'source', label: '线索来源', type: 'select', options: sourceOptions, width: 120 },
          { key: 'ownerId', label: '负责人', type: 'select', options: employeeOptions.data || [], width: 160 },
        ]}
        fields={[
          { key: 'name', label: '线索名称', required: true, span: 12 },
          { key: 'company', label: '公司名称', span: 12 },
          { key: 'contact', label: '联系人', span: 8 },
          { key: 'phone', label: '联系电话', span: 8 },
          { key: 'email', label: '邮箱', span: 8 },
          { key: 'source', label: '线索来源', type: 'select', enumKey: 'leadSources', span: 8 },
          { key: 'status', label: '线索状态', type: 'select', enumKey: 'leadStatus', span: 8 },
          { key: 'owner_id', label: '负责人', type: 'employee', span: 8 },
          { key: 'expected_amount', label: '预计金额', type: 'money', span: 8 },
          { key: 'next_follow_at', label: '下次跟进日期', type: 'date', span: 8 },
          { key: 'remark', label: '备注', type: 'textarea', rows: 3, span: 24 },
        ]}
        toFormValues={(record: any) => ({
          ...record,
          next_follow_at: record.next_follow_at ? dayjs(record.next_follow_at) : undefined,
        })}
        rowActionsExtra={(record: any) => (
          record.status !== '已转客户' && hasPerm('crm.edit') ? (
            <Tooltip title="转为客户">
              <Button type="text" size="small" icon={<SwapOutlined />} onClick={() => doConvert(record)} />
            </Tooltip>
          ) : null
        )}
        headerExtra={(
          <Space size={4} className="text-muted" style={{ fontSize: 12 }}>
            <Tag color="orange">待跟进</Tag>
            <span>线索确认意向并转为客户后，可继续创建商机与合同</span>
          </Space>
        )}
      />
    </>
  );
}
