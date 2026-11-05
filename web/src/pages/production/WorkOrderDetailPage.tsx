import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, App, Button, Col, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Progress, Result, Row, Select,
  Space, Spin, Steps, Table, Tag,
} from 'antd';
import {
  ArrowLeftOutlined, CheckCircleOutlined, DeleteOutlined, EditOutlined, ExportOutlined, LockOutlined,
  PlayCircleOutlined, SendOutlined, StopOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useAuth } from '../../store/auth';
import { useMeta } from '../../store/meta';
import { fmtDate, fmtMoney, fmtNumber } from '../../utils/format';
import WorkOrderActionDialog, { type WoInputMode } from './WorkOrderActionDialog';
import {
  PriorityTag, WO_PRIORITIES, WoStatusTag, actionSuccessText, loadColor, woActionsOf, woProgress,
} from './shared';

const ACTION_ICONS: Record<string, ReactNode> = {
  release: <SendOutlined />,
  start: <PlayCircleOutlined />,
  issue: <ExportOutlined />,
  complete: <CheckCircleOutlined />,
  close: <LockOutlined />,
  void: <StopOutlined />,
};

const CONFIRM_TEXT: Record<string, string> = {
  release: '下达后工单进入执行阶段，可进行开工、领料操作。',
  start: '开工后记录实际开工日期，工单状态变为「生产中」。',
  close: '关闭后工单归档，不再参与生产统计与排产。',
  void: '作废后工单不可恢复，且不再参与 MRP 测算与排产。',
};
const CONFIRM_LABEL: Record<string, string> = { release: '下达', start: '开工', close: '关闭', void: '作废' };

const OPERATION_STATUS_COLOR: Record<string, string> = { 待开始: 'default', 进行中: 'processing', 已完成: 'success' };

/** 工单详情 */
export default function WorkOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { hasPerm } = useAuth();
  const { dict } = useMeta();
  const wo = useRequest<any>(() => api.get(`/api/production/work-orders/${id}`), [id]);
  const [dialog, setDialog] = useState<{ open: boolean; mode: WoInputMode }>({ open: false, mode: 'issue' });
  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm] = Form.useForm();

  const data = wo.data;
  const warehouseOptions = (dict('warehouses') || []).map((w: any) => ({
    label: `${w.name}${w.type ? `（${w.type}）` : ''}`,
    value: w.id,
  }));

  const openEdit = () => {
    if (!data) return;
    editForm.setFieldsValue({
      qty: data.qty,
      planned_start: data.planned_start ? dayjs(data.planned_start) : null,
      planned_end: data.planned_end ? dayjs(data.planned_end) : null,
      priority: data.priority,
      warehouse_id: data.warehouse_id,
      material_wh_id: data.material_wh_id,
      remark: data.remark,
    });
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!data) return;
    try {
      const v = await editForm.validateFields();
      if (dayjs(v.planned_end).isBefore(dayjs(v.planned_start), 'day')) {
        message.error('计划完成日期不能早于计划开始日期');
        return;
      }
      setSavingEdit(true);
      const res = await api.put<any>(`/api/production/work-orders/${data.id}`, {
        qty: v.qty,
        planned_start: dayjs(v.planned_start).format('YYYY-MM-DD'),
        planned_end: dayjs(v.planned_end).format('YYYY-MM-DD'),
        priority: v.priority,
        warehouse_id: v.warehouse_id,
        material_wh_id: v.material_wh_id,
        remark: v.remark || '',
      });
      message.success('工单已修改，物料需求与工序已按 BOM 重新展开');
      wo.setData(res);
      setEditOpen(false);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '工单修改失败');
    } finally {
      setSavingEdit(false);
    }
  };

  const runSimpleAction = async (action: string) => {
    if (!data) return;
    try {
      const res = await api.post<any>(`/api/production/work-orders/${data.id}/action`, { action });
      message.success(actionSuccessText(action));
      wo.setData(res);
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  };

  const confirmSimple = (action: string) => {
    if (!data) return;
    const label = CONFIRM_LABEL[action] || '执行';
    modal.confirm({
      title: `确认${label}工单 ${data.order_no}？`,
      content: CONFIRM_TEXT[action],
      okText: `确认${label}`,
      okButtonProps: action === 'void' ? { danger: true } : undefined,
      cancelText: '取消',
      onOk: () => runSimpleAction(action),
    });
  };

  const confirmDelete = () => {
    if (!data) return;
    modal.confirm({
      title: `确认删除工单 ${data.order_no}？`,
      content: '只有草稿状态的工单可以删除，删除后不可恢复。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.del(`/api/production/work-orders/${data.id}`);
          message.success('工单已删除');
          navigate('/production/work-orders');
        } catch (e: any) {
          message.error(e?.message || '删除失败');
        }
      },
    });
  };

  const back = (
    <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/production/work-orders')} style={{ marginRight: -2 }} />
  );

  if (wo.loading && !data) {
    return (
      <div>
        <PageHeader title="生产工单详情" back={back} />
        <div className="card">
          <div className="empty-hint">
            <Spin /> <span style={{ marginLeft: 8 }}>正在加载工单数据…</span>
          </div>
        </div>
      </div>
    );
  }

  if (wo.error || !data) {
    return (
      <div>
        <PageHeader title="生产工单详情" back={back} />
        <div className="card">
          <Result
            status="warning"
            title="工单加载失败"
            subTitle={wo.error || '生产工单不存在或已被删除'}
            extra={
              <Space>
                <Button onClick={() => navigate('/production/work-orders')}>返回工单列表</Button>
                <Button type="primary" onClick={wo.refresh}>重试</Button>
              </Space>
            }
          />
        </div>
      </div>
    );
  }

  const allowedActions = hasPerm('production.approve') ? woActionsOf(data.status) : [];
  const canDelete = data.status === 'DRAFT' && hasPerm('production.delete');
  const stepIndex = ['DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'].indexOf(data.status);

  const materials = data.materials || [];
  const operations = data.operations || [];
  const materialTotal = materials.reduce(
    (acc: any, m: any) => ({
      required: acc.required + (Number(m.required_qty) || 0),
      issued: acc.issued + (Number(m.issued_qty) || 0),
      amount: acc.amount + (Number(m.issued_amount) || 0),
    }),
    { required: 0, issued: 0, amount: 0 }
  );
  const operationTotal = operations.reduce(
    (acc: any, o: any) => ({
      planned: acc.planned + (Number(o.planned_hours) || 0),
      actual: acc.actual + (Number(o.actual_hours) || 0),
    }),
    { planned: 0, actual: 0 }
  );

  return (
    <div>
      <PageHeader
        title={
          <Space size={10}>
            <span>{data.order_no}</span>
            <WoStatusTag status={data.status} />
            <PriorityTag value={data.priority} />
          </Space>
        }
        back={back}
        subtitle={`${data.item_name}${data.item_code ? `（${data.item_code}）` : ''} · ${data.spec || '无规格'} · ${fmtNumber(data.qty, 2)} ${data.uom || ''} · BOM ${data.bom?.code || '—'}`}
        extra={
          <Space wrap>
            {data.status === 'DRAFT' && hasPerm('production.edit') && (
              <Button icon={<EditOutlined />} onClick={openEdit}>
                编辑
              </Button>
            )}
            {allowedActions.map((a) => (
              <Button
                key={a.action}
                type={a.primary ? 'primary' : 'default'}
                danger={a.danger}
                icon={ACTION_ICONS[a.action]}
                onClick={() => (a.input ? setDialog({ open: true, mode: a.input }) : confirmSimple(a.action))}
              >
                {a.label}
              </Button>
            ))}
            {canDelete && (
              <Button danger icon={<DeleteOutlined />} onClick={confirmDelete}>
                删除
              </Button>
            )}
          </Space>
        }
      />

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 6 }}>
          {data.status === 'VOID' ? (
            <Alert type="error" showIcon message="该工单已作废，不可再执行生产动作" />
          ) : (
            <Steps
              size="small"
              current={stepIndex < 0 ? 0 : stepIndex}
              items={[
                { title: '草稿', description: data.created_at?.slice(0, 16) },
                { title: '已下达' },
                { title: '生产中', description: data.actual_start || '' },
                { title: '已完工', description: data.actual_end || '' },
                { title: '已关闭' },
              ]}
            />
          )}
        </div>
      </div>

      <div className="card mt-14">
        <div className="card-head">
          <div className="card-title">
            <span className="dot" />
            工单信息
          </div>
          <span className="text-muted" style={{ fontSize: 11 }}>
            进度 {fmtNumber(woProgress(data.qty, data.completed_qty), 1)}%
          </span>
        </div>
        <div className="card-pad">
          <Descriptions
            bordered
            size="small"
            column={{ xs: 1, sm: 2, xl: 3 }}
            items={[
              { key: 'order_no', label: '工单号', children: data.order_no },
              { key: 'status', label: '工单状态', children: <WoStatusTag status={data.status} /> },
              { key: 'priority', label: '优先级', children: <PriorityTag value={data.priority} /> },
              {
                key: 'item',
                label: '生产成品',
                children: (
                  <span>
                    {data.item_name}
                    <span className="text-muted">（{data.item_code}）</span>
                  </span>
                ),
              },
              { key: 'spec', label: '规格型号', children: data.spec || '-' },
              { key: 'uom', label: '计量单位', children: data.uom || '-' },
              { key: 'qty', label: '生产数量', children: `${fmtNumber(data.qty, 2)} ${data.uom || ''}` },
              { key: 'completed', label: '已完工数量', children: `${fmtNumber(data.completed_qty, 2)} ${data.uom || ''}` },
              { key: 'remaining', label: '未完工数量', children: `${fmtNumber(data.remaining_qty, 2)} ${data.uom || ''}` },
              {
                key: 'progress',
                label: '完工进度',
                children: (
                  <Progress
                    percent={woProgress(data.qty, data.completed_qty)}
                    size="small"
                    strokeColor={woProgress(data.qty, data.completed_qty) >= 100 ? 'var(--success)' : 'var(--primary)'}
                  />
                ),
              },
              { key: 'planned_start', label: '计划开始', children: fmtDate(data.planned_start) },
              { key: 'planned_end', label: '计划完成', children: fmtDate(data.planned_end) },
              { key: 'actual_start', label: '实际开始', children: fmtDate(data.actual_start) },
              { key: 'actual_end', label: '实际完成', children: fmtDate(data.actual_end) },
              { key: 'warehouse', label: '完工入库仓', children: data.warehouse_name || '-' },
              { key: 'material_wh', label: '领料仓库', children: data.material_wh_name || '-' },
              {
                key: 'material_amount',
                label: '已领料金额',
                children: <span className="money">¥{fmtMoney(data.material_issued_amount || 0)}</span>,
              },
              { key: 'created', label: '创建人 / 时间', children: `${data.created_by_name || '-'} · ${data.created_at || '-'}` },
              {
                key: 'remark',
                label: '备注',
                span: 3,
                children: data.remark || <span className="text-muted">无</span>,
              },
            ]}
          />
        </div>
      </div>

      <div className="card mt-14">
        <div className="card-head">
          <div className="card-title">
            <span className="dot" />
            物料需求与领料情况
            <Tag color="blue" style={{ marginLeft: 4 }}>
              {materials.length} 项
            </Tag>
          </div>
          <Space size={14}>
            <span className="text-muted" style={{ fontSize: 12 }}>
              已领料金额 <b className="money" style={{ color: 'var(--text)' }}>¥{fmtMoney(materialTotal.amount)}</b>
            </span>
          </Space>
        </div>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={materials}
          scroll={{ x: 1200 }}
          locale={{ emptyText: '暂无物料需求（工单未关联 BOM 或 BOM 无明细）' }}
          columns={[
            { title: '物料编码', dataIndex: 'item_code', width: 120 },
            {
              title: '物料名称',
              dataIndex: 'item_name',
              width: 200,
              ellipsis: true,
              render: (v: string, r: any) => (
                <div>
                  <div>{v}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>{r.item_spec || r.spec}</div>
                </div>
              ),
            },
            { title: '单位', dataIndex: 'uom', width: 60, align: 'center' },
            {
              title: '需求量',
              dataIndex: 'required_qty',
              width: 100,
              align: 'right',
              render: (v: any) => <span className="num">{fmtNumber(v, 2)}</span>,
            },
            {
              title: '已领量',
              dataIndex: 'issued_qty',
              width: 100,
              align: 'right',
              render: (v: any) => <span className="num text-success">{fmtNumber(v, 2)}</span>,
            },
            {
              title: '未领量',
              dataIndex: 'remain_qty',
              width: 100,
              align: 'right',
              render: (v: any) =>
                Number(v) > 0 ? <span className="num text-danger">{fmtNumber(v, 2)}</span> : <span className="text-muted">0</span>,
            },
            {
              title: '领料进度',
              dataIndex: 'issue_rate',
              width: 140,
              render: (v: any) => (
                <Progress
                  percent={Math.min(100, Number(v) || 0)}
                  size="small"
                  strokeColor={Number(v) >= 100 ? 'var(--success)' : 'var(--primary)'}
                />
              ),
            },
            {
              title: '单位成本',
              dataIndex: 'unit_cost',
              width: 100,
              align: 'right',
              render: (v: any) => `¥${fmtMoney(v)}`,
            },
            {
              title: '已领金额',
              dataIndex: 'issued_amount',
              width: 110,
              align: 'right',
              render: (v: any) => <span className="num">¥{fmtMoney(v)}</span>,
            },
            { title: '领料仓库', dataIndex: 'warehouse_name', width: 110, render: (v: string) => v || '-' },
            { title: '备注', dataIndex: 'remark', width: 120, ellipsis: true, render: (v: string) => v || '-' },
          ]}
          summary={() =>
            materials.length ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <b>合计</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <b className="num">{fmtNumber(materialTotal.required, 2)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <b className="num text-success">{fmtNumber(materialTotal.issued, 2)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} colSpan={1} />
                <Table.Summary.Cell index={4} colSpan={2} />
                <Table.Summary.Cell index={5} align="right">
                  <b className="num text-danger">¥{fmtMoney(materialTotal.amount)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} colSpan={2} />
              </Table.Summary.Row>
            ) : null
          }
        />
      </div>

      <div className="card mt-14">
        <div className="card-head">
          <div className="card-title">
            <span className="dot" />
            工序计划与执行
            <Tag color="blue" style={{ marginLeft: 4 }}>
              {operations.length} 道
            </Tag>
          </div>
          <span className="text-muted" style={{ fontSize: 12 }}>
            计划 {fmtNumber(operationTotal.planned, 2)}h / 实际 {fmtNumber(operationTotal.actual, 2)}h
          </span>
        </div>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={operations}
          scroll={{ x: 900 }}
          locale={{ emptyText: '暂无工序计划（BOM 未关联工序或尚未展开）' }}
          columns={[
            { title: '序号', dataIndex: 'seq', width: 60, align: 'center' },
            { title: '工序名称', dataIndex: 'process_name', width: 150 },
            {
              title: '工作中心',
              dataIndex: 'work_center_name',
              width: 160,
              render: (v: string, r: any) =>
                v ? (
                  <span>
                    {v} <span className="text-muted">({r.work_center_code})</span>
                  </span>
                ) : (
                  '-'
                ),
            },
            {
              title: '计划工时',
              dataIndex: 'planned_hours',
              width: 100,
              align: 'right',
              render: (v: any) => <span className="num">{fmtNumber(v, 2)} h</span>,
            },
            {
              title: '实际工时',
              dataIndex: 'actual_hours',
              width: 100,
              align: 'right',
              render: (v: any) => <span className="num">{fmtNumber(v, 2)} h</span>,
            },
            {
              title: '工时达成率',
              key: 'rate',
              width: 130,
              render: (_: any, r: any) => {
                const planned = Number(r.planned_hours) || 0;
                const actual = Number(r.actual_hours) || 0;
                const rate = planned > 0 ? Math.round((actual / planned) * 10000) / 100 : 0;
                return (
                  <span className="num" style={{ color: loadColor(rate) }}>
                    {fmtNumber(rate, 1)}%
                  </span>
                );
              },
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 90,
              align: 'center',
              render: (v: string) => <Tag color={OPERATION_STATUS_COLOR[v] || 'default'}>{v}</Tag>,
            },
            { title: '操作员', dataIndex: 'operator', width: 90, render: (v: string) => v || '-' },
            { title: '备注', dataIndex: 'remark', width: 140, ellipsis: true, render: (v: string) => v || '-' },
          ]}
          summary={() =>
            operations.length ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <b>合计</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <b className="num">{fmtNumber(operationTotal.planned, 2)} h</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <b className="num">{fmtNumber(operationTotal.actual, 2)} h</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} colSpan={4} />
              </Table.Summary.Row>
            ) : null
          }
        />
      </div>

      <WorkOrderActionDialog
        open={dialog.open}
        mode={dialog.mode}
        woId={data.id}
        onClose={() => setDialog((s) => ({ ...s, open: false }))}
        onDone={(updated) => wo.setData(updated)}
      />

      <Modal
        title={`编辑工单 ${data.order_no}`}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={submitEdit}
        confirmLoading={savingEdit}
        okText="保存修改"
        cancelText="取消"
        width={680}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 14 }}
          message="仅草稿状态的工单可以修改"
          description="修改数量、日期或仓库后，系统将按当前启用的 BOM 重新展开物料需求与工序计划。"
        />
        <Form form={editForm} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="qty" label="生产数量" rules={[{ required: true, message: '请填写生产数量' }]}>
                <InputNumber style={{ width: '100%' }} min={0.01} precision={2} addonAfter={data.uom || ''} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="priority" label="优先级">
                <Select options={WO_PRIORITIES.map((p) => ({ label: p, value: p }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="warehouse_id" label="完工入库仓库">
                <Select allowClear showSearch optionFilterProp="label" placeholder="自动匹配" options={warehouseOptions} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="planned_start" label="计划开始日期" rules={[{ required: true, message: '请选择计划开始日期' }]}>
                <DatePicker style={{ width: '100%' }} allowClear={false} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="planned_end" label="计划完成日期" rules={[{ required: true, message: '请选择计划完成日期' }]}>
                <DatePicker style={{ width: '100%' }} allowClear={false} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="material_wh_id" label="领料仓库">
                <Select allowClear showSearch optionFilterProp="label" placeholder="默认原料仓" options={warehouseOptions} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={2} placeholder="生产要求、工艺说明等（可选）" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
}
