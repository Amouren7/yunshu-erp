import { useEffect, useState } from 'react';
import { Alert, App, DatePicker, Descriptions, InputNumber, Modal, Space, Spin, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import { api } from '../../api/client';
import { fmtMoney, fmtNumber, todayStr } from '../../utils/format';
import { actionSuccessText, WoStatusTag } from './shared';

export type WoInputMode = 'issue' | 'complete';

interface Props {
  open: boolean;
  mode: WoInputMode;
  woId?: number;
  onClose: () => void;
  /** 动作成功后回调（返回最新工单详情） */
  onDone?: (wo: any) => void;
}

/**
 * 工单录入型动作弹窗：
 * - issue：领料（可按物料行调整本次领料数量，默认领完剩余）
 * - complete：报完工（完工数量 + 单位成本，默认材料成本 × 1.18 / 未完工数量）
 */
export default function WorkOrderActionDialog({ open, mode, woId, onClose, onDone }: Props) {
  const { message } = App.useApp();
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionDate, setActionDate] = useState<any>(dayjs());
  const [issueLines, setIssueLines] = useState<any[]>([]);
  const [completeQty, setCompleteQty] = useState<number | null>(null);
  const [unitCost, setUnitCost] = useState<number | null>(null);

  const remainingQty = detail ? Math.round(Math.max(0, Number(detail.qty) - Number(detail.completed_qty || 0)) * 100) / 100 : 0;
  const issuedAmount = Number(detail?.material_issued_amount) || 0;
  const suggestedUnitCost = remainingQty > 0 ? Math.round(((issuedAmount * 1.18) / remainingQty) * 100) / 100 : 0;

  useEffect(() => {
    if (!open || !woId) return;
    let alive = true;
    setLoading(true);
    setDetail(null);
    api
      .get<any>(`/api/production/work-orders/${woId}`)
      .then((wo) => {
        if (!alive) return;
        setDetail(wo);
        setActionDate(dayjs());
        if (mode === 'issue') {
          const rows = (wo.materials || [])
            .filter((m: any) => Number(m.remain_qty) > 0)
            .map((m: any) => ({ ...m, qty: Number(m.remain_qty) }));
          setIssueLines(rows);
        } else {
          setCompleteQty(remainingQtyOf(wo));
          const remain = remainingQtyOf(wo);
          const amount = Number(wo.material_issued_amount) || 0;
          setUnitCost(remain > 0 ? Math.round(((amount * 1.18) / remain) * 100) / 100 : 0);
        }
      })
      .catch((e: any) => {
        if (alive) message.error(e?.message || '工单数据加载失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, woId]);

  const submit = async () => {
    if (!detail) return;
    try {
      let payload: Record<string, any> = { action: mode, date: actionDate ? dayjs(actionDate).format('YYYY-MM-DD') : todayStr() };
      if (mode === 'issue') {
        const picked = issueLines.filter((l) => Number(l.qty) > 0);
        if (!picked.length) {
          message.warning('请至少填写一行领料数量');
          return;
        }
        for (const l of picked) {
          if (Number(l.qty) > Number(l.remain_qty) + 0.001) {
            message.error(`物料「${l.item_name || l.item_code}」领料数量不能超过未领数量 ${fmtNumber(l.remain_qty, 2)}`);
            return;
          }
        }
        payload.lines = picked.map((l) => ({ id: l.id, qty: Math.round(Number(l.qty) * 100) / 100 }));
      } else {
        const qty = Number(completeQty) || 0;
        if (!(qty > 0)) {
          message.warning('请填写完工数量');
          return;
        }
        if (qty > remainingQty + 0.001) {
          message.error(`完工数量不能超过未完工数量 ${fmtNumber(remainingQty, 2)}`);
          return;
        }
        payload.qty = Math.round(qty * 100) / 100;
        payload.unit_cost = Math.round((Number(unitCost) || 0) * 100) / 100;
      }
      setSaving(true);
      const res = await api.post<any>(`/api/production/work-orders/${detail.id}/action`, payload);
      message.success(actionSuccessText(mode));
      onDone?.(res);
      onClose();
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    } finally {
      setSaving(false);
    }
  };

  const totalIssueQty = issueLines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const totalIssueAmount = issueLines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0);
  const notIssuedCount = (detail?.materials || []).filter((m: any) => Number(m.remain_qty) > 0).length;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={saving}
      width={mode === 'issue' ? 820 : 620}
      destroyOnClose
      title={
        <Space>
          <span>{mode === 'issue' ? '工单领料' : '工单报完工'}</span>
          {detail?.order_no && <span className="text-muted" style={{ fontSize: 12, fontWeight: 400 }}>{detail.order_no}</span>}
          {detail?.status && <WoStatusTag status={detail.status} />}
        </Space>
      }
      okText={mode === 'issue' ? '确认领料' : '确认完工'}
      cancelText="取消"
    >
      <Spin spinning={loading}>
        {detail && (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message={
                mode === 'issue'
                  ? '领料后将按移动加权平均成本生成库存流水（MO 出库），并自动生成会计凭证（生产成本 / 原材料）。'
                  : '完工后将生成成品入库流水与会计凭证（库存商品 / 生产成本），单位成本默认按 已领材料成本 × 1.18 ÷ 未完工数量 计算。'
              }
            />
            <Descriptions
              size="small"
              column={mode === 'issue' ? 3 : 2}
              bordered
              style={{ marginBottom: 12 }}
              items={[
                { key: 'item', label: '成品', children: `${detail.item_name || ''}${detail.item_code ? `（${detail.item_code}）` : ''}` },
                { key: 'qty', label: '生产数量', children: `${fmtNumber(detail.qty, 2)} ${detail.uom || ''}` },
                { key: 'done', label: '已完工', children: `${fmtNumber(detail.completed_qty, 2)} ${detail.uom || ''}` },
                ...(mode === 'issue'
                  ? [{ key: 'amount', label: '已领料金额', children: `¥${fmtMoney(issuedAmount)}` }]
                  : [
                      { key: 'remain', label: '未完工数量', children: `${fmtNumber(remainingQty, 2)} ${detail.uom || ''}` },
                      { key: 'cost', label: '已领材料成本', children: `¥${fmtMoney(issuedAmount)}` },
                    ]),
                {
                  key: 'date',
                  label: '业务日期',
                  children: <DatePicker size="small" value={actionDate} onChange={(v) => setActionDate(v)} style={{ width: 130 }} allowClear={false} />,
                },
              ]}
            />

            {mode === 'issue' ? (
              issueLines.length === 0 ? (
                <Alert type="success" showIcon message="该工单物料已全部领完，无需再次领料。" />
              ) : (
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={issueLines}
                  scroll={{ y: 300 }}
                  columns={[
                    {
                      title: '物料',
                      dataIndex: 'item_name',
                      width: 220,
                      render: (_: any, r: any) => (
                        <div>
                          <div>{r.item_name}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>{r.item_code}</div>
                        </div>
                      ),
                    },
                    { title: '单位', dataIndex: 'uom', width: 60, align: 'center' },
                    { title: '需求量', dataIndex: 'required_qty', width: 90, align: 'right', render: (v: any) => fmtNumber(v, 2) },
                    { title: '已领量', dataIndex: 'issued_qty', width: 90, align: 'right', render: (v: any) => fmtNumber(v, 2) },
                    {
                      title: '未领量',
                      dataIndex: 'remain_qty',
                      width: 90,
                      align: 'right',
                      render: (v: any) => <span className="text-danger num">{fmtNumber(v, 2)}</span>,
                    },
                    {
                      title: '本次领料',
                      dataIndex: 'qty',
                      width: 130,
                      render: (v: any, r: any, i: number) => (
                        <InputNumber
                          size="small"
                          min={0}
                          max={Number(r.remain_qty)}
                          precision={2}
                          value={v}
                          style={{ width: '100%' }}
                          onChange={(val) => {
                            setIssueLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, qty: val } : x)));
                          }}
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
                      title: '金额',
                      key: 'amount',
                      width: 110,
                      align: 'right',
                      render: (_: any, r: any) => <span className="num">¥{fmtMoney((Number(r.qty) || 0) * (Number(r.unit_cost) || 0))}</span>,
                    },
                  ]}
                  summary={() => (
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0} colSpan={5}>
                        <b>合计</b>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1} align="right">
                        <b className="num">{fmtNumber(totalIssueQty, 2)}</b>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="right">-</Table.Summary.Cell>
                      <Table.Summary.Cell index={3} align="right">
                        <b className="num text-danger">¥{fmtMoney(totalIssueAmount)}</b>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  )}
                />
              )
            ) : (
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="完工数量">
                  <Space>
                    <InputNumber
                      min={0.01}
                      max={remainingQty}
                      precision={2}
                      value={completeQty as any}
                      onChange={(v) => setCompleteQty(v as any)}
                      style={{ width: 160 }}
                      addonAfter={detail.uom || ''}
                    />
                    <span className="text-muted" style={{ fontSize: 12 }}>最多可完工 {fmtNumber(remainingQty, 2)}</span>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="单位成本">
                  <Space>
                    <InputNumber
                      min={0}
                      precision={2}
                      value={unitCost as any}
                      onChange={(v) => setUnitCost(v as any)}
                      style={{ width: 160 }}
                      prefix="¥"
                    />
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      建议 ¥{fmtMoney(suggestedUnitCost)}（材料成本 ×1.18 ÷ 完工数量）
                    </span>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="预计入库金额">
                  <Tag color="blue" style={{ fontSize: 13 }}>
                    ¥{fmtMoney((Number(completeQty) || 0) * (Number(unitCost) || 0))}
                  </Tag>
                  <span className="text-muted" style={{ fontSize: 12, marginLeft: 8 }}>完工数量 × 单位成本</span>
                </Descriptions.Item>
              </Descriptions>
            )}
            {mode === 'complete' && issuedAmount <= 0 && (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 12 }}
                message="该工单尚未领料"
                description="未领料直接报完工时，入库单位成本将按物料标准成本估算。建议先完成领料再报完工，以保证成本核算准确。"
              />
            )}
            {mode === 'complete' && issuedAmount > 0 && notIssuedCount > 0 && (
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 12 }}
                message={`仍有 ${notIssuedCount} 项物料未领完`}
                description="本次完工将按已领材料成本计算单位成本，未领物料可在完工前补领。"
              />
            )}
          </>
        )}
      </Spin>
    </Modal>
  );
}

function remainingQtyOf(wo: any): number {
  return Math.round(Math.max(0, Number(wo?.qty || 0) - Number(wo?.completed_qty || 0)) * 100) / 100;
}
