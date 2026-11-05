import { useState } from 'react';
import { Alert, Button, Input, Select, Space, Table, Tag } from 'antd';
import { CalculatorOutlined, ReloadOutlined, SearchOutlined, ShoppingOutlined, ToolOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { fmtMoney, fmtNumber } from '../../utils/format';

const ACTION_COLOR: Record<string, string> = { 采购: 'orange', 生产: 'blue', 无: 'default' };

/** 物料需求计划（简易 MRP） */
export default function MrpPage() {
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('全部');
  const [actionFilter, setActionFilter] = useState('全部');

  const mrp = useRequest<any>(
    () => api.get('/api/production/materials-requirements', { keyword: appliedKeyword, limit: 500 }),
    [appliedKeyword]
  );

  const data = mrp.data || {};
  const summary = data.summary || {};
  const allRows: any[] = data.rows || [];
  const rows = allRows.filter(
    (r) =>
      (statusFilter === '全部' || r.status === statusFilter) &&
      (actionFilter === '全部' || r.suggested_action === actionFilter)
  );
  const shortageAmount = rows.reduce((s, r) => s + (Number(r.shortage_amount) || 0), 0);

  const doSearch = () => {
    setAppliedKeyword(keyword.trim());
  };

  const reset = () => {
    setKeyword('');
    setAppliedKeyword('');
    setStatusFilter('全部');
    setActionFilter('全部');
  };

  return (
    <div>
      <PageHeader
        title="物料需求计划（MRP）"
        subtitle="按未完工工单未领料需求 + 未发货销售订单（BOM 逐层展开）测算净需求，对比现库存给出采购 / 生产建议"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={mrp.refresh}>重新测算</Button>
          </Space>
        }
      />

      {mrp.error && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 14 }}
          message="物料需求测算失败"
          description={mrp.error}
          action={<Button size="small" onClick={mrp.refresh}>重试</Button>}
        />
      )}

      <div className="kpi-grid">
        <StatCard
          title="需求物料数"
          value={summary.demandItems || 0}
          money={false}
          digits={0}
          suffix="种"
          icon={<CalculatorOutlined />}
          foot={`来源：在产工单 ${fmtNumber(summary.woCount || 0, 0)} 张 / 销售订单 ${fmtNumber(summary.soOrderCount || 0, 0)} 张`}
        />
        <StatCard
          title="缺口物料数"
          value={summary.shortageItems || 0}
          money={false}
          digits={0}
          suffix="种"
          color={Number(summary.shortageItems) > 0 ? 'var(--danger)' : undefined}
          icon={<ToolOutlined />}
          foot={`建议采购 ${fmtNumber(summary.purchaseItems || 0, 0)} 项 · 建议生产 ${fmtNumber(summary.productionItems || 0, 0)} 项`}
        />
        <StatCard
          title="建议采购金额"
          value={summary.purchaseAmount || 0}
          prefix="¥"
          icon={<ShoppingOutlined />}
          foot="按物料最新成本估算"
        />
        <StatCard
          title="建议生产数量"
          value={summary.productionQty || 0}
          money={false}
          digits={2}
          suffix="件"
          icon={<ToolOutlined />}
          foot="成品 / 半成品缺口建议下达工单"
        />
      </div>

      <div className="card mt-14">
        <div className="filter-bar">
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#8b98ab' }} />}
            placeholder="搜索物料编码 / 名称 / 规格"
            style={{ width: 260 }}
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              if (!e.target.value) setAppliedKeyword('');
            }}
            onPressEnter={doSearch}
          />
          <Select
            style={{ width: 130 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={['全部', '缺口', '充足'].map((v) => ({ label: v, value: v }))}
          />
          <Select
            style={{ width: 140 }}
            value={actionFilter}
            onChange={setActionFilter}
            options={['全部', '采购', '生产', '无'].map((v) => ({ label: v === '全部' ? '全部建议' : v, value: v }))}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={doSearch}>查询</Button>
          <Button onClick={reset}>重置</Button>
          <div className="toolbar-spacer" />
          <span className="text-muted" style={{ fontSize: 12 }}>
            生成时间 {data.generatedAt ? String(data.generatedAt).replace('T', ' ').slice(0, 16) : '-'}
          </span>
        </div>
        <Table
          size="small"
          rowKey="item_id"
          loading={mrp.loading}
          dataSource={rows}
          scroll={{ x: 1600 }}
          pagination={{
            defaultPageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (t) => `共 ${t} 条`,
          }}
          locale={{
            emptyText: (
              <div className="empty-hint">
                {allRows.length
                  ? '当前筛选条件下没有物料需求'
                  : '暂无物料需求：当前没有未完工工单的未领料需求，也没有未发货销售订单需求'}
              </div>
            ),
          }}
          columns={[
            { title: '物料编码', dataIndex: 'item_code', width: 120, fixed: 'left' },
            {
              title: '物料名称',
              dataIndex: 'item_name',
              width: 190,
              ellipsis: true,
              render: (v: string, r: any) => (
                <div>
                  <div>{v}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>{r.spec}</div>
                </div>
              ),
            },
            {
              title: '类型',
              dataIndex: 'item_type',
              width: 80,
              align: 'center',
              render: (v: string) => <Tag style={{ marginInlineEnd: 0 }}>{v}</Tag>,
            },
            { title: '单位', dataIndex: 'uom', width: 60, align: 'center' },
            {
              title: '现库存',
              dataIndex: 'stock_qty',
              width: 100,
              align: 'right',
              render: (v: any) => <span className="num">{fmtNumber(v, 2)}</span>,
            },
            {
              title: '工单需求',
              dataIndex: 'wo_demand',
              width: 100,
              align: 'right',
              render: (v: any) => <span className="num">{fmtNumber(v, 2)}</span>,
            },
            {
              title: '销售需求',
              dataIndex: 'so_demand',
              width: 100,
              align: 'right',
              render: (v: any) => <span className="num">{fmtNumber(v, 2)}</span>,
            },
            {
              title: '总需求',
              dataIndex: 'demand_qty',
              width: 100,
              align: 'right',
              render: (v: any) => <b className="num">{fmtNumber(v, 2)}</b>,
            },
            {
              title: '缺口',
              dataIndex: 'shortage_qty',
              width: 100,
              align: 'right',
              render: (v: any) =>
                Number(v) > 0 ? <b className="num text-danger">{fmtNumber(v, 2)}</b> : <span className="text-muted">0</span>,
            },
            {
              title: '建议动作',
              dataIndex: 'suggested_action',
              width: 90,
              align: 'center',
              render: (v: string) => <Tag color={ACTION_COLOR[v] || 'default'} style={{ marginInlineEnd: 0 }}>{v}</Tag>,
            },
            {
              title: '建议采购/生产量',
              dataIndex: 'suggested_qty',
              width: 130,
              align: 'right',
              render: (v: any) => (Number(v) > 0 ? <span className="num">{fmtNumber(v, 2)}</span> : '-'),
            },
            {
              title: '单位成本',
              dataIndex: 'unit_cost',
              width: 100,
              align: 'right',
              render: (v: any) => `¥${fmtMoney(v)}`,
            },
            {
              title: '缺口金额',
              dataIndex: 'shortage_amount',
              width: 110,
              align: 'right',
              render: (v: any) =>
                Number(v) > 0 ? <span className="num text-danger">¥{fmtMoney(v)}</span> : <span className="text-muted">-</span>,
            },
            {
              title: '需求来源',
              dataIndex: 'sources',
              width: 180,
              ellipsis: true,
              render: (v: any) => (Array.isArray(v) && v.length ? v.join('、') : '-'),
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 80,
              align: 'center',
              render: (v: string) => <Tag color={v === '缺口' ? 'red' : 'green'} style={{ marginInlineEnd: 0 }}>{v}</Tag>,
            },
          ]}
          summary={() =>
            rows.length ? (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={8}>
                  <b>合计（当前筛选 {rows.length} 种物料）</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="right">
                  <b className="num text-danger">
                    {fmtNumber(rows.reduce((s, r) => s + (Number(r.shortage_qty) || 0), 0), 2)}
                  </b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} colSpan={3} />
                <Table.Summary.Cell index={3} align="right">
                  <b className="num text-danger">¥{fmtMoney(shortageAmount)}</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} colSpan={3} />
              </Table.Summary.Row>
            ) : null
          }
        />
      </div>

      <div className="card mt-14">
        <div className="card-pad" style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 2 }}>
          <b>测算口径：</b>
          ① 未完工工单（草稿/已下达/生产中）的未领料需求；② 未发货销售订单按 BOM 逐层展开到原材料的需求；
          ③ 净需求 = 总需求 − 当前库存（所有仓库合计）；④ 缺口物料按物料类型建议「采购」或「生产」。
          <span className="text-muted">（本页为简易 MRP，如需按提前期、最小采购批量与安全库存滚动测算，请以正式 MRP 运算为准。）</span>
        </div>
      </div>
    </div>
  );
}
