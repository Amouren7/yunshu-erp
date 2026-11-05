import { useMemo, useState } from 'react';
import { Button, DatePicker, Progress, Select, Space, Tag } from 'antd';
import { SearchOutlined, SyncOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import StatCard from '../../components/StatCard';
import EntitySelect from '../../components/EntitySelect';
import DocListPage from '../../components/DocListPage';
import DocEditorPage from '../../components/DocEditor';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { useMeta } from '../../store/meta';
import { fmtMoney, fmtNumber } from '../../utils/format';

export function StockBalancesPage() {
  const { dict } = useMeta();
  const value = useRequest(() => api.get('/api/inventory/value'), []);
  const [refreshKey, setRefreshKey] = useState(0);
  const warehouseOptions = (dict('warehouses') || []).map((w: any) => ({ label: w.name, value: w.id }));

  return (
    <div>
      <PageHeader
        title="库存余额"
        subtitle="实时库存数量与移动加权平均成本，按物料 + 仓库维度汇总"
        extra={
          <>
            <Space>
              <StatCard title="库存总额" value={value.data?.amount || 0} prefix="¥" />
              <StatCard title="库存明细" value={value.data?.sku_count || 0} money={false} digits={0} suffix="条" />
            </Space>
            <Button icon={<SyncOutlined />} onClick={() => { value.refresh(); setRefreshKey((k) => k + 1); }}>刷新</Button>
          </>
        }
      />
      <DataTable
        load={(params) => api.get('/api/inventory/balances', { ...params, limit: 1000 })}
        reloadKey={refreshKey}
        exportFilename="库存余额"
        filters={[
          { key: 'warehouseId', label: '仓库', type: 'select', options: warehouseOptions },
          { key: 'onlyNonZero', label: '仅非零库存', type: 'select', options: [{ label: '是', value: '1' }, { label: '全部', value: '0' }] },
        ]}
        search={{ placeholder: '搜索物料编码 / 名称 / 规格' }}
        columns={[
          { title: '物料编码', dataIndex: 'item_code', width: 130, fixed: 'left' },
          { title: '物料名称', dataIndex: 'item_name', width: 180, ellipsis: true },
          { title: '规格型号', dataIndex: 'spec', width: 200, ellipsis: true },
          { title: '类型', dataIndex: 'item_type', width: 80, render: (v) => <Tag>{v}</Tag> },
          { title: '仓库', dataIndex: 'warehouse_name', width: 120 },
          { title: '计量单位', dataIndex: 'uom', width: 80, align: 'center' },
          { title: '库存数量', dataIndex: 'qty', width: 110, align: 'right', render: (v) => <b className="num">{fmtNumber(v, 2)}</b> },
          { title: '平均成本', dataIndex: 'avg_cost', width: 110, align: 'right', render: (v) => fmtMoney(v) },
          { title: '库存金额', dataIndex: 'amount', width: 120, align: 'right', render: (v) => <span className="num">{fmtMoney(v)}</span> },
          { title: '安全库存', dataIndex: 'safety_stock', width: 100, align: 'right', render: (v) => fmtNumber(v, 0) },
          {
            title: '库存状态', dataIndex: 'qty', key: 'stock_status', width: 110, align: 'center',
            render: (v: number, r: any) => {
              if (v <= 0) return <Tag color="red">无库存</Tag>;
              if (v < r.safety_stock) return <Tag color="orange">低于安全库存</Tag>;
              return <Tag color="green">正常</Tag>;
            },
          },
          { title: '更新时间', dataIndex: 'updated_at', width: 150 },
        ]}
      />
    </div>
  );
}

export function StockLedgerPage() {
  const { dict } = useMeta();
  const [itemId, setItemId] = useState<any>();
  const [warehouseId, setWarehouseId] = useState<any>();
  const [docType, setDocType] = useState<string>();
  const [range, setRange] = useState<any>();
  const warehouseOptions = (dict('warehouses') || []).map((w: any) => ({ label: w.name, value: w.id }));

  const docTypeOptions = [
    { label: '销售发货', value: 'DN' }, { label: '销售退货', value: 'SR' },
    { label: '采购入库', value: 'GRN' }, { label: '采购退货', value: 'PR' },
    { label: '调拨', value: 'TR' }, { label: '盘点', value: 'ADJ' },
    { label: '其他入库', value: 'OI' }, { label: '其他出库', value: 'OO' }, { label: '生产领料/完工', value: 'MO' },
  ];

  const extraParams = useMemo(() => ({
    itemId, warehouseId, docType,
    startDate: range?.[0]?.format?.('YYYY-MM-DD'),
    endDate: range?.[1]?.format?.('YYYY-MM-DD'),
  }), [itemId, warehouseId, docType, range]);

  return (
    <div>
      <PageHeader title="库存流水" subtitle="所有出入库流水（只增不改），可追溯单据来源与结存数量" />
      <div className="card">
        <div className="filter-bar">
          <EntitySelect type="item" style={{ width: 280 }} placeholder="选择物料" value={itemId} onChange={setItemId} />
          <Select allowClear style={{ width: 150 }} placeholder="仓库" options={warehouseOptions} value={warehouseId} onChange={setWarehouseId} />
          <Select allowClear style={{ width: 160 }} placeholder="业务类型" options={docTypeOptions} value={docType} onChange={setDocType} />
          <DateRange value={range} onChange={setRange} />
          <Button icon={<SearchOutlined />} onClick={() => {}} type="primary">查询</Button>
        </div>
      </div>
      <div className="mt-14">
        <DataTable
          columns={[
            { title: '业务日期', dataIndex: 'biz_date', width: 110, fixed: 'left' },
            { title: '业务类型', dataIndex: 'doc_type', width: 100, render: (v) => docTypeOptions.find((x) => x.value === v)?.label || v },
            { title: '单据编号', dataIndex: 'doc_no', width: 160 },
            { title: '物料', dataIndex: 'item_name', width: 180, ellipsis: true, render: (v, r: any) => <div>{v}<div className="text-muted" style={{ fontSize: 11 }}>{r.item_code} {r.spec}</div></div> },
            { title: '仓库', dataIndex: 'warehouse_name', width: 110 },
            { title: '方向', dataIndex: 'direction', width: 70, align: 'center', render: (v) => v === 'IN' ? <Tag color="green">入库</Tag> : <Tag color="orange">出库</Tag> },
            { title: '入库数量', dataIndex: 'qty_in', width: 100, align: 'right', render: (v) => Number(v) ? <span className="num text-success">+{fmtNumber(v, 2)}</span> : '-' },
            { title: '出库数量', dataIndex: 'qty_out', width: 100, align: 'right', render: (v) => Number(v) ? <span className="num text-danger">-{fmtNumber(v, 2)}</span> : '-' },
            { title: '单位成本', dataIndex: 'unit_cost', width: 110, align: 'right', render: (v) => fmtMoney(v) },
            { title: '金额', dataIndex: 'amount', width: 120, align: 'right', render: (v) => <span className="num">{fmtMoney(v)}</span> },
            { title: '结存数量', dataIndex: 'balance_qty', width: 110, align: 'right', render: (v) => <b className="num">{fmtNumber(v, 2)}</b> },
            { title: '批号', dataIndex: 'batch_no', width: 110, render: (v) => v || '-' },
          ]}
          load={(params) => api.get('/api/inventory/ledger', { ...params, ...extraParams })}
          extraParams={extraParams}
          exportFilename="库存流水"
          scrollX={1500}
        />
      </div>
    </div>
  );
}

function DateRange({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return <DatePicker.RangePicker style={{ width: 240 }} value={value} onChange={onChange} />;
}

export function StockAlertsPage() {
  const alerts = useRequest(() => api.get('/api/inventory/alerts'), []);
  const rows = alerts.data || [];
  return (
    <div>
      <PageHeader
        title="库存预警"
        subtitle="低于安全库存的物料清单，建议及时补货或安排生产"
        extra={<Button icon={<SyncOutlined />} onClick={alerts.refresh}>刷新</Button>}
      />
      <div className="card">
        <div className="card-head">
          <div className="card-title"><span className="dot" />预警物料 <Tag color="orange" style={{ marginLeft: 4 }}>{rows.length}</Tag></div>
        </div>
        <div className="card-pad">
          {rows.length === 0 && <div className="empty-hint">库存充足，暂无预警</div>}
          {rows.map((r: any) => {
            const ratio = r.safety_stock ? Math.min(100, Math.round((r.qty / r.safety_stock) * 100)) : 100;
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '11px 0', borderBottom: '1px solid #f4f6fa' }}>
                <div style={{ width: 220 }}>
                  <div style={{ fontWeight: 500 }}>{r.name}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>{r.code} · {r.spec}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <Progress percent={ratio} status="exception" size="small" showInfo={false} />
                </div>
                <div style={{ width: 160, textAlign: 'right' }}>
                  <span className="text-danger" style={{ fontWeight: 600 }}>{fmtNumber(r.qty, 2)}</span>
                  <span className="text-muted"> / 安全 {fmtNumber(r.safety_stock, 0)} {r.uom}</span>
                </div>
                <Button size="small" type="link" onClick={() => { location.href = '/purchase/orders/new'; }}>发起采购</Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TransfersPage() {
  return <DocListPage docType="TR" title="库存调拨单" subtitle="仓库之间的库存转移，审核后自动生成调出/调入库存流水" basePath="/inventory/transfers" permModule="inventory" />;
}
export function TransferEditor() {
  return <DocEditorPage docType="TR" basePath="/inventory/transfers" listPath="/inventory/transfers" />;
}
export function StocktakePage() {
  return <DocListPage docType="ADJ" title="库存盘点单" subtitle="盘点实际数量，审核后生成盘盈/盘亏调整与会计凭证" basePath="/inventory/stocktake" permModule="inventory" />;
}
export function StocktakeEditor() {
  return <DocEditorPage docType="ADJ" basePath="/inventory/stocktake" listPath="/inventory/stocktake" />;
}
export function OtherInPage() {
  return <DocListPage docType="OI" title="其他入库单" subtitle="样品、赠品、借入等非采购入库业务" basePath="/inventory/other-in" permModule="inventory" />;
}
export function OtherInEditor() {
  return <DocEditorPage docType="OI" basePath="/inventory/other-in" listPath="/inventory/other-in" />;
}
export function OtherOutPage() {
  return <DocListPage docType="OO" title="其他出库单" subtitle="样品、赠送、研发领用等非销售出库业务" basePath="/inventory/other-out" permModule="inventory" />;
}
export function OtherOutEditor() {
  return <DocEditorPage docType="OO" basePath="/inventory/other-out" listPath="/inventory/other-out" />;
}
