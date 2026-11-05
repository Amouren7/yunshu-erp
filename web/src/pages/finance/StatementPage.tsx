/**
 * /finance/statements 财务报表
 * ------------------------------------------------------------
 * 期间选择（月份）+ Tabs：利润表 / 资产负债表 / 现金流量表
 * 屏幕用 Table 排版（本月数 + 本年累计），打印使用 print-sheet 样式类，
 * 通过 window.print() 输出 A4 报表（#print-area 打印区）。
 */
import { useMemo, useState } from 'react';
import { Button, DatePicker, Space, Spin, Table, Tabs, Tag } from 'antd';
import { PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useMeta } from '../../store/meta';
import { fmtMoney } from '../../utils/format';
import { indentStyle } from './common';

/* ---------- 资产负债表行 ---------- */
interface BsRow {
  key: string;
  name: string;
  code?: string;
  amount: number;
  level: number;
  group?: boolean;
  total?: boolean;
}

function buildBsRows(groups: any[]): BsRow[] {
  const rows: BsRow[] = [];
  for (const g of groups || []) {
    rows.push({ key: `g-${g.key}`, name: g.name, amount: g.amount, level: 0, group: true });
    (g.items || []).forEach((it: any, i: number) => {
      rows.push({ key: `${g.key}-${i}`, name: it.name, code: it.code, amount: it.amount, level: 1 });
    });
  }
  return rows;
}

export default function StatementsPage() {
  const [period, setPeriod] = useState<any>(dayjs());
  const [tab, setTab] = useState('income');
  const periodStr = period ? dayjs(period).format('YYYY-MM') : dayjs().format('YYYY-MM');
  const { meta } = useMeta();
  const company = meta?.settings?.company_name || '云枢科技（深圳）有限公司';

  const income = useRequest(() => api.get('/api/finance/income-statement', { period: periodStr }), [periodStr]);
  const balance = useRequest(() => api.get('/api/finance/balance-sheet', { period: periodStr }), [periodStr]);
  const cash = useRequest(() => api.get('/api/finance/cash-flow', { period: periodStr }), [periodStr]);
  const refreshAll = () => { income.refresh(); balance.refresh(); cash.refresh(); };

  /* ============================================================
   * 利润表
   * ============================================================ */
  const incomeItems = income.data?.items || [];
  const incomeColumns: ColumnsType<any> = useMemo(() => [
    {
      title: '项目', dataIndex: 'label',
      render: (v: string, r: any) => (
        <span style={{ ...indentStyle(r.level || 0), fontWeight: r.subtotal ? 600 : 400 }}>{v}</span>
      ),
    },
    {
      title: '本月数', dataIndex: 'current', width: 190, align: 'right',
      render: (v: number, r: any) => (
        <span className="num" style={{ fontWeight: r.subtotal ? 600 : 400, color: Number(v) < 0 ? 'var(--danger)' : undefined }}>
          {fmtMoney(v)}
        </span>
      ),
    },
    {
      title: '本年累计', dataIndex: 'ytd', width: 190, align: 'right',
      render: (v: number, r: any) => (
        <span className="num" style={{ fontWeight: r.subtotal ? 600 : 400, color: Number(v) < 0 ? 'var(--danger)' : undefined }}>
          {fmtMoney(v)}
        </span>
      ),
    },
  ], []);

  const incomeContent = (
    <div className="card">
      <div className="card-head">
        <div className="card-title"><span className="dot" />利润表</div>
        <Space size={16} className="text-muted" style={{ fontSize: 12 }}>
          <span>会计期间：{income.data?.period || periodStr}</span>
          <span>口径：已过账凭证（收入类取贷方净额，成本费用类取借方净额）</span>
        </Space>
      </div>
      <Table
        rowKey="key"
        columns={incomeColumns}
        dataSource={incomeItems}
        pagination={false}
        size="small"
        loading={income.loading}
        locale={{ emptyText: '该期间暂无损益发生额' }}
        scroll={{ x: 760 }}
        rowClassName={(r: any) => (r.subtotal ? 'report-subtotal-row' : '')}
      />
      <div className="doc-total-bar">
        <div className="doc-total-item">
          <div className="label">本月净利润</div>
          <div className="value num" style={{ color: Number(income.data?.current?.net_profit) < 0 ? 'var(--danger)' : 'var(--success)' }}>
            {fmtMoney(income.data?.current?.net_profit || 0)}
          </div>
        </div>
        <div className="doc-total-item">
          <div className="label">本年累计净利润</div>
          <div className="value num" style={{ color: Number(income.data?.ytd?.net_profit) < 0 ? 'var(--danger)' : 'var(--success)' }}>
            {fmtMoney(income.data?.ytd?.net_profit || 0)}
          </div>
        </div>
        <div className="doc-total-item">
          <div className="label">本月营业利润</div>
          <div className="value num">{fmtMoney(income.data?.current?.operating_profit || 0)}</div>
        </div>
        <div className="doc-total-item grand">
          <div className="label">本月利润总额</div>
          <div className="value num">{fmtMoney(income.data?.current?.total_profit || 0)}</div>
        </div>
      </div>
    </div>
  );

  /* ============================================================
   * 资产负债表
   * ============================================================ */
  const totals = balance.data?.totals || {};
  const assetRows = useMemo<BsRow[]>(() => [
    ...buildBsRows(balance.data?.assets || []),
    { key: 'ASSET_TOTAL', name: '资产总计', amount: totals.asset_total || 0, level: 0, total: true },
  ], [balance.data?.assets, totals.asset_total]);

  const liabEquityRows = useMemo<BsRow[]>(() => [
    ...buildBsRows(balance.data?.liabilities || []),
    ...buildBsRows(balance.data?.equity || []),
    { key: 'LE_TOTAL', name: '负债和所有者权益总计', amount: totals.liability_equity_total || 0, level: 0, total: true },
  ], [balance.data?.liabilities, balance.data?.equity, totals.liability_equity_total]);

  const bsColumns: ColumnsType<BsRow> = [
    {
      title: '项目', dataIndex: 'name',
      render: (v: string, r: any) => (
        <span style={{ paddingLeft: r.level ? 18 : 0, fontWeight: r.group || r.total ? 600 : 400 }}>
          {v}
          {r.code && <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>{r.code}</span>}
        </span>
      ),
    },
    {
      title: '期末余额', dataIndex: 'amount', width: 170, align: 'right',
      render: (v: number, r: any) => (
        <span className="num" style={{ fontWeight: r.group || r.total ? 600 : 400, color: Number(v) < 0 ? 'var(--danger)' : undefined }}>
          {fmtMoney(v)}
        </span>
      ),
    },
  ];

  const balanced = !!totals.balanced;
  const balanceContent = (
    <div className="card">
      <div className="card-head">
        <div className="card-title"><span className="dot" />资产负债表</div>
        <Space size={16} className="text-muted" style={{ fontSize: 12 }}>
          <span>会计期间：{balance.data?.period || periodStr}</span>
          <span>截至：{balance.data?.asOfDate || '-'}</span>
          <Tag color={balanced ? 'green' : 'red'}>{balanced ? '资产 = 负债 + 所有者权益' : '报表不平衡'}</Tag>
        </Space>
      </div>
      <div className="card-pad">
        {balance.loading && !balance.data ? (
          <div style={{ padding: 60, textAlign: 'center' }}><Spin tip="加载中…" /></div>
        ) : (
          <div className="grid-2-even">
            <div>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>资　产</b>
                <span className="text-muted" style={{ fontSize: 12 }}>期末余额</span>
              </div>
              <Table
                rowKey="key"
                columns={bsColumns}
                dataSource={assetRows}
                pagination={false}
                size="small"
                bordered
                locale={{ emptyText: '暂无资产科目余额' }}
              />
            </div>
            <div>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <b style={{ fontSize: 13 }}>负债和所有者权益</b>
                <span className="text-muted" style={{ fontSize: 12 }}>期末余额</span>
              </div>
              <Table
                rowKey="key"
                columns={bsColumns}
                dataSource={liabEquityRows}
                pagination={false}
                size="small"
                bordered
                locale={{ emptyText: '暂无负债 / 权益科目余额' }}
              />
            </div>
          </div>
        )}
      </div>
      <div className="doc-total-bar">
        <div className="doc-total-item">
          <div className="label">资产总计</div>
          <div className="value num">{fmtMoney(totals.asset_total || 0)}</div>
        </div>
        <div className="doc-total-item">
          <div className="label">负债合计</div>
          <div className="value num">{fmtMoney(totals.liability_total || 0)}</div>
        </div>
        <div className="doc-total-item">
          <div className="label">所有者权益合计</div>
          <div className="value num">{fmtMoney(totals.equity_total || 0)}</div>
        </div>
        <div className="doc-total-item grand">
          <div className="label">平衡校验（差额）</div>
          <div className="value num" style={{ color: balanced ? 'var(--success)' : 'var(--danger)', fontSize: 17 }}>
            {balanced ? '平衡 ✓' : fmtMoney(totals.diff || 0)}
          </div>
        </div>
      </div>
    </div>
  );

  /* ============================================================
   * 现金流量表
   * ============================================================ */
  const cashItems = cash.data?.items || [];
  const cashRows = useMemo(() => {
    const rows: any[] = [];
    let lastGroup = '';
    cashItems.forEach((it: any) => {
      if (it.group !== lastGroup) {
        lastGroup = it.group;
        rows.push({ key: `g-${it.group}`, label: it.group, isGroup: true, group: it.group });
      }
      rows.push({ ...it, key: `${it.group}-${it.key}` });
    });
    return rows;
  }, [cashItems]);

  const cashColumns: ColumnsType<any> = [
    {
      title: '项目', dataIndex: 'label',
      render: (v: string, r: any) => (
        <span style={{ fontWeight: r.isGroup || r.subtotal ? 600 : 400 }}>
          {v}
          {r.subtotal && !r.isGroup && <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>小计</span>}
        </span>
      ),
    },
    {
      title: '本月金额', dataIndex: 'amount', width: 200, align: 'right',
      render: (v: number, r: any) => r.isGroup
        ? <span className="text-muted">—</span>
        : <span className="num" style={{ fontWeight: r.subtotal ? 600 : 400, color: Number(v) < 0 ? 'var(--danger)' : undefined }}>{fmtMoney(v)}</span>,
    },
  ];

  const check = cash.data?.check || {};
  const cashContent = (
    <div className="card">
      <div className="card-head">
        <div className="card-title"><span className="dot" />现金流量表</div>
        <Space size={16} className="text-muted" style={{ fontSize: 12 }}>
          <span>会计期间：{cash.data?.period || periodStr}</span>
          <span>口径：含现金 / 银行存款科目的已过账凭证（按对方科目分摊）</span>
          <Tag color={Math.abs(Number(check.diff) || 0) <= 0.01 ? 'green' : 'orange'}>
            勾稽差额 {fmtMoney(check.diff || 0)}
          </Tag>
        </Space>
      </div>
      <Table
        rowKey="key"
        columns={cashColumns}
        dataSource={cashRows}
        pagination={false}
        size="small"
        loading={cash.loading}
        locale={{ emptyText: '该期间暂无现金流量发生额' }}
        scroll={{ x: 720 }}
      />
      <div className="doc-total-bar">
        <div className="doc-total-item">
          <div className="label">期初现金余额</div>
          <div className="value num">{fmtMoney(cash.data?.opening_cash || 0)}</div>
        </div>
        <div className="doc-total-item">
          <div className="label">现金净增加额</div>
          <div className="value num" style={{ color: Number(cash.data?.net_increase) < 0 ? 'var(--danger)' : 'var(--success)' }}>
            {fmtMoney(cash.data?.net_increase || 0)}
          </div>
        </div>
        <div className="doc-total-item">
          <div className="label">期末现金余额</div>
          <div className="value num">{fmtMoney(cash.data?.closing_cash || 0)}</div>
        </div>
        <div className="doc-total-item grand">
          <div className="label">经营 / 投资 / 筹资净额</div>
          <div className="value num" style={{ fontSize: 15 }}>
            {fmtMoney(cash.data?.operating?.net || 0)} / {fmtMoney(cash.data?.investing?.net || 0)} / {fmtMoney(cash.data?.financing?.net || 0)}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="财务报表"
        subtitle={`${periodStr} 期间财务报表 · 数据来源于已过账凭证（POSTED），资产负债表按期末累计余额编制`}
        extra={
          <Space>
            <DatePicker picker="month" value={period} onChange={setPeriod} allowClear={false} style={{ width: 150 }} />
            <Button icon={<ReloadOutlined />} onClick={refreshAll}>刷新</Button>
            <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>打印报表</Button>
          </Space>
        }
      />

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'income', label: '利润表', children: incomeContent },
          { key: 'balance', label: '资产负债表', children: balanceContent },
          { key: 'cash', label: '现金流量表', children: cashContent },
        ]}
      />

      {/* 打印区域：始终渲染，打印时通过 CSS 显示（仅打印当前 Tab） */}
      <div id="print-area">
        {tab === 'income' && <IncomePrint data={income.data} company={company} />}
        {tab === 'balance' && <BalancePrint data={balance.data} company={company} />}
        {tab === 'cash' && <CashPrint data={cash.data} company={company} />}
      </div>
    </div>
  );
}

/* ============================================================
 * 打印视图
 * ============================================================ */
function PrintHead({ company, title }: { company: string; title: string }) {
  return (
    <div className="print-head">
      <div className="print-company">{company}</div>
      <div className="print-docname">{title}</div>
    </div>
  );
}

function PrintMeta({ company, period, extra }: { company: string; period?: string; extra?: string }) {
  return (
    <div className="print-meta">
      <div><span>编制单位：</span>{company}</div>
      <div><span>会计期间：</span>{period || '-'}</div>
      <div><span>金额单位：</span>元</div>
      <div><span>{extra || `打印时间：${new Date().toLocaleString('zh-CN')}`}</span></div>
    </div>
  );
}

function PrintSign() {
  return (
    <div className="print-sign">
      <div>制表人：</div>
      <div>审核人：</div>
      <div>财务负责人：</div>
      <div>打印时间：{new Date().toLocaleString('zh-CN')}</div>
    </div>
  );
}

function IncomePrint({ data, company }: { data: any; company: string }) {
  const items = data?.items || [];
  return (
    <div className="print-sheet">
      <PrintHead company={company} title="利 润 表" />
      <PrintMeta company={company} period={data?.period} extra={`期间：${data?.startDate || '-'} 至 ${data?.endDate || '-'}`} />
      <table className="print-table">
        <thead>
          <tr>
            <th>项目</th>
            <th className="num" style={{ width: 160 }}>本月数</th>
            <th className="num" style={{ width: 160 }}>本年累计</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it: any) => (
            <tr key={it.key}>
              <td style={{ paddingLeft: 8 + (it.level || 0) * 16, fontWeight: it.subtotal ? 600 : 400 }}>{it.label}</td>
              <td className="num" style={{ fontWeight: it.subtotal ? 600 : 400 }}>{fmtMoney(it.current)}</td>
              <td className="num" style={{ fontWeight: it.subtotal ? 600 : 400 }}>{fmtMoney(it.ytd)}</td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: '#8b98ab', padding: 20 }}>该期间暂无损益发生额</td></tr>}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ textAlign: 'right', fontWeight: 600 }}>净利润</td>
            <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(data?.current?.net_profit || 0)}</td>
            <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(data?.ytd?.net_profit || 0)}</td>
          </tr>
        </tfoot>
      </table>
      <PrintSign />
    </div>
  );
}

function BalancePrint({ data, company }: { data: any; company: string }) {
  const totals = data?.totals || {};
  const leftBase = buildBsRows(data?.assets || []).map((r) => ({ ...r, key: `l-${r.key}` }));
  const left = [...leftBase, { key: 'l-total', name: '资产总计', amount: totals.asset_total || 0, level: 0, total: true } as BsRow];
  const rightBase = [
    ...buildBsRows(data?.liabilities || []),
    ...buildBsRows(data?.equity || []),
  ].map((r) => ({ ...r, key: `r-${r.key}` }));
  const right = [...rightBase, { key: 'r-total', name: '负债和所有者权益总计', amount: totals.liability_equity_total || 0, level: 0, total: true } as BsRow];
  const count = Math.max(left.length, right.length);

  return (
    <div className="print-sheet">
      <PrintHead company={company} title="资 产 负 债 表" />
      <PrintMeta company={company} period={data?.period} extra={`截至：${data?.asOfDate || '-'}`} />
      <table className="print-table">
        <thead>
          <tr>
            <th>资产</th>
            <th className="num" style={{ width: 130 }}>期末余额</th>
            <th>负债和所有者权益</th>
            <th className="num" style={{ width: 130 }}>期末余额</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: count }).map((_, i) => {
            const l: any = left[i];
            const r: any = right[i];
            return (
              <tr key={i}>
                <td style={{ paddingLeft: l?.level ? 18 : 8, fontWeight: l?.group || l?.total ? 600 : 400 }}>
                  {l ? l.name : ''}{l?.code ? `（${l.code}）` : ''}
                </td>
                <td className="num" style={{ fontWeight: l?.group || l?.total ? 600 : 400 }}>{l ? fmtMoney(l.amount) : ''}</td>
                <td style={{ paddingLeft: r?.level ? 18 : 8, fontWeight: r?.group || r?.total ? 600 : 400 }}>
                  {r ? r.name : ''}{r?.code ? `（${r.code}）` : ''}
                </td>
                <td className="num" style={{ fontWeight: r?.group || r?.total ? 600 : 400 }}>{r ? fmtMoney(r.amount) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 10, fontSize: 12, color: totals.balanced ? '#16a34a' : '#e5484d' }}>
        平衡校验：资产总计 {fmtMoney(totals.asset_total || 0)} ＝ 负债和所有者权益总计 {fmtMoney(totals.liability_equity_total || 0)}
        {totals.balanced ? '（平衡）' : `（差额 ${fmtMoney(totals.diff || 0)}）`}
      </div>
      <PrintSign />
    </div>
  );
}

function CashPrint({ data, company }: { data: any; company: string }) {
  const items = data?.items || [];
  return (
    <div className="print-sheet">
      <PrintHead company={company} title="现 金 流 量 表" />
      <PrintMeta company={company} period={data?.period} extra={`期间：${data?.startDate || '-'} 至 ${data?.endDate || '-'}`} />
      <table className="print-table">
        <thead>
          <tr>
            <th>项目</th>
            <th className="num" style={{ width: 180 }}>本月金额</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it: any) => (
            <tr key={`${it.group}-${it.key}`}>
              <td style={{ fontWeight: it.subtotal ? 600 : 400 }}>{it.label}</td>
              <td className="num" style={{ fontWeight: it.subtotal ? 600 : 400 }}>{fmtMoney(it.amount)}</td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', color: '#8b98ab', padding: 20 }}>该期间暂无现金流量发生额</td></tr>}
          <tr>
            <td style={{ fontWeight: 600 }}>期初现金余额</td>
            <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(data?.opening_cash || 0)}</td>
          </tr>
          <tr>
            <td style={{ fontWeight: 600 }}>期末现金余额</td>
            <td className="num" style={{ fontWeight: 600 }}>{fmtMoney(data?.closing_cash || 0)}</td>
          </tr>
        </tbody>
      </table>
      <PrintSign />
    </div>
  );
}
