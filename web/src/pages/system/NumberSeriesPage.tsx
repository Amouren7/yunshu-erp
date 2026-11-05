import { useMemo, useState } from 'react';
import { App, Button, Form, Input, InputNumber, Modal, Space, Tag } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import { api } from '../../api/client';
import { useMeta } from '../../store/meta';

interface SeriesRow {
  doc_type: string;
  prefix: string;
  next_no: number;
  pad: number;
  date_pattern: string;
  name?: string;
  preview?: string;
}

export default function NumberSeriesPage() {
  const { message } = App.useApp();
  const { meta } = useMeta();
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<SeriesRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const docName = (docType: string, fallback?: string) =>
    meta?.docTypes?.[docType]?.name || fallback || docType;

  const columns = useMemo(() => [
    {
      title: '单据类型', dataIndex: 'doc_type', width: 220,
      render: (v: string, r: SeriesRow) => (
        <div>
          <div style={{ fontWeight: 500 }}>{docName(v, r.name)}</div>
          <div className="text-muted" style={{ fontSize: 11 }}>{v}</div>
        </div>
      ),
    },
    {
      title: '单号前缀', dataIndex: 'prefix', width: 150,
      render: (v: string) => <code style={{ fontSize: 12.5, color: 'var(--primary)' }}>{v || '-'}</code>,
    },
    {
      title: '当前序号', dataIndex: 'next_no', width: 110, align: 'right' as const,
      render: (v: number) => <span className="num">{v}</span>,
    },
    {
      title: '流水位数', dataIndex: 'pad', width: 100, align: 'center' as const,
      render: (v: number) => <Tag>{v} 位</Tag>,
    },
    { title: '日期段格式', dataIndex: 'date_pattern', width: 130, align: 'center' as const, render: (v: string) => v || '-' },
    {
      title: '单号示例', dataIndex: 'preview', width: 200,
      render: (v: string) => (v ? <Tag color="blue" style={{ fontFamily: 'Consolas, monospace' }}>{v}</Tag> : '-'),
    },
    {
      title: '规则说明', key: 'rule', width: 320,
      render: (_: any, r: SeriesRow) => (
        <span className="text-muted" style={{ fontSize: 12 }}>
          {r.prefix} + {r.date_pattern || '无日期段'} + 流水号（{r.pad} 位），下一个号 {r.next_no}
        </span>
      ),
    },
    {
      title: '操作', key: '__actions', width: 100, align: 'center' as const, fixed: 'right' as const,
      render: (_: any, r: SeriesRow) => (
        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>编辑</Button>
      ),
    },
  ], [meta]);

  const openEdit = (record: SeriesRow) => {
    form.resetFields();
    form.setFieldsValue({
      prefix: record.prefix,
      next_no: record.next_no,
      pad: record.pad,
      date_pattern: record.date_pattern || 'yyyyMM',
    });
    setEditing(record);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.put(`/api/system/number-series/${editing!.doc_type}`, {
        prefix: values.prefix,
        next_no: values.next_no,
        pad: values.pad,
        date_pattern: values.date_pattern,
      });
      message.success(`${docName(editing!.doc_type, editing!.name)} 单号规则已保存`);
      setEditing(null);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="单据号规则"
        subtitle="配置各业务单据的单号生成规则：前缀 + 日期段 + 流水号；修改下一个序号可跳号或回补"
        extra={<Button onClick={() => setReloadKey((k) => k + 1)}>刷新</Button>}
      />
      <DataTable<SeriesRow>
        rowKey="doc_type"
        columns={columns as any}
        load={() => api.get<any[]>('/api/system/number-series').then((rows) => ({ rows, total: rows.length }))}
        reloadKey={reloadKey}
        search={false}
        exportFilename="单据号规则"
        scrollX={1400}
        defaultPageSize={50}
        toolbar={<span className="text-muted" style={{ fontSize: 12 }}>单号生成规则：前缀 + 日期段（yyyyMM）+ 补零流水号，修改后对新生成单据生效</span>}
      />

      <Modal
        title={`编辑单号规则 · ${editing ? docName(editing.doc_type, editing.name) : ''}`}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              name="prefix"
              label="单号前缀"
              rules={[
                { required: true, message: '请填写单号前缀' },
                { max: 20, message: '前缀不能超过 20 个字符' },
              ]}
            >
              <Input placeholder="如 XSDD" maxLength={20} />
            </Form.Item>
            <Form.Item name="date_pattern" label="日期段格式" extra="支持 yyyy / MM / dd 组合，留空表示无日期段">
              <Input placeholder="yyyyMM" maxLength={20} />
            </Form.Item>
            <Form.Item
              name="pad"
              label="流水号位数"
              rules={[{ required: true, message: '请填写流水号位数' }]}
            >
              <InputNumber min={1} max={10} precision={0} style={{ width: '100%' }} addonAfter="位" />
            </Form.Item>
            <Form.Item
              name="next_no"
              label="下一个流水号"
              rules={[{ required: true, message: '请填写下一个流水号' }]}
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          {editing?.preview && (
            <Space size={6} wrap style={{ fontSize: 12 }}>
              <span className="text-muted">当前单号预览：</span>
              <Tag color="blue" style={{ fontFamily: 'Consolas, monospace' }}>{editing.preview}</Tag>
            </Space>
          )}
        </Form>
      </Modal>
    </div>
  );
}
