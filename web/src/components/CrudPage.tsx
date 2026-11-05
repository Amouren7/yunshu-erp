import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Button, Col, Descriptions, Drawer, Form, Popconfirm, Row, Space, App } from 'antd';
import { DeleteOutlined, EditOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../api/client';
import { useAuth } from '../store/auth';
import PageHeader from './PageHeader';
import SchemaForm, { formValues, type FieldDef } from './SchemaForm';
import DataTable, { type FilterDef } from './DataTable';

export interface CrudPageProps<T = any> {
  title: string;
  subtitle?: ReactNode;
  /** 接口基地址，如 /api/masterdata/items */
  base: string;
  /** 实体名称，如 物料 */
  entity: string;
  columns: ColumnsType<T>;
  fields: FieldDef[];
  search?: boolean | { placeholder?: string };
  filters?: FilterDef[];
  extraParams?: Record<string, any>;
  permModule?: string;
  exportFilename?: string;
  drawerWidth?: number;
  rowActionsExtra?: (record: T) => ReactNode;
  toolbarExtra?: ReactNode;
  headerExtra?: ReactNode;
  /** 打开编辑前可做数据加工 */
  toFormValues?: (record: T) => Record<string, any>;
  /** 保存前加工 */
  beforeSave?: (values: Record<string, any>, editing: T | null) => Record<string, any>;
  /** 详情展示字段 */
  detailFields?: { key: string; label: string; render?: (v: any, r: T) => ReactNode }[];
  onSaved?: () => void;
  reloadDeps?: any;
  scrollX?: number;
  canCreate?: boolean;
  canDelete?: boolean;
}

/** 通用 CRUD 页面：列表 + 新增/编辑抽屉 + 删除 + 批量删除 + 导出 */
export default function CrudPage<T extends Record<string, any> = any>(props: CrudPageProps<T>) {
  const {
    title, subtitle, base, entity, columns, fields, search = true, filters = [], extraParams = {},
    permModule = 'basedata', exportFilename, drawerWidth = 720, rowActionsExtra, toolbarExtra,
    headerExtra, toFormValues, beforeSave, detailFields, onSaved, reloadDeps, scrollX = 1400,
    canCreate = true, canDelete = true,
  } = props;
  const { message } = App.useApp();
  const { hasPerm } = useAuth();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [detail, setDetail] = useState<T | null>(null);

  const canEdit = hasPerm(`${permModule}.edit`);
  const allowCreate = canCreate && hasPerm(`${permModule}.create`);
  const allowDelete = canDelete && hasPerm(`${permModule}.delete`);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  };

  const openEdit = (record: T) => {
    setEditing(record);
    form.resetFields();
    const values = toFormValues ? toFormValues(record) : record;
    const cleaned: Record<string, any> = {};
    for (const f of fields) {
      if (values[f.key] !== undefined) cleaned[f.key] = values[f.key];
    }
    form.setFieldsValue(cleaned);
    setOpen(true);
  };

  const handleSave = async (submitAfter?: boolean) => {
    try {
      const values = await form.validateFields();
      let data = formValues(fields, values);
      if (beforeSave) data = beforeSave(data, editing);
      setSaving(true);
      if (editing) await api.put(`${base}/${editing.id}`, data);
      else await api.post(base, data);
      message.success(`${entity}${editing ? '修改' : '新增'}成功`);
      setOpen(false);
      refresh();
      onSaved?.();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: T) => {
    try {
      await api.del(`${base}/${record.id}`);
      message.success('删除成功');
      refresh();
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const rowActions = (record: T) => (
    <>
      {detailFields && (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetail(record)}>详情</Button>
      )}
      {canEdit && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>}
      {rowActionsExtra?.(record)}
      {allowDelete && (
        <Popconfirm title={`确认删除该${entity}？`} description="删除后不可恢复" onConfirm={() => handleDelete(record)}>
          <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      )}
    </>
  );

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        extra={
          <>
            {headerExtra}
            {allowCreate && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增{entity}</Button>
            )}
          </>
        }
      />
      <DataTable
        columns={columns}
        load={(params) => api.get(base, params)}
        search={search}
        filters={filters}
        extraParams={extraParams}
        rowActions={rowActions}
        toolbar={toolbarExtra}
        exportFilename={exportFilename || `${title}_${new Date().toISOString().slice(0, 10)}`}
        reloadKey={reloadKey}
        scrollX={scrollX}
      />

      <Drawer
        title={`${editing ? '编辑' : '新增'}${entity}`}
        open={open}
        onClose={() => setOpen(false)}
        width={drawerWidth}
        destroyOnClose
        footer={
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setOpen(false)}>取消</Button>
              <Button type="primary" loading={saving} onClick={() => handleSave()}>保存</Button>
            </Space>
          </div>
        }
      >
        <SchemaForm fields={fields} form={form} />
      </Drawer>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={`${entity}详情`} width={620}>
        {detail && (
          <Descriptions column={2} bordered size="small" items={(detailFields || []).map((f) => ({
            key: f.key,
            label: f.label,
            span: 1,
            children: f.render ? f.render((detail as any)[f.key], detail) : ((detail as any)[f.key] ?? '-'),
          }))} />
        )}
      </Drawer>
    </div>
  );
}
