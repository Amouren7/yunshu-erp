import { useCallback, useMemo, useState } from 'react';
import { App, Button, Drawer, Form, Popconfirm, Space, Tag } from 'antd';
import { DeleteOutlined, EditOutlined, FileDoneOutlined, FundOutlined, PercentageOutlined, PlusOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import StatCard from '../../components/StatCard';
import SchemaForm, { formValues, type FieldDef } from '../../components/SchemaForm';
import { api } from '../../api/client';
import { useAuth } from '../../store/auth';
import { useMeta } from '../../store/meta';
import { fmtDate, fmtMoney, fmtNumber } from '../../utils/format';

const CONTRACT_STATUS_COLORS: Record<string, string> = {
  草稿: 'default', 执行中: 'blue', 已完成: 'green', 已终止: 'red',
};

const CONTRACT_FIELDS: FieldDef[] = [
  { key: 'name', label: '合同名称', required: true, span: 24 },
  { key: 'customer_id', label: '客户', type: 'customer', required: true, span: 12 },
  { key: 'amount', label: '合同金额', type: 'money', span: 12 },
  { key: 'sign_date', label: '签订日期', type: 'date', span: 8 },
  { key: 'start_date', label: '生效日期', type: 'date', span: 8 },
  { key: 'end_date', label: '到期日期', type: 'date', span: 8 },
  { key: 'status', label: '合同状态', type: 'select', enumKey: 'contractStatus', span: 8 },
  { key: 'owner_id', label: '负责人', type: 'employee', span: 8 },
  { key: 'remark', label: '备注', type: 'textarea', rows: 3, span: 24 },
];

export default function ContractsPage() {
  const { hasPerm } = useAuth();
  const { enumOf } = useMeta();
  const { message } = App.useApp();
  const [summary, setSummary] = useState<any>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const canCreate = hasPerm('crm.create');
  const canEdit = hasPerm('crm.edit');
  const canDelete = hasPerm('crm.delete');

  const statusOptions = useMemo(
    () => (enumOf('contractStatus') as string[]).map((v) => ({ label: v, value: v })),
    [enumOf],
  );

  const load = useCallback((params: Record<string, any>) => api.get('/api/crm/contracts', params).then((res: any) => {
    setSummary(res?.summary || {});
    return res;
  }), []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setFormOpen(true);
  };

  const openEdit = (row: any) => {
    setEditing(row);
    form.resetFields();
    setFormOpen(true);
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      const data = formValues(CONTRACT_FIELDS, values);
      setSaving(true);
      if (editing) await api.put(`/api/crm/contracts/${editing.id}`, data);
      else await api.post('/api/crm/contracts', data);
      message.success(editing ? '合同已更新' : '合同已创建，合同编号由系统自动生成');
      setFormOpen(false);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: any) => {
    try {
      await api.del(`/api/crm/contracts/${row.id}`);
      message.success('合同已删除');
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  return (
    <div>
      <PageHeader
        title="合同管理"
        subtitle="销售合同台账：合同编号由系统按年度自动编号，金额与执行状态实时汇总"
        extra={canCreate ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增合同</Button>
        ) : undefined}
      />

      <div className="kpi-grid">
        <StatCard
          title="合同总额" value={summary.total_amount || 0} prefix="¥" icon={<FileDoneOutlined />}
          foot={`共 ${fmtNumber(summary.count, 0)} 份合同`}
        />
        <StatCard
          title="执行中金额" value={summary.executing_amount || 0} prefix="¥" icon={<FundOutlined />}
          foot={`执行中 ${fmtNumber(summary.executing_count, 0)} 份`}
        />
        <StatCard
          title="平均合同金额" value={summary.avg_amount || 0} prefix="¥" icon={<PercentageOutlined />}
          foot="按当前筛选条件统计"
        />
        <StatCard
          title="合同数量" value={summary.count || 0} money={false} digits={0} suffix="份"
          icon={<FileDoneOutlined />}
          foot="含草稿 / 执行中 / 已完成 / 已终止"
        />
      </div>

      <div className="mt-14">
        <DataTable
          columns={[
            { title: '合同号', dataIndex: 'contract_no', width: 150, fixed: 'left', render: (v: string) => <b>{v}</b> },
            { title: '合同名称', dataIndex: 'name', width: 260, ellipsis: true },
            {
              title: '客户', dataIndex: 'customer_name', width: 190, ellipsis: true,
              render: (v: string, r: any) => (
                <div>
                  <div>{v || '-'}</div>
                  {r.customer_code && <div className="text-muted" style={{ fontSize: 11 }}>{r.customer_code}{r.customer_level ? ` · ${r.customer_level} 级` : ''}</div>}
                </div>
              ),
            },
            {
              title: '合同金额', dataIndex: 'amount', width: 130, align: 'right',
              render: (v: any) => <b className="num">¥{fmtMoney(v, 0)}</b>,
            },
            { title: '签订日期', dataIndex: 'sign_date', width: 110, render: (v: string) => fmtDate(v) },
            {
              title: '合同期限', dataIndex: 'start_date', width: 200,
              render: (_: any, r: any) => `${fmtDate(r.start_date)} ~ ${fmtDate(r.end_date)}`,
            },
            {
              title: '状态', dataIndex: 'status', width: 96, align: 'center',
              render: (v: string) => <Tag color={CONTRACT_STATUS_COLORS[v] || 'default'}>{v}</Tag>,
            },
            { title: '负责人', dataIndex: 'owner_name', width: 96, render: (v: string) => v || '-' },
            { title: '备注', dataIndex: 'remark', ellipsis: true, render: (v: string) => v || '-' },
          ]}
          load={load}
          rowKey="id"
          exportFilename="合同台账"
          scrollX={1420}
          reloadKey={reloadKey}
          search={{ placeholder: '搜索合同号 / 合同名称 / 客户名称' }}
          filters={[
            { key: 'status', label: '合同状态', type: 'select', options: statusOptions, width: 120 },
            { key: 'dateRange', label: '签订日期', type: 'dateRange' },
          ]}
          toolbar={(
            <Space size={6} wrap>
              <span className="text-muted" style={{ fontSize: 12 }}>
                金额汇总随筛选条件变化 · 合同编号由系统按签约日期自动生成
              </span>
            </Space>
          )}
          rowActions={(record) => (
            <>
              {canEdit && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>}
              {canDelete && (
                <Popconfirm title={`确认删除合同「${record.contract_no}」？`} description="删除后不可恢复" onConfirm={() => remove(record)}>
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              )}
            </>
          )}
        />
      </div>

      <Drawer
        title={`${editing ? '编辑' : '新增'}合同`}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        width={720}
        destroyOnClose
        footer={(
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setFormOpen(false)}>取消</Button>
              <Button type="primary" loading={saving} onClick={save}>保存</Button>
            </Space>
          </div>
        )}
      >
        {editing && (
          <div className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
            合同编号：<b style={{ color: 'var(--text)' }}>{editing.contract_no}</b>（系统自动生成，不可修改）
          </div>
        )}
        <SchemaForm
          form={form}
          fields={CONTRACT_FIELDS}
          initialValues={editing ? {
            name: editing.name,
            customer_id: editing.customer_id,
            amount: editing.amount,
            sign_date: editing.sign_date,
            start_date: editing.start_date,
            end_date: editing.end_date,
            status: editing.status,
            owner_id: editing.owner_id,
            remark: editing.remark,
          } : { status: '执行中' }}
        />
      </Drawer>
    </div>
  );
}
