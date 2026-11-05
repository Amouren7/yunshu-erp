import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Empty, Space, Table, Tag } from 'antd';
import { ReloadOutlined, RiseOutlined, TeamOutlined, TrophyOutlined, WalletOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ChartCard, { CHART_COLORS, axisStyle } from '../../components/ChartCard';
import { api } from '../../api/client';
import { useRequest } from '../../api/hooks';
import { fmtDate, fmtMoney, fmtNumber } from '../../utils/format';

const LEVEL_COLORS: Record<string, string> = { A: 'green', B: 'blue', C: 'default', D: 'orange' };

export default function CustomerRankPage() {
  const [range, setRange] = useState<any>([dayjs().subtract(11, 'month').startOf('month'), dayjs()]);
  const startDate = range?.[0] ? dayjs(range[0]).format('YYYY-MM-DD') : undefined;
  const endDate = range?.[1] ? dayjs(range[1]).format('YYYY-MM-DD') : undefined;
  const rank = useRequest(
    () => api.get('/api/crm/customers/rank', { startDate, endDate, limit: 20 }),
    [startDate, endDate],
  );

  const rows: any[] = rank.data?.rows || [];
  const summary = rank.data?.summary || {};
  const orderTotal = rows.reduce((s, r) => s + Number(r.order_count || 0), 0);
  const amountTotal = Number(summary.totalAmount || 0);
  const profitTotal = rows.reduce((s, r) => s + Number(r.profit || 0), 0);
  const profitRate = amountTotal > 0 ? (profitTotal / amountTotal) * 100 : 0;

  const rankOption = useMemo(() => {
    const top = rows.slice(0, 10).slice().reverse();
    return {
      color: ['#2f6bff', '#16a34a'],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: any) => `¥${fmtMoney(v, 0)}` },
      legend: { data: ['销售额（价税合计）', '毛利'], right: 0, top: 0, itemHeight: 8, textStyle: { fontSize: 11, color: '#5b6b82' } },
      grid: { left: 8, right: 24, top: 36, bottom: 4, containLabel: true },
      xAxis: { type: 'value', ...axisStyle(), axisLabel: { ...axisStyle().axisLabel, formatter: (v: number) => (v >= 10000 ? `${v / 10000}万` : v) } },
      yAxis: { type: 'category', data: top.map((r) => String(r.customer_name || '').slice(0, 10)), ...axisStyle() },
      series: [
        { name: '销售额（价税合计）', type: 'bar', barWidth: 9, itemStyle: { borderRadius: [0, 3, 3, 0] }, data: top.map((r) => Number(r.total_amount || 0)) },
        { name: '毛利', type: 'bar', barWidth: 9, itemStyle: { borderRadius: [0, 3, 3, 0] }, data: top.map((r) => Number(r.profit || 0)) },
      ],
    };
  }, [rows]);

  const rateOption = useMemo(() => {
    const top = rows.slice(0, 10);
    return {
      color: ['#f59e0b'],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: any) => `${Number(v).toFixed(2)}%` },
      grid: { left: 8, right: 20, top: 20, bottom: 4, containLabel: true },
      xAxis: { type: 'category', data: top.map((r) => String(r.customer_name || '').slice(0, 6)), ...axisStyle(), axisLabel: { ...axisStyle().axisLabel, interval: 0, rotate: 24 } },
      yAxis: { type: 'value', ...axisStyle(), axisLabel: { ...axisStyle().axisLabel, formatter: '{value}%' } },
      series: [{
        type: 'bar', barWidth: 16, itemStyle: { borderRadius: [3, 3, 0, 0] },
        data: top.map((r) => Number(r.profit_rate || 0)),
        label: { show: true, position: 'top', fontSize: 10, color: '#8b98ab', formatter: (p: any) => `${Number(p.value).toFixed(0)}%` },
      }],
    };
  }, [rows]);

  return (
    <div>
      <PageHeader
        title="客户贡献排行"
        subtitle="按销售发货单（已审核及之后状态）汇总客户贡献，默认统计近 12 个月"
        extra={(
          <Space>
            <DatePicker.RangePicker
              style={{ width: 250 }}
              value={range}
              onChange={setRange}
              allowClear={false}
            />
            <Button icon={<ReloadOutlined />} onClick={rank.refresh} loading={rank.loading}>刷新</Button>
          </Space>
        )}
      />
      {rank.error && (
        <Alert type="error" showIcon message="客户贡献数据加载失败" description={rank.error} style={{ marginBottom: 14 }} />
      )}

      <div className="kpi-grid">
        <StatCard
          title="上榜客户数" value={summary.customerCount || 0} money={false} digits={0} suffix="家"
          icon={<TeamOutlined />} foot={`统计区间 ${startDate || '-'} ~ ${endDate || '-'}`}
        />
        <StatCard
          title="客户贡献总额" value={amountTotal} prefix="¥" icon={<WalletOutlined />}
          foot={`${fmtNumber(orderTotal, 0)} 张发货单`}
        />
        <StatCard
          title="贡献毛利" value={profitTotal} prefix="¥" icon={<RiseOutlined />}
          foot={`综合毛利率 ${profitRate.toFixed(2)}%`}
        />
        <StatCard
          title="贡献第一客户" value={summary.topCustomer || '-'} money={false}
          icon={<TrophyOutlined />} foot={`贡献 ¥${fmtMoney(rows[0]?.total_amount, 0)}`}
        />
      </div>

      <div className="grid-2-even mt-14">
        {rows.length === 0 ? (
          <div className="card">
            <div className="card-head"><div className="card-title"><span className="dot" />客户贡献 TOP10</div></div>
            <div className="card-pad"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前区间暂无销售数据" /></div>
          </div>
        ) : (
          <ChartCard title="客户贡献 TOP10（金额）" option={rankOption} height={320} />
        )}
        {rows.length === 0 ? (
          <div className="card">
            <div className="card-head"><div className="card-title"><span className="dot" />毛利率分布</div></div>
            <div className="card-pad"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前区间暂无销售数据" /></div>
          </div>
        ) : (
          <ChartCard title="TOP10 客户毛利率" option={rateOption} height={320} />
        )}
      </div>

      <div className="card mt-14">
        <div className="card-head">
          <div className="card-title"><span className="dot" />客户贡献明细</div>
          <span className="text-muted" style={{ fontSize: 12 }}>
            口径：销售额 = 不含税金额 · 价税合计 = 含税金额 · 毛利率 = 毛利 / 不含税金额
          </span>
        </div>
        <Table
          size="small"
          rowKey="customer_id"
          loading={rank.loading}
          dataSource={rows}
          pagination={false}
          scroll={{ x: 1360 }}
          columns={[
            {
              title: '排名', dataIndex: 'rank', width: 80, align: 'center', fixed: 'left' as const,
              render: (v: number) => (
                <Tag color={v === 1 ? 'gold' : v === 2 ? 'silver' : v === 3 ? 'orange' : 'default'} style={{ minWidth: 30, textAlign: 'center' }}>
                  {v}
                </Tag>
              ),
            },
            { title: '客户编码', dataIndex: 'customer_code', width: 100 },
            {
              title: '客户名称', dataIndex: 'customer_name', width: 230, ellipsis: true, fixed: 'left' as const,
              render: (v: string) => <b>{v}</b>,
            },
            { title: '等级', dataIndex: 'level', width: 70, align: 'center', render: (v: string) => <Tag color={LEVEL_COLORS[v] || 'default'}>{v || '-'}</Tag> },
            { title: '区域', dataIndex: 'region', width: 80, render: (v: string) => v || '-' },
            { title: '订单数', dataIndex: 'order_count', width: 90, align: 'right', render: (v: any) => fmtNumber(v, 0) },
            { title: '销售额', dataIndex: 'amount', width: 120, align: 'right', render: (v: any) => <span className="num">¥{fmtMoney(v, 0)}</span> },
            {
              title: '价税合计', dataIndex: 'total_amount', width: 130, align: 'right',
              render: (v: any) => <b className="num">¥{fmtMoney(v, 0)}</b>,
            },
            { title: '毛利', dataIndex: 'profit', width: 120, align: 'right', render: (v: any) => <span className="num">¥{fmtMoney(v, 0)}</span> },
            {
              title: '毛利率', dataIndex: 'profit_rate', width: 90, align: 'right',
              render: (v: any) => <span className="num" style={{ color: Number(v) >= 30 ? 'var(--success)' : Number(v) < 0 ? 'var(--danger)' : undefined }}>{Number(v).toFixed(2)}%</span>,
            },
            { title: '平均单笔', dataIndex: 'avg_order_amount', width: 120, align: 'right', render: (v: any) => <span className="num">¥{fmtMoney(v, 0)}</span> },
            { title: '最近下单', dataIndex: 'last_order_date', width: 110, render: (v: string) => fmtDate(v) },
          ]}
        />
      </div>
    </div>
  );
}
