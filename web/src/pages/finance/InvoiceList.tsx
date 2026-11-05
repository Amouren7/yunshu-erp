/**
 * 应收 / 应付发票台账公共组件
 * ------------------------------------------------------------
 * - InvoiceListBlock：筛选栏 + KPI + 密集列表，供应收台账 / 应付台账 /
 *   发票管理（Tabs）三处复用。
 * - InvoiceDetailDrawer：发票详情抽屉（含核销记录、关联凭证），并支持
 *   修改到期日 / 备注（PUT /api/finance/invoices/:id）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, App, Button, Checkbox, DatePicker, Descriptions, Drawer, Form, Input, Select, Space, Spin, Table, Tag,
} from 'antd';
import { EditOutlined, RedoOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import DataTable from '../../components/DataTable';
import EntitySelect from '../../components/EntitySelect';
import StatCard from '../../components/StatCard';
import { useAuth } from '../../store/auth';
import { fmtMoney } from '../../utils/format';
import {
  CLOSED_INVOICE_STATUS, docPathOf, DOC_TYPE_LABEL, invoiceStatusOptions, invoiceTypeLabel,
  InvoiceStatusTag, OverdueTag, partnerLabel, VOUCHER_TYPE_LABEL, type InvoiceType,
} from './common';

/* ============================================================
 * 发票详情抽屉
 * ============================================================ */
interface DrawerProps {
  invoiceId: number | null;
  open: boolean;
  invoiceType: InvoiceType;
  canEdit?: boolean;
  startEditing?: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function InvoiceDetailDrawer({ invoiceId, open, invoiceType, canEdit, startEditing, onClose, onSaved }: DrawerProps) {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const d = await api.get(`/api/finance/invoices/${invoiceId}`);
      setData(d);
      form.setFieldsValue({
        due_date: d?.due_date ? dayjs(d.due_date) : null,
        remark: d?.remark || '',
      });
    } catch (e: any) {
      message.error(e?.message || '加载发票详情失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [invoiceId, form, message]);

  useEffect(() => {
    if (open) {
      setEditing(!!startEditing);
      load();
    } else {
      setData(null);
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId, startEditing]);

  const save = async () => {
    if (!invoiceId) return;
    try {
      const v = await form.validateFields();
      setSaving(true);
      await api.put(`/api/finance/invoices/${invoiceId}`, {
        due_date: v.due_date ? dayjs(v.due_date).format('YYYY-MM-DD') : null,
        remark: v.remark || '',
      });
      message.success('发票到期日 / 备注已更新');
      setEditing(false);
      await load();
      onSaved?.();
    } catch (e: any) {
      if (!e?.errorFields) message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const partner = data?.partner || {};
  const doc = data?.doc;
  const sourceDoc = data?.source_doc;
  const sourcePath = docPathOf(doc?.doc_type, doc?.id);
  const remain = Number(data?.remain_amount) || 0;

  const allocationColumns: ColumnsType<any> = [
    { title: '核销日期', dataIndex: 'payment_date', width: 105 },
    {
      title: '收付款单号', dataIndex: 'payment_no', width: 160,
      render: (v: string, r: any) => (
        <a onClick={() => navigate(`${r.payment_type === 'RECEIPT' ? '/finance/receipts' : '/finance/payments'}/${r.payment_id}`)}>{v}</a>
      ),
    },
    {
      title: '类型', dataIndex: 'payment_type', width: 80, align: 'center',
      render: (v: string) => (v === 'RECEIPT' ? <Tag color="green">收款</Tag> : <Tag color="orange">付款</Tag>),
    },
    { title: '核销金额', dataIndex: 'amount', width: 120, align: 'right', render: (v: number) => <span className="num">{fmtMoney(v)}</span> },
    { title: '结算方式', dataIndex: 'method', width: 110, render: (v: string) => v || '-' },
    { title: '状态', dataIndex: 'status', width: 90, align: 'center' },
    { title: '备注', dataIndex: 'remark', ellipsis: true, render: (v: string) => v || '-' },
  ];

  const voucherColumns: ColumnsType<any> = [
    {
      title: '凭证字号', dataIndex: 'voucher_no', width: 150,
      render: (v: string, r: any) => <a onClick={() => navigate(`/finance/vouchers/${r.id}`)}>{v}</a>,
    },
    { title: '凭证日期', dataIndex: 'voucher_date', width: 105 },
    { title: '类型', dataIndex: 'voucher_type', width: 90, render: (v: string) => VOUCHER_TYPE_LABEL[v] || v },
    { title: '摘要', dataIndex: 'summary', ellipsis: true },
    { title: '借方合计', dataIndex: 'total_debit', width: 120, align: 'right', render: (v: number) => <span className="num">{fmtMoney(v)}</span> },
    { title: '贷方合计', dataIndex: 'total_credit', width: 120, align: 'right', render: (v: number) => <span className="num">{fmtMoney(v)}</span> },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={940}
      title={`${invoiceTypeLabel(invoiceType)}发票详情`}
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            {hasPerm('finance.create') && invoiceType === 'AR' && remain > 0 && (
              <Button type="primary" onClick={() => { onClose(); navigate('/finance/receipts/new'); }}>登记收款</Button>
            )}
            {hasPerm('finance.create') && invoiceType === 'AP' && remain > 0 && (
              <Button type="primary" onClick={() => { onClose(); navigate('/finance/payments/new'); }}>登记付款</Button>
            )}
            {sourcePath && <Button onClick={() => { onClose(); navigate(sourcePath); }}>查看来源单据</Button>}
          </Space>
          <Button onClick={onClose}>关闭</Button>
        </div>
      }
    >
      {loading || !data ? (
        <div style={{ padding: 60, textAlign: 'center' }}><Spin tip="加载中…" /></div>
      ) : (
        <div>
          {Number(data.overdue_days) > 0 && !CLOSED_INVOICE_STATUS.includes(data.status) && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`该发票已逾期 ${data.overdue_days} 天，未结金额 ￥${fmtMoney(remain)}，请及时${invoiceType === 'AR' ? '催收' : '安排付款'}。`}
            />
          )}

          <div className="flex-between" style={{ marginBottom: 10 }}>
            <Space size={10}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{data.invoice_no}</span>
              <InvoiceStatusTag status={data.status} />
              <Tag color={invoiceType === 'AR' ? 'blue' : 'orange'}>{invoiceTypeLabel(invoiceType)}发票</Tag>
              <OverdueTag days={data.overdue_days} status={data.status} />
            </Space>
            {canEdit && !editing && (
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>修改到期日 / 备注</Button>
            )}
          </div>

          <Descriptions bordered size="small" column={2} items={[
            { key: 'invoice_no', label: '发票号码', children: data.invoice_no },
            { key: 'period', label: '会计期间', children: data.period || '-' },
            { key: partnerLabel(invoiceType), label: partnerLabel(invoiceType), children: `${partner.name || '-'}${partner.code ? `（${partner.code}）` : ''}` },
            { key: 'source', label: '来源单据', children: doc ? (sourcePath ? <a onClick={() => navigate(sourcePath)}>{doc.doc_no}</a> : doc.doc_no) : '-' },
            { key: 'invoice_date', label: '开票日期', children: data.invoice_date || '-' },
            { key: 'due_date', label: '到期日', children: <span style={{ color: Number(data.overdue_days) > 0 ? 'var(--danger)' : undefined }}>{data.due_date || '-'}</span> },
            { key: 'total_amount', label: '价税合计', children: <b className="num">￥{fmtMoney(data.total_amount)}</b> },
            { key: 'remain_amount', label: `未${invoiceType === 'AR' ? '收' : '付'}金额`, children: <b className="num" style={{ color: remain > 0 ? 'var(--danger)' : 'var(--success)' }}>￥{fmtMoney(remain)}</b> },
            { key: 'subtotal', label: '不含税金额', children: `￥${fmtMoney(data.subtotal)}` },
            { key: 'tax_amount', label: '税额', children: `￥${fmtMoney(data.tax_amount)}` },
            { key: 'paid_amount', label: `已${invoiceType === 'AR' ? '收' : '付'}`, children: `￥${fmtMoney(data.paid_amount)}` },
            { key: 'overdue_days', label: '逾期天数', children: <OverdueTag days={data.overdue_days} status={data.status} /> },
            { key: 'partner_contact', label: '联系人', children: `${partner.contact || '-'}${partner.phone ? ` / ${partner.phone}` : ''}` },
            { key: 'partner_bank', label: '开户行', children: partner.bank_name ? `${partner.bank_name} ${partner.bank_account || ''}` : '-' },
            { key: 'remark', label: '备注', span: 2, children: data.remark || '-' },
          ]} />

          {sourceDoc && (
            <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
              上游单据：{sourceDoc.doc_no}（{DOC_TYPE_LABEL[sourceDoc.doc_type] || sourceDoc.doc_type} · {sourceDoc.doc_date}）
            </div>
          )}

          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-head">
              <div className="card-title"><span className="dot" />核销记录</div>
              <span className="text-muted" style={{ fontSize: 12 }}>共 {(data.allocations || []).length} 笔</span>
            </div>
            <Table
              rowKey={(r: any) => r.allocation_id || `${r.payment_id}-${r.amount}`}
              columns={allocationColumns}
              dataSource={data.allocations || []}
              pagination={false}
              size="small"
              scroll={{ x: 900 }}
              locale={{ emptyText: '暂无核销记录' }}
            />
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-head">
              <div className="card-title"><span className="dot" />关联会计凭证</div>
              <span className="text-muted" style={{ fontSize: 12 }}>共 {(data.vouchers || []).length} 张</span>
            </div>
            <Table
              rowKey="id"
              columns={voucherColumns}
              dataSource={data.vouchers || []}
              pagination={false}
              size="small"
              scroll={{ x: 800 }}
              locale={{ emptyText: '暂无关联凭证' }}
            />
          </div>

          {canEdit && (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="card-head">
                <div className="card-title"><span className="dot" />发票信息维护</div>
                <span className="text-muted" style={{ fontSize: 12 }}>仅允许修改到期日与备注，其余字段由来源单据控制</span>
              </div>
              <div className="card-pad">
                <Form form={form} layout="vertical" disabled={!editing}>
                  <Space size={16} align="start" wrap>
                    <Form.Item name="due_date" label="到期日" style={{ marginBottom: 8 }}>
                      <DatePicker style={{ width: 180 }} placeholder="选择到期日" />
                    </Form.Item>
                    <Form.Item name="remark" label="备注" style={{ marginBottom: 8 }}>
                      <Input.TextArea rows={2} style={{ width: 520 }} placeholder="发票备注" maxLength={500} showCount />
                    </Form.Item>
                  </Space>
                </Form>
                {editing && (
                  <Space style={{ marginTop: 8 }}>
                    <Button type="primary" loading={saving} onClick={save}>保存修改</Button>
                    <Button onClick={() => { setEditing(false); form.setFieldsValue({ due_date: data.due_date ? dayjs(data.due_date) : null, remark: data.remark || '' }); }}>取消</Button>
                  </Space>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

/* ============================================================
 * 发票台账列表块
 * ============================================================ */
interface ListProps {
  invoiceType: InvoiceType;
  /** ledger：收/付款台账（含 KPI 与登记收付款）；manage：发票管理（可编辑到期日） */
  mode?: 'ledger' | 'manage';
  showKpis?: boolean;
}

export function InvoiceListBlock({ invoiceType, mode = 'ledger', showKpis = false }: ListProps) {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  const [partnerId, setPartnerId] = useState<any>();
  const [status, setStatus] = useState<string | undefined>();
  const [range, setRange] = useState<any>();
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailEdit, setDetailEdit] = useState(false);

  const isAr = invoiceType === 'AR';
  const title = isAr ? '应收' : '应付';

  const extraParams = useMemo(() => ({
    invoiceType,
    partnerId: partnerId || undefined,
    status: status || undefined,
    overdue: overdueOnly ? '1' : undefined,
    startDate: range?.[0] ? dayjs(range[0]).format('YYYY-MM-DD') : undefined,
    endDate: range?.[1] ? dayjs(range[1]).format('YYYY-MM-DD') : undefined,
    keyword: keyword || undefined,
  }), [invoiceType, partnerId, status, overdueOnly, range, keyword]);

  const kpi = useRequest(async () => {
    if (!showKpis) return null;
    const [inv, ov] = await Promise.all([
      api.get('/api/finance/invoices', { invoiceType, page: 1, pageSize: 1 }),
      api.get('/api/finance/overview'),
    ]);
    return { summary: inv?.summary || {}, count: inv?.total || 0, overview: ov || {} };
  }, [reloadKey, showKpis, invoiceType]);

  const refresh = () => setReloadKey((k) => k + 1);

  const reset = () => {
    setPartnerId(undefined);
    setStatus(undefined);
    setRange(undefined);
    setOverdueOnly(false);
    setKeywordInput('');
    setKeyword('');
  };

  const openDetail = (id: number, edit = false) => {
    setDetailId(id);
    setDetailEdit(edit);
  };

  const columns: ColumnsType<any> = [
    {
      title: '发票号码', dataIndex: 'invoice_no', width: 146, fixed: 'left',
      render: (v: string, r: any) => <a onClick={() => openDetail(r.id)} style={{ fontWeight: 500 }}>{v}</a>,
    },
    {
      title: partnerLabel(invoiceType), dataIndex: 'partner_name', width: 180, ellipsis: true,
      render: (v: string, r: any) => (
        <div>
          <div>{v || '-'}</div>
          <div className="text-muted" style={{ fontSize: 11 }}>{r.partner_code || ''}</div>
        </div>
      ),
    },
    { title: '来源单号', dataIndex: 'doc_no', width: 142, render: (v: string) => v || '-' },
    { title: '开票日期', dataIndex: 'invoice_date', width: 100 },
    { title: '到期日', dataIndex: 'due_date', width: 100 },
    { title: '金额', dataIndex: 'total_amount', width: 104, align: 'right', render: (v: number) => <span className="num">{fmtMoney(v)}</span> },
    { title: `已${isAr ? '收' : '付'}`, dataIndex: 'paid_amount', width: 100, align: 'right', render: (v: number) => <span className="num">{fmtMoney(v)}</span> },
    {
      title: `未${isAr ? '收' : '付'}`, dataIndex: 'remain_amount', width: 108, align: 'right',
      render: (v: number) => <b className="num" style={{ color: Number(v) > 0 ? 'var(--danger)' : 'var(--success)' }}>{fmtMoney(v)}</b>,
    },
    {
      title: '逾期', dataIndex: 'overdue_days', width: 94, align: 'center',
      render: (v: number, r: any) => <OverdueTag days={v} status={r.status} />,
    },
    { title: '状态', dataIndex: 'status', width: 92, align: 'center', render: (v: string) => <InvoiceStatusTag status={v} /> },
    ...(mode === 'manage' ? [{ title: '备注', dataIndex: 'remark', width: 160, ellipsis: true, render: (v: string) => v || '-' }] : []),
  ];

  const rowActions = (r: any) => {
    if (mode === 'manage') {
      return (
        <>
          <Button type="link" size="small" onClick={() => openDetail(r.id)}>详情</Button>
          {hasPerm('finance.edit') && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openDetail(r.id, true)}>修改</Button>
          )}
        </>
      );
    }
    return (
      <>
        <Button type="link" size="small" onClick={() => openDetail(r.id)}>详情</Button>
        {Number(r.remain_amount) > 0 && hasPerm('finance.create') && (
          <Button
            type="link" size="small"
            onClick={() => navigate(isAr ? '/finance/receipts/new' : '/finance/payments/new')}
          >
            登记{isAr ? '收款' : '付款'}
          </Button>
        )}
      </>
    );
  };

  const ov = kpi.data?.overview || {};
  const summary = kpi.data?.summary || {};
  const count = kpi.data?.count || 0;

  return (
    <div>
      {showKpis && (
        <div className="kpi-grid">
          <StatCard title={`${title}总额`} value={summary.total_amount || 0} prefix="¥" icon={<span style={{ fontSize: 13 }}>票</span>}
            foot={`共 ${count} 张发票（当前台账全部）`} />
          <StatCard title={`已${isAr ? '收' : '付'}金额`} value={summary.paid_amount || 0} prefix="¥" foot="发票口径累计核销" />
          <StatCard title={`未${isAr ? '收' : '付'}余额`} value={summary.remain_amount || 0} prefix="¥" color="var(--danger)"
            foot={`${ov[isAr ? 'receivable' : 'payable']?.count || 0} 张未结清发票`} />
          <StatCard title={`逾期未${isAr ? '收' : '付'}`} value={ov[isAr ? 'overdue_ar_amount' : 'overdue_ap_amount'] || 0} prefix="¥" color="var(--warning)"
            foot={`${ov[isAr ? 'overdue_ar_count' : 'overdue_ap_count'] || 0} 张逾期发票 · 全量口径`} />
        </div>
      )}

      <div className="card" style={{ marginTop: showKpis ? 14 : 0 }}>
        <div className="filter-bar">
          <EntitySelect
            type={isAr ? 'customer' : 'supplier'}
            style={{ width: 260 }}
            placeholder={`选择${partnerLabel(invoiceType)}`}
            value={partnerId}
            onChange={setPartnerId}
          />
          <Select
            allowClear
            style={{ width: 140 }}
            placeholder="发票状态"
            value={status}
            onChange={setStatus}
            options={invoiceStatusOptions(invoiceType)}
          />
          <DatePicker.RangePicker
            style={{ width: 240 }}
            value={range}
            onChange={setRange}
            placeholder={['开票开始日', '开票结束日']}
          />
          <Checkbox checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)}>
            仅看逾期
          </Checkbox>
          <Input
            allowClear
            style={{ width: 220 }}
            prefix={<SearchOutlined style={{ color: '#8b98ab' }} />}
            placeholder="发票号 / 来源单号 / 往来单位"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onPressEnter={() => setKeyword(keywordInput)}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={() => setKeyword(keywordInput)}>查询</Button>
          <Button icon={<RedoOutlined />} onClick={reset}>重置</Button>
          <div className="toolbar-spacer" />
          <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
        </div>
      </div>

      <div className="mt-14">
        <DataTable
          columns={columns}
          load={(params) => api.get('/api/finance/invoices', params)}
          extraParams={extraParams}
          search={false}
          filters={[]}
          rowActions={rowActions}
          reloadKey={reloadKey}
          exportFilename={`${title}发票台账_${dayjs().format('YYYYMMDD')}`}
          scrollX={mode === 'manage' ? 1480 : 1320}
          showIndex={false}
          defaultPageSize={20}
        />
      </div>

      <InvoiceDetailDrawer
        invoiceId={detailId}
        open={detailId !== null}
        invoiceType={invoiceType}
        canEdit={mode === 'manage' && hasPerm('finance.edit')}
        startEditing={detailEdit}
        onClose={() => { setDetailId(null); setDetailEdit(false); }}
        onSaved={refresh}
      />
    </div>
  );
}
