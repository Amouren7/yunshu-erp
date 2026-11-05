import { useCallback, useMemo, useState } from 'react';
import { App, Button, Drawer, Form, Popconfirm, Space, Tag, Tooltip } from 'antd';
import { CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import SchemaForm, { formValues, type FieldDef } from '../../components/SchemaForm';
import { SimpleStatus } from '../../components/StatusTag';
import { api } from '../../api/client';
import { useAuth } from '../../store/auth';
import { useMeta } from '../../store/meta';
import { fmtDate, fmtNumber } from '../../utils/format';

const LEAVE_FIELDS: FieldDef[] = [
  { key: 'employee_id', label: '员工', type: 'employee', required: true, span: 12 },
  { key: 'leave_type', label: '请假类型', type: 'select', enumKey: 'leaveTypes', required: true, span: 12 },
  { key: 'start_date', label: '开始日期', type: 'date', required: true, span: 12 },
  { key: 'end_date', label: '结束日期', type: 'date', required: true, span: 12 },
  { key: 'days', label: '请假天数', type: 'number', precision: 1, min: 0.5, span: 12, help: '留空则按工作日自动计算' },
  { key: 'reason', label: '请假原因', type: 'textarea', rows: 3, span: 24 },
];

const LEAVE_TYPE_COLORS: Record<string, string> = {
  事假: 'default', 病假: 'orange', 年假: 'blue', 调休: 'cyan', 婚假: 'magenta', 产假: 'purple', 丧假: 'red',
};

export default function LeavesPage() {
  const { hasPerm } = useAuth();
  const { enumOf, dict } = useMeta();
  const { message } = App.useApp();
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const canCreate = hasPerm('hr.create');
  const canEdit = hasPerm('hr.edit');
  const canApprove = hasPerm('hr.approve');
  const canDelete = hasPerm('hr.delete');

  const statusOptions = useMemo(
    () => (enumOf('leaveStatus') as string[]).map((v) => ({ label: v, value: v })),
    [enumOf],
  );
  const leaveTypeOptions = useMemo(
    () => (enumOf('leaveTypes') as string[]).map((v) => ({ label: v, value: v })),
    [enumOf],
  );
  const departmentOptions = useMemo(
    () => (dict('departments') || []).map((d: any) => ({ label: d.name, value: d.id })),
    [dict],
  );

  const load = useCallback((params: Record<string, any>) => api.get('/api/hr/leaves', params).then((res: any) => {
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
      const data = formValues(LEAVE_FIELDS, values);
      setSaving(true);
      if (editing) await api.put(`/api/hr/leaves/${editing.id}`, data);
      else await api.post('/api/hr/leaves', data);
      message.success(editing ? '请假单已更新' : '请假申请已提交，等待审批');
      setFormOpen(false);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const approve = async (row: any, approved: boolean) => {
    try {
      await api.post(`/api/hr/leaves/${row.id}/approve`, { approved });
      message.success(`已${approved ? '批准' : '驳回'} ${row.employee_name} 的${row.leave_type}申请`);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      message.error(e?.message || '审批失败');
    }
  };

  const remove = async (row: any) => {
    try {
      await api.del(`/api/hr/leaves/${row.id}`);
      message.success('请假单已删除');
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  return (
    <div>
      <PageHeader
        title="请假管理"
        subtitle={(
          <span>
            员工请假申请与审批流转 · 待审批 <b style={{ color: '#d97706' }}>{fmtNumber(summary['待审批'], 0)}</b> 条
            {' · '}已批准 <b style={{ color: '#16a34a' }}>{fmtNumber(summary['已批准'], 0)}</b> 条
            {' · '}已驳回 <b style={{ color: '#e5484d' }}>{fmtNumber(summary['已驳回'], 0)}</b> 条
          </span>
        )}
        extra={canCreate ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增请假单</Button>
        ) : undefined}
      />

      <DataTable
        columns={[
          { title: '工号', dataIndex: 'employee_code', width: 86, fixed: 'left' },
          {
            title: '姓名', dataIndex: 'employee_name', width: 110,
            render: (v: string, r: any) => (
              <div>
                <b>{v}</b>
                <div className="text-muted" style={{ fontSize: 11 }}>{r.position || '-'}</div>
              </div>
            ),
          },
          { title: '部门', dataIndex: 'department_name', width: 120, render: (v: string) => v || '-' },
          {
            title: '请假类型', dataIndex: 'leave_type', width: 100,
            render: (v: string) => <Tag color={LEAVE_TYPE_COLORS[v] || 'default'}>{v}</Tag>,
          },
          {
            title: '起止日期', dataIndex: 'start_date', width: 200,
            render: (_: any, r: any) => `${fmtDate(r.start_date)} ~ ${fmtDate(r.end_date)}`,
          },
          { title: '天数', dataIndex: 'days', width: 80, align: 'right', render: (v: any) => `${fmtNumber(v, 1)} 天` },
          { title: '请假原因', dataIndex: 'reason', ellipsis: true, render: (v: string) => v || '-' },
          { title: '状态', dataIndex: 'status', width: 100, align: 'center', render: (v: string) => <SimpleStatus value={v} /> },
          { title: '审批人', dataIndex: 'approver_name', width: 100, render: (v: string) => v || '-' },
          { title: '提交时间', dataIndex: 'created_at', width: 160, render: (v: string) => (v ? String(v).slice(0, 16) : '-') },
        ]}
        load={load}
        rowKey="id"
        exportFilename="请假记录"
        scrollX={1300}
        reloadKey={reloadKey}
        search={false}
        filters={[
          { key: 'status', label: '审批状态', type: 'select', options: statusOptions, width: 120 },
          { key: 'leaveType', label: '请假类型', type: 'select', options: leaveTypeOptions, width: 120 },
          { key: 'departmentId', label: '部门', type: 'select', options: departmentOptions, width: 140 },
          { key: 'dateRange', label: '请假日期', type: 'dateRange' },
        ]}
        toolbar={(
          <Space size={6} wrap>
            <span className="text-muted" style={{ fontSize: 12 }}>审批规则：仅「待审批」的请假单可批准 / 驳回 / 修改</span>
          </Space>
        )}
        rowActions={(record) => (
          <>
            {record.status === '待审批' && canApprove && (
              <>
                <Tooltip title="批准">
                  <span style={{ display: 'inline-flex' }}>
                    <Popconfirm
                      title={`批准 ${record.employee_name} 的${record.leave_type}？`}
                      description={`${fmtDate(record.start_date)} ~ ${fmtDate(record.end_date)}，共 ${fmtNumber(record.days, 1)} 天`}
                      onConfirm={() => approve(record, true)}
                    >
                      <Button type="text" size="small" style={{ color: 'var(--success)' }} icon={<CheckOutlined />} />
                    </Popconfirm>
                  </span>
                </Tooltip>
                <Tooltip title="驳回">
                  <span style={{ display: 'inline-flex' }}>
                    <Popconfirm title="确认驳回该请假申请？" onConfirm={() => approve(record, false)}>
                      <Button type="text" size="small" danger icon={<CloseOutlined />} />
                    </Popconfirm>
                  </span>
                </Tooltip>
              </>
            )}
            {record.status === '待审批' && canEdit && (
              <Tooltip title="编辑">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
              </Tooltip>
            )}
            {canDelete && (
              <Tooltip title="删除">
                <span style={{ display: 'inline-flex' }}>
                  <Popconfirm title="确认删除该请假单？" description="删除后不可恢复" onConfirm={() => remove(record)}>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </span>
              </Tooltip>
            )}
          </>
        )}
      />

      <Drawer
        title={`${editing ? '编辑' : '新增'}请假单`}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        width={620}
        destroyOnClose
        footer={(
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setFormOpen(false)}>取消</Button>
              <Button type="primary" loading={saving} onClick={save}>提交</Button>
            </Space>
          </div>
        )}
      >
        <SchemaForm
          form={form}
          fields={LEAVE_FIELDS}
          initialValues={editing ? {
            employee_id: editing.employee_id,
            leave_type: editing.leave_type,
            start_date: editing.start_date,
            end_date: editing.end_date,
            days: editing.days,
            reason: editing.reason,
          } : undefined}
        />
      </Drawer>
    </div>
  );
}
