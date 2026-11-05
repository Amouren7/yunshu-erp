import { useMemo, useState } from 'react';
import { App, Button, Drawer, Form, Input, Modal, Popconfirm, Space, Tag, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import SchemaForm, { formValues, type FieldDef } from '../../components/SchemaForm';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { fmtDateTime } from '../../utils/format';

interface UserRow {
  id: number;
  username: string;
  name: string;
  role_id?: number;
  role_name?: string;
  role_code?: string;
  department_id?: number;
  department_name?: string;
  phone?: string;
  email?: string;
  status: string;
  last_login_at?: string | null;
  created_at?: string;
}

const STATUS_OPTIONS = [
  { label: '启用', value: 'ENABLED' },
  { label: '停用', value: 'DISABLED' },
];

export default function UsersPage() {
  const { message } = App.useApp();
  const { hasPerm } = useAuth();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [resetForm] = Form.useForm();
  const [resetting, setResetting] = useState(false);

  const roles = useRequest(() => api.get<any[]>('/api/system/roles'), []);
  const roleList = roles.data || [];
  const roleOptions = useMemo(
    () => roleList.map((r: any) => ({ label: `${r.name}（${r.code}）`, value: r.id })),
    [roleList],
  );

  const canCreate = hasPerm('system.create');
  const canEdit = hasPerm('system.edit');
  const canDelete = hasPerm('system.delete');

  const createFields: FieldDef[] = useMemo(() => [
    { key: 'username', label: '用户名', required: true, span: 8, placeholder: '3-32 位字母、数字、_ . -' },
    { key: 'name', label: '姓名', required: true, span: 8 },
    { key: 'password', label: '初始密码', type: 'password', required: true, span: 8, help: '至少 6 位' },
    { key: 'role_id', label: '角色', type: 'select', required: true, span: 8, options: roleOptions },
    { key: 'department_id', label: '所属部门', type: 'department', span: 8 },
    { key: 'employee_id', label: '关联员工', type: 'employee', span: 8 },
    { key: 'phone', label: '手机', span: 8 },
    { key: 'email', label: '邮箱', span: 10 },
    { key: 'status', label: '状态', type: 'select', span: 6, options: STATUS_OPTIONS, defaultValue: 'ENABLED' },
  ], [roleOptions]);

  const editFields: FieldDef[] = useMemo(() => [
    { key: 'username', label: '用户名', required: true, span: 8, disabled: editing?.username === 'admin', placeholder: '3-32 位字母、数字、_ . -' },
    { key: 'name', label: '姓名', required: true, span: 8 },
    { key: 'role_id', label: '角色', type: 'select', required: true, span: 8, options: roleOptions },
    { key: 'department_id', label: '所属部门', type: 'department', span: 8 },
    { key: 'employee_id', label: '关联员工', type: 'employee', span: 8 },
    { key: 'phone', label: '手机', span: 8 },
    { key: 'email', label: '邮箱', span: 10 },
    { key: 'status', label: '状态', type: 'select', span: 6, options: STATUS_OPTIONS, disabled: editing?.username === 'admin' },
  ], [roleOptions, editing]);

  const fields = editing ? editFields : createFields;

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'ENABLED' });
    setOpen(true);
  };

  const openEdit = (record: UserRow) => {
    setEditing(record);
    form.resetFields();
    const values: Record<string, any> = {};
    for (const f of editFields) {
      const v = (record as any)[f.key];
      if (v !== undefined && v !== null) values[f.key] = v;
    }
    form.setFieldsValue(values);
    setOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const data = formValues(fields, values);
      setSaving(true);
      if (editing) await api.put(`/api/system/users/${editing.id}`, data);
      else await api.post('/api/system/users', data);
      message.success(`用户${editing ? '修改' : '新增'}成功`);
      setOpen(false);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: UserRow) => {
    try {
      await api.del(`/api/system/users/${record.id}`);
      message.success('用户已删除');
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const openReset = (record: UserRow) => {
    resetForm.resetFields();
    setResetUser(record);
  };

  const handleReset = async () => {
    try {
      const values = await resetForm.validateFields();
      if (values.password !== values.confirm) {
        message.error('两次输入的密码不一致');
        return;
      }
      setResetting(true);
      await api.post(`/api/system/users/${resetUser!.id}/reset-password`, { password: values.password });
      message.success(`用户「${resetUser!.name}」密码已重置`);
      setResetUser(null);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '重置密码失败');
    } finally {
      setResetting(false);
    }
  };

  const columns = [
    { title: '用户名', dataIndex: 'username', width: 130, fixed: 'left' as const },
    {
      title: '姓名', dataIndex: 'name', width: 110,
      render: (v: string) => <b style={{ fontWeight: 500 }}>{v}</b>,
    },
    {
      title: '角色', dataIndex: 'role_name', width: 130,
      render: (v: string, r: UserRow) => (v ? <Tag color={r.role_code === 'ADMIN' ? 'red' : 'blue'}>{v}</Tag> : '-'),
    },
    { title: '部门', dataIndex: 'department_name', width: 130, render: (v: string) => v || '-' },
    { title: '手机', dataIndex: 'phone', width: 130, render: (v: string) => v || '-' },
    { title: '邮箱', dataIndex: 'email', width: 190, ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '状态', dataIndex: 'status', width: 90, align: 'center' as const,
      render: (v: string) => (v === 'ENABLED'
        ? <Tag color="green">启用</Tag>
        : <Tag color="default">停用</Tag>),
    },
    { title: '最后登录', dataIndex: 'last_login_at', width: 150, render: (v: string) => (v ? fmtDateTime(v) : <span className="text-muted">从未登录</span>) },
    { title: '创建时间', dataIndex: 'created_at', width: 150, render: (v: string) => fmtDateTime(v) },
  ];

  return (
    <div>
      <PageHeader
        title="用户管理"
        subtitle="系统账号、角色分配与部门归属；停用账号后其登录会话立即失效"
        extra={
          canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增用户</Button>
        }
      />

      <DataTable<UserRow>
        rowKey="id"
        columns={columns as any}
        load={(params) => api.get('/api/system/users', params)}
        search={{ placeholder: '搜索用户名 / 姓名 / 手机 / 邮箱' }}
        filters={[
          { key: 'status', label: '状态', type: 'select', options: STATUS_OPTIONS },
          { key: 'roleId', label: '角色', type: 'select', options: roleList.map((r: any) => ({ label: r.name, value: r.id })) },
        ]}
        exportFilename="用户管理"
        reloadKey={reloadKey}
        scrollX={1400}
        rowActions={(record) => (
          <>
            {canEdit && (
              <Tooltip title="编辑用户">
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
              </Tooltip>
            )}
            {canEdit && (
              <Tooltip title="重置密码">
                <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => openReset(record)} />
              </Tooltip>
            )}
            {canDelete && (
              <Popconfirm
                title={`确认删除用户「${record.name}」？`}
                description="删除后不可恢复，该用户会话将失效"
                onConfirm={() => handleDelete(record)}
              >
                <Tooltip title="删除用户">
                  <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            )}
          </>
        )}
      />

      <Drawer
        title={editing ? `编辑用户 · ${editing.name}` : '新增用户'}
        open={open}
        onClose={() => setOpen(false)}
        width={640}
        destroyOnClose
        footer={
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setOpen(false)}>取消</Button>
              <Button type="primary" loading={saving} onClick={handleSave}>保存</Button>
            </Space>
          </div>
        }
      >
        <SchemaForm fields={fields} form={form} />
        {editing && (
          <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
            提示：密码需通过「重置密码」单独设置；系统管理员账号（admin）不可修改用户名、不可停用。
          </div>
        )}
      </Drawer>

      <Modal
        title={`重置密码 · ${resetUser?.name || ''}`}
        open={!!resetUser}
        onCancel={() => setResetUser(null)}
        onOk={handleReset}
        confirmLoading={resetting}
        okText="确认重置"
        destroyOnClose
      >
        <Form form={resetForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="password"
            label="新密码"
            rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码至少 6 位' }]}
          >
            <Input.Password placeholder="至少 6 位" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认新密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_: any, value: string) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入" autoComplete="new-password" />
          </Form.Item>
          <div className="text-muted" style={{ fontSize: 12 }}>
            重置后该用户所有登录会话立即失效，需使用新密码重新登录。
          </div>
        </Form>
      </Modal>
    </div>
  );
}
