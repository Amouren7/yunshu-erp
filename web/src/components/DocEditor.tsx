import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  App, Button, Col, DatePicker, Descriptions, Divider, Empty, Form, Input, InputNumber, Modal, Row,
  Select, Space, Spin, Table, Tag, Timeline, Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined, CheckOutlined, DeleteOutlined, FileAddOutlined, PlusOutlined, PrinterOutlined,
  SaveOutlined, SendOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { api } from '../api/client';
import { useAuth } from '../store/auth';
import { useMeta } from '../store/meta';
import PageHeader from './PageHeader';
import SchemaForm, { type FieldDef } from './SchemaForm';
import EntitySelect from './EntitySelect';
import StatusTag from './StatusTag';
import DocPrint from './DocPrint';
import DataTable from './DataTable';
import { fmtMoney, todayStr } from '../utils/format';

interface Props {
  docType: string;
  basePath: string;
  listPath?: string;
}

interface LineRow {
  key: string;
  id?: number;
  item_id?: any;
  item_code?: string;
  item_name?: string;
  spec?: string;
  uom?: string;
  qty?: number | null;
  price?: number | null;
  discount_rate?: number | null;
  tax_rate?: number | null;
  amount?: number;
  tax_amount?: number;
  total_amount?: number;
  warehouse_id?: any;
  batch_no?: string;
  remark?: string;
  source_line_id?: number;
  invoice_id?: any;
  invoice_no?: string;
  remain_amount?: number;
  due_date?: string;
}

let seq = 0;
const uid = () => `l${Date.now()}_${seq++}`;
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const DOC_ROUTES: Record<string, string> = {
  SO: '/sales/orders', DN: '/sales/deliveries', SR: '/sales/returns',
  PO: '/purchase/orders', GRN: '/purchase/receipts', PR: '/purchase/returns',
  TR: '/inventory/transfers', ADJ: '/inventory/stocktake', OI: '/inventory/other-in', OO: '/inventory/other-out',
  RC: '/finance/receipts', PY: '/finance/payments',
};
function routeOf(docType: string) {
  return DOC_ROUTES[docType] || '/dashboard';
}

function calcLine(l: LineRow) {
  const qty = Number(l.qty) || 0;
  const price = Number(l.price) || 0;
  const disc = Number(l.discount_rate) || 0;
  const rate = Number(l.tax_rate) || 0;
  const amount = round2(qty * price * (1 - disc / 100));
  const tax = round2(amount * rate / 100);
  return { amount, tax, total: round2(amount + tax) };
}

const CURRENCY_OPTIONS = [
  { label: '人民币 CNY', value: 'CNY' },
  { label: '美元 USD', value: 'USD' },
  { label: '欧元 EUR', value: 'EUR' },
];

export default function DocEditorPage({ docType, basePath, listPath }: Props) {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { hasPerm } = useAuth();
  const { meta, docType: getDocType, loading: metaLoading } = useMeta();
  const dt = getDocType(docType);
  const isNew = !id;
  const [headerForm] = Form.useForm();

  const [doc, setDoc] = useState<any>(null);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('DRAFT');
  const [initialHeader, setInitialHeader] = useState<Record<string, any>>({});
  const [partnerId, setPartnerId] = useState<any>();
  const [sourceOpen, setSourceOpen] = useState(false);

  const editable = isNew || status === 'DRAFT';
  const module = dt?.module || 'sales';
  const isInvoiceMode = dt?.lines?.mode === 'invoices';
  const docTypeName = dt?.name || docType;

  // ---------- 表头字段 ----------
  const headerFields = useMemo<FieldDef[]>(() => {
    if (!dt) return [];
    return (dt.fields || []).map((f: any) => {
      let type: any = f.type;
      let options = f.options;
      if (type === 'currency') { type = 'select'; options = CURRENCY_OPTIONS; }
      if (type === 'customer' || type === 'supplier' || type === 'warehouse' || type === 'employee' || type === 'department' || type === 'date' || type === 'select' || type === 'textarea') {
        return { key: f.key, label: f.label, type, required: f.required, options, span: f.span || 8, placeholder: f.type === 'select' ? `请选择${f.label}` : undefined };
      }
      return { key: f.key, label: f.label, type: 'text', required: f.required, span: f.span || 8 };
    });
  }, [dt]);

  // ---------- 加载 ----------
  const loadDoc = useCallback(async (docId: string) => {
    setLoading(true);
    try {
      const d = await api.get(`/api/documents/${docId}`);
      setDoc(d);
      setStatus(d.status);
      setPartnerId(d.partner_id);
      setLines((d.lines || []).map((l: any) => ({ ...l, key: uid(), extra: l.extra })));
      const vals: Record<string, any> = {};
      for (const f of d.docTypeMeta ? [] : []) void f;
      for (const f of (getDocType(docType)?.fields || [])) {
        let v = d[f.key];
        if (f.type === 'date' && v) v = dayjs(v);
        if (v !== undefined && v !== null) vals[f.key] = v;
      }
      setInitialHeader(vals);
      if (sp.get('print') === '1') setTimeout(() => window.print(), 900);
    } catch (e: any) {
      message.error(e?.message || '加载单据失败');
    } finally {
      setLoading(false);
    }
  }, [docType, getDocType, message, sp]);

  useEffect(() => {
    if (isNew) {
      setLines([{ key: uid(), qty: 1, price: 0, discount_rate: 0, tax_rate: 13 }]);
      setInitialHeader({ doc_date: dayjs(todayStr()) });
      setStatus('DRAFT');
      setLoading(false);
    } else if (dt) {
      loadDoc(String(id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, docType, dt]);

  // 从源单生成（URL 带 source 参数）
  useEffect(() => {
    const sourceId = sp.get('source');
    if (isNew && sourceId && dt) {
      api.get('/api/documents/pull', { sourceId, docType }).then((res: any) => {
        applySource(res);
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dt, sp]);

  const applySource = (res: any) => {
    const headerVals: Record<string, any> = {};
    for (const f of (dt.fields || [])) {
      let v = res.header?.[f.key];
      if (f.type === 'date' && v) v = dayjs(v);
      if (v !== undefined && v !== null && v !== '') headerVals[f.key] = v;
    }
    headerVals.doc_date = dayjs(todayStr());
    headerForm.setFieldsValue(headerVals);
    setInitialHeader((s) => ({ ...s, ...headerVals }));
    setPartnerId(res.header?.partner_id);
    setLines((res.lines || []).map((l: any) => {
      const price = docType === 'GRN' || docType === 'PO' || docType === 'PR' ? (l.price || 0) : l.price;
      return {
        key: uid(), item_id: l.item_id, item_code: l.item_code, item_name: l.item_name, spec: l.spec, uom: l.uom,
        qty: l.remain_qty || l.qty, price, discount_rate: l.discount_rate || 0, tax_rate: l.tax_rate || 13,
        warehouse_id: l.warehouse_id, source_line_id: l.id, remark: l.remark || '',
      };
    }));
    setSourceOpen(false);
    message.success(`已从 ${res.source?.doc_no} 引入 ${res.lines?.length || 0} 行明细`);
  };

  // ---------- 明细编辑 ----------
  const addLine = () => setLines((prev) => [...prev, { key: uid(), qty: 1, price: 0, discount_rate: 0, tax_rate: 13 }]);
  const updateLine = (key: string, patch: Partial<LineRow>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const totals = useMemo(() => {
    if (isInvoiceMode) {
      const total = round2(lines.reduce((s, l) => s + (Number(l.price) || 0), 0));
      return { subtotal: total, tax: 0, total };
    }
    let subtotal = 0, tax = 0;
    for (const l of lines) { const c = calcLine(l); subtotal += c.amount; tax += c.tax; }
    return { subtotal: round2(subtotal), tax: round2(tax), total: round2(subtotal + tax) };
  }, [lines, isInvoiceMode]);

  const onPickItem = (key: string, opt: any) => {
    const raw = opt?.data || opt || {};
    const isPurchase = ['PO', 'GRN', 'PR'].includes(docType);
    const price = isPurchase ? (raw.price_purchase || 0) : (raw.price_sale || 0);
    updateLine(key, {
      item_id: raw.value ?? opt?.value,
      item_code: raw.code,
      item_name: raw.label ?? raw.name,
      spec: raw.spec,
      uom: raw.uom,
      tax_rate: raw.tax_rate ?? 13,
      price: price || 0,
    });
  };

  const onPickInvoice = (key: string, opt: any) => {
    const raw = opt?.data || opt || {};
    updateLine(key, {
      invoice_id: raw.value ?? opt?.value,
      invoice_no: raw.label ?? raw.invoice_no,
      remain_amount: raw.remain_amount,
      price: raw.remain_amount,
      due_date: raw.due_date,
    });
  };

  // 一键核销全部未结发票
  const autoAllocate = async () => {
    const pid = headerForm.getFieldValue('partner_id');
    if (!pid) { message.warning('请先选择往来单位'); return; }
    try {
      const rows: any[] = await api.get('/api/meta/options', {
        type: 'invoice', partnerId: pid, invoiceType: docType === 'PY' ? 'AP' : 'AR', limit: 100,
      });
      const open = rows.filter((r: any) => (r.remain_amount || 0) > 0);
      if (!open.length) { message.info('没有可核销的未结发票'); return; }
      setLines(open.map((r: any) => ({
        key: uid(), invoice_id: r.value, invoice_no: r.label, remain_amount: r.remain_amount,
        price: r.remain_amount, due_date: r.due_date, remark: '',
      })));
      message.success(`已引入 ${open.length} 张未结发票`);
    } catch (e: any) {
      message.error(e?.message || '获取发票失败');
    }
  };

  // ---------- 保存 ----------
  const buildPayload = async () => {
    const values = await headerForm.validateFields();
    const header: Record<string, any> = {};
    for (const [k, v] of Object.entries(values)) {
      header[k] = dayjs.isDayjs(v) ? dayjs(v).format('YYYY-MM-DD') : v;
    }
    const payloadLines = lines.map((l) => {
      if (isInvoiceMode) {
        return { invoice_id: l.invoice_id, amount: l.price, remark: l.remark, invoice_no: l.invoice_no };
      }
      return {
        item_id: l.item_id, qty: l.qty, price: l.price, discount_rate: l.discount_rate,
        tax_rate: l.tax_rate, warehouse_id: l.warehouse_id, batch_no: l.batch_no,
        remark: l.remark, source_line_id: l.source_line_id,
      };
    });
    if (!payloadLines.length) throw new Error('请至少添加一行明细');
    if (!isInvoiceMode && payloadLines.some((l) => !l.item_id)) throw new Error('存在未选择物料的行');
    if (!isInvoiceMode && payloadLines.some((l) => !(Number(l.qty) > 0))) throw new Error('明细数量必须大于 0');
    if (isInvoiceMode && payloadLines.some((l) => !l.invoice_id)) throw new Error('存在未选择发票的行');
    return { doc_type: docType, ...header, lines: payloadLines };
  };

  const doSave = async (thenSubmit = false) => {
    try {
      setSaving(true);
      const payload = await buildPayload();
      let res: any;
      if (isNew) {
        res = await api.post('/api/documents', payload);
      } else {
        res = await api.put(`/api/documents/${doc?.id}`, payload);
      }
      if (thenSubmit) {
        await api.post(`/api/documents/${res.id}/action`, { action: 'submit' });
        message.success('保存并提交成功');
      } else {
        message.success('保存成功');
      }
      navigate(`${basePath}/${res.id || payload.doc_type ? res.id : doc?.id}`, { replace: true });
      if (!isNew) await loadDoc(String(doc.id));
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const doPrint = async () => {
    if (doc?.id) {
      try { await api.post(`/api/documents/${doc.id}/printed`); } catch { /* 忽略打印计数失败 */ }
    }
    setTimeout(() => window.print(), 120);
  };

  const runAction = async (action: string, label: string) => {
    try {
      await api.post(`/api/documents/${doc.id}/action`, { action });
      message.success(`${label}成功`);
      await loadDoc(String(doc.id));
    } catch (e: any) {
      message.error(e?.message || `${label}失败`);
    }
  };

  const confirmAction = (action: string, label: string) => {
    modal.confirm({
      title: `确认${label}单据 ${doc.doc_no}？`,
      content: action === 'approve' ? '审核后将自动生成库存变动、应收应付与会计凭证，且单据不可再修改。' : undefined,
      okText: '确认', cancelText: '取消',
      onOk: () => runAction(action, label),
    });
  };

  // ---------- 明细列 ----------
  const lineFields = dt?.lines?.fields || ['item_id', 'qty', 'price', 'remark'];
  const showCol = (k: string) => lineFields.includes(k) || lineFields.includes('amount');

  const itemColumns: ColumnsType<LineRow> = [
    {
      title: '序号', width: 50, align: 'center', render: (_: any, __: any, i: number) => <span className="text-muted">{i + 1}</span>,
    },
    {
      title: '物料', dataIndex: 'item_id', width: 280,
      render: (_: any, r: LineRow) => editable ? (
        <div>
          <EntitySelect type="item" size="small" value={r.item_id} placeholder="搜索物料编码/名称"
            onChange={(v, o) => { if (v) onPickItem(r.key, o); else updateLine(r.key, { item_id: undefined, item_code: '', item_name: '' }); }}
            onPick={(o) => onPickItem(r.key, o)} style={{ width: '100%' }} />
          {r.spec && <div style={{ fontSize: 11, color: '#8b98ab', marginTop: 2 }}>{r.spec} / {r.uom}</div>}
        </div>
      ) : (
        <div><div>{r.item_name}</div><div style={{ fontSize: 11, color: '#8b98ab' }}>{r.item_code} {r.spec}</div></div>
      ),
    },
    { title: '单位', dataIndex: 'uom', width: 60, align: 'center', render: (v: any) => v || '-' },
    {
      title: '数量', dataIndex: 'qty', width: 100, align: 'right',
      render: (_: any, r: LineRow) => editable
        ? <InputNumber size="small" style={{ width: '100%' }} min={0} precision={2} value={r.qty as any} onChange={(v) => updateLine(r.key, { qty: v })} />
        : r.qty,
    },
    ...(showCol('price') ? [{
      title: '单价', dataIndex: 'price', width: 110, align: 'right' as const,
      render: (_: any, r: LineRow) => editable
        ? <InputNumber size="small" style={{ width: '100%' }} min={0} precision={2} value={r.price as any} onChange={(v) => updateLine(r.key, { price: v })} />
        : fmtMoney(r.price),
    }] : []),
    ...(showCol('discount_rate') ? [{
      title: '折扣%', dataIndex: 'discount_rate', width: 80, align: 'right' as const,
      render: (_: any, r: LineRow) => editable
        ? <InputNumber size="small" style={{ width: '100%' }} min={0} max={100} precision={2} value={r.discount_rate as any} onChange={(v) => updateLine(r.key, { discount_rate: v })} />
        : (r.discount_rate || 0),
    }] : []),
    ...(showCol('tax_rate') ? [{
      title: '税率%', dataIndex: 'tax_rate', width: 80, align: 'right' as const,
      render: (_: any, r: LineRow) => editable
        ? <InputNumber size="small" style={{ width: '100%' }} min={0} max={100} precision={2} value={r.tax_rate as any} onChange={(v) => updateLine(r.key, { tax_rate: v })} />
        : (r.tax_rate || 0),
    }] : []),
    {
      title: '金额', dataIndex: 'amount', width: 110, align: 'right',
      render: (_: any, r: LineRow) => <span className="num">{fmtMoney(editable ? calcLine(r).amount : r.amount)}</span>,
    },
    ...(showCol('tax_rate') ? [{
      title: '税额', dataIndex: 'tax_amount', width: 100, align: 'right' as const,
      render: (_: any, r: LineRow) => <span className="num">{fmtMoney(editable ? calcLine(r).tax : r.tax_amount)}</span>,
    }] : []),
    ...(lineFields.includes('batch_no') || lineFields.includes('warehouse_id') ? [{
      title: '批号/仓库', dataIndex: 'batch_no', width: 120,
      render: (_: any, r: LineRow) => editable
        ? <Input size="small" value={r.batch_no} placeholder="批号" onChange={(e) => updateLine(r.key, { batch_no: e.target.value })} />
        : (r.batch_no || '-'),
    }] : []),
    {
      title: '备注', dataIndex: 'remark', width: 160,
      render: (_: any, r: LineRow) => editable
        ? <Input size="small" value={r.remark} onChange={(e) => updateLine(r.key, { remark: e.target.value })} />
        : (r.remark || '-'),
    },
    ...(editable ? [{
      title: '', width: 48, align: 'center' as const,
      render: (_: any, r: LineRow) => <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeLine(r.key)} />,
    }] : []),
  ];

  const invoiceColumns: ColumnsType<LineRow> = [
    { title: '序号', width: 50, align: 'center', render: (_: any, __: any, i: number) => <span className="text-muted">{i + 1}</span> },
    {
      title: '待核销发票', dataIndex: 'invoice_id', width: 320,
      render: (_: any, r: LineRow) => editable ? (
        <EntitySelect type="invoice" invoiceType={docType === 'PY' ? 'AP' : 'AR'} partnerId={partnerId} size="small"
          value={r.invoice_id} placeholder="选择该往来单位的未结发票"
          onChange={(v, o) => { if (v) onPickInvoice(r.key, o); else updateLine(r.key, { invoice_id: undefined, invoice_no: '' }); }}
          onPick={(o) => onPickInvoice(r.key, o)} style={{ width: '100%' }} />
      ) : (
        <div><div>{r.invoice_no}</div><div style={{ fontSize: 11, color: '#8b98ab' }}>到期日 {r.due_date || '-'}</div></div>
      ),
    },
    { title: '发票余额', dataIndex: 'remain_amount', width: 130, align: 'right', render: (v: any, r: LineRow) => <span className="num">{fmtMoney(v ?? r.price)}</span> },
    {
      title: '本次核销金额', dataIndex: 'price', width: 150, align: 'right',
      render: (_: any, r: LineRow) => editable
        ? <InputNumber size="small" style={{ width: '100%' }} min={0} precision={2} value={r.price as any} onChange={(v) => updateLine(r.key, { price: v })} />
        : <span className="num">{fmtMoney(r.price)}</span>,
    },
    {
      title: '备注', dataIndex: 'remark', width: 200,
      render: (_: any, r: LineRow) => editable ? <Input size="small" value={r.remark} onChange={(e) => updateLine(r.key, { remark: e.target.value })} /> : (r.remark || '-'),
    },
    ...(editable ? [{
      title: '', width: 48, align: 'center' as const,
      render: (_: any, r: LineRow) => <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeLine(r.key)} />,
    }] : []),
  ];

  // ---------- 渲染 ----------
  if (metaLoading || (loading && !isNew)) {
    return <div style={{ padding: 120, textAlign: 'center' }}><Spin size="large" tip="加载中…" /></div>;
  }
  if (!dt) return <Empty description="单据类型不存在" />;

  const viewValues = (dt.fields || []).map((f: any) => {
    let v = doc?.[f.key];
    if (f.type === 'date') v = v ? dayjs(v).format('YYYY-MM-DD') : '-';
    if (f.type === 'currency') v = v || 'CNY';
    // 关联字段展示名称而不是 ID
    if (f.key === 'partner_id') v = doc?.partner_name || v;
    if (f.key === 'warehouse_id') v = doc?.warehouse_name || v;
    if (f.key === 'to_warehouse_id') v = doc?.to_warehouse_name || v;
    if (f.key === 'salesperson_id') v = doc?.salesperson_name || v;
    if (f.key === 'department_id') v = doc?.department_name || v;
    if (v === undefined || v === null || v === '') v = '-';
    return { key: f.key, label: f.label, value: v };
  });

  const actionButtons = () => {
    if (editable) {
      return (
        <>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(listPath || basePath)}>返回</Button>
          {dt.sources?.length > 0 && (
            <Button icon={<FileAddOutlined />} onClick={() => setSourceOpen(true)}>从源单生成</Button>
          )}
          {!isNew && <Button icon={<PrinterOutlined />} onClick={doPrint}>打印</Button>}
          <Button icon={<SaveOutlined />} loading={saving} onClick={() => doSave(false)}>保存草稿</Button>
          <Button type="primary" icon={<SendOutlined />} loading={saving} onClick={() => doSave(true)}>保存并提交</Button>
        </>
      );
    }
    return (
      <>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(listPath || basePath)}>返回</Button>
        <Button icon={<PrinterOutlined />} onClick={doPrint}>打印</Button>
        {(doc?.actions || []).map((a: any) => (
          <Button
            key={a.action}
            type={a.action === 'approve' ? 'primary' : 'default'}
            danger={a.action === 'void'}
            icon={a.action === 'approve' ? <CheckOutlined /> : undefined}
            onClick={() => (a.confirm ? confirmAction(a.action, a.label) : runAction(a.action, a.label))}
          >
            {a.label}
          </Button>
        ))}
      </>
    );
  };

  return (
    <div>
      <PageHeader
        title={
          <Space size={10}>
            <span>{isNew ? `新建${docTypeName}` : doc?.doc_no || docTypeName}</span>
            {!isNew && <StatusTag status={status} docType={docType} />}
          </Space>
        }
        subtitle={
          isNew
            ? `请填写${docTypeName}信息，保存后可提交审批`
            : `单据日期 ${doc?.doc_date} · 制单人 ${doc?.created_by_name || '-'} · 金额 ￥${fmtMoney(doc?.total_amount)}`
        }
        extra={actionButtons()}
      />

      <div className="card card-pad">
        <div className="card-title" style={{ marginBottom: 16 }}><span className="dot" />基本信息</div>
        {editable ? (
          <SchemaForm
            fields={headerFields}
            form={headerForm}
            initialValues={initialHeader}
            onValuesChange={(changed) => {
              if (changed.partner_id !== undefined) setPartnerId(changed.partner_id);
            }}
          />
        ) : (
          <Descriptions column={3} size="small" items={viewValues.map((v: any) => ({ key: v.key, label: v.label, children: v.value }))} />
        )}
      </div>

      <div className="card mt-14">
        <div className="card-head">
          <div className="card-title"><span className="dot" />{isInvoiceMode ? '核销明细' : '单据明细'}</div>
          {editable && (
            <Space>
              {isInvoiceMode && <Button size="small" icon={<ThunderboltOutlined />} onClick={autoAllocate}>一键核销全部</Button>}
              <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addLine}>添加明细行</Button>
            </Space>
          )}
        </div>
        <Table
          className="doc-lines-edit"
          rowKey="key"
          size="small"
          columns={isInvoiceMode ? invoiceColumns : itemColumns}
          dataSource={lines}
          pagination={false}
          scroll={{ x: 1100 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无明细，请添加" /> }}
        />
        <div className="doc-total-bar">
          <div className="doc-total-item">
            <div className="label">明细行数</div>
            <div className="value">{lines.length}</div>
          </div>
          {!isInvoiceMode && (
            <>
              <div className="doc-total-item">
                <div className="label">未税金额</div>
                <div className="value">￥{fmtMoney(totals.subtotal)}</div>
              </div>
              <div className="doc-total-item">
                <div className="label">税额合计</div>
                <div className="value">￥{fmtMoney(totals.tax)}</div>
              </div>
            </>
          )}
          <div className="doc-total-item grand">
            <div className="label">{isInvoiceMode ? '核销合计' : '价税合计'}</div>
            <div className="value">￥{fmtMoney(totals.total)}</div>
          </div>
        </div>
      </div>

      {!isNew && (
        <div className="grid-2 mt-14">
          <div className="card">
            <div className="card-head"><div className="card-title"><span className="dot" />关联凭证与发票</div></div>
            <div className="card-pad">
              <Row gutter={16}>
                <Col span={8}>
                  <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>关联单据</div>
                  {doc?.sourceDoc && (
                    <div style={{ padding: '6px 0', borderBottom: '1px solid #f0f2f7' }}>
                      <Tag color="blue">上游</Tag>
                      <a onClick={() => navigate(`${routeOf(doc.sourceDoc.doc_type)}/${doc.sourceDoc.id}`)}>{doc.sourceDoc.doc_no}</a>
                      <div className="text-muted" style={{ fontSize: 11 }}>{doc.sourceDoc.doc_date}</div>
                    </div>
                  )}
                  {(doc?.relatedDocs || []).map((r: any) => (
                    <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid #f0f2f7' }}>
                      <Tag color="green">下游</Tag>
                      <a onClick={() => navigate(`${routeOf(r.doc_type)}/${r.id}`)}>{r.doc_no}</a>
                      <span className="num" style={{ float: 'right', fontSize: 12 }}>￥{fmtMoney(r.total_amount)}</span>
                      <div className="text-muted" style={{ fontSize: 11 }}>{r.doc_date} · {r.status}</div>
                    </div>
                  ))}
                  {!doc?.sourceDoc && (doc?.relatedDocs || []).length === 0 && <div className="text-muted">无关联单据</div>}
                </Col>
                <Col span={8}>
                  <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>生成的会计凭证</div>
                  {(doc?.vouchers || []).length === 0 && <div className="text-muted">无（该单据不过账或未审核）</div>}
                  {(doc?.vouchers || []).map((v: any) => (
                    <div key={v.id} style={{ padding: '6px 0', borderBottom: '1px solid #f0f2f7' }}>
                      <a onClick={() => navigate(`/finance/vouchers/${v.id}`)}>{v.voucher_no}</a>
                      <div className="text-muted" style={{ fontSize: 11 }}>{v.summary}</div>
                      <span className="num" style={{ fontSize: 12 }}>￥{fmtMoney(v.total_debit)}</span>
                    </div>
                  ))}
                </Col>
                <Col span={8}>
                  <div className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>应收/应付发票</div>
                  {(doc?.invoices || []).length === 0 && <div className="text-muted">无</div>}
                  {(doc?.invoices || []).map((v: any) => (
                    <div key={v.id} style={{ padding: '6px 0', borderBottom: '1px solid #f0f2f7' }}>
                      <a onClick={() => navigate('/finance/invoices')}>{v.invoice_no}</a>
                      <StatusTag color={v.status === '已收' || v.status === '已付' ? 'success' : 'warning'} label={v.status} />
                      <span className="num" style={{ float: 'right', fontSize: 12 }}>￥{fmtMoney(v.total_amount)}</span>
                      <div className="text-muted" style={{ fontSize: 11 }}>到期 {v.due_date || '-'}</div>
                    </div>
                  ))}
                </Col>
              </Row>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><div className="card-title"><span className="dot" />操作日志</div></div>
            <div className="card-pad" style={{ maxHeight: 300, overflowY: 'auto' }}>
              <Timeline
                items={(doc?.logs || []).map((l: any) => ({
                  color: l.action === '审核' ? 'green' : l.action === '作废' ? 'red' : 'blue',
                  children: (
                    <div>
                      <b>{l.action}</b>
                      <span className="text-muted" style={{ marginLeft: 8, fontSize: 12 }}>{l.user_name} · {l.created_at}</span>
                      {l.remark && <div className="text-muted" style={{ fontSize: 12 }}>{l.remark}</div>}
                    </div>
                  ),
                }))}
              />
            </div>
          </div>
        </div>
      )}

      <SourcePickerModal
        open={sourceOpen}
        sources={dt.sources || []}
        targetType={docType}
        onCancel={() => setSourceOpen(false)}
        onPick={(res) => applySource(res)}
      />

      {/* 打印区域：始终渲染，打印时通过 CSS 显示 */}
      <div id="print-area">
        <DocPrint
          doc={{
            ...(doc || {}),
            ...Object.fromEntries(Object.entries(headerForm.getFieldsValue()).map(([k, v]: any) => [k, dayjs.isDayjs(v) ? dayjs(v).format('YYYY-MM-DD') : v])),
            doc_no: doc?.doc_no || '（未保存草稿）',
            doc_date: doc?.doc_date || (dayjs.isDayjs(headerForm.getFieldValue('doc_date')) ? headerForm.getFieldValue('doc_date').format('YYYY-MM-DD') : todayStr()),
            partner_name: doc?.partner_name || (headerFields.some((f) => f.key === 'partner_id') ? '' : '-'),
            created_by_name: doc?.created_by_name || '当前用户',
          }}
          lines={lines.map((l) => ({ ...l, ...(isInvoiceMode ? { item_name: l.invoice_no, amount: l.price, total_amount: l.price, qty: 1 } : {}), amount: isInvoiceMode ? l.price : calcLine(l).amount, tax_amount: isInvoiceMode ? 0 : calcLine(l).tax, total_amount: isInvoiceMode ? l.price : calcLine(l).total }))}
          docTypeName={docTypeName}
          statusLabel={meta?.docTypes?.[docType]?.statuses?.find((s: any) => s.value === status)?.label || status}
        />
      </div>
    </div>
  );
}

function SourcePickerModal({ open, sources, targetType, onCancel, onPick }: { open: boolean; sources: string[]; targetType: string; onCancel: () => void; onPick: (res: any) => void }) {
  const { message } = App.useApp();
  const [sourceType, setSourceType] = useState(sources[0]);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => { if (open) setSourceType(sources[0]); }, [open, sources]);

  const columns: ColumnsType<any> = [
    { title: '单据编号', dataIndex: 'doc_no', width: 160 },
    { title: '日期', dataIndex: 'doc_date', width: 110 },
    { title: '往来单位', dataIndex: 'partner_name', ellipsis: true },
    { title: '金额', dataIndex: 'total_amount', width: 120, align: 'right', render: (v: number) => <span className="num">{fmtMoney(v)}</span> },
    { title: '状态', dataIndex: 'status', width: 100, render: (v: string) => <StatusTag status={v} docType={sourceType} /> },
    {
      title: '', width: 80, render: (_: any, r: any) => (
        <Button type="link" size="small" onClick={async () => {
          try {
            setLoading(true);
            const res = await api.get('/api/documents/pull', { sourceId: r.id, docType: targetType });
            if (!res.lines?.length) { message.warning('该源单已全部执行完毕，无剩余可引用明细'); return; }
            onPick(res);
          } catch (e: any) {
            message.error(e?.message || '读取源单失败');
          } finally {
            setLoading(false);
          }
        }}>选择</Button>
      ),
    },
  ];

  return (
    <Modal open={open} onCancel={onCancel} footer={null} width={900} title={`从源单生成${targetType === 'DN' ? '发货单' : targetType === 'GRN' ? '入库单' : '单据'}`}>
      <div style={{ marginBottom: 12 }}>
        <Space>
          <span className="text-muted">源单类型：</span>
          <Select style={{ width: 160 }} value={sourceType} onChange={(v) => { setSourceType(v); setReloadKey((k) => k + 1); }}
            options={sources.map((s) => ({ label: s === 'SO' ? '销售订单' : s === 'PO' ? '采购订单' : s === 'DN' ? '销售发货单' : s === 'GRN' ? '采购入库单' : s, value: s }))} />
        </Space>
      </div>
      <DataTable
        columns={columns}
        load={(params) => api.get('/api/documents', { docType: sourceType, ...params, pageSize: params.pageSize || 10, ...(sourceType === 'SO' || sourceType === 'PO' ? { onlyUnfinished: '1' } : {}) })}
        filters={[{ key: 'dateRange', label: '日期范围', type: 'dateRange' }]}
        rowActions={undefined}
        exportFilename=""
        showIndex={false}
        defaultPageSize={10}
        scrollX={800}
        reloadKey={reloadKey}
      />
      {loading && <div className="text-muted" style={{ marginTop: 8 }}>正在读取源单明细…</div>}
    </Modal>
  );
}

