import { useMemo, useState } from 'react';
import {
  Alert, App, Button, Col, DatePicker, Empty, Form, Input, Modal, Popconfirm, Row, Segmented,
  Select, Space, Spin, Tag, Timeline, Tooltip,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import EntitySelect from '../../components/EntitySelect';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { useMeta } from '../../store/meta';
import { fmtNumber } from '../../utils/format';

const REF_TYPES = [
  { label: '线索', value: 'LEAD' },
  { label: '客户', value: 'CUSTOMER' },
  { label: '商机', value: 'OPPORTUNITY' },
];
const REF_TYPE_LABEL: Record<string, string> = { LEAD: '线索', CUSTOMER: '客户', OPPORTUNITY: '商机' };
const ACTIVITY_COLORS: Record<string, string> = {
  电话沟通: 'blue', 上门拜访: 'green', 邮件往来: 'cyan', 会议: 'purple', 演示: 'orange', 其他: 'default',
};

/** 关联对象选择：客户用 EntitySelect，线索/商机加载候选列表 */
function RefObjectSelect({ type, value, onChange, fallbackLabel, style }: {
  type?: string;
  value?: any;
  onChange?: (v: any) => void;
  fallbackLabel?: string;
  style?: React.CSSProperties;
}) {
  const options = useRequest(() => {
    if (type === 'LEAD') {
      return api.get('/api/crm/leads', { pageSize: 200 }).then((r: any) => (r.rows || []).map((x: any) => ({
        label: x.company ? `${x.name}（${x.company}）` : x.name, value: x.id,
      })));
    }
    if (type === 'OPPORTUNITY') {
      return api.get('/api/crm/opportunities', { pageSize: 200 }).then((r: any) => (r.rows || []).map((x: any) => ({
        label: x.customer_name ? `${x.name}（${x.customer_name}）` : x.name, value: x.id,
      })));
    }
    return Promise.resolve([]);
  }, [type]);

  if (type === 'CUSTOMER') {
    return <EntitySelect type="customer" value={value} onChange={onChange} style={style} placeholder="搜索并选择客户" />;
  }
  const merged = [...(options.data || [])];
  if (value !== undefined && value !== null && value !== '' && !merged.some((o: any) => String(o.value) === String(value))) {
    merged.unshift({ label: fallbackLabel || `#${value}`, value });
  }
  return (
    <Select
      showSearch
      allowClear
      optionFilterProp="label"
      value={value ?? undefined}
      onChange={onChange}
      style={style}
      placeholder={type ? '搜索并选择关联对象' : '请先选择关联类型'}
      disabled={!type}
      options={merged}
      loading={options.loading}
    />
  );
}

export default function ActivitiesPage() {
  const { hasPerm } = useAuth();
  const { enumOf } = useMeta();
  const { message } = App.useApp();
  const canEdit = hasPerm('crm.edit');
  const canCreate = hasPerm('crm.create');
  const canDelete = hasPerm('crm.delete');

  const [view, setView] = useState<'timeline' | 'table'>('timeline');
  const [refType, setRefType] = useState<string | undefined>(undefined);
  const [refId, setRefId] = useState<any>(undefined);
  const [activityType, setActivityType] = useState<string | undefined>(undefined);
  const [range, setRange] = useState<any>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const formRefType: string | undefined = Form.useWatch('ref_type', form);

  const activityOptions = useMemo(
    () => (enumOf('activityTypes') as string[]).map((v) => ({ label: v, value: v })),
    [enumOf],
  );

  const extraParams = useMemo(() => ({
    refType,
    refId,
    activityType,
    startDate: range?.[0] ? dayjs(range[0]).format('YYYY-MM-DD') : undefined,
    endDate: range?.[1] ? dayjs(range[1]).format('YYYY-MM-DD') : undefined,
  }), [refType, refId, activityType, range]);
  const paramsKey = JSON.stringify(extraParams);

  const timeline = useRequest(
    () => api.get('/api/crm/activities', { ...extraParams, page: 1, pageSize: 100 }),
    [paramsKey, reloadKey],
  );

  const resetFilters = () => {
    setRefType(undefined);
    setRefId(undefined);
    setActivityType(undefined);
    setRange(null);
  };

  const refreshAll = () => setReloadKey((k) => k + 1);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setFormOpen(true);
  };

  const openEdit = (row: any) => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue({
      ref_type: row.ref_type,
      ref_id: row.ref_id,
      activity_type: row.activity_type,
      subject: row.subject,
      content: row.content,
      activity_at: row.activity_at ? dayjs(row.activity_at) : undefined,
    });
    setFormOpen(true);
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      const payload: any = {
        ref_type: values.ref_type,
        ref_id: values.ref_id,
        activity_type: values.activity_type,
        subject: values.subject || '',
        content: values.content || '',
      };
      if (values.activity_at) payload.activity_at = dayjs(values.activity_at).format('YYYY-MM-DD HH:mm');
      setSaving(true);
      if (editing) await api.put(`/api/crm/activities/${editing.id}`, payload);
      else await api.post('/api/crm/activities', payload);
      message.success(editing ? '跟进记录已更新' : '跟进记录已保存');
      setFormOpen(false);
      refreshAll();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: any) => {
    try {
      await api.del(`/api/crm/activities/${row.id}`);
      message.success('跟进记录已删除');
      refreshAll();
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  };

  const timelineRows: any[] = timeline.data?.rows || [];
  const timelineItems = timelineRows.map((row: any) => ({
    color: row.activity_type === '电话沟通' ? 'blue'
      : row.activity_type === '上门拜访' ? 'green'
        : row.activity_type === '会议' ? 'purple'
          : row.activity_type === '演示' ? 'orange' : 'gray',
    children: (
      <div className="card" style={{ padding: '12px 14px' }}>
        <div className="flex-between" style={{ marginBottom: 4 }}>
          <Space size={8} wrap>
            <span className="text-muted" style={{ fontSize: 12 }}>
              {row.activity_at ? String(row.activity_at).slice(0, 16) : '-'}
            </span>
            <Tag color={ACTIVITY_COLORS[row.activity_type] || 'default'}>{row.activity_type}</Tag>
            <Tag color="blue">{REF_TYPE_LABEL[row.ref_type] || row.ref_type}</Tag>
            <b style={{ fontSize: 13 }}>{row.subject || '（未填写主题）'}</b>
          </Space>
          {canEdit && (
            <Space size={0}>
              <Tooltip title="编辑">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
              </Tooltip>
              {canDelete && (
                <Tooltip title="删除">
                  <span style={{ display: 'inline-flex' }}>
                    <Popconfirm title="确认删除该跟进记录？" onConfirm={() => remove(row)}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </span>
                </Tooltip>
              )}
            </Space>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.7 }}>{row.content || '-'}</div>
        <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
          关联对象：{row.ref_name || `${REF_TYPE_LABEL[row.ref_type] || row.ref_type} #${row.ref_id}`}
          {' · '}负责人：{row.owner_name || '-'}
          {' · '}创建：{String(row.created_at || '').slice(0, 16)}
        </div>
      </div>
    ),
  }));

  return (
    <div>
      <PageHeader
        title="跟进记录"
        subtitle="线索 / 客户 / 商机的沟通、拜访与会议记录，支持时间线与表格两种视角"
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} onClick={refreshAll}>刷新</Button>
            {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增跟进</Button>}
          </Space>
        )}
      />

      <div className="card">
        <div className="filter-bar">
          <Select
            allowClear
            placeholder="关联类型"
            style={{ width: 130 }}
            value={refType}
            options={REF_TYPES}
            onChange={(v) => { setRefType(v); setRefId(undefined); }}
          />
          <RefObjectSelect type={refType} value={refId} onChange={setRefId} style={{ width: 260 }} />
          <Select
            allowClear
            placeholder="跟进方式"
            style={{ width: 130 }}
            value={activityType}
            options={activityOptions}
            onChange={setActivityType}
          />
          <DatePicker.RangePicker style={{ width: 240 }} value={range} onChange={setRange} />
          <Button onClick={resetFilters}>重置</Button>
          <div className="toolbar-spacer" />
          <span className="text-muted" style={{ fontSize: 12 }}>共 {fmtNumber(timeline.data?.total, 0)} 条记录</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '12px 0' }}>
        <Segmented
          value={view}
          onChange={(v) => setView(v as any)}
          options={[{ label: '时间线', value: 'timeline' }, { label: '表格', value: 'table' }]}
        />
        <span className="text-muted" style={{ fontSize: 12 }}>按跟进时间倒序展示最近 100 条</span>
      </div>

      {view === 'timeline' ? (
        <div className="card card-pad">
          {timeline.error && <Alert type="error" showIcon message="跟进记录加载失败" description={timeline.error} />}
          {timeline.loading && <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>}
          {!timeline.loading && !timeline.error && timelineItems.length === 0 && (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无跟进记录，点击右上角「新增跟进」开始记录" />
          )}
          {!timeline.loading && timelineItems.length > 0 && (
            <Timeline items={timelineItems} style={{ paddingTop: 8 }} />
          )}
        </div>
      ) : (
        <DataTable
          columns={[
            {
              title: '跟进时间', dataIndex: 'activity_at', width: 150, fixed: 'left',
              render: (v: string) => (v ? String(v).slice(0, 16) : '-'),
            },
            {
              title: '跟进方式', dataIndex: 'activity_type', width: 110, align: 'center',
              render: (v: string) => <Tag color={ACTIVITY_COLORS[v] || 'default'}>{v}</Tag>,
            },
            {
              title: '关联对象', dataIndex: 'ref_name', width: 220, ellipsis: true,
              render: (v: string, r: any) => (
                <div>
                  <div>{v || '-'}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>{REF_TYPE_LABEL[r.ref_type] || r.ref_type} #{r.ref_id}</div>
                </div>
              ),
            },
            { title: '主题', dataIndex: 'subject', width: 200, ellipsis: true, render: (v: string) => v || '-' },
            { title: '沟通内容', dataIndex: 'content', ellipsis: true, render: (v: string) => v || '-' },
            { title: '负责人', dataIndex: 'owner_name', width: 100, render: (v: string) => v || '-' },
            { title: '创建时间', dataIndex: 'created_at', width: 150, render: (v: string) => (v ? String(v).slice(0, 16) : '-') },
          ]}
          load={(params) => api.get('/api/crm/activities', params)}
          extraParams={extraParams}
          rowKey="id"
          search={false}
          filters={[]}
          reloadKey={reloadKey}
          exportFilename="跟进记录"
          scrollX={1300}
          rowActions={(record) => (
            <>
              {canEdit && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>}
              {canDelete && (
                <Popconfirm title="确认删除该跟进记录？" onConfirm={() => remove(record)}>
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              )}
            </>
          )}
        />
      )}

      <Modal
        title={editing ? '编辑跟进记录' : '新增跟进记录'}
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        onOk={save}
        okText="保存"
        confirmLoading={saving}
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ activity_type: '电话沟通', activity_at: dayjs() }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="ref_type" label="关联类型" rules={[{ required: true, message: '请选择关联类型' }]}>
                <Select
                  options={REF_TYPES}
                  placeholder="请选择关联类型"
                  onChange={() => form.setFieldsValue({ ref_id: undefined })}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="ref_id"
                label="关联对象"
                rules={[{ required: true, message: '请选择关联对象' }]}
              >
                <RefObjectSelect
                  type={formRefType}
                  fallbackLabel={editing && editing.ref_type === formRefType ? editing.ref_name : undefined}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="activity_type" label="跟进方式" rules={[{ required: true, message: '请选择跟进方式' }]}>
                <Select options={activityOptions} placeholder="请选择跟进方式" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="activity_at" label="跟进时间">
                <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} placeholder="默认当前时间" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="subject" label="跟进主题">
                <Input placeholder="如：报价确认 / 方案演示 / 合同条款沟通" maxLength={60} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="content" label="沟通内容">
                <Input.TextArea rows={4} placeholder="记录沟通要点、客户反馈与下一步行动" maxLength={1000} showCount />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
