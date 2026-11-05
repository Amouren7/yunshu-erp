import { useMemo, useState } from 'react';
import { Segmented, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { RiseOutlined, ShoppingCartOutlined, TeamOutlined, WalletOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import DataTable from '../../components/DataTable';
import { api } from '../../api/client';
import { fmtMoney, fmtNumber } from '../../utils/format';
import {
  customerSummaryColumns, itemSummaryColumns, salespersonSummaryColumns,
  Pct, RangeBar, useReportRange,
} from './shared';

type TabKey = 'customer' | 'item' | 'salesperson';

const TAB_KEYS: TabKey[] = ['customer', 'item', 'salesperson'];

const TAB_META: Record<TabKey, {
  label: string;
  url: string;
  rowKey: string;
  exportName: string;
  columns: () => ColumnsType<any>;
  countLabel: string;
  countValue: (s: any) => number;
  unit: string;
}> = {
  customer: {
    label: '按客户', url: '/api/reports/sales-summary', rowKey: 'customer_id',
    exportName: '销售汇总_按客户', columns: customerSummaryColumns,
    countLabel: '客户数', countValue: (s) => s.customerCount || 0, unit: '家客户',
  },
  item: {
    label: '按产品', url: '/api/reports/sales-by-item', rowKey: 'item_id',
    exportName: '销售汇总_按产品', columns: itemSummaryColumns,
    countLabel: '产品数', countValue: (s) => s.itemCount || 0, unit: '个产品',
  },
  salesperson: {
    label: '按业务员', url: '/api/reports/sales-by-salesperson', rowKey: 'salesperson_id',
    exportName: '销售汇总_按业务员', columns: salespersonSummaryColumns,
    countLabel: '业务员数', countValue: (s) => s.salespersonCount || 0, unit: '名业务员',
  },
};

export default function SalesSummaryPage() {
  const { range, setRange, params } = useReportRange('month');
  const [tab, setTab] = useState<TabKey>('customer');
  const [summary, setSummary] = useState<any>({});
  const cfg = TAB_META[tab];

  const columns = useMemo(() => cfg.columns(), [tab]);

  const load = (p: Record<string, any>) =>
    api.get(cfg.url, p).then((res: any) => {
      setSummary(res?.summary || {});
      return res;
    });

  const summaryCount = cfg.countValue(summary);

  return (
    <div>
      <PageHeader
        title="销售汇总表"
        subtitle={`统计区间 ${params.startDate} ~ ${params.endDate} · 口径：已审核发货单，金额为未税金额，毛利率 = 毛利 / 未税销售额`}
        extra={<RangeBar value={range} onChange={setRange} />}
      />

      <div className="kpi-grid">
        <StatCard title="销售额（未税）" value={summary.amount || 0} prefix="¥" icon={<ShoppingCartOutlined />}
          foot={`价税合计 ￥${fmtMoney(summary.total_amount || 0)}`} />
        <StatCard title="销售成本" value={summary.cost_amount || 0} prefix="¥" icon={<WalletOutlined />}
          foot={`${fmtNumber(summary.orders || 0, 0)} 张发货单`} />
        <StatCard title="毛利额" value={summary.profit || 0} prefix="¥" icon={<RiseOutlined />}
          foot={<span>毛利率 <Pct value={summary.profit_rate} /></span>} />
        <StatCard title={cfg.countLabel} value={summaryCount} money={false} digits={0} icon={<TeamOutlined />}
          foot={`税额 ￥${fmtMoney(summary.tax_amount || 0)}`} />
      </div>

      <DataTable
        key={`${tab}-${params.startDate}-${params.endDate}`}
        rowKey={cfg.rowKey}
        columns={columns as any}
        load={load}
        extraParams={params}
        exportFilename={cfg.exportName}
        search={
          tab === 'customer'
            ? { placeholder: '搜索客户编码 / 名称' }
            : tab === 'item'
              ? { placeholder: '搜索产品编码 / 名称 / 规格' }
              : false
        }
        toolbar={
          <Segmented
            value={tab}
            options={TAB_KEYS.map((k) => ({ label: TAB_META[k].label, value: k }))}
            onChange={(v) => setTab(v as TabKey)}
          />
        }
        scrollX={1500}
        summary={(rows) =>
          rows.length > 0 ? (
            <SummaryRow tab={tab} summary={summary} countLabel={`${fmtNumber(summaryCount, 0)} ${cfg.unit}`} columns={columns} />
          ) : null
        }
      />
    </div>
  );
}

function SummaryRow({
  tab, summary, countLabel, columns,
}: {
  tab: TabKey;
  summary: any;
  countLabel: string;
  columns: ColumnsType<any>;
}) {
  const firstKey = tab === 'customer' ? 'customer_code' : tab === 'item' ? 'item_code' : 'employee_code';
  const secondKey = tab === 'customer' ? 'customer_name' : tab === 'item' ? 'item_name' : 'salesperson_name';

  const valueOf = (dataIndex: any): any => {
    const key = String(dataIndex);
    if (key === firstKey) return '';
    if (key === secondKey) return `合计（${countLabel}）`;
    if (['order_count', 'qty', 'amount', 'tax_amount', 'total_amount', 'cost_amount', 'profit', 'profit_rate'].includes(key)) {
      if (key === 'order_count') return <b>{fmtNumber(summary.orders, 0)}</b>;
      if (key === 'qty') {
        return summary.qty === undefined || summary.qty === null
          ? '-'
          : <b>{fmtNumber(summary.qty, 2)}</b>;
      }
      if (key === 'profit_rate') return <b><Pct value={summary.profit_rate} /></b>;
      return <b className="num">{`￥${fmtMoney(summary[key] || 0)}`}</b>;
    }
    return '';
  };

  return (
    <Table.Summary.Row>
      <Table.Summary.Cell index={0}><b>合计</b></Table.Summary.Cell>
      {columns.map((c: any, i) => (
        <Table.Summary.Cell key={i} index={i + 1} align={c.align || 'left'}>
          {valueOf(c.dataIndex)}
        </Table.Summary.Cell>
      ))}
    </Table.Summary.Row>
  );
}
