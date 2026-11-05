/**
 * /finance/aging 账龄分析
 * ------------------------------------------------------------
 * Tabs 应收 / 应付：四段账龄（0-30 / 31-60 / 61-90 / 90 天以上）汇总 +
 * 柱状图 + 按往来单位明细（含最大逾期天数、最早到期日）。
 * 口径：按发票到期日（due_date）计算逾期天数，未到期归入 0-30 天档。
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Empty, Input, Space, Spin, Table, Tabs, Tag } from 'antd';
import { DownloadOutlined, SearchOutlined, SyncOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ChartCard, { CHART_COLORS, axisStyle } from '../../components/ChartCard';
import StatCard from '../../components/StatCard';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { exportCsv, fmtMoney, fmtNumber } from '../../utils/format';
import { AGING_BUCKETS } from './common';

type AgingType = 'AR' | 'AP';

export default function AgingPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<AgingType>('AR');
  const [keyword, setKeyword] = useState('');
  const req = useRequest(() => api.get(tab === 'AR' ? '/api/finance/ar-aging' : '/api/finance/ap-aging'), [tab]);

  const rows: any[] = req.data?.rows || [];
  const buckets: any[] = req.data?.summary?.buckets || [];
  const total = req.data?.summary?.total || {};
  const isAr = tab === 'AR';
  const partnerName = isAr ? '客户' : '供应商';

  const filteredRows = useMemo(() => {
    if (!keyword.trim()) return rows;
    const k = keyword.trim().toLowerCase();
    return rows.filter((r) => String(r.partner_name || '').toLowerCase().includes(k) || String(r.partner_code || '').toLowerCase().includes(k));
  }, [rows, keyword]);

  const chartOption = useMemo(() => ({
    color: CHART_COLORS,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: any) => `￥${fmtNumber(v, 2)}` },
    grid: { left: 10, right: 16, top: 34, bottom: 6, containLabel: true },
    xAxis: { type: 'category', data: buckets.map((b) => b.label), ...axisStyle() },
    yAxis: {
      type: 'value', ...axisStyle(),
      axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(0)}万` : v) },
    },
    series: [{
      name: isAr ? '应收未收' : '应付未付',
      type: 'bar',
      barWidth: 36,
      itemStyle: {
        borderRadius: [4, 4, 0, 0],
        color: (p: any) => ['#16a34a', '#2f6bff', '#f59e0b', '#e5484d'][p.dataIndex % 4],
      },
      label: {
        show: true, position: 'top', fontSize: 11, color: '#5b6b82',
        formatter: (p: any) => `￥${(Number(p.value) / 10000).toFixed(1)}万`,
      },
      data: buckets.map((b) => b.amount),
    }],
  }), [buckets, isAr]);

  const columns: ColumnsType<any> = [
    { title: `${partnerName}编码`, dataIndex: 'partner_code', width: 100 },
    { title: `${partnerName}名称`, dataIndex: 'partner_name', width: 220, ellipsis: true },
    { title: '发票笔数', dataIndex: 'invoice_count', width: 80, align: 'center' },
    ...AGING_BUCKETS.map((key) => ({
      title: key === '90+' ? '90 天以上' : `${key} 天`,
      dataIndex: key,
      width: 125,
      align: 'right' as const,
      render: (v: number) => (Number(v) ? <span className="num">{fmtMoney(v)}</span> : <span className="text-muted">-</span>),
    })),
    {
      title: '合计', dataIndex: 'total', width: 130, align: 'right',
      render: (v: number) => <b className="num" style={{ color: 'var(--danger)' }}>{fmtMoney(v)}</b>,
    },
    {
      title: '最大逾期', dataIndex: 'max_overdue_days', width: 100, align: 'center',
      render: (v: number) => {
        const d = Number(v) || 0;
        if (d > 90) return <Tag color="red">{d} 天</Tag>;
        if (d > 30) return <Tag color="orange">{d} 天</Tag>;
        if (d > 0) return <Tag color="gold">{d} 天</Tag>;
        return <Tag color="green">未逾期</Tag>;
      },
    },
    { title: '最早到期日', dataIndex: 'oldest_due_date', width: 105 },
  ];

  const doExport = () => {
    if (!filteredRows.length) return;
    exportCsv(
      `${isAr ? '应收' : '应付'}账龄分析_${dayjs().format('YYYYMMDD')}`,
      [
        { title: `${partnerName}编码`, dataIndex: 'partner_code' },
        { title: `${partnerName}名称`, dataIndex: 'partner_name' },
        { title: '发票笔数', dataIndex: 'invoice_count' },
        { title: '0-30天', dataIndex: '0-30' },
        { title: '31-60天', dataIndex: '31-60' },
        { title: '61-90天', dataIndex: '61-90' },
        { title: '90天以上', dataIndex: '90+' },
        { title: '合计', dataIndex: 'total' },
        { title: '最大逾期天数', dataIndex: 'max_overdue_days' },
        { title: '最早到期日', dataIndex: 'oldest_due_date' },
      ],
      filteredRows,
    );
  };

  const content = (
    <div>
      {req.loading && rows.length === 0 ? (
        <div className="card"><div style={{ padding: 70, textAlign: 'center' }}><Spin tip="加载中…" /></div></div>
      ) : (
        <>
          <div className="kpi-grid">
            {buckets.map((b: any, i: number) => (
              <StatCard
                key={b.key}
                title={`${b.label}账龄`}
                value={b.amount || 0}
                prefix="¥"
                color={['#16a34a', '#2f6bff', '#f59e0b', '#e5484d'][i % 4]}
                foot={`${b.count || 0} 张发票 · 占比 ${b.ratio || 0}%`}
              />
            ))}
          </div>

          <div className="grid-2 mt-14">
            {buckets.some((b: any) => Number(b.amount) !== 0) ? (
              <ChartCard title={`${isAr ? '应收' : '应付'}账龄分布（柱状图）`} option={chartOption} height={300}
                extra={<Tag color="blue">合计 ￥{fmtMoney(total.amount || 0)}</Tag>} />
            ) : (
              <div className="card">
                <div className="card-head"><div className="card-title"><span className="dot" />账龄分布</div></div>
                <div className="empty-hint">暂无未结清{isAr ? '应收' : '应付'}发票</div>
              </div>
            )}
            <div className="card">
              <div className="card-head"><div className="card-title"><span className="dot" />账龄口径与汇总</div></div>
              <div className="card-pad">
                <div className="flex-between" style={{ padding: '9px 0', borderBottom: '1px solid #f4f6fa' }}>
                  <span className="text-muted">未结清总额</span>
                  <b className="num" style={{ fontSize: 17 }}>￥{fmtMoney(total.amount || 0)}</b>
                </div>
                <div className="flex-between" style={{ padding: '9px 0', borderBottom: '1px solid #f4f6fa' }}>
                  <span className="text-muted">发票张数</span><b className="num">{total.count || 0} 张</b>
                </div>
                <div className="flex-between" style={{ padding: '9px 0', borderBottom: '1px solid #f4f6fa' }}>
                  <span className="text-muted">{partnerName}数量</span><b className="num">{total.partner_count || 0} 家</b>
                </div>
                <div className="flex-between" style={{ padding: '9px 0', borderBottom: '1px solid #f4f6fa' }}>
                  <span className="text-muted">统计日期</span><b>{req.data?.asOfDate || dayjs().format('YYYY-MM-DD')}</b>
                </div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.9 }}>
                  口径说明：按发票到期日（due_date）计算逾期天数；未到期（≤0 天）归入 0-30 天档；
                  90 天以上建议重点催收 / 启动法务评估。
                </div>
                <Space style={{ marginTop: 12 }}>
                  <Button icon={<SyncOutlined />} onClick={() => req.refresh()}>刷新</Button>
                  <Button icon={<DownloadOutlined />} onClick={doExport}>导出账龄表</Button>
                </Space>
              </div>
            </div>
          </div>

          <div className="card mt-14">
            <div className="card-head">
              <div className="card-title"><span className="dot" />{partnerName}账龄明细 <Tag color="blue" style={{ marginLeft: 4 }}>{filteredRows.length} 家</Tag></div>
              <Space>
                <Input
                  allowClear
                  size="small"
                  style={{ width: 220 }}
                  prefix={<SearchOutlined style={{ color: '#8b98ab' }} />}
                  placeholder={`搜索${partnerName}编码 / 名称`}
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
                <Button size="small" type="link" onClick={() => navigate(isAr ? '/finance/receivables' : '/finance/payables')}>
                  查看{isAr ? '应收' : '应付'}台账 →
                </Button>
              </Space>
            </div>
            {filteredRows.length === 0 ? (
              <div className="empty-hint">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`暂无未结清${isAr ? '应收' : '应付'}发票`} />
              </div>
            ) : (
              <Table
                rowKey="partner_id"
                columns={columns}
                dataSource={filteredRows}
                pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `共 ${t} 家` }}
                size="small"
                scroll={{ x: 1280 }}
                summary={() => (
                  <Table.Summary fixed>
                    <Table.Summary.Row style={{ fontWeight: 600, background: '#f7f9fd' }}>
                      <Table.Summary.Cell index={0} colSpan={2} align="right">合计</Table.Summary.Cell>
                      <Table.Summary.Cell index={2} align="center">{total.count || 0}</Table.Summary.Cell>
                      {AGING_BUCKETS.map((key, i) => {
                        const b = buckets.find((x: any) => x.key === key);
                        return (
                          <Table.Summary.Cell key={key} index={3 + i} align="right">
                            <span className="num">{fmtMoney(b?.amount || 0)}</span>
                          </Table.Summary.Cell>
                        );
                      })}
                      <Table.Summary.Cell index={7} align="right"><span className="num">{fmtMoney(total.amount || 0)}</span></Table.Summary.Cell>
                      <Table.Summary.Cell index={8} colSpan={2} />
                    </Table.Summary.Row>
                  </Table.Summary>
                )}
              />
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="账龄分析"
        subtitle="应收 / 应付账龄分档统计：识别长账龄风险，辅助催收与付款排期"
        extra={<Button icon={<SyncOutlined />} onClick={() => req.refresh()}>刷新</Button>}
      />
      <Tabs
        activeKey={tab}
        onChange={(k) => { setTab(k as AgingType); setKeyword(''); }}
        items={[
          { key: 'AR', label: '应收账龄', children: content },
          { key: 'AP', label: '应付账龄', children: content },
        ]}
      />
    </div>
  );
}
