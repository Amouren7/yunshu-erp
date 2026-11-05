import { useMemo, useState } from 'react';
import { App, Button, Form, Input, Modal, Popconfirm, Select, Space, Tag } from 'antd';
import { BellOutlined, CheckOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import EntitySelect from '../../components/EntitySelect';
import { api } from '../../api/client';
import { useAuth } from '../../store/auth';
import { fmtDateTime } from '../../utils/format';

const LEVEL_META: Record<string, { label: string; color: string }> = {
  INFO: { label: '通知', color: 'blue' },
  WARN: { label: '提醒', color: 'orange' },
  DANGER: { label: '预警', color: 'red' },
};

const LEVEL_OPTIONS = [
  { label: '通知', value: 'INFO' },
  { label: '提醒', value: 'WARN' },
  { label: '预警', value: 'DANGER' },
];

interface NoticeRow {
  id: number;
  title: string;
  content: string;
  level: string;
  user_id?: number | null;
  is_read: number;
  created_at: string;
}

export default function NoticesPage() {
  const { message } = App.useApp();
  const { hasPerm } = useAuth();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [unread, setUnread] = useState(0);
  const [detail, setDetail] = useState<NoticeRow | null>(null);

  const canCreate = hasPerm('system.create');
  const canEdit = hasPerm('system.edit');
  const canDelete = hasPerm('system.delete');

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ level: 'INFO' });
    setOpen(true);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.post('/api/system/notices', {
        title: values.title,
        content: values.content || '',
        level: values.level,
        user_id: values.user_id || null,
      });
      message.success('通知已发布');
      setOpen(false);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '发布失败');
    } finally {
      setSaving(false);
    }
  };

  const markRead = async (record: NoticeRow) => {
    try {
      await api.post(`/api/system/notices/${record.id}/read`);
      message.success('已标记为已读');
      setReloadKey((k) => k + 1);
      if (!record.is_read) setUnread((n) => Math.max(0, n - 1));
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  };

  const handleDelete = async (record: NoticeRow) => {
    try {
      await api.del(`/api/system/notices/${record.id}`);
      message.success('通知已删除');
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const columns = useMemo(() => [
    {
      title: '级别', dataIndex: 'level', width: 90, align: 'center' as const,
      render: (v: string) => {
        const m = LEVEL_META[v] || LEVEL_META.INFO;
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '标题', dataIndex: 'title', width: 280,
      render: (v: string, r: NoticeRow) => (
        <a onClick={() => setDetail(r)} style={{ fontWeight: r.is_read ? 400 : 600 }}>
          {!r.is_read && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#e5484d', marginRight: 6, verticalAlign: 'middle' }} />}
          {v}
        </a>
      ),
    },
    {
      title: '内容', dataIndex: 'content', ellipsis: true,
      render: (v: string) => <span className="text-muted" style={{ fontSize: 12 }}>{v || '-'}</span>,
    },
    {
      title: '接收人', dataIndex: 'user_id', width: 100, align: 'center' as const,
      render: (v: number | null) => (v ? `用户 #${v}` : <Tag>全体</Tag>),
    },
    {
      title: '状态', dataIndex: 'is_read', width: 90, align: 'center' as const,
      render: (v: number) => (v ? <Tag>已读</Tag> : <Tag color="red">未读</Tag>),
    },
    { title: '发布时间', dataIndex: 'created_at', width: 165, render: (v: string) => fmtDateTime(v) },
    {
      title: '操作', key: '__actions', width: 170, align: 'center' as const, fixed: 'right' as const,
      render: (_: any, record: NoticeRow) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => setDetail(record)}>查看</Button>
          {canEdit && !record.is_read && (
            <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => markRead(record)}>已读</Button>
          )}
          {canDelete && (
            <Popconfirm title="确认删除该通知？" onConfirm={() => handleDelete(record)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ], [canDelete, canEdit]);

  return (
    <div>
      <PageHeader
        title="通知公告"
        subtitle="系统通知、业务提醒与风险预警；未读通知会显示在右上角消息铃铛中"
        extra={
          <Space>
            <Tag color={unread > 0 ? 'red' : 'default'} icon={<BellOutlined />}>未读 {unread} 条</Tag>
            {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建通知</Button>}
          </Space>
        }
      />

      <DataTable<NoticeRow>
        rowKey="id"
        columns={columns as any}
        load={(params) =>
          api.get('/api/system/notices', params).then((res: any) => {
            setUnread(Number(res?.unread) || 0);
            return { rows: res?.rows || [], total: res?.total || 0 };
          })
        }
        search={{ placeholder: '搜索通知标题 / 内容' }}
        filters={[
          { key: 'level', label: '级别', type: 'select', options: LEVEL_OPTIONS },
          { key: 'is_read', label: '状态', type: 'select', options: [{ label: '未读', value: '0' }, { label: '已读', value: '1' }] },
        ]}
        exportFilename="通知公告"
        reloadKey={reloadKey}
        scrollX={1300}
      />

      <Modal
        title="新建通知"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleCreate}
        confirmLoading={saving}
        okText="发布"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="title" label="通知标题" rules={[{ required: true, message: '请填写通知标题' }, { max: 100, message: '标题不超过 100 字' }]}>
            <Input placeholder="如：月末结账提醒" maxLength={100} />
          </Form.Item>
          <Form.Item name="level" label="通知级别" rules={[{ required: true, message: '请选择通知级别' }]}>
            <Select options={LEVEL_OPTIONS} />
          </Form.Item>
          <Form.Item name="content" label="通知内容" rules={[{ required: true, message: '请填写通知内容' }]}>
            <Input.TextArea rows={4} placeholder="请输入通知正文" maxLength={1000} showCount />
          </Form.Item>
          <Form.Item name="user_id" label="接收人" extra="留空表示发送给全体用户">
            <EntitySelect type="user" placeholder="全体用户" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={detail ? <Space><Tag color={(LEVEL_META[detail.level] || LEVEL_META.INFO).color}>{(LEVEL_META[detail.level] || LEVEL_META.INFO).label}</Tag>{detail.title}</Space> : '通知详情'}
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={
          detail ? (
            <Space>
              <Button onClick={() => setDetail(null)}>关闭</Button>
              {canEdit && !detail.is_read && (
                <Button type="primary" icon={<CheckOutlined />} onClick={() => { markRead(detail); setDetail(null); }}>标记已读</Button>
              )}
            </Space>
          ) : null
        }
      >
        {detail && (
          <div>
            <div className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
              发布时间：{fmtDateTime(detail.created_at)} · 接收人：{detail.user_id ? `用户 #${detail.user_id}` : '全体用户'}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.9, fontSize: 13.5 }}>{detail.content || '（无正文）'}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}
