/**
 * /finance/ledger 明细账
 * ------------------------------------------------------------
 * 选择会计科目 + 日期区间，按凭证逐笔列出发生额并滚动计算余额，
 * 页脚合计与期初 / 期末余额由后端窗口函数计算，翻页后余额连续。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, DatePicker, Empty, Space, Table } from 'antd';
import { SearchOutlined, SyncOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import EntitySelect from '../../components/EntitySelect';
import StatCard from '../../components/StatCard';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { fmtMoney } from '../../utils/format';
import { DirectionTag } from './common';

interface LedgerQuery {
  accountCode?: string;
  startDate?: string;
  endDate?: string;
}

export default function LedgerPage() {
  const navigate = useNavigate();
  const [accountCode, setAccountCode] = useState<string | undefined>();
  const [range, setRange] = useState<any>([dayjs().startOf('month'), dayjs()]);
  const [query, setQuery] = useState<LedgerQuery>({});
  const [reloadKey, setReloadKey] = useState(0);

  const stats = useRequest(async () => {
    if (!query.accountCode) return null;
    return api.get('/api/finance/ledger', { ...query, page: 1, pageSize: 1 });
  }, [query.accountCode, query.startDate, query.endDate]);

  const doQuery = () => {
    if (!accountCode) return;
    setQuery({
      accountCode,
      startDate: range?.[0] ? dayjs(range[0]).format('YYYY-MM-DD') : undefined,
      endDate: range?.[1] ? dayjs(range[1]).format('YYYY-MM-DD') : undefined,
    });
    setReloadKey((k) => k + 1);
  };

  const reset = () => {
    setAccountCode(undefined);
    setRange([dayjs().startOf('month'), dayjs()]);
    setQuery({});
    setReloadKey((k) => k + 1);
  };

  const refresh = () => {
    setReloadKey((k) => k + 1);
    stats.refresh();
  };

  const account = stats.data?.account;
  const s = stats.data || {};
  const direction = account?.direction;

  const columns: ColumnsType<any> = [
    { title: '业务日期', dataIndex: 'voucher_date', width: 108, fixed: 'left' },
    {
      title: '凭证字号', dataIndex: 'voucher_no', width: 150,
      render: (v: string, r: any) => <a onClick={() => navigate(`/finance/vouchers/${r.voucher_id}`)}>{v}</a>,
    },
    { title: '摘要', dataIndex: 'summary', minWidth: 260, ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '往来单位', dataIndex: 'partner_name', width: 200, ellipsis: true,
      render: (v: string, r: any) => v || (r.source_type ? '-' : '-'),
    },
    {
      title: '借方发生额', dataIndex: 'debit', width: 140, align: 'right',
      render: (v: number) => (Number(v) ? <span className="num text-success">{fmtMoney(v)}</span> : <span className="text-muted">-</span>),
    },
    {
      title: '贷方发生额', dataIndex: 'credit', width: 140, align: 'right',
      render: (v: number) => (Number(v) ? <span className="num text-danger">{fmtMoney(v)}</span> : <span className="text-muted">-</span>),
    },
    {
      title: '余额', dataIndex: 'balance', width: 150, align: 'right',
      render: (v: number) => <b className="num">{fmtMoney(v)}</b>,
    },
  ];

  const hasAccount = !!query.accountCode;

  return (
    <div>
      <PageHeader
        title="明细账"
        subtitle={
          hasAccount
            ? `${account?.name || ''}（${query.accountCode}）· ${query.startDate || ''} 至 ${query.endDate || ''} · 逐笔发生额与滚动余额`
            : '选择会计科目与日期区间，查询逐笔发生额、对方往来单位与滚动余额'
        }
        extra={
          <Space wrap>
            <EntitySelect
              type="account"
              style={{ width: 250 }}
              placeholder="选择会计科目"
              value={accountCode}
              onChange={(v: any) => setAccountCode(v)}
            />
            <DatePicker.RangePicker style={{ width: 250 }} value={range} onChange={setRange} />
            <Button type="primary" icon={<SearchOutlined />} onClick={doQuery} disabled={!accountCode}>查询</Button>
            <Button onClick={reset}>重置</Button>
            <Button icon={<SyncOutlined />} onClick={refresh}>刷新</Button>
          </Space>
        }
      />

      {!hasAccount ? (
        <div className="card">
          <div className="empty-hint">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请先选择会计科目，再点击「查询」查看明细账" />
          </div>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <StatCard title="期初余额" value={s.opening_balance || 0} prefix="¥"
              foot={`余额方向：${direction === 'CREDIT' ? '贷' : '借'}`} />
            <StatCard title="本期借方合计" value={s.total_debit || 0} prefix="¥" foot="区间内借方发生额" />
            <StatCard title="本期贷方合计" value={s.total_credit || 0} prefix="¥" foot="区间内贷方发生额" />
            <StatCard title="期末余额" value={s.closing_balance || 0} prefix="¥"
              color={Number(s.closing_balance) < 0 ? 'var(--danger)' : undefined}
              foot={`${s.total || 0} 笔分录 · 方向 ${direction === 'CREDIT' ? '贷' : '借'}`} />
          </div>

          <div className="grid-2 mt-14">
            <div>
              <DataTable
                columns={columns}
                load={(params) => api.get('/api/finance/ledger', params)}
                extraParams={query}
                search={false}
                filters={[]}
                reloadKey={reloadKey}
                exportFilename={`明细账_${query.accountCode || ''}_${dayjs().format('YYYYMMDD')}`}
                scrollX={1200}
                defaultPageSize={50}
                showIndex={false}
                summary={() => (
                  <Table.Summary fixed>
                    <Table.Summary.Row style={{ fontWeight: 600, background: '#f7f9fd' }}>
                      <Table.Summary.Cell index={0} colSpan={4} align="right">本期合计</Table.Summary.Cell>
                      <Table.Summary.Cell index={4} align="right"><span className="num">{fmtMoney(s.total_debit || 0)}</span></Table.Summary.Cell>
                      <Table.Summary.Cell index={5} align="right"><span className="num">{fmtMoney(s.total_credit || 0)}</span></Table.Summary.Cell>
                      <Table.Summary.Cell index={6} align="right"><span className="num">{fmtMoney(s.closing_balance || 0)}</span></Table.Summary.Cell>
                    </Table.Summary.Row>
                  </Table.Summary>
                )}
              />
            </div>
            <div className="card">
              <div className="card-head"><div className="card-title"><span className="dot" />科目信息</div></div>
              <div className="card-pad">
                <div className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid #f4f6fa' }}>
                  <span className="text-muted">科目编码</span><b>{account?.code || '-'}</b>
                </div>
                <div className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid #f4f6fa' }}>
                  <span className="text-muted">科目名称</span><b>{account?.name || '-'}</b>
                </div>
                <div className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid #f4f6fa' }}>
                  <span className="text-muted">余额方向</span><DirectionTag direction={direction} />
                </div>
                <div className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid #f4f6fa' }}>
                  <span className="text-muted">科目类别</span><b>{account?.category || '-'}</b>
                </div>
                <div className="flex-between" style={{ padding: '8px 0' }}>
                  <span className="text-muted">明细科目</span><b>{account?.is_leaf ? '是' : '否'}</b>
                </div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.8 }}>
                  说明：余额按科目正常方向计算，借方类科目余额 = 期初 + 借 - 贷；贷方类科目余额 = 期初 + 贷 - 借。
                  点击凭证字号可跳转查看凭证分录。
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
