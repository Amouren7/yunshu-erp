import { useMemo, useState } from 'react';
import {
  Alert, App, Button, Checkbox, Divider, Drawer, Form, Input, Popconfirm, Select, Space, Table, Tag, Tooltip,
} from 'antd';
import { DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { useMeta } from '../../store/meta';
import { exportCsv } from '../../utils/format';

interface RoleRow {
  id: number;
  code: string;
  name: string;
  description?: string;
  permissions: string[];
  data_scope: string;
  status: string;
  user_count: number;
  builtin: boolean;
}

const DATA_SCOPE_LABELS: Record<string, string> = {
  all: '全部数据',
  dept: '本部门',
  self: '本人',
};

const STATUS_OPTIONS = [
  { label: '启用', value: 'ENABLED' },
  { label: '停用', value: 'DISABLED' },
];

const DATA_SCOPE_OPTIONS = [
  { label: '全部数据（all）', value: 'all' },
  { label: '本部门数据（dept）', value: 'dept' },
  { label: '本人数据（self）', value: 'self' },
];

export default function RolesPage() {
  const { message } = App.useApp();
  const { hasPerm } = useAuth();
  const { meta } = useMeta();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [perms, setPerms] = useState<string[]>([]);
  const [superAdmin, setSuperAdmin] = useState(false);

  const { data, loading, refresh } = useRequest(() => api.get<RoleRow[]>('/api/system/roles'), []);
  const roleList = data || [];

  const modules = meta?.modules || [];
  const actions = meta?.actions || [];
  const allCodes = useMemo(
    () => modules.flatMap((m: any) => actions.map((a: any) => `${m.key}.${a.key}`)),
    [modules, actions],
  );
  const checkedCount = perms.length;
  const allChecked = allCodes.length > 0 && allCodes.every((c) => perms.includes(c));
  const someChecked = perms.length > 0 && !allChecked;

  const canCreate = hasPerm('system.create');
  const canEdit = hasPerm('system.edit');
  const canDelete = hasPerm('system.delete');

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ data_scope: 'self', status: 'ENABLED' });
    setPerms([]);
    setSuperAdmin(false);
    setOpen(true);
  };

  const openEdit = (record: RoleRow) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue({
      name: record.name,
      code: record.code,
      description: record.description || '',
      data_scope: record.data_scope,
      status: record.status,
    });
    const list = record.permissions || [];
    if (list.includes('*')) {
      setSuperAdmin(true);
      setPerms(allCodes);
    } else {
      setSuperAdmin(false);
      const expanded: string[] = [];
      for (const m of modules) {
        const moduleCodes = actions.map((a: any) => `${m.key}.${a.key}`);
        if (list.includes(`${m.key}.*`) || moduleCodes.every((c) => list.includes(c))) {
          expanded.push(...moduleCodes);
        } else {
          for (const code of moduleCodes) if (list.includes(code)) expanded.push(code);
        }
      }
      setPerms(expanded);
    }
    setOpen(true);
  };

  const togglePerm = (code: string, checked: boolean) => {
    setPerms((prev) => (checked ? Array.from(new Set([...prev, code])) : prev.filter((c) => c !== code)));
  };

  const toggleModule = (moduleKey: string, checked: boolean) => {
    const moduleCodes = actions.map((a: any) => `${moduleKey}.${a.key}`);
    setPerms((prev) => (checked
      ? Array.from(new Set([...prev, ...moduleCodes]))
      : prev.filter((c) => !moduleCodes.includes(c))));
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const permissions = superAdmin
        ? ['*']
        : modules.flatMap((m: any) => {
            const moduleCodes = actions.map((a: any) => `${m.key}.${a.key}`);
            const picked = moduleCodes.filter((c) => perms.includes(c));
            if (picked.length === 0) return [];
            if (picked.length === moduleCodes.length) return [`${m.key}.*`];
            return picked;
          });
      const body = {
        name: values.name,
        code: values.code,
        description: values.description || '',
        data_scope: values.data_scope,
        status: values.status,
        permissions,
      };
      setSaving(true);
      if (editing) await api.put(`/api/system/roles/${editing.id}`, body);
      else await api.post('/api/system/roles', body);
      message.success(`角色${editing ? '修改' : '新增'}成功`);
      setOpen(false);
      refresh();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: RoleRow) => {
    try {
      await api.del(`/api/system/roles/${record.id}`);
      message.success('角色已删除');
      refresh();
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const rows = roleList;

  const columns = [
    {
      title: '角色名称', dataIndex: 'name', width: 170,
      render: (v: string, r: RoleRow) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v} {r.builtin && <Tag color="gold" style={{ marginLeft: 4 }}>内置</Tag>}</div>
          <div className="text-muted" style={{ fontSize: 11 }}>{r.description || '-'}</div>
        </div>
      ),
    },
    { title: '角色编码', dataIndex: 'code', width: 130, render: (v: string) => <Tag color="blue">{v}</Tag> },
    {
      title: '数据范围', dataIndex: 'data_scope', width: 100, align: 'center' as const,
      render: (v: string) => <Tag>{DATA_SCOPE_LABELS[v] || v}</Tag>,
    },
    {
      title: '状态', dataIndex: 'status', width: 90, align: 'center' as const,
      render: (v: string) => (v === 'ENABLED' ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
    },
    {
      title: '权限数', dataIndex: 'permissions', width: 110, align: 'center' as const,
      render: (v: string[]) => {
        if (!v || v.length === 0) return <span className="text-muted">0 项</span>;
        if (v.includes('*')) return <Tag color="red">全部权限 *</Tag>;
        const text = `${v.length} 项`;
        const detail = v.join('\n');
        return (
          <Tooltip title={<div style={{ maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-line', fontSize: 11 }}>{detail}</div>}>
            <a>{text}</a>
          </Tooltip>
        );
      },
    },
    { title: '用户数', dataIndex: 'user_count', width: 90, align: 'right' as const, render: (v: number) => `${v} 人` },
    {
      title: '操作', key: '__actions', width: 160, fixed: 'right' as const, align: 'center' as const,
      render: (_: any, record: RoleRow) => (
        <Space size={0}>
          {canEdit && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>}
          {canDelete && !record.builtin && (
            <Popconfirm
              title={`确认删除角色「${record.name}」？`}
              description={record.user_count > 0 ? '该角色下仍有用户，需先调整用户角色' : '删除后不可恢复'}
              onConfirm={() => handleDelete(record)}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const doExport = () => {
    exportCsv('角色权限', [
      { title: '角色名称', dataIndex: 'name' },
      { title: '角色编码', dataIndex: 'code' },
      { title: '数据范围', dataIndex: 'data_scope' },
      { title: '状态', dataIndex: 'status' },
      { title: '权限数', csv: (r: RoleRow) => (r.permissions?.includes('*') ? '全部' : r.permissions?.length || 0) },
      { title: '用户数', dataIndex: 'user_count' },
      { title: '权限明细', csv: (r: RoleRow) => (r.permissions || []).join(' ') },
    ], roleList);
  };

  return (
    <div>
      <PageHeader
        title="角色权限"
        subtitle="角色定义权限码集合（模块.动作）与数据范围；超级管理员使用 * 表示全部权限"
        extra={
          <>
            <Button icon={<DownloadOutlined />} onClick={doExport}>导出</Button>
            {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增角色</Button>}
          </>
        }
      />

      <div className="card">
        <div className="card-head">
          <div className="card-title"><span className="dot" />角色列表（{rows.length}）</div>
        </div>
        <Table
          size="middle"
          rowKey="id"
          loading={loading}
          dataSource={rows}
          columns={columns as any}
          pagination={false}
          scroll={{ x: 1000 }}
        />
      </div>

      <Drawer
        title={editing ? `编辑角色 · ${editing.name}` : '新增角色'}
        open={open}
        onClose={() => setOpen(false)}
        width={900}
        destroyOnClose
        footer={
          <div className="flex-between">
            <span className="text-muted" style={{ fontSize: 12 }}>
              {superAdmin ? '超级管理员：拥有全部权限（*）' : `已选权限 ${checkedCount} 项`}
            </span>
            <Space>
              <Button onClick={() => setOpen(false)}>取消</Button>
              <Button type="primary" loading={saving} onClick={handleSave}>保存</Button>
            </Space>
          </div>
        }
      >
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请填写角色名称' }]}>
              <Input placeholder="如：销售经理" maxLength={32} />
            </Form.Item>
            <Form.Item
              name="code"
              label="角色编码"
              rules={[
                { required: true, message: '请填写角色编码' },
                { pattern: /^[A-Z][A-Z0-9_]{1,30}$/, message: '2-31 位大写字母、数字或下划线，且以字母开头' },
              ]}
            >
              <Input placeholder="如：SALES_MGR" maxLength={31} disabled={!!editing?.builtin} style={{ textTransform: 'uppercase' }} />
            </Form.Item>
            <Form.Item name="data_scope" label="数据范围" rules={[{ required: true, message: '请选择数据范围' }]}>
              <Select options={DATA_SCOPE_OPTIONS} />
            </Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
              <Select options={STATUS_OPTIONS} />
            </Form.Item>
          </div>
          <Form.Item name="description" label="角色说明">
            <Input.TextArea rows={2} placeholder="角色职责简述（可选）" maxLength={200} />
          </Form.Item>
        </Form>

        {editing?.builtin && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="内置角色的编码不可修改；保存后权限将以显式权限码存储。"
          />
        )}

        <Divider orientation="left" style={{ margin: '4px 0 10px' }}>
          <span style={{ fontSize: 13 }}>权限矩阵</span>
        </Divider>

        <div
          className="filter-bar"
          style={{ borderRadius: 8, border: '1px solid #eef1f7', marginBottom: 8, padding: '8px 12px' }}
        >
          <Checkbox
            checked={allChecked}
            indeterminate={someChecked}
            disabled={superAdmin}
            onChange={(e) => {
              if (e.target.checked) setPerms([...allCodes]);
              else setPerms([]);
            }}
          >
            全选全部权限
          </Checkbox>
          <Button size="small" type="link" disabled={superAdmin} onClick={() => setPerms([])}>清空</Button>
          <div className="toolbar-spacer" />
          <Checkbox
            checked={superAdmin}
            onChange={(e) => {
              setSuperAdmin(e.target.checked);
              if (e.target.checked) setPerms([...allCodes]);
            }}
          >
            超级管理员（*）
          </Checkbox>
        </div>

        <div style={{ border: '1px solid #eef1f7', borderRadius: 8, overflow: 'hidden' }}>
          {modules.map((m: any) => {
            const moduleCodes = actions.map((a: any) => `${m.key}.${a.key}`);
            const picked = moduleCodes.filter((c) => perms.includes(c));
            const moduleAll = picked.length === moduleCodes.length && moduleCodes.length > 0;
            const moduleSome = picked.length > 0 && !moduleAll;
            return (
              <div
                key={m.key}
                style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start', padding: '7px 12px',
                  borderBottom: '1px solid #f4f6fa', background: '#fff',
                }}
              >
                <div style={{ width: 120, flex: '0 0 120px' }}>
                  <Checkbox
                    checked={moduleAll}
                    indeterminate={moduleSome}
                    disabled={superAdmin}
                    onChange={(e) => toggleModule(m.key, e.target.checked)}
                  >
                    <span style={{ fontWeight: 500 }}>{m.name}</span>
                  </Checkbox>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', flex: 1 }}>
                  {actions.map((a: any) => {
                    const code = `${m.key}.${a.key}`;
                    return (
                      <Checkbox
                        key={code}
                        checked={superAdmin || perms.includes(code)}
                        disabled={superAdmin}
                        onChange={(e) => togglePerm(code, e.target.checked)}
                      >
                        <span style={{ fontSize: 12.5 }}>{a.name}</span>
                        <span className="text-muted" style={{ fontSize: 10, marginLeft: 4 }}>{code.split('.').pop()}</span>
                      </Checkbox>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>
          权限码格式：模块.动作（如 sales.view）；若模块内全部动作选中，保存时自动合并为「模块.*」；拥有 * 表示全部权限。
          未勾选任何权限的角色无法访问业务页面。
        </div>
      </Drawer>
    </div>
  );
}
