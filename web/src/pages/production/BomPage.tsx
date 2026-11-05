import { useRef, useState } from 'react';
import {
  Alert, App, Button, Col, Descriptions, Drawer, Form, Input, InputNumber, Row, Select, Space, Spin, Table, Tag, Tree,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import EntitySelect from '../../components/EntitySelect';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { fmtMoney, fmtNumber } from '../../utils/format';

interface BomLineForm {
  key: string;
  item_id?: number;
  fallbackLabel?: string;
  qty: number;
  loss_rate: number;
  remark?: string;
}

const emptyLine = (key: string): BomLineForm => ({ key, qty: 1, loss_rate: 0, remark: '' });

/** BOM 管理（列表 / 抽屉编辑 / BOM 树详情） */
export default function BomPage() {
  const { message, modal } = App.useApp();
  const { hasPerm } = useAuth();
  const [form] = Form.useForm();
  const [refreshKey, setRefreshKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<BomLineForm[]>([emptyLine('l1')]);
  const lineKey = useRef(1);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<any[]>([]);
  const [bomMap, setBomMap] = useState<Record<number, number>>({});

  const processes = useRequest(() => api.get<any>('/api/masterdata/processes', { pageSize: 200 }), []);
  const processOptions = (processes.data?.rows || []).map((p: any) => ({
    label: `${p.code} ${p.name}`,
    value: p.id,
  }));
  const processNameOf = (id: number) => {
    const p = (processes.data?.rows || []).find((x: any) => x.id === id);
    return p ? `${p.code} ${p.name}` : id || '-';
  };

  const refresh = () => setRefreshKey((k) => k + 1);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ version: 'V1.0', output_qty: 1, scrap_rate: 0, status: '启用' });
    lineKey.current = 1;
    setLines([emptyLine('l1')]);
    setEditOpen(true);
  };

  const openEdit = async (record: any) => {
    setEditing(record);
    form.resetFields();
    setEditOpen(true);
    setEditLoading(true);
    setLines([]);
    try {
      const d = await api.get<any>(`/api/masterdata/boms/${record.id}`);
      form.setFieldsValue({
        code: d.code,
        name: d.name,
        item_id: d.item_id,
        version: d.version,
        output_qty: d.output_qty,
        scrap_rate: d.scrap_rate,
        process_id: d.process_id,
        status: d.status,
        remark: d.remark,
      });
      setLines(
        (d.lines || []).map((l: any, i: number) => ({
          key: `l${i + 1}`,
          item_id: l.item_id,
          fallbackLabel: `${l.item_code} ${l.item_name}`,
          qty: Number(l.qty) || 0,
          loss_rate: Number(l.loss_rate) || 0,
          remark: l.remark || '',
        }))
      );
      lineKey.current = (d.lines || []).length + 1;
    } catch (e: any) {
      message.error(e?.message || 'BOM 明细加载失败');
      setEditOpen(false);
    } finally {
      setEditLoading(false);
    }
  };

  const addLine = () => {
    lineKey.current += 1;
    setLines((prev) => [...prev, emptyLine(`l${lineKey.current}`)]);
  };

  const updateLine = (index: number, patch: Partial<BomLineForm>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const submit = async () => {
    try {
      const values = await form.validateFields();
      const validLines = lines.filter((l) => l.item_id);
      if (!validLines.length) {
        message.warning('请至少添加一行 BOM 明细（选择物料）');
        return;
      }
      if (validLines.length !== lines.length) {
        message.warning('存在未选择物料的明细行，请选择物料或删除该行');
        return;
      }
      const payload = {
        code: values.code,
        name: values.name,
        item_id: values.item_id,
        version: values.version || 'V1.0',
        output_qty: Number(values.output_qty) || 1,
        scrap_rate: Number(values.scrap_rate) || 0,
        process_id: values.process_id || null,
        status: values.status || '启用',
        remark: values.remark || '',
        lines: validLines.map((l) => ({
          item_id: l.item_id,
          qty: Number(l.qty) || 0,
          loss_rate: Number(l.loss_rate) || 0,
          remark: l.remark || '',
        })),
      };
      setSaving(true);
      if (editing) await api.put(`/api/masterdata/boms/${editing.id}`, payload);
      else await api.post('/api/masterdata/boms', payload);
      message.success(`BOM${editing ? '修改' : '新增'}成功`);
      setEditOpen(false);
      refresh();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (record: any) => {
    modal.confirm({
      title: `确认删除 BOM「${record.code}」？`,
      content: '删除后将同时删除其明细行；若已被生产工单引用则不允许删除。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.del(`/api/masterdata/boms/${record.id}`);
          message.success('BOM 已删除');
          refresh();
        } catch (e: any) {
          message.error(e?.message || '删除失败');
        }
      },
    });
  };

  const buildLineNodes = (rows: any[], map: Record<number, number>): DataNode[] =>
    rows.map((l) => ({
      key: `line-${l.id}-${l.item_id}`,
      title: (
        <Space size={6} wrap>
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>{l.item_code}</Tag>
          <span>{l.item_name}</span>
          <span className="text-muted">× {fmtNumber(l.qty, 4)}</span>
          {Number(l.loss_rate) > 0 && <span className="text-muted">（损耗 {fmtNumber(l.loss_rate, 2)}%）</span>}
          <span className="text-muted" style={{ fontSize: 11 }}>{l.uom}</span>
          <span className="text-muted" style={{ fontSize: 11 }}>¥{fmtMoney(l.price_purchase)}</span>
        </Space>
      ),
      itemId: l.item_id,
      isLeaf: !map[l.item_id],
    })) as any;

  const updateTreeData = (list: any[], key: any, children: any[]): any[] =>
    list.map((node) => {
      if (node.key === key) return { ...node, children };
      if (node.children) return { ...node, children: updateTreeData(node.children, key, children) };
      return node;
    });

  const openDetail = async (record: any) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    setTreeData([]);
    setExpandedKeys([]);
    try {
      const [d, all] = await Promise.all([
        api.get<any>(`/api/masterdata/boms/${record.id}`),
        api.get<any>('/api/masterdata/boms', { pageSize: 200 }),
      ]);
      const map: Record<number, number> = {};
      for (const b of all.rows || []) if (b.status === '启用') map[b.item_id] = b.id;
      setBomMap(map);
      setDetail(d);
      const outputQty = Number(d.output_qty) > 0 ? Number(d.output_qty) : 1;
      const unitCost = (d.lines || []).reduce(
        (s: number, l: any) => s + (Number(l.qty) || 0) * (Number(l.price_purchase) || 0) * (1 + (Number(l.loss_rate) || 0) / 100),
        0
      ) / outputQty;
      setTreeData([
        {
          key: 'root',
          title: (
            <Space size={6} wrap>
              <Tag color="green" style={{ marginInlineEnd: 0 }}>{d.item?.code}</Tag>
              <b>{d.item?.name}</b>
              <span className="text-muted" style={{ fontSize: 12 }}>
                产出 {fmtNumber(d.output_qty, 2)} {d.item?.uom || ''} · 版本 {d.version} · 单位材料成本 ¥{fmtMoney(unitCost)}
              </span>
              <Tag color={d.status === '启用' ? 'green' : 'default'} style={{ marginInlineEnd: 0 }}>{d.status}</Tag>
            </Space>
          ),
          children: buildLineNodes(d.lines || [], map),
        } as DataNode,
      ]);
      setExpandedKeys(['root']);
    } catch (e: any) {
      message.error(e?.message || 'BOM 详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const loadTreeData = async (node: any) => {
    const itemId = Number(node.itemId);
    const bomId = bomMap[itemId];
    if (!bomId) return;
    try {
      const d = await api.get<any>(`/api/masterdata/boms/${bomId}`);
      const children = buildLineNodes(d.lines || [], bomMap);
      setTreeData((prev) => updateTreeData(prev, node.key, children));
    } catch {
      setTreeData((prev) => updateTreeData(prev, node.key, []));
    }
  };

  return (
    <div>
      <PageHeader
        title="BOM 管理"
        subtitle="物料清单（BOM）维护：成品与半成品的组成结构、用量、损耗率与关联工序"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
            {hasPerm('basedata.create') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增 BOM</Button>
            )}
          </Space>
        }
      />

      <DataTable
        columns={[
          {
            title: 'BOM 编码',
            dataIndex: 'code',
            width: 150,
            fixed: 'left',
            render: (v: string, r: any) => (
              <a style={{ fontWeight: 500 }} onClick={() => openDetail(r)}>
                {v}
              </a>
            ),
          },
          { title: 'BOM 名称', dataIndex: 'name', width: 220, ellipsis: true, render: (v: string) => v || '-' },
          {
            title: '成品',
            dataIndex: 'item_name',
            width: 240,
            ellipsis: true,
            render: (v: string, r: any) => (
              <div>
                <div>{v}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>{r.item_code} · {r.spec}</div>
              </div>
            ),
          },
          { title: '版本', dataIndex: 'version', width: 80, align: 'center' },
          {
            title: '产出数量',
            dataIndex: 'output_qty',
            width: 100,
            align: 'right',
            render: (v: any, r: any) => <span className="num">{fmtNumber(v, 2)} {r.uom || ''}</span>,
          },
          {
            title: '损耗率',
            dataIndex: 'scrap_rate',
            width: 90,
            align: 'right',
            render: (v: any) => `${fmtNumber(v, 2)}%`,
          },
          {
            title: '明细行',
            dataIndex: 'line_count',
            width: 90,
            align: 'center',
            render: (v: any) => <Tag color="blue" style={{ marginInlineEnd: 0 }}>{fmtNumber(v, 0)} 行</Tag>,
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 90,
            align: 'center',
            render: (v: string) => <Tag color={v === '启用' ? 'green' : 'default'}>{v}</Tag>,
          },
          { title: '创建时间', dataIndex: 'created_at', width: 110, render: (v: string) => (v ? v.slice(0, 10) : '-') },
        ]}
        load={(params) => api.get('/api/masterdata/boms', params)}
        reloadKey={refreshKey}
        filters={[
          { key: 'status', label: '状态', type: 'select', width: 120, options: [{ label: '启用', value: '启用' }, { label: '停用', value: '停用' }] },
        ]}
        search={{ placeholder: '搜索 BOM 编码 / 名称 / 成品名称' }}
        rowActions={(record: any) => (
          <>
            <Button type="link" size="small" onClick={() => openDetail(record)}>详情</Button>
            {hasPerm('basedata.edit') && (
              <Button type="link" size="small" onClick={() => openEdit(record)}>编辑</Button>
            )}
            {hasPerm('basedata.delete') && (
              <Button type="link" size="small" danger onClick={() => confirmDelete(record)}>删除</Button>
            )}
          </>
        )}
        exportFilename="BOM清单"
        scrollX={1300}
      />

      <Drawer
        title={editing ? `编辑 BOM · ${editing.code}` : '新增 BOM'}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        width={900}
        destroyOnClose
        footer={
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setEditOpen(false)}>取消</Button>
              <Button type="primary" loading={saving} onClick={submit}>保存 BOM</Button>
            </Space>
          </div>
        }
      >
        <Spin spinning={editLoading}>
          <Form form={form} layout="vertical">
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="code" label="BOM 编码" rules={[{ required: true, message: '请填写 BOM 编码' }]}>
                  <Input placeholder="如 BOM-GW1000" />
                </Form.Item>
              </Col>
              <Col span={16}>
                <Form.Item name="name" label="BOM 名称">
                  <Input placeholder="如 智能物联网网关 BOM" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="item_id" label="成品 / 半成品" rules={[{ required: true, message: '请选择成品' }]}>
                  <EntitySelect type="item" placeholder="搜索成品编码或名称" />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name="version" label="版本">
                  <Input placeholder="V1.0" />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name="output_qty" label="产出数量">
                  <InputNumber style={{ width: '100%' }} min={0.01} precision={2} />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name="scrap_rate" label="损耗率 %">
                  <InputNumber style={{ width: '100%' }} min={0} max={100} precision={2} suffix="%" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="process_id" label="关联工序">
                  <Select allowClear showSearch optionFilterProp="label" placeholder="选择工序（生成工单工序计划）" options={processOptions} />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name="status" label="状态">
                  <Select options={[{ label: '启用', value: '启用' }, { label: '停用', value: '停用' }]} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="remark" label="备注">
                  <Input placeholder="工艺说明等（可选）" />
                </Form.Item>
              </Col>
            </Row>
          </Form>

          <div className="flex-between" style={{ marginBottom: 8 }}>
            <b style={{ fontSize: 13 }}>BOM 明细</b>
            <Button size="small" icon={<PlusOutlined />} onClick={addLine}>添加明细行</Button>
          </div>
          <Table
            size="small"
            rowKey="key"
            pagination={false}
            dataSource={lines}
            className="doc-lines-edit"
            locale={{ emptyText: '请点击「添加明细行」维护 BOM 组成物料' }}
            columns={[
              {
                title: '物料',
                dataIndex: 'item_id',
                width: 300,
                render: (_: any, r: any, i: number) => (
                  <EntitySelect
                    type="item"
                    size="small"
                    value={r.item_id}
                    fallbackLabel={r.fallbackLabel}
                    placeholder="搜索物料"
                    style={{ width: '100%' }}
                    onChange={(v, opt: any) =>
                      updateLine(i, { item_id: v, fallbackLabel: opt ? `${opt.code} ${opt.label}` : undefined })
                    }
                  />
                ),
              },
              {
                title: '用量',
                dataIndex: 'qty',
                width: 120,
                render: (v: any, _r: any, i: number) => (
                  <InputNumber
                    size="small"
                    min={0.0001}
                    precision={4}
                    style={{ width: '100%' }}
                    value={v}
                    onChange={(val) => updateLine(i, { qty: Number(val) || 0 })}
                  />
                ),
              },
              {
                title: '损耗率 %',
                dataIndex: 'loss_rate',
                width: 120,
                render: (v: any, _r: any, i: number) => (
                  <InputNumber
                    size="small"
                    min={0}
                    max={100}
                    precision={2}
                    style={{ width: '100%' }}
                    value={v}
                    onChange={(val) => updateLine(i, { loss_rate: Number(val) || 0 })}
                  />
                ),
              },
              {
                title: '备注',
                dataIndex: 'remark',
                render: (v: any, _r: any, i: number) => (
                  <Input
                    size="small"
                    placeholder="可选"
                    value={v}
                    onChange={(e) => updateLine(i, { remark: e.target.value })}
                  />
                ),
              },
              {
                title: '',
                key: 'op',
                width: 50,
                align: 'center',
                render: (_: any, _r: any, i: number) => (
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={lines.length <= 1}
                    onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                  />
                ),
              },
            ]}
          />
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message="领料数量 = 工单数量 × BOM 用量 × (1 + 损耗率) ÷ BOM 产出数量；修改 BOM 不会影响已下达的工单。"
          />
        </Spin>
      </Drawer>

      <Drawer
        title="BOM 结构树"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={780}
        destroyOnClose
        footer={
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setDetailOpen(false)}>关闭</Button>
              {detail && hasPerm('basedata.edit') && (
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => {
                    const row = detail;
                    setDetailOpen(false);
                    openEdit({ ...row, item_name: row.item?.name, item_code: row.item?.code });
                  }}
                >
                  编辑 BOM
                </Button>
              )}
            </Space>
          </div>
        }
      >
        <Spin spinning={detailLoading}>
          {detail ? (
            <>
              <Descriptions
                column={2}
                bordered
                size="small"
                items={[
                  { key: 'code', label: 'BOM 编码', children: detail.code },
                  { key: 'name', label: 'BOM 名称', children: detail.name || '-' },
                  { key: 'item', label: '成品', children: `${detail.item?.code || ''} ${detail.item?.name || ''}` },
                  { key: 'version', label: '版本', children: detail.version || '-' },
                  { key: 'output', label: '产出数量', children: `${fmtNumber(detail.output_qty, 2)} ${detail.item?.uom || ''}` },
                  { key: 'scrap', label: '损耗率', children: `${fmtNumber(detail.scrap_rate, 2)}%` },
                  { key: 'process', label: '关联工序', children: detail.process_id ? processNameOf(detail.process_id) : '-' },
                  { key: 'status', label: '状态', children: <Tag color={detail.status === '启用' ? 'green' : 'default'}>{detail.status}</Tag> },
                  { key: 'count', label: '明细行数', children: `${(detail.lines || []).length} 行` },
                  { key: 'remark', label: '备注', children: detail.remark || '-' },
                ]}
              />
              <div className="flex-between mt-14" style={{ marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>物料组成结构</b>
                <span className="text-muted" style={{ fontSize: 11 }}>半成品可逐层展开子 BOM</span>
              </div>
              <div className="card" style={{ padding: '10px 12px' }}>
                <Tree
                  showLine
                  blockNode
                  treeData={treeData}
                  loadData={loadTreeData}
                  expandedKeys={expandedKeys}
                  onExpand={(keys) => setExpandedKeys(keys as any[])}
                />
              </div>
            </>
          ) : (
            <div className="empty-hint">暂无 BOM 数据</div>
          )}
        </Spin>
      </Drawer>
    </div>
  );
}
