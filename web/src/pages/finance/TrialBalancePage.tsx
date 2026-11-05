/**
 * /finance/trial-balance 科目余额表（试算平衡表）
 * ------------------------------------------------------------
 * 期初余额 / 本期借方 / 本期贷方 / 期末余额，末行合计并校验借贷平衡。
 */
import { useState } from 'react';
import { Button, DatePicker, Empty, Space, Spin, Table, Tag } from 'antd';
import { SearchOutlined, SyncOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { fmtMoney } from '../../utils/format';
import { ACCOUNT_CATEGORY_LABEL, DirectionTag } from './common';

interface TBRow {
  code: string;
  name: string;
  category: string;
  direction: string;
  opening_balance: number;
  debit: number;
  credit: number;
  closing_balance: number;
}

export default function TrialBalancePage() {
  const [range, setRange] = useState<any>([dayjs().startOf('month'), dayjs()]);
  const [query, setQuery] = useState(() => ({
    startDate: dayjs().startOf('month').format('YYYY-MM-DD'),
    endDate: dayjs().format('YYYY-MM-DD'),
  }));
  const req = useRequest(() => api.get('/api/finance/trial-balance', query), [query.startDate, query.endDate]);

  const rows: TBRow[] = req.data?.rows || [];
  const totals = req.data?.totals || {};

  const doQuery = () => {
    if (!range?.[0] || !range?.[1]) return;
    setQuery({
      startDate: dayjs(range[0]).format('YYYY-MM-DD'),
      endDate: dayjs(range[1]).format('YYYY-MM-DD'),
    });
  };

  const reset = () => {
    const start = dayjs().startOf('month');
    const end = dayjs();
    setRange([start, end]);
    setQuery({ startDate: start.format('YYYY-MM-DD'), endDate: end.format('YYYY-MM-DD') });
  };

  const columns: ColumnsType<TBRow> = [
    { title: '科目编码', dataIndex: 'code', width: 110, fixed: 'left' },
    { title: '科目名称', dataIndex: 'name', width: 220, fixed: 'left', ellipsis: true },
    {
      title: '科目类别', dataIndex: 'category', width: 100, align: 'center',
      render: (v: string) => <Tag>{ACCOUNT_CATEGORY_LABEL[v] || v}</Tag>,
    },
    {
      title: '方向', dataIndex: 'direction', width: 70, align: 'center',
      render: (v: string) => <DirectionTag direction={v} />,
    },
    {
      title: '期初余额', dataIndex: 'opening_balance', width: 140, align: 'right',
      render: (v: number) => <span className="num">{fmtMoney(v)}</span>,
    },
    {
      title: '本期借方', dataIndex: 'debit', width: 140, align: 'right',
      render: (v: number) => <span className="num">{fmtMoney(v)}</span>,
    },
    {
      title: '本期贷方', dataIndex: 'credit', width: 140, align: 'right',
      render: (v: number) => <span className="num">{fmtMoney(v)}</span>,
    },
    {
      title: '期末余额', dataIndex: 'closing_balance', width: 140, align: 'right',
      render: (v: number) => <b className="num">{fmtMoney(v)}</b>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="科目余额表"
        subtitle={`${req.data?.startDate || query.startDate} 至 ${req.data?.endDate || query.endDate} · 期初余额 = 区间前累计发生额，期末余额 = 期初 + 本期发生 · ${
          totals.balanced ? '借贷平衡' : '借贷不平衡'
        }`}
        extra={
          <Space>
            <DatePicker.RangePicker style={{ width: 250 }} value={range} onChange={setRange} />
            <Button type="primary" icon={<SearchOutlined />} onClick={doQuery}>查询</Button>
            <Button onClick={reset}>重置</Button>
            <Button icon={<SyncOutlined />} onClick={() => req.refresh()}>刷新</Button>
          </Space>
        }
      />

      <div className="card">
        <div className="card-head">
          <div className="card-title"><span className="dot" />科目余额明细</div>
          <Space size={14}>
            <span className="text-muted" style={{ fontSize: 12 }}>共 {rows.length} 个科目</span>
            <Tag color={totals.balanced ? 'green' : 'red'}>
              {totals.balanced ? '期初 / 发生额 / 期末 三处借贷平衡' : '期初 / 发生额 / 期末 存在不平'}
            </Tag>
          </Space>
        </div>

        {req.loading && rows.length === 0 ? (
          <div style={{ padding: 70, textAlign: 'center' }}><Spin tip="加载中…" /></div>
        ) : rows.length === 0 ? (
          <div className="empty-hint">该区间没有发生额或余额的科目</div>
        ) : (
          <Table
            rowKey="code"
            columns={columns}
            dataSource={rows}
            pagination={false}
            size="small"
            bordered
            scroll={{ x: 1100 }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ fontWeight: 600, background: '#f7f9fd' }}>
                  <Table.Summary.Cell index={0} colSpan={4} align="right">合　计</Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <div className="num">借 {fmtMoney(totals.opening_debit || 0)}</div>
                    <div className="num">贷 {fmtMoney(totals.opening_credit || 0)}</div>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <span className="num">{fmtMoney(totals.debit || 0)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">
                    <span className="num">{fmtMoney(totals.credit || 0)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">
                    <div className="num">借 {fmtMoney(totals.closing_debit || 0)}</div>
                    <div className="num">贷 {fmtMoney(totals.closing_credit || 0)}</div>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        )}
      </div>

      <div className="card mt-14">
        <div className="card-head">
          <div className="card-title"><span className="dot" />试算平衡校验</div>
          <Tag color={totals.balanced ? 'green' : 'red'}>{totals.balanced ? '平衡' : '不平衡'}</Tag>
        </div>
        <div className="card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
          <div>
            <div className="text-muted" style={{ fontSize: 12 }}>期初余额 借 / 贷</div>
            <div className="num" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>
              {fmtMoney(totals.opening_debit || 0)} / {fmtMoney(totals.opening_credit || 0)}
            </div>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: 12 }}>本期发生额 借 / 贷</div>
            <div className="num" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>
              {fmtMoney(totals.debit || 0)} / {fmtMoney(totals.credit || 0)}
            </div>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: 12 }}>期末余额 借 / 贷</div>
            <div className="num" style={{ fontSize: 16, fontWeight: 600, marginTop: 4 }}>
              {fmtMoney(totals.closing_debit || 0)} / {fmtMoney(totals.closing_credit || 0)}
            </div>
          </div>
        </div>
        {!totals.balanced && (
          <div className="card-pad" style={{ paddingTop: 0 }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="试算不平衡，请检查凭证过账与科目映射配置" />
          </div>
        )}
      </div>
    </div>
  );
}
