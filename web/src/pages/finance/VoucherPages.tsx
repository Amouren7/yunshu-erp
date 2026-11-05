/**
 * 会计凭证：列表 / 手工录入 / 凭证详情
 * ------------------------------------------------------------
 * - VouchersPage：期间、类型、状态、关键词筛选 + 分页列表
 * - VoucherNewPage：借贷多行录入，科目选择，实时合计与借贷平衡校验
 * - VoucherDetailPage：凭证分录表格 + 打印
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  App, Button, DatePicker, Descriptions, Divider, Form, Input, InputNumber, Select, Space, Spin, Table, Tag,
} from 'antd';
import {
  ArrowLeftOutlined, DeleteOutlined, PlusOutlined, PrinterOutlined, ReloadOutlined, SaveOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import EntitySelect from '../../components/EntitySelect';
import { useAuth } from '../../store/auth';
import { useMeta } from '../../store/meta';
import { fmtMoney } from '../../utils/format';
import {
  docPathOf, DOC_TYPE_LABEL, VOUCHER_SOURCE_LABEL, VOUCHER_TYPE_LABEL,
  VoucherStatusTag, VoucherTypeTag,
} from './common';

/* ============================================================
 * 凭证列表
 * ============================================================ */
export function VouchersPage() {
  const navigate = useNavigate();
  const { hasPerm } = useAuth();
  const [period, setPeriod] = useState<any>(dayjs());
  const [voucherType, setVoucherType] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const extraParams = useMemo(() => ({
    period: period ? dayjs(period).format('YYYY-MM') : undefined,
    voucherType: voucherType || undefined,
    status: status || undefined,
    keyword: keyword || undefined,
  }), [period, voucherType, status, keyword]);

  const reset = () => {
    setPeriod(dayjs());
    setVoucherType(undefined);
    setStatus(undefined);
    setKeywordInput('');
    setKeyword('');
  };

  const columns: ColumnsType<any> = [
    {
      title: '凭证字号', dataIndex: 'voucher_no', width: 160, fixed: 'left',
      render: (v: string, r: any) => <a onClick={() => navigate(`/finance/vouchers/${r.id}`)} style={{ fontWeight: 500 }}>{v}</a>,
    },
    { title: '凭证日期', dataIndex: 'voucher_date', width: 105 },
    { title: '会计期间', dataIndex: 'period', width: 90, align: 'center' },
    { title: '类型', dataIndex: 'voucher_type', width: 80, align: 'center', render: (v: string) => <VoucherTypeTag type={v} /> },
    { title: '摘要', dataIndex: 'summary', ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '来源', dataIndex: 'source_no', width: 150,
      render: (v: string, r: any) => {
        if (v) {
          const path = docPathOf(r.source_type, r.source_id);
          return path ? <a onClick={() => navigate(path)}>{v}</a> : v;
        }
        return r.source_type ? (VOUCHER_SOURCE_LABEL[r.source_type] || r.source_type) : '-';
      },
    },
    { title: '分录数', dataIndex: 'line_count', width: 75, align: 'center' },
    {
      title: '借方合计', dataIndex: 'total_debit', width: 130, align: 'right',
      render: (v: number) => <span className="num">{fmtMoney(v)}</span>,
    },
    {
      title: '贷方合计', dataIndex: 'total_credit', width: 130, align: 'right',
      render: (v: number) => <span className="num">{fmtMoney(v)}</span>,
    },
    { title: '状态', dataIndex: 'status', width: 90, align: 'center', render: (v: string) => <VoucherStatusTag status={v} /> },
    { title: '制单人', dataIndex: 'created_by_name', width: 90, render: (v: string) => v || '-' },
  ];

  const rowActions = (r: any) => (
    <>
      <Button type="link" size="small" onClick={() => navigate(`/finance/vouchers/${r.id}`)}>查看</Button>
      <Button type="link" size="small" onClick={() => navigate(`/finance/vouchers/${r.id}`)}>分录</Button>
    </>
  );

  return (
    <div>
      <PageHeader
        title="会计凭证"
        subtitle="业务单据审核后自动生成凭证；支持手工凭证录入，借贷平衡后直接过账"
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => setReloadKey((k) => k + 1)}>刷新</Button>
            {hasPerm('finance.create') && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/finance/vouchers/new')}>手工凭证</Button>
            )}
          </>
        }
      />

      <div className="card">
        <div className="filter-bar">
          <DatePicker
            picker="month"
            allowClear
            style={{ width: 150 }}
            value={period}
            onChange={setPeriod}
            placeholder="会计期间"
          />
          <Select
            allowClear
            style={{ width: 130 }}
            placeholder="凭证类型"
            value={voucherType}
            onChange={setVoucherType}
            options={[{ label: '系统生成', value: 'AUTO' }, { label: '手工凭证', value: 'MANUAL' }]}
          />
          <Select
            allowClear
            style={{ width: 120 }}
            placeholder="凭证状态"
            value={status}
            onChange={setStatus}
            options={[{ label: '已过账', value: 'POSTED' }, { label: '草稿', value: 'DRAFT' }]}
          />
          <Input
            allowClear
            style={{ width: 240 }}
            placeholder="凭证号 / 摘要 / 来源类型"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onPressEnter={() => setKeyword(keywordInput)}
          />
          <Button type="primary" onClick={() => setKeyword(keywordInput)}>查询</Button>
          <Button onClick={reset}>重置</Button>
          <div className="toolbar-spacer" />
          <span className="text-muted" style={{ fontSize: 12 }}>审核后自动过账，凭证不可修改</span>
        </div>
      </div>

      <div className="mt-14">
        <DataTable
          columns={columns}
          load={(params) => api.get('/api/finance/vouchers', params)}
          extraParams={extraParams}
          search={false}
          filters={[]}
          rowActions={rowActions}
          reloadKey={reloadKey}
          exportFilename={`会计凭证_${dayjs().format('YYYYMMDD')}`}
          scrollX={1500}
          defaultPageSize={20}
        />
      </div>
    </div>
  );
}

/* ============================================================
 * 手工凭证录入
 * ============================================================ */
interface VLine {
  key: string;
  account_code?: string;
  account_name?: string;
  summary?: string;
  debit: number | null;
  credit: number | null;
}

let lineSeq = 0;
const newLine = (): VLine => ({ key: `vl_${Date.now()}_${lineSeq++}`, debit: null, credit: null });

export function VoucherNewPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [date, setDate] = useState<any>(dayjs());
  const [summary, setSummary] = useState('手工凭证');
  const [lines, setLines] = useState<VLine[]>([newLine(), newLine()]);
  const [saving, setSaving] = useState(false);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
  const balanced = Math.abs(diff) <= 0.01 && totalDebit > 0;

  const patch = (key: string, p: Partial<VLine>) => setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const removeLine = (key: string) => setLines((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.key !== key)));

  const submit = async () => {
    if (!date) { message.warning('请选择凭证日期'); return; }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const no = i + 1;
      if (!l.account_code) { message.error(`第 ${no} 行请选择会计科目`); return; }
      const d = Number(l.debit) || 0;
      const c = Number(l.credit) || 0;
      if (d <= 0 && c <= 0) { message.error(`第 ${no} 行借贷金额不能同时为 0`); return; }
      if (d > 0 && c > 0) { message.error(`第 ${no} 行不能同时填写借方和贷方金额`); return; }
    }
    if (totalDebit <= 0) { message.warning('凭证金额合计必须大于 0'); return; }
    if (!balanced) { message.error(`借贷不平衡：借方 ${fmtMoney(totalDebit)}，贷方 ${fmtMoney(totalCredit)}`); return; }
    setSaving(true);
    try {
      const res = await api.post('/api/finance/vouchers', {
        voucher_date: dayjs(date).format('YYYY-MM-DD'),
        summary: summary || '手工凭证',
        lines: lines.map((l) => ({
          account_code: l.account_code,
          summary: l.summary || summary || '手工凭证',
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
        })),
      });
      message.success(`凭证 ${res?.voucher_no || ''} 已保存并过账`);
      navigate(`/finance/vouchers/${res?.id}`);
    } catch (e: any) {
      message.error(e?.message || '凭证保存失败');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<VLine> = [
    {
      title: '行次', key: 'idx', width: 56, align: 'center',
      render: (_: any, __: VLine, i: number) => <span className="text-muted num">{i + 1}</span>,
    },
    {
      title: <span className="required-star">会计科目</span>, dataIndex: 'account_code', width: 300,
      render: (v: string, r: VLine) => (
        <EntitySelect
          type="account"
          size="small"
          style={{ width: '100%' }}
          value={v}
          fallbackLabel={r.account_name}
          placeholder="选择会计科目"
          onChange={(val: any, opt: any) => patch(r.key, { account_code: val, account_name: opt?.label || '' })}
        />
      ),
    },
    {
      title: '摘要', dataIndex: 'summary', minWidth: 220,
      render: (v: string, r: VLine) => (
        <Input
          size="small"
          placeholder={summary || '分录摘要（默认取凭证摘要）'}
          value={v}
          onChange={(e) => patch(r.key, { summary: e.target.value })}
        />
      ),
    },
    {
      title: '借方金额', dataIndex: 'debit', width: 150, align: 'right',
      render: (v: number, r: VLine) => (
        <InputNumber
          size="small"
          min={0}
          precision={2}
          style={{ width: '100%' }}
          placeholder="0.00"
          value={v as any}
          onChange={(val) => patch(r.key, { debit: val as any, credit: val ? 0 : r.credit })}
        />
      ),
    },
    {
      title: '贷方金额', dataIndex: 'credit', width: 150, align: 'right',
      render: (v: number, r: VLine) => (
        <InputNumber
          size="small"
          min={0}
          precision={2}
          style={{ width: '100%' }}
          placeholder="0.00"
          value={v as any}
          onChange={(val) => patch(r.key, { credit: val as any, debit: val ? 0 : r.debit })}
        />
      ),
    },
    {
      title: '', key: 'op', width: 60, align: 'center',
      render: (_: any, r: VLine) => (
        <Button type="link" size="small" danger icon={<DeleteOutlined />} disabled={lines.length <= 1} onClick={() => removeLine(r.key)} />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="手工凭证录入"
        subtitle="借贷分录平衡后方可保存，保存即过账（POSTED），凭证不可修改"
        back={<Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/finance/vouchers')} style={{ paddingLeft: 0 }} />}
        extra={
          <Space>
            <Button onClick={() => navigate('/finance/vouchers')}>取消</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={submit}>保存凭证</Button>
          </Space>
        }
      />

      <div className="card">
        <div className="card-head">
          <div className="card-title"><span className="dot" />凭证信息</div>
          <span className="text-muted" style={{ fontSize: 12 }}>手工凭证 · 保存后由系统生成凭证字号并过账</span>
        </div>
        <div className="card-pad">
          <Form layout="inline">
            <Form.Item label="凭证日期" required>
              <DatePicker value={date} onChange={setDate} style={{ width: 170 }} />
            </Form.Item>
            <Form.Item label="凭证摘要">
              <Input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                style={{ width: 420 }}
                placeholder="输入凭证摘要，如：计提本月折旧"
                maxLength={200}
              />
            </Form.Item>
          </Form>
        </div>
      </div>

      <div className="card mt-14">
        <div className="card-head">
          <div className="card-title"><span className="dot" />凭证分录</div>
          <Button size="small" icon={<PlusOutlined />} onClick={() => setLines((rows) => [...rows, newLine()])}>添加分录行</Button>
        </div>
        <div className="card-pad doc-lines-edit" style={{ paddingBottom: 8 }}>
          <Table
            rowKey="key"
            columns={columns}
            dataSource={lines}
            pagination={false}
            size="small"
            scroll={{ x: 1000 }}
            locale={{ emptyText: '暂无分录，点击「添加分录行」开始录入' }}
          />
        </div>
        <div className="doc-total-bar">
          <div className="doc-total-item">
            <div className="label">借方合计</div>
            <div className="value num">{fmtMoney(totalDebit)}</div>
          </div>
          <div className="doc-total-item">
            <div className="label">贷方合计</div>
            <div className="value num">{fmtMoney(totalCredit)}</div>
          </div>
          <div className="doc-total-item">
            <div className="label">借贷差额</div>
            <div className="value num" style={{ color: balanced ? 'var(--success)' : 'var(--danger)' }}>
              {fmtMoney(diff)}
            </div>
          </div>
          <div className="doc-total-item grand">
            <div className="label">平衡校验</div>
            <div className="value" style={{ color: balanced ? 'var(--success)' : 'var(--danger)', fontSize: 16 }}>
              {balanced ? '借贷平衡' : '未平衡'}
            </div>
          </div>
        </div>
      </div>

      <div className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
        提示：每行只能填写借方或贷方其中一个金额；科目由「科目映射」与总账科目表维护，非明细科目不可使用。
      </div>
    </div>
  );
}

/* ============================================================
 * 凭证详情
 * ============================================================ */
export function VoucherDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { meta } = useMeta();
  const req = useRequest(() => api.get(`/api/finance/vouchers/${id}`), [id]);
  const data = req.data;
  const lines = data?.lines || [];
  const company = meta?.settings?.company_name || '云枢科技（深圳）有限公司';

  const lineColumns: ColumnsType<any> = [
    { title: '行次', dataIndex: 'line_no', width: 60, align: 'center' },
    { title: '摘要', dataIndex: 'summary', minWidth: 220, ellipsis: true, render: (v: string) => v || '-' },
    { title: '科目编码', dataIndex: 'account_code', width: 110 },
    {
      title: '科目名称', dataIndex: 'account_name', width: 180,
      render: (v: string, r: any) => (
        <span>
          {v || '-'}
          {r.category ? <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>{r.category}</span> : null}
        </span>
      ),
    },
    {
      title: '往来单位', dataIndex: 'partner_name', width: 200, ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '借方金额', dataIndex: 'debit', width: 140, align: 'right',
      render: (v: number) => (Number(v) ? <span className="num">{fmtMoney(v)}</span> : <span className="text-muted">-</span>),
    },
    {
      title: '贷方金额', dataIndex: 'credit', width: 140, align: 'right',
      render: (v: number) => (Number(v) ? <span className="num">{fmtMoney(v)}</span> : <span className="text-muted">-</span>),
    },
  ];

  const totalDebit = Number(data?.total_debit) || 0;
  const totalCredit = Number(data?.total_credit) || 0;
  const sourcePath = docPathOf(data?.source_doc?.doc_type, data?.source_doc?.id);

  return (
    <div>
      <PageHeader
        title={`记账凭证 ${data?.voucher_no || ''}`}
        subtitle={data ? `${data.voucher_date} · 会计期间 ${data.period} · ${VOUCHER_TYPE_LABEL[data.voucher_type] || data.voucher_type}` : '凭证详情'}
        back={<Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/finance/vouchers')} style={{ paddingLeft: 0 }} />}
        extra={
          <Space>
            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>打印凭证</Button>
            <Button onClick={() => navigate('/finance/vouchers')}>返回列表</Button>
          </Space>
        }
      />

      {req.loading ? (
        <div style={{ padding: 80, textAlign: 'center' }}><Spin tip="加载中…" /></div>
      ) : !data ? (
        <div className="card"><div className="empty-hint">{req.error || '凭证不存在'}</div></div>
      ) : (
        <>
          <div className="card">
            <div className="card-head">
              <div className="card-title"><span className="dot" />凭证信息</div>
              <Space>
                <VoucherTypeTag type={data.voucher_type} />
                <VoucherStatusTag status={data.status} />
              </Space>
            </div>
            <div className="card-pad">
              <Descriptions
                bordered
                size="small"
                column={3}
                items={[
                  { key: 'voucher_no', label: '凭证字号', children: data.voucher_no },
                  { key: 'voucher_date', label: '凭证日期', children: data.voucher_date },
                  { key: 'period', label: '会计期间', children: data.period },
                  { key: 'voucher_type', label: '凭证类型', children: VOUCHER_TYPE_LABEL[data.voucher_type] || data.voucher_type },
                  { key: 'status', label: '凭证状态', children: data.status === 'POSTED' ? '已过账' : '草稿' },
                  { key: 'created_by_name', label: '制单人', children: data.created_by_name || '-' },
                  {
                    key: 'source', label: '来源单据',
                    children: sourcePath ? <a onClick={() => navigate(sourcePath)}>{data.source_doc.doc_no}</a>
                      : (data.source_doc?.doc_no || VOUCHER_SOURCE_LABEL[data.source_type] || '-'),
                  },
                  { key: 'posted_at', label: '过账时间', children: data.posted_at || data.created_at || '-' },
                  { key: 'line_count', label: '分录行数', children: `${lines.length} 行` },
                  { key: 'summary', label: '凭证摘要', span: 3, children: data.summary || '-' },
                  { key: 'total_debit', label: '借方合计', children: <b className="num">￥{fmtMoney(totalDebit)}</b> },
                  { key: 'total_credit', label: '贷方合计', children: <b className="num">￥{fmtMoney(totalCredit)}</b> },
                  {
                    key: 'balanced', label: '平衡校验',
                    children: Math.abs(totalDebit - totalCredit) <= 0.01
                      ? <Tag color="green">借贷平衡</Tag>
                      : <Tag color="red">借贷不平衡</Tag>,
                  },
                ]}
              />
              {sourcePath && data.source_doc && (
                <div className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
                  来源单据：{data.source_doc.doc_no}（{DOC_TYPE_LABEL[data.source_doc.doc_type] || data.source_doc.doc_type} · {data.source_doc.doc_date}）
                  <Divider type="vertical" />
                  <a onClick={() => navigate(sourcePath)}>查看来源单据 →</a>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="card-title"><span className="dot" />凭证分录</div>
              <span className="text-muted" style={{ fontSize: 12 }}>共 {lines.length} 行</span>
            </div>
            <Table
              rowKey={(r: any) => r.id || r.line_no}
              columns={lineColumns}
              dataSource={lines}
              pagination={false}
              size="small"
              scroll={{ x: 1000 }}
              locale={{ emptyText: '该凭证没有分录明细' }}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row style={{ fontWeight: 600, background: '#f7f9fd' }}>
                    <Table.Summary.Cell index={0} colSpan={5} align="right">合计</Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <span className="num">{fmtMoney(totalDebit)}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      <span className="num">{fmtMoney(totalCredit)}</span>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </div>
        </>
      )}

      {/* 打印区域：始终渲染，打印时通过 CSS 显示 */}
      <div id="print-area">
        <div className="print-sheet">
          <div className="print-head">
            <div className="print-company">{company}</div>
            <div className="print-docname">记 账 凭 证</div>
          </div>
          <div className="print-meta">
            <div><span>凭证字号：</span>{data?.voucher_no || '-'}</div>
            <div><span>凭证日期：</span>{data?.voucher_date || '-'}</div>
            <div><span>会计期间：</span>{data?.period || '-'}</div>
            <div><span>凭证类型：</span>{VOUCHER_TYPE_LABEL[data?.voucher_type] || '-'}</div>
            <div><span>来源单据：</span>{data?.source_doc?.doc_no || VOUCHER_SOURCE_LABEL[data?.source_type] || '-'}</div>
            <div><span>制单人：</span>{data?.created_by_name || '-'}</div>
          </div>
          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>行次</th>
                <th>摘要</th>
                <th style={{ width: 100 }}>科目编码</th>
                <th style={{ width: 150 }}>科目名称</th>
                <th className="num" style={{ width: 120 }}>借方金额</th>
                <th className="num" style={{ width: 120 }}>贷方金额</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l: any) => (
                <tr key={l.id || l.line_no}>
                  <td>{l.line_no}</td>
                  <td>{l.summary || '-'}</td>
                  <td>{l.account_code}</td>
                  <td>{l.account_name || '-'}</td>
                  <td className="num">{Number(l.debit) ? fmtMoney(l.debit) : ''}</td>
                  <td className="num">{Number(l.credit) ? fmtMoney(l.credit) : ''}</td>
                </tr>
              ))}
              {lines.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#8b98ab', padding: 20 }}>无分录</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ textAlign: 'right' }}>合计</td>
                <td className="num">{fmtMoney(totalDebit)}</td>
                <td className="num">{fmtMoney(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
          <div style={{ marginTop: 14, fontSize: 12, color: '#5b6b82' }}>
            摘要：{data?.summary || '-'}　【{Math.abs(totalDebit - totalCredit) <= 0.01 ? '借贷平衡' : '借贷不平衡'}】
          </div>
          <div className="print-sign">
            <div>制单人：{data?.created_by_name || ''}</div>
            <div>审核人：</div>
            <div>记账人：</div>
            <div>出纳：</div>
          </div>
        </div>
      </div>
    </div>
  );
}
