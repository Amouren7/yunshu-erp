import { useMemo, useState } from 'react';
import { Button, Col, Row, Table, Tabs } from 'antd';
import { DownloadOutlined, InboxOutlined, ReloadOutlined, RiseOutlined, WalletOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { CHART_COLORS, axisStyle } from '../../components/ChartCard';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { exportCsv, fmtMoney, fmtNumber } from '../../utils/format';
import { ChartOrEmpty, RangeBar, useReportRange } from './shared';

const CATEGORY_COLORS = CHART_COLORS;

export default function InventoryReportPage() {
  const { range, setRange, params } = useReportRange('last12');
  const [tab, setTab] = useState('warehouse');

  const balance = useRequest(() => api.get('/api/reports/inventory-balance'), []);
  const turnover = useRequest(
    () => api.get('/api/reports/inventory-turnover', params),
    [params.startDate, params.endDate],
  );

  const b = balance.data || {};
  const t = turnover.data || {};
  const summary = b.summary || {};
  const tSummary = t.summary || {};
  const byWarehouse: any[] = b.byWarehouse || [];
  const byCategory: any[] = b.byCategory || [];
  const topItems: any[] = b.topItems || [];
  const turnoverByCategory: any[] = t.byCategory || [];

  const refreshAll = () => { balance.refresh(); turnover.refresh(); };

  const categoryOption = useMemo(() => ({
    color: CATEGORY_COLORS,
    tooltip: { trigger: 'item', valueFormatter: (v: any) => `￥${fmtMoney(v)}` },
    legend: { orient: 'vertical', right: 0, top: 'center', itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
    series: [{
      type: 'pie', radius: ['50%', '72%'], center: ['34%', '50%'],
      itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
      label: { show: false },
      data: byCategory.map((r) => ({ name: r.category_name, value: r.amount })),
    }],
  }), [byCategory]);

  const warehouseOption = useMemo(() => {
    const rows = [...byWarehouse].sort((a, b2) => Number(a.amount) - Number(b2.amount));
    return {
      color: CATEGORY_COLORS,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: any) => `￥${fmtMoney(v)}` },
      grid: { left: 8, right: 84, top: 8, bottom: 4, containLabel: true },
      xAxis: {
        type: 'value', ...axisStyle(),
        axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 10000)}万` : v) },
      },
      yAxis: { type: 'category', data: rows.map((r) => r.name), ...axisStyle() },
      series: [{
        type: 'bar', barWidth: 16, itemStyle: { borderRadius: [0, 4, 4, 0], color: '#2f6bff' },
        data: rows.map((r) => r.amount),
        label: {
          show: true, position: 'right', fontSize: 10, color: '#8b98ab',
          formatter: (p: any) => (Number(p.value) >= 10000 ? `￥${(Number(p.value) / 10000).toFixed(1)}万` : `￥${fmtMoney(p.value, 0)}`),
        },
      }],
    };
  }, [byWarehouse]);

  const warehouseColumns = [
    { title: '仓库编码', dataIndex: 'code', width: 110 },
    { title: '仓库名称', dataIndex: 'name', width: 180 },
    { title: '仓库类型', dataIndex: 'type', width: 120, render: (v: any) => v || '-' },
    { title: 'SKU 数', dataIndex: 'sku_count', width: 100, align: 'right' as const, render: (v: any) => fmtNumber(v, 0) },
    { title: '库存数量', dataIndex: 'qty', width: 130, align: 'right' as const, render: (v: any) => fmtNumber(v, 2) },
    { title: '库存金额', dataIndex: 'amount', width: 150, align: 'right' as const, render: (v: any) => <span className="num money">{fmtMoney(v)}</span> },
  ];
  const categoryColumns = [
    { title: '物料分类', dataIndex: 'category_name', width: 180 },
    { title: 'SKU 数', dataIndex: 'sku_count', width: 100, align: 'right' as const, render: (v: any) => fmtNumber(v, 0) },
    { title: '库存数量', dataIndex: 'qty', width: 130, align: 'right' as const, render: (v: any) => fmtNumber(v, 2) },
    { title: '库存金额', dataIndex: 'amount', width: 160, align: 'right' as const, render: (v: any) => <span className="num money">{fmtMoney(v)}</span> },
  ];
  const turnoverColumns = [
    { title: '物料分类', dataIndex: 'category_name', width: 160 },
    { title: '出库成本', dataIndex: 'out_cost', width: 140, align: 'right' as const, render: (v: any) => fmtMoney(v) },
    { title: '入库成本', dataIndex: 'in_cost', width: 140, align: 'right' as const, render: (v: any) => fmtMoney(v) },
    { title: '期初库存', dataIndex: 'opening_value', width: 140, align: 'right' as const, render: (v: any) => fmtMoney(v) },
    { title: '期末库存', dataIndex: 'ending_value', width: 140, align: 'right' as const, render: (v: any) => fmtMoney(v) },
    { title: '平均库存', dataIndex: 'avg_inventory', width: 140, align: 'right' as const, render: (v: any) => fmtMoney(v) },
    { title: '周转率(次)', dataIndex: 'turnover_rate', width: 110, align: 'right' as const, render: (v: any) => <b className="num">{fmtNumber(v, 2)}</b> },
    { title: '周转天数', dataIndex: 'turnover_days', width: 110, align: 'right' as const, render: (v: any) => (v === null || v === undefined ? '-' : `${fmtNumber(v, 2)} 天`) },
  ];
  const topColumns = [
    { title: '产品编码', dataIndex: 'item_code', width: 130 },
    { title: '产品名称', dataIndex: 'item_name', width: 200, ellipsis: true },
    { title: '规格型号', dataIndex: 'spec', width: 200, ellipsis: true, render: (v: any) => v || '-' },
    { title: '单位', dataIndex: 'uom', width: 70, align: 'center' as const, render: (v: any) => v || '-' },
    { title: '库存数量', dataIndex: 'qty', width: 120, align: 'right' as const, render: (v: any) => fmtNumber(v, 2) },
    { title: '平均成本', dataIndex: 'avg_cost', width: 120, align: 'right' as const, render: (v: any) => fmtMoney(v) },
    { title: '库存金额', dataIndex: 'amount', width: 150, align: 'right' as const, render: (v: any) => <span className="num money">{fmtMoney(v)}</span> },
  ];

  const doExport = () => {
    if (tab === 'warehouse') exportCsv('库存分析_按仓库', warehouseColumns as any, byWarehouse);
    else if (tab === 'category') exportCsv('库存分析_按分类', categoryColumns as any, byCategory);
    else if (tab === 'turnover') exportCsv('库存分析_周转率', turnoverColumns as any, turnoverByCategory);
    else exportCsv('库存分析_库存金额TOP20', topColumns as any, topItems);
  };

  return (
    <div>
      <PageHeader
        title="库存分析"
        subtitle={`库存余额基于实时结存；周转区间 ${params.startDate} ~ ${params.endDate}（周转率 = 出库成本 / 平均库存）`}
        extra={
          <RangeBar
            value={range}
            onChange={setRange}
            onRefresh={refreshAll}
            loading={balance.loading || turnover.loading}
          />
        }
      />

      <div className="kpi-grid">
        <StatCard title="库存总金额" value={summary.total_amount || 0} prefix="¥" icon={<InboxOutlined />}
          foot={`${fmtNumber(summary.total_qty || 0, 2)} 件库存`} />
        <StatCard title="SKU 数" value={summary.sku_count || 0} money={false} digits={0} icon={<WalletOutlined />}
          foot={`${fmtNumber(summary.warehouse_count || 0, 0)} 个仓库有库存`} />
        <StatCard title="库存分类数" value={summary.category_count || 0} money={false} digits={0} icon={<RiseOutlined />}
          foot="按物料分类汇总" />
        <StatCard title="本期出库成本" value={tSummary.out_cost || 0} prefix="¥" icon={<DownloadOutlined />}
          foot={`入库成本 ￥${fmtMoney(tSummary.in_cost || 0)}`} />
        <StatCard title="平均库存" value={tSummary.avg_inventory || 0} prefix="¥" icon={<WalletOutlined />}
          foot={`期初 ￥${fmtMoney(tSummary.opening_inventory || 0)} · 期末 ￥${fmtMoney(tSummary.ending_inventory || 0)}`} />
        <StatCard title="库存周转率" value={tSummary.turnover_rate || 0} money={false} digits={2} suffix="次" icon={<RiseOutlined />}
          foot={`统计 ${turnover.data?.days || 0} 天`} />
        <StatCard title="周转天数" value={tSummary.turnover_days ?? '-'} money={false} digits={2} suffix="天" icon={<InboxOutlined />}
          foot="周转率越高、天数越短" />
        <StatCard title="库存金额占比（最大分类）" value={byCategory[0]?.amount || 0} prefix="¥" icon={<WalletOutlined />}
          foot={byCategory[0]?.category_name || '暂无分类数据'} />
      </div>

      <Row gutter={14} className="mt-14">
        <Col xs={24} xl={12}>
          <ChartOrEmpty title="库存金额分布（按物料分类）" option={categoryOption} hasData={byCategory.length > 0} height={300} />
        </Col>
        <Col xs={24} xl={12}>
          <ChartOrEmpty title="库存金额分布（按仓库）" option={warehouseOption} hasData={byWarehouse.length > 0} height={300} />
        </Col>
      </Row>

      <div className="card mt-14">
        <div className="card-head">
          <div className="card-title"><span className="dot" />库存明细汇总</div>
          <Button size="small" icon={<DownloadOutlined />} onClick={doExport}>导出当前表</Button>
        </div>
        <div className="card-pad" style={{ paddingTop: 0 }}>
          <Tabs
            activeKey={tab}
            onChange={setTab}
            items={[
              {
                key: 'warehouse', label: `按仓库（${byWarehouse.length}）`,
                children: <SimpleTable rows={byWarehouse} columns={warehouseColumns} rowKey="warehouse_id" scrollX={900} />,
              },
              {
                key: 'category', label: `按分类（${byCategory.length}）`,
                children: <SimpleTable rows={byCategory} columns={categoryColumns} rowKey="category_id" scrollX={700} />,
              },
              {
                key: 'turnover', label: '周转率分析',
                children: (
                  <div>
                    <div className="flex-gap" style={{ padding: '4px 0 10px' }}>
                      <span className="text-muted" style={{ fontSize: 12 }}>
                        周转率 <b>{fmtNumber(tSummary.turnover_rate || 0, 2)} 次</b>
                        <span style={{ margin: '0 8px' }}>·</span>
                        周转天数 <b>{tSummary.turnover_days ?? '-'} 天</b>
                        <span style={{ margin: '0 8px' }}>·</span>
                        期末库存 <b>￥{fmtMoney(tSummary.ending_inventory || 0)}</b>
                      </span>
                    </div>
                    <SimpleTable rows={turnoverByCategory} columns={turnoverColumns} rowKey="category_id" scrollX={1200} showIndex />
                  </div>
                ),
              },
              {
                key: 'top', label: '库存金额 TOP 20',
                children: <SimpleTable rows={topItems} columns={topColumns} rowKey="item_id" scrollX={1100} showIndex />,
              },
            ]}
          />
        </div>
      </div>

      <div className="text-muted" style={{ fontSize: 11, marginTop: 10 }}>
        注：库存余额取实时结存数量与移动加权平均成本；周转率按「本期出库成本 / 平均库存」计算，平均库存 =（期初 + 期末）/ 2。
      </div>
    </div>
  );
}

function SimpleTable({
  rows, columns, rowKey, scrollX, showIndex,
}: {
  rows: any[];
  columns: any[];
  rowKey: string;
  scrollX?: number;
  showIndex?: boolean;
}) {
  const cols = showIndex
    ? [
        {
          title: '#', key: '__idx', width: 52, align: 'center' as const,
          render: (_: any, __: any, i: number) => <span className="text-muted num">{i + 1}</span>,
        },
        ...columns,
      ]
    : columns;
  if (!rows.length) return <div className="empty-hint">当前区间暂无数据</div>;
  return (
    <Table
      size="small"
      rowKey={rowKey}
      dataSource={rows}
      columns={cols as any}
      pagination={false}
      scroll={scrollX ? { x: scrollX } : undefined}
    />
  );
}
