import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, App, Button, Col, DatePicker, Descriptions, Form, Input, InputNumber, Row, Select, Space, Spin,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import EntitySelect from '../../components/EntitySelect';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useMeta } from '../../store/meta';
import { fmtMoney, fmtNumber } from '../../utils/format';
import { WO_PRIORITIES } from './shared';

/** 新建生产工单 */
export default function WorkOrderCreatePage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { dict } = useMeta();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<any>(null);

  const warehouseOptions = (dict('warehouses') || []).map((w: any) => ({
    label: `${w.name}${w.type ? `（${w.type}）` : ''}`,
    value: w.id,
  }));

  // 校验成品是否配置启用 BOM（后端创建时会拦截，这里提前提示）
  const bomCheck = useRequest<any>(
    () =>
      picked
        ? api.get('/api/masterdata/boms', { pageSize: 200 })
        : Promise.resolve({ rows: [], total: 0 }),
    [picked?.value]
  );
  const matchedBom = (bomCheck.data?.rows || []).find(
    (b: any) => Number(b.item_id) === Number(picked?.value) && b.status === '启用'
  );

  const submit = async () => {
    try {
      const v = await form.validateFields();
      if (dayjs(v.planned_end).isBefore(dayjs(v.planned_start), 'day')) {
        message.error('计划完成日期不能早于计划开始日期');
        return;
      }
      setSaving(true);
      const res = await api.post<any>('/api/production/work-orders', {
        item_id: v.item_id,
        qty: v.qty,
        planned_start: dayjs(v.planned_start).format('YYYY-MM-DD'),
        planned_end: dayjs(v.planned_end).format('YYYY-MM-DD'),
        priority: v.priority,
        warehouse_id: v.warehouse_id || undefined,
        material_wh_id: v.material_wh_id || undefined,
        remark: v.remark || '',
      });
      message.success('生产工单创建成功，已按 BOM 展开物料需求与工序');
      navigate(`/production/work-orders/${res.id}`, { replace: true });
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '创建生产工单失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="新建生产工单"
        back={
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/production/work-orders')}
            style={{ marginRight: -2 }}
          />
        }
        subtitle="选择成品与数量，系统按启用的 BOM 自动展开领料清单与工序计划"
        extra={
          <Space>
            <Button onClick={() => navigate('/production/work-orders')}>取消</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={submit}>
              保存工单
            </Button>
          </Space>
        }
      />

      <Row gutter={14}>
        <Col xs={24} xl={16}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <span className="dot" />
                工单基本信息
              </div>
              <span className="text-muted" style={{ fontSize: 11 }}>
                保存后状态为「草稿」，可在详情页下达
              </span>
            </div>
            <div className="card-pad">
              <Form
                form={form}
                layout="vertical"
                initialValues={{
                  qty: 1,
                  priority: '普通',
                  planned_start: dayjs(),
                  planned_end: dayjs().add(7, 'day'),
                }}
              >
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      name="item_id"
                      label="生产成品"
                      rules={[{ required: true, message: '请选择要生产的成品' }]}
                      extra="支持成品 / 半成品，选择后自动匹配启用 BOM"
                    >
                      <EntitySelect type="item" placeholder="搜索成品编码或名称" onPick={(opt) => setPicked(opt)} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item
                      name="qty"
                      label="生产数量"
                      rules={[{ required: true, message: '请填写生产数量' }]}
                    >
                      <InputNumber style={{ width: '100%' }} min={0.01} precision={2} placeholder="请输入生产数量" />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={6}>
                    <Form.Item name="priority" label="优先级" initialValue="普通">
                      <Select options={WO_PRIORITIES.map((p) => ({ label: p, value: p }))} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={8}>
                    <Form.Item
                      name="planned_start"
                      label="计划开始日期"
                      rules={[{ required: true, message: '请选择计划开始日期' }]}
                    >
                      <DatePicker style={{ width: '100%' }} allowClear={false} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={8}>
                    <Form.Item
                      name="planned_end"
                      label="计划完成日期"
                      rules={[{ required: true, message: '请选择计划完成日期' }]}
                    >
                      <DatePicker style={{ width: '100%' }} allowClear={false} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={8}>
                    <Form.Item
                      name="warehouse_id"
                      label="完工入库仓库"
                      extra="留空则按成品类型自动匹配（成品仓 / 半成品仓）"
                    >
                      <Select allowClear showSearch optionFilterProp="label" placeholder="自动匹配" options={warehouseOptions} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={8}>
                    <Form.Item
                      name="material_wh_id"
                      label="领料仓库"
                      extra="留空则默认原料仓"
                    >
                      <Select allowClear showSearch optionFilterProp="label" placeholder="默认原料仓" options={warehouseOptions} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={16}>
                    <Form.Item name="remark" label="备注">
                      <Input.TextArea rows={2} placeholder="生产要求、工艺说明等（可选）" />
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
            </div>
            <div className="doc-total-bar">
              <Space>
                <Button onClick={() => navigate('/production/work-orders')}>取消</Button>
                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={submit}>
                  保存并查看详情
                </Button>
              </Space>
            </div>
          </div>
        </Col>

        <Col xs={24} xl={8}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">
                <span className="dot" />
                已选成品
              </div>
            </div>
            <div className="card-pad">
              {!picked ? (
                <div className="empty-hint" style={{ padding: '24px 0' }}>
                  请先选择生产成品
                </div>
              ) : (
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label="成品编码">{picked.code}</Descriptions.Item>
                  <Descriptions.Item label="成品名称">{picked.label}</Descriptions.Item>
                  <Descriptions.Item label="规格型号">{picked.spec || '-'}</Descriptions.Item>
                  <Descriptions.Item label="计量单位">{picked.uom || '-'}</Descriptions.Item>
                  <Descriptions.Item label="当前库存">
                    {fmtNumber(picked.stock_qty, 2)} {picked.uom || ''}
                  </Descriptions.Item>
                  <Descriptions.Item label="参考售价">¥{fmtMoney(picked.price_sale)}</Descriptions.Item>
                </Descriptions>
              )}
            </div>
          </div>

          <div className="card mt-14">
            <div className="card-head">
              <div className="card-title">
                <span className="dot" />
                BOM 匹配
              </div>
            </div>
            <div className="card-pad">
              {!picked ? (
                <div className="text-muted" style={{ fontSize: 12 }}>
                  选择成品后自动检查是否配置启用的 BOM。
                </div>
              ) : bomCheck.loading ? (
                <div style={{ textAlign: 'center', padding: 12 }}>
                  <Spin size="small" /> <span className="text-muted" style={{ fontSize: 12 }}>正在匹配 BOM…</span>
                </div>
              ) : matchedBom ? (
                <Alert
                  type="success"
                  showIcon
                  message={`已匹配 BOM：${matchedBom.code}`}
                  description={`${matchedBom.name || ''} · 版本 ${matchedBom.version} · 产出 ${matchedBom.output_qty} · ${matchedBom.line_count} 行物料。保存后自动展开领料清单与工序。`}
                />
              ) : (
                <Alert
                  type="warning"
                  showIcon
                  message="未找到启用的 BOM"
                  description="该成品尚未配置启用的 BOM，后端会拒绝创建工单。请先在「BOM 管理」中维护并启用 BOM。"
                />
              )}
            </div>
          </div>

          <div className="card mt-14">
            <div className="card-head">
              <div className="card-title">
                <span className="dot" />
                创建说明
              </div>
            </div>
            <div className="card-pad" style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 2 }}>
              <div>1. 成品必须存在「启用」状态的 BOM，否则无法创建工单。</div>
              <div>2. 领料数量 = 生产数量 × BOM 用量 × (1 + 损耗率) ÷ BOM 产出数量。</div>
              <div>3. 工序计划工时 = 生产数量 × 工序标准工时 ÷ BOM 产出数量。</div>
              <div>4. 草稿状态可修改数量与日期，下达后进入执行阶段。</div>
              <div style={{ marginTop: 6 }}>
                <ThunderboltOutlined style={{ color: 'var(--warning)' }} /> 领料 / 完工会自动生成库存流水与会计凭证。
              </div>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}
